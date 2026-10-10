# -*- coding: utf-8 -*-
"""점포 계보(lineage) — 연속 분기를 이어 '한 가게'를 추적한다.
0단계 상가업소번호 → 1~3단계 지문(ID가 바뀐 재등록 흡수) → 4단계 체인 일괄 재등록. 한 분기 이상 빠졌다 같은 ID로 돌아오면 같은 계보로 잇는다.
4단계 (2026-10-10): 같은 업종·같은 건물 좌표(1m)에서 한 기록은 사라지고 한 기록은 새로 생긴 1:1 짝이 한 분기에 같은 상호(사라진 쪽 또는
  새로 생긴 쪽)로 20쌍 이상 몰리면 같은 가게의 기록 교체로 보고 잇는다. 2025Q1에 스타벅스 599곳이 상호 칸에 지점명만 적힌 새 번호로 실렸다가
  2025Q2에는 통째로 빠졌다 — 1~3단계는 상호가 달라 못 잇고, 신뢰 개업 600여 건이 거짓으로 생겼다 (마스터플랜 §5.5)
  잡힌 묶음(분기·업종·상호)은 relabel_batches.csv로 남겨 p4가 그 체인을 개업·폐업 계산에서 빼는 데 쓴다
산출: lineage.parquet  (계보 1행 = 가게 1곳. 첫 등장 분기, 진입 시 속성, 분기별 등장 여부)
      lineage_long.parquet (계보 × 분기 1행)
2026-10-10: 분기 표를 메모리에 다 들고 있다가 마지막에 피벗하던 방식을 분기마다 디스크에 쓰는 방식으로 바꿨다.
  메모리 4GB(Cowork 작업 공간)에서 10개 분기를 돌리면 피벗에서 죽었다. 출력 내용은 같다."""
import pandas as pd, numpy as np, re, glob, sys, time, os
import pyarrow as pa, pyarrow.parquet as pq
from scipy.spatial import cKDTree
BATCH = int(os.environ.get("RELABEL_MIN", 20))                       # 4단계 — 같은 상호 짝이 이만큼 몰려야 기록 교체로 본다
xy = lambda d: np.c_[d.lon.values * 88200, d.lat.values * 111000]
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
sys.path.insert(0, os.environ.get("INGEST_DIR", os.path.join(HERE, "..", "..", "scripts"))); import ingest_sangga as ig
S = sys.argv[1]; START = sys.argv[2] if len(sys.argv) > 2 else "2024Q1"
qs = [q for q in sorted(re.search(r"poi_(\d{4}Q\d)", f).group(1) for f in glob.glob(f"{S}/poi_*.parquet")) if q >= START]
COLS = ["biz_no", "fp", "name", "name_norm", "cat_s", "cat_s_nm", "adm_cd", "floor", "lon", "lat", "h3_8", "h3_9", "h3_10"]
OUTC = ["lineage", "quarter", "biz_no", "is_new", "how"] + [c for c in COLS if c != "biz_no"]
lin_of = {}; prev = None; stage_cnt = {}; firsts = []; present = {}; writer = None; batches = []
for q in qs:
    t = time.time()
    cur = pd.read_parquet(f"{S}/poi_{q}.parquet", columns=COLS).drop_duplicates("biz_no").reset_index(drop=True)
    link = {}
    if prev is not None:
        _, _, _, _, lk = ig.diff_quarters(prev, cur, return_links=True)
        lk = lk.drop_duplicates("cur"); link = dict(zip(lk.cur, lk.prev))
        stage_cnt[q] = lk.stage.value_counts().to_dict()
        # 4단계 — 체인 일괄 재등록
        cu = cur[~cur.biz_no.isin(list(link)) & ~cur.biz_no.isin(list(lin_of))]                 # 새 계보가 될 기록
        pv = prev[~prev.biz_no.isin(list(set(lk.prev))) & ~prev.biz_no.isin(list(set(cur.biz_no)))]   # 사라진 기록
        add = []
        for c in set(cu.cat_s) & set(pv.cat_s):
            a_ = cu[cu.cat_s == c]; b_ = pv[pv.cat_s == c]
            ta, tb = cKDTree(xy(a_)), cKDTree(xy(b_))
            na = tb.query_ball_point(xy(a_), 1, return_length=True); nbb = ta.query_ball_point(xy(b_), 1, return_length=True)
            d, j = tb.query(xy(a_), distance_upper_bound=1); ok = np.isfinite(d) & (na == 1)
            ok[ok] = nbb[j[ok]] == 1                                                          # 1:1 짝만
            if ok.any():
                add.append(pd.DataFrame({"cur": a_.biz_no.values[ok], "prev": b_.biz_no.values[j[ok]], "cat": c,
                                         "cn": a_.name_norm.values[ok], "pn": b_.name_norm.values[j[ok]]}))
        if add:
            P4 = pd.concat(add)
            P4 = P4[(P4.groupby(["cat", "pn"]).cur.transform("size") >= BATCH) | (P4.groupby(["cat", "cn"]).cur.transform("size") >= BATCH)]
            link.update(dict(zip(P4.cur, P4.prev)))
            if len(P4):
                stage_cnt[q][4] = len(P4)
                for side, col in (("사라진 쪽", "pn"), ("새로 생긴 쪽", "cn")):
                    gs = P4.groupby(["cat", col]).size()
                    batches += [(q, c_, side, nm_, int(v)) for (c_, nm_), v in gs[gs >= BATCH].items()]
                print(f"   {q} 4단계 체인 일괄 재등록 {len(P4):,}쌍 — " + ", ".join(f"{k}({v})" for k, v in P4.pn.value_counts().head(3).items()), flush=True)
    lids, new, how = [], [], []
    for b in cur.biz_no.values:
        pb = link.get(b)
        if pb is not None and pb in lin_of:
            lids.append(lin_of[pb]); new.append(False); how.append("link")
        elif b in lin_of:
            lids.append(lin_of[b]); new.append(False); how.append("reappear")
        else:
            lids.append(b); new.append(prev is not None); how.append("new" if prev is not None else "initial")
    cur["lineage"] = lids; cur["is_new"] = new; cur["how"] = how; cur["quarter"] = q
    lin_of.update(dict(zip(cur.biz_no.values, lids)))
    part = cur[OUTC]
    tb = pa.Table.from_pandas(part, preserve_index=False)
    if writer is None: writer = pq.ParquetWriter(f"{S}/lineage_long.parquet", tb.schema)
    writer.write_table(tb.cast(writer.schema))
    firsts.append(part[part.how.isin(["initial", "new"])])            # 계보가 처음 생긴 행 = 진입 시 속성
    present[q] = pd.unique(part.lineage.values)
    print(f"{q}: 점포 {len(cur):,} · 새 계보 {sum(new):,} · 재등장 {how.count('reappear'):,} · {time.time()-t:.0f}s", flush=True)
    prev = cur[COLS]; del cur, part, tb
writer.close()
first = pd.concat(firsts, ignore_index=True).drop_duplicates("lineage")
code = pd.Index(first.lineage)
A = first.rename(columns={"quarter": "entry"}).reset_index(drop=True)
for q in qs:
    v = np.zeros(len(A), dtype="int64"); ix = code.get_indexer(present[q]); v[ix[ix >= 0]] = 1; A[q] = v
A.to_parquet(f"{S}/lineage.parquet", index=False)
pd.DataFrame(batches, columns=["quarter", "cat_s", "side", "name_norm", "pairs"]).to_csv(f"{S}/relabel_batches.csv", index=False, encoding="utf-8-sig")
print("계보", f"{len(A):,}", "· 단계별 연결:", stage_cnt)
