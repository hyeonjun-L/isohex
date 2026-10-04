#!/usr/bin/env python3
"""
점지 — 소상공인 상가(상권)정보 분기 스냅샷 적재기

원본 분기 CSV를 읽어 (1) 점포 스냅샷, (2) 직전 분기 대비 변화, (3) 격자×업종×분기 집계
세 가지 파생 산출물을 만든다. 상가업소번호가 분기마다 재생성되므로 상호명+업종+행정동으로
만든 '지문(fingerprint)'으로 분기 간 점포를 추적하고, 남은 것은 같은 상호·업종 200m 이내로 한 번 더 짝짓는다.
2026-10 확인: 상가업소번호는 재생성되지 않고 대부분 유지된다 → ID로 먼저 짝짓고 지문은 보조로 쓴다.

사용법:
    python ingest_sangga.py --raw data/raw --out data/snapshots
    python ingest_sangga.py --raw data/raw --out data/snapshots --sido 서울 --res 9

디렉터리 규약:
    data/raw/<아무경로>/..._서울_202606.csv   # 파일명 끝 6자리 YYYYMM으로 분기 인식
    data/snapshots/poi_202606.parquet
    data/snapshots/change_202603_202606.parquet
    data/snapshots/grid_industry_202606.parquet
    data/snapshots/qc_report.csv
"""
import argparse, csv, hashlib, os, re, sys, glob, json, fnmatch, unicodedata
from collections import Counter, defaultdict
from datetime import datetime

csv.field_size_limit(10 ** 7)

# ── 컬럼 매핑: 한글/영문 스키마를 하나로 ────────────────────────────────
COLMAP = {
    "상가업소번호": "biz_no", "상호명": "name", "지점명": "branch",
    "상권업종대분류코드": "cat_l", "상권업종대분류명": "cat_l_nm",
    "상권업종중분류코드": "cat_m", "상권업종중분류명": "cat_m_nm",
    "상권업종소분류코드": "cat_s", "상권업종소분류명": "cat_s_nm",
    "표준산업분류코드": "ksic", "시도명": "sido", "시군구명": "sgg",
    "행정동코드": "adm_cd", "행정동명": "adm_nm", "법정동명": "bjd_nm",
    "지번주소": "addr_jibun", "도로명주소": "addr_road", "건물명": "bldg",
    "층정보": "floor", "호정보": "ho", "동정보": "dong_info",
    "경도": "lon", "위도": "lat",
}
NEEDED = ["name", "branch", "cat_s", "cat_s_nm", "sido", "sgg", "adm_cd", "adm_nm",
          "addr_road", "floor", "lon", "lat"]

# 서울 대략 경계 (좌표 이상치 걸러내기용)
BBOX = {"서울": (126.73, 127.27, 37.41, 37.72)}

_punct = re.compile(r"[^0-9a-z가-힣]")
COORD_PREC = 3     # --fp-mode coord 일 때만 쓴다
FP_MODE = "adm"    # main()에서 --fp-mode로 덮어씀
FALLBACK_M = 200   # 2단계 매칭 반경(m)


def norm_name(name: str, branch: str = "") -> str:
    """상호명 정규화: 공백·기호 제거, 소문자화. **지점명은 넣지 않는다.**

    지점명 컬럼 채움률이 분기마다 크게 흔들린다 (서울 2022Q4 8.4% → 2023Q1 0.3% → 2026Q2 9.4%).
    지점명을 합치면 '크린업24'+'우장산점' 과 '크린업24셀프빨래방우' 가 서로 다른 가게가 되어
    폐업+개업으로 두 번 잡힌다. 같은 동의 같은 상호 지점끼리는 지문이 겹치지만, diff가
    다중집합으로 짝지으므로 개수는 보존된다. (branch 인자는 하위호환용으로만 남김)
    """
    return _punct.sub("", (name or "").lower())


def open_csv(path):
    """인코딩을 탐지해 DictReader와 정규화된 컬럼명을 돌려준다."""
    for enc in ("utf-8-sig", "cp949", "utf-8"):
        try:
            fh = open(path, encoding=enc, newline="")
            rdr = csv.reader(fh)
            hdr = next(rdr)
            if not any("상호" in h or "name" in h.lower() for h in hdr):
                fh.close()
                continue
            cols = [COLMAP.get(h.strip(), h.strip()) for h in hdr]
            missing = [c for c in NEEDED if c not in cols]
            if missing:
                raise SystemExit(f"[!] {os.path.basename(path)} 필수 컬럼 없음: {missing}\n    실제 헤더: {hdr[:12]}")
            return fh, rdr, cols, enc
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"[!] 인코딩 판별 실패: {path}")


def quarter_of(path: str) -> str:
    """파일명에서 YYYYMM을 뽑아 YYYYQn으로."""
    m = re.findall(r"(20\d{2})(0[1-9]|1[0-2])", os.path.basename(path))
    if not m:
        m = re.findall(r"(20\d{2})(0[1-9]|1[0-2])", path)
    if not m:
        raise SystemExit(f"[!] 파일명에서 분기(YYYYMM)를 못 찾음: {path}")
    y, mo = m[-1]
    if int(mo) % 3:
        # 분기말(03·06·09·12)이 아닌 파일이 섞여 있다 (예: 2025-10-30 공개분 '_202510').
        # 분기로 반올림하면 다른 파일과 같은 분기로 겹쳐 덮어쓰므로 적재하지 않는다.
        return None
    return f"{y}Q{int(mo) // 3}"


def fingerprint(name_norm, cat_s, adm_cd, lon=None, lat=None, mode="adm", prec=3):
    """정규화상호 + 업종소분류 + 위치키 의 해시. 위치키는 기본 '행정동코드'.

    v1은 좌표 3자리(≈110m)를 위치키로 썼다. 그런데 상가정보는 분기마다 좌표를 다시 계산해서
    같은 가게가 110m 칸 경계를 넘나들면 '폐업 + 개업'으로 두 번 잡혔다. 행정동은 좌표가
    조금 흔들려도 안 바뀐다. 서울 2022Q4→2023Q1 실측 (2026-10-01):

        위치키              동일분기 중복률   분기간 매칭률   개업 건수   허위개업*
        좌표 3자리(v1)          0.48%           67.1%        115,616     11.5%
        행정동                  1.06%           70.2%         99,207      2.5%
        행정동 + 200m 보정      1.06%           70.7%         96,707      0.0%**

        *  허위개업 = 개업으로 잡혔는데 같은 상호·업종의 '폐업'이 50m 안에 있는 비율
        ** 보정 단계가 바로 그런 쌍을 같은 가게로 묶으므로 정의상 0이 된다

    중복률은 두 배가 되지만(같은 동에 같은 상호·업종이 둘 — 주로 프랜차이즈) 2% 게이트 안이고,
    diff를 다중집합으로 짝지어서 중복 지문도 개수만큼 매칭된다.

    추가로 지점명을 빼고(norm_name 참고) 유사상호 30m 보정(diff_quarters 3단계)을 더하면:

        2022Q4→2023Q1          개업      잔여오염*   셀프빨래방 개업
        상호+지점, 행정동     96,686      39.3%        300
        상호만, 행정동        63,291      15.5%         16
        + 유사상호 30m        52,834       1.1%         16      ← 채택

        * 잔여오염 = 남은 개업 중 같은 업종 폐업이 30m 안에 있고 상호 유사도 0.5 이상인 비율
    """
    loc = adm_cd if mode == "adm" else f"{round(lon, prec)}|{round(lat, prec)}"
    key = f"{name_norm}|{cat_s}|{loc}"
    return hashlib.blake2s(key.encode(), digest_size=10).hexdigest()


def diff_quarters(prev, cur, fallback_m=FALLBACK_M, fuzzy_m=30, return_links=False):
    """두 분기 스냅샷을 짝지어 폐업·개업을 돌려준다.

    0단계: 상가업소번호가 같으면 같은 가게 (두 분기에 ID가 절반 이상 겹칠 때만 사용).
    1단계: 지문이 같은 것끼리 짝짓는다. 같은 지문이 여러 개면 개수만큼만 (다중집합).
    2단계: 남은 것 중 상호·업종이 같고 fallback_m 이내면 같은 가게로 본다.
           행정동 경계 근처에서 좌표가 흔들린 경우, 행정동 코드가 바뀐 경우, 근거리 이전을 흡수한다.
    3단계: 같은 업종 fuzzy_m 이내에서 상호 표기만 달라진 것을 묶는다 (아래 주석).

    return_links=True 이면 (closed, opened, n_matched, n_fallback, links) 를 돌려준다.
    links = 이어진 쌍 [prev_biz_no, cur_biz_no, stage] — 점포 계보(생존 추적)에 쓴다.
    """
    import numpy as np
    import pandas as pd
    p = prev.reset_index(drop=True).copy(); c = cur.reset_index(drop=True).copy()
    # 0단계: 상가업소번호. 2025Q4 이후 분기 간 87~97%가 유지되고, 이어진 쌍의 99.9%가
    #   같은 업종·200m 이내였다 (2026-10-01 실측). 이전 분기에 ID가 있으면 ID로 먼저 짝짓고,
    #   ID가 바뀐 것(재등록)만 지문 단계로 넘긴다.
    n_id = 0; links = []
    has_id = "biz_no" in p.columns and "biz_no" in c.columns
    if has_id:
        common = set(p.biz_no.dropna()) & set(c.biz_no.dropna()) - {""}
        if len(common) >= 0.5 * min(len(p), len(c)):
            n_id = int(c.biz_no.isin(common).sum())
            if return_links:
                links.append(pd.DataFrame({"prev": sorted(common), "cur": sorted(common), "stage": 0}))
            p = p[~p.biz_no.isin(common)].reset_index(drop=True)
            c = c[~c.biz_no.isin(common)].reset_index(drop=True)
    p["_k"] = p.fp + "#" + p.groupby("fp").cumcount().astype(str)
    c["_k"] = c.fp + "#" + c.groupby("fp").cumcount().astype(str)
    closed = p[~p._k.isin(set(c._k))].copy()
    opened = c[~c._k.isin(set(p._k))].copy()
    n_exact = len(p) - len(closed) + n_id
    if return_links and has_id:
        m1 = p[["biz_no", "_k"]].merge(c[["biz_no", "_k"]], on="_k", suffixes=("_p", "_c"))
        links.append(pd.DataFrame({"prev": m1.biz_no_p, "cur": m1.biz_no_c, "stage": 1}))

    n_fb = 0
    if fallback_m and len(closed) and len(opened):
        for d_ in (closed, opened):
            d_["_nk"] = d_.name_norm.fillna("") + "|" + d_.cat_s
        cand = closed[["_nk", "lon", "lat"]].reset_index().merge(
            opened[["_nk", "lon", "lat"]].reset_index(), on="_nk", suffixes=("_c", "_o"))
        if len(cand):
            dx = (cand.lon_c - cand.lon_o) * 88200; dy = (cand.lat_c - cand.lat_o) * 111000
            cand["d"] = np.hypot(dx, dy)
            cand = cand[cand.d <= fallback_m].sort_values("d")
            used_c, used_o = set(), set()
            for ic, io in zip(cand.index_c.values, cand.index_o.values):   # 가까운 쌍부터 1:1
                if ic in used_c or io in used_o:
                    continue
                used_c.add(ic); used_o.add(io)
                if return_links and has_id:
                    links.append(pd.DataFrame({"prev": [closed.at[ic, "biz_no"]], "cur": [opened.at[io, "biz_no"]], "stage": [2]}))
            closed = closed.drop(index=list(used_c)); opened = opened.drop(index=list(used_o))
            n_fb = len(used_c)
    # 3단계: 같은 업종, 30m 이내, 상호가 접두 관계(짧은 쪽 3자 이상)이거나 유사도 0.75 이상.
    #   '번아트' ↔ '번아트koreaburnartlimited유', '워시엔조이' ↔ '워시엔조이양재점' 처럼
    #   상호 표기만 바뀐 같은 가게를 묶는다. 유사도 높은 쌍부터 1:1.
    n_fz = 0
    if fuzzy_m and len(closed) and len(opened):
        from difflib import SequenceMatcher
        from scipy.spatial import cKDTree
        xy = lambda d: np.c_[d.lon.values * 88200, d.lat.values * 111000]
        cand = []
        for cat, go in opened.groupby("cat_s"):
            gc = closed[closed.cat_s == cat]
            if not len(gc):
                continue
            hits = cKDTree(xy(gc)).query_ball_point(xy(go), r=fuzzy_m)
            ic_arr = gc.index.values; nc_arr = gc.name_norm.fillna("").values
            for io, no, lst in zip(go.index.values, go.name_norm.fillna("").values, hits):
                for k in lst:
                    nc = nc_arr[k]
                    pre = (no.startswith(nc) or nc.startswith(no)) and min(len(no), len(nc)) >= 3
                    sim = SequenceMatcher(None, no, nc).ratio()
                    if pre or sim >= 0.75:
                        cand.append((-sim, ic_arr[k], io))
        used_c, used_o = set(), set()
        for _, ic, io in sorted(cand):
            if ic in used_c or io in used_o:
                continue
            used_c.add(ic); used_o.add(io)
            if return_links and has_id:
                links.append(pd.DataFrame({"prev": [closed.at[ic, "biz_no"]], "cur": [opened.at[io, "biz_no"]], "stage": [3]}))
        closed = closed.drop(index=list(used_c)); opened = opened.drop(index=list(used_o))
        n_fz = len(used_c)
    for d_ in (closed, opened):
        d_.drop(columns=[x for x in ("_k", "_nk") if x in d_.columns], inplace=True)
    if return_links:
        lk = pd.concat(links, ignore_index=True) if links else pd.DataFrame(columns=["prev", "cur", "stage"])
        return closed, opened, n_exact, n_fb + n_fz, lk
    return closed, opened, n_exact, n_fb + n_fz


def load_quarter(path, sido_filter, resolutions, qc):
    import h3 as h3lib
    fh, rdr, cols, enc = open_csv(path)
    idx = {c: i for i, c in enumerate(cols)}
    out, seen_fp = [], Counter()
    n_raw = n_kept = n_nocoord = n_oob = 0
    with fh:
        for row in rdr:
            n_raw += 1
            if len(row) < len(cols):
                continue
            g = lambda c: row[idx[c]].strip() if c in idx else ""
            sido = g("sido")
            if sido_filter and sido_filter not in sido:
                continue
            try:
                lon, lat = float(g("lon")), float(g("lat"))
            except ValueError:
                n_nocoord += 1
                continue
            bb = BBOX.get(sido_filter)
            if bb and not (bb[0] <= lon <= bb[1] and bb[2] <= lat <= bb[3]):
                n_oob += 1
                continue
            nn = norm_name(g("name"), g("branch"))
            if not nn:
                continue
            fp = fingerprint(nn, g("cat_s"), g("adm_cd"), lon, lat, FP_MODE, COORD_PREC)
            seen_fp[fp] += 1
            rec = {
                "fp": fp, "biz_no": g("biz_no"), "name_norm": nn, "name": g("name"), "branch": g("branch"),
                "cat_s": g("cat_s"), "cat_s_nm": g("cat_s_nm"),
                "sgg": g("sgg"), "adm_cd": g("adm_cd"), "adm_nm": g("adm_nm"),
                "floor": g("floor"), "addr_road": g("addr_road"),
                "lon": lon, "lat": lat,
            }
            for r in resolutions:
                rec[f"h3_{r}"] = h3lib.latlng_to_cell(lat, lon, r)
            out.append(rec)
            n_kept += 1
    dup = sum(v - 1 for v in seen_fp.values() if v > 1)
    qc.update(rows_raw=n_raw, rows_kept=n_kept, drop_nocoord=n_nocoord,
              drop_outofbbox=n_oob, fp_unique=len(seen_fp), fp_dup=dup, encoding=enc)
    return out


def find_files(root, pattern):
    """원본 CSV 찾기. macOS에서 받은 파일명은 NFD(자모 분리)로 저장되는 일이 많아
    NFC 패턴('상가(상권)정보')과 그대로 비교하면 하나도 안 맞는다. 이름과 패턴을 둘 다 NFC로 맞춘다.
    패턴의 마지막 경로 조각만 파일명 패턴으로 쓰고, 하위 폴더는 항상 재귀 탐색한다."""
    name_pat = unicodedata.normalize("NFC", pattern).split("/")[-1]
    out = []
    for d, _, fs in os.walk(root):
        for fn in fs:
            if fnmatch.fnmatch(unicodedata.normalize("NFC", fn), name_pat):
                out.append(os.path.join(d, fn))
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, help="원본 CSV가 들어 있는 루트 디렉터리")
    ap.add_argument("--out", required=True, help="파생 스냅샷을 쓸 디렉터리")
    ap.add_argument("--sido", default="서울", help="시도 필터 (빈 문자열이면 전체)")
    ap.add_argument("--res", default="8,9,10", help="H3 해상도 (쉼표 구분)")
    ap.add_argument("--glob", default="**/*상가(상권)정보*.csv", help="원본 파일 이름 패턴 (마지막 조각만 씀, 하위 폴더는 항상 탐색)")
    ap.add_argument("--fp-mode", choices=["adm", "coord"], default="adm",
                    help="지문 위치키: adm=행정동코드(기본), coord=좌표 반올림(v1 방식, 비교용)")
    ap.add_argument("--coord-prec", type=int, default=3,
                    help="--fp-mode coord 일 때 좌표 소수 자릿수 (3 ≈ 110m)")
    ap.add_argument("--fallback-m", type=int, default=200,
                    help="2단계 매칭 반경(m). 0이면 끔")
    args = ap.parse_args()
    global COORD_PREC, FP_MODE, FALLBACK_M
    COORD_PREC, FP_MODE, FALLBACK_M = args.coord_prec, args.fp_mode, args.fallback_m

    try:
        import h3  # noqa
        import pyarrow  # noqa
        import pandas as pd
    except ImportError as e:
        raise SystemExit(f"[!] 필요한 패키지가 없습니다: {e}\n    pip install h3 pyarrow pandas")

    resolutions = [int(x) for x in args.res.split(",") if x.strip()]
    os.makedirs(args.out, exist_ok=True)

    files = find_files(args.raw, args.glob)
    # 주기성 과거 데이터 목록에는 분기 스냅샷이 아닌 파일이 섞여 있다 (의료기관, 카페업소 수, 세탁소 현황 등)
    EXCLUDE = ("업종코드", "의료기관", "카페업소", "세탁소 현황", "수의업", "개업 현황", "변화추이")
    skipped = [f for f in files if any(x in unicodedata.normalize("NFC", os.path.basename(f)) for x in EXCLUDE)]
    files = [f for f in files if f not in skipped]
    for f in skipped:
        print(f"[건너뜀] 분기 스냅샷 아님: {os.path.basename(f)}")
    if not files:
        raise SystemExit(f"[!] 원본 파일을 못 찾음: {args.raw}/{args.glob}")

    by_q = defaultdict(list); mid = []
    for f in files:
        q = quarter_of(f)
        if q is None:
            mid.append(f); continue
        by_q[q].append(f)
    # 분기말이 아닌 파일 — 예: 2025년 3분기판이 2025-10-30에 '_202510'으로 늦게 공개됐다 (20250930 파일은 없다).
    # 바로 앞 분기에 파일이 없으면 그 분기의 늦은 공개판으로 보고 배정한다. 있으면 겹치므로 건너뛴다.
    for f in mid:
        y, mo = map(int, re.findall(r"(20\d{2})(0[1-9]|1[0-2])", os.path.basename(f))[-1])
        pq = f"{y}Q{(mo - 1) // 3}" if mo > 3 else f"{y - 1}Q4"
        if pq not in by_q:
            by_q[pq].append(f)
            print(f"[배정] {os.path.basename(f)} → {pq} (분기말 파일이 없어 늦은 공개판으로 간주)")
        else:
            print(f"[건너뜀] {os.path.basename(f)} — {pq} 파일이 이미 있음")

    print(f"발견한 분기: {', '.join(sorted(by_q))}  (파일 {len(files)}개)\n")
    qc_rows = []

    for q in sorted(by_q):
        snap_path = os.path.join(args.out, f"poi_{q}.parquet")
        qc = {"quarter": q, "ingested_at": datetime.now().isoformat(timespec="seconds")}
        if os.path.exists(snap_path):
            print(f"[{q}] 이미 적재됨 — 건너뜀 ({snap_path})")
            continue
        recs = []
        for f in by_q[q]:
            print(f"[{q}] 읽는 중: {os.path.basename(f)}")
            recs += load_quarter(f, args.sido, resolutions, qc)
        if not recs:
            print(f"[{q}] 유효 레코드 0건 — 건너뜀")
            continue
        df = pd.DataFrame(recs)
        df.to_parquet(snap_path, index=False)
        qc["poi_count"] = len(df)
        qc["fp_dup_rate"] = round(qc["fp_dup"] / max(len(df), 1) * 100, 2)
        # 업종분류 체계 감지 — 2023년 개편으로 소분류가 837 → 247로 바뀌었다.
        # 체계가 다른 분기끼리는 업종코드 기준 비교가 성립하지 않는다.
        qc["cat_s_distinct"] = df.cat_s.nunique()
        qc["taxonomy"] = "247체계(2023개편후)" if qc["cat_s_distinct"] <= 300 else "837체계(개편전)"

        # 격자×업종 집계
        for r in resolutions:
            agg = (df.groupby([f"h3_{r}", "cat_s", "cat_s_nm"])
                     .size().reset_index(name="store_cnt"))
            agg["quarter"] = q
            agg.to_parquet(os.path.join(args.out, f"grid{r}_industry_{q}.parquet"), index=False)
        qc[f"cells_res{resolutions[0]}"] = df[f"h3_{resolutions[0]}"].nunique()

        # 직전 분기와 diff — 원본이 아니라 '이미 적재된 스냅샷'에서 찾는다.
        # (분기가 하나씩 도착하는 게 정상이므로 raw 목록만 보면 diff가 영영 안 돈다)
        prevs = sorted(
            re.search(r"poi_(\d{4}Q\d)\.parquet$", p).group(1)
            for p in glob.glob(os.path.join(args.out, "poi_*.parquet"))
            if re.search(r"poi_(\d{4}Q\d)\.parquet$", p)
        )
        prevs = [x for x in prevs if x < q]
        if prevs:
            pq = prevs[-1]
            ppath = os.path.join(args.out, f"poi_{pq}.parquet")
            if os.path.exists(ppath):
                prev = pd.read_parquet(ppath)
                prev_tax = "247체계(2023개편후)" if prev.cat_s.nunique() <= 300 else "837체계(개편전)"
                if prev_tax != qc["taxonomy"]:
                    print(f"  [!] {pq}({prev_tax})와 {q}({qc['taxonomy']})는 업종분류 체계가 다릅니다.\n"
                          f"      업종코드 기준 비교가 성립하지 않으므로 이 구간을 걸치는 시점 분리는 쓰지 마세요.")
                    qc["taxonomy_break"] = True
                closed, opened, n_exact, n_fb = diff_quarters(prev, df, FALLBACK_M)
                opened["change"] = "opened"; closed["change"] = "closed"
                chg = pd.concat([opened, closed], ignore_index=True)
                chg["quarter"] = q; chg["prev_quarter"] = pq
                chg.to_parquet(os.path.join(args.out, f"change_{pq}_{q}.parquet"), index=False)
                matched = n_exact + n_fb
                qc.update(prev_quarter=pq, fp_mode=FP_MODE, fallback_matched=n_fb,
                          match_rate=round(matched / max(len(prev), 1) * 100, 2),
                          opened=len(opened), closed=len(closed),
                          net_change_pct=round((len(df) - len(prev)) / max(len(prev), 1) * 100, 2))

        qc_rows.append(qc)
        print(f"[{q}] 점포 {qc['poi_count']:,}건 · 좌표결측 {qc['drop_nocoord']:,} · "
              f"경계밖 {qc['drop_outofbbox']:,} · 지문중복 {qc['fp_dup_rate']}%"
              + (f" · 직전대비 매칭 {qc.get('match_rate')}% "
                 f"(개업 {qc.get('opened'):,} / 폐업 {qc.get('closed'):,})" if "match_rate" in qc else ""))

    if qc_rows:
        import pandas as pd
        qpath = os.path.join(args.out, "qc_report.csv")
        pd.DataFrame(qc_rows).to_csv(
            qpath, mode="a", header=not os.path.exists(qpath), index=False, encoding="utf-8-sig")
        print(f"\nQC 리포트: {qpath}")
        print("\n── 품질 게이트 ──")
        for r in qc_rows:
            flags = []
            if r.get("fp_dup_rate", 0) > 2:
                flags.append(f"지문 중복 {r['fp_dup_rate']}% (>2%: 지문 설계 재검토)")
            # 기준은 서울 2022Q4→2023Q1 실측에서 잡았다. 좌표3 지문의 상한이 약 70%이고
            # 그 분기는 원본 수록범위 정비(교육 -42.6%, 보건 -60.0%)가 겹쳐 있었다.
            if "match_rate" in r and r["match_rate"] < 55:
                flags.append(f"직전 분기 매칭 {r['match_rate']}% (<55%: 상호 정규화·지문 위치키 재검토)")
            if "opened" in r and r.get("poi_count") and r["opened"] / r["poi_count"] > 0.06:
                # 정상 분기 쌍(2025Q4→2026Q1)의 개업률은 3.1%였다. 2026Q2는 10.3%였는데
                # 과학·기술(0.8%→10.9%)·시설관리(0.4%→12.2%)처럼 실제로 그렇게 늘 리 없는 업종까지 뛰었다
                # → 원본에 기존 업소가 한꺼번에 추가된 것. 이 구간의 '개업'은 라벨로 쓰기 전에 걸러야 한다
                flags.append(f"개업률 {r['opened']/r['poi_count']:.1%} (>6%: 원본 일괄 추가 의심 — 업종 대분류별 개업률 확인)")
            if abs(r.get("net_change_pct", 0)) > 8:
                flags.append(f"총 점포수 변화 {r['net_change_pct']}% (>8%: 원본 수록범위 변경 의심 — "
                             f"업종 대분류별 증감을 확인할 것)")
            print(f"  {r['quarter']}: " + ("통과" if not flags else " / ".join(flags)))


if __name__ == "__main__":
    main()
