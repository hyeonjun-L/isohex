# -*- coding: utf-8 -*-
"""무인 업종 점검 — 서울시 무인점포 명단을 상가정보 가게 기록에 붙여, 무인 가게가 어느 업종코드에 실려 있고
얼마나 버티며 어떤 자리에 있는지 본다 (마스터플랜 §5.16)

입력
  UNM_CSV  서울시 무인점포 현황 (소방재난본부 예방과, 2025-12-31 기준 4,251곳 — 연번·자치구·업소명·업종만, 주소·좌표 없음.
           포털 검색과 방문 확인으로 만든 목록). 기본: isohex 폴더에서 이름에 '무인점포 현황'이 든 csv
  S (인자) poi_2025Q4.parquet (명단 기준일과 같은 분기 — 연결 대상) · poi_2025Q3·poi_2026Q1 (못 붙은 곳 점검) ·
           lineage_long.parquet (p3) · lineage_enriched.parquet (p4 — 마지막 등장·의심 기록 표시)
  결과/    매출잠재_격자.csv (p18 — 셀 수요 접근성·반경 300m 점포 수)
출력 (OUT_DIR, 기본 ./결과)
  무인_연결.csv   명단 1행 = 1곳. 붙은 상가 기록(상가업소번호·계보·상호·지점·업종코드·층·res9 셀)·방법·점수
  무인_업종.csv   무인 유형 × 업종코드: 붙은 수, 그 코드 2025Q4 점포 중 무인 몫(하한), 반년 폐업률 무인/나머지,
                  최근 2년 등록 몫, 1층·지하 몫, 주변 300m 점포 수, 거주 쪽 기울기
  무인_검정.csv   유형별 요약: 연결률, 주 코드, 같은 코드 안 무인−나머지 차이(반년 폐업·최근 등록·1층)와 95% 구간
  무인_등록연도.csv 주 코드에서 ID 발급 연도별 무인 몫 ('2022 이전'은 ID가 처음 매겨질 때 이미 있던 가게가 대부분).
                  셀프 빨래방 코드(거의 전부 무인)에서 붙은 몫의 연도별 기울기로 나눈 '보정무인몫'을 함께 — 새 가게일수록 명단에 덜 올라 있는 만큼
  무인_구별.csv   구별 명단 수와 상가정보 셀프 빨래방·독서실/스터디카페 수, 연결률 (명단이 구마다 고르게 덮였는지)
연결 (같은 자치구 안에서만 찾는다)
  ① 정확  — 정규화한 업소명(공백·기호 제거, 소문자) = 상호명+지점명 또는 상호명, 그 구에 하나뿐
  ② 상호+지점 — 명단 이름의 상호 낱말(일반 낱말 '스터디카페·빨래방·아이스크림·카페·무인…'을 뺀 가장 긴 낱말)과
                지점 핵심('중곡점' → '중곡')이 둘 다 든 상가 기록이 그 구에 하나뿐. 지점 핵심은 상호 낱말을 지운 나머지에서 찾는다
  ③ 유사  — 글자 2·3-그램 TF-IDF 코사인 1위 ≥ T_SIM, 2위와 차 ≥ M_GAP. 명단과 상가 기록 둘 다 지점이 있는데 2글자도 안 겹치면 뺀다('지점다름')
  ④ 포함  — 명단 이름(4글자 이상, 일반 낱말만으로 된 이름 제외)을 통째로 품은 상가 기록이 그 구에 하나뿐
  ⑤ 동명  — 후보가 여럿이면 정확 연결에서 그 유형이 주로 실린 코드(몫 5% 이상) 안에서 하나만 남을 때 (민감도 점검에서 뺀다)
  규칙마다 '주 코드에 실린 몫'으로 정밀도를 따로 잰다 — 맞게 붙었으면 정확 연결만큼, 아무 가게에나 붙었으면 서울 전체 비율만큼 주 코드에 실린다
  상가 기록 하나에는 명단 하나만 (방법 순위 → 점수 순)
반년 폐업 = 2025Q4에 실린 계보가 2026Q2에 없고 다시 안 나타남 (p4와 같은 정의, 의심 기록 제외)
  무인 = 명단에 붙은 계보, 나머지 = 같은 코드의 다른 계보 (유인 + 못 붙은 무인 — 차이를 0 쪽으로 줄이는 쪽의 오염)
  같은 코드끼리만 비교하고 코드별 차이를 MH 가중(n무인·n나머지/합)으로 합친다. 95% 구간 = 코드별 이항 모수 부트스트랩
STAGE=link 은 후보표(S/unmanned_cand.parquet)까지, analyze 는 후보표부터, all(기본)은 둘 다"""
import pandas as pd, numpy as np, sys, os, re, glob, time, math, unicodedata as ud
import scipy.sparse as sp
import pyarrow.parquet as pq
from collections import Counter, defaultdict
t0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
S = sys.argv[1]
R = os.path.join(HERE, "결과"); OUT = os.environ.get("OUT_DIR", R); os.makedirs(OUT, exist_ok=True)
STAGE = os.environ.get("STAGE", "all")
T_SIM = float(os.environ.get("T_SIM", 0.6)); M_GAP = float(os.environ.get("M_GAP", 0.1)); SHARE = 0.05
NB = int(os.environ.get("B_BOOT", 2000)); rng = np.random.default_rng(20261010)
Q0, QS = "2025Q4", ["2025Q3", "2026Q1"]
CAND = f"{S}/unmanned_cand.parquet"
SHORT = {"무인빨래방": "빨래방", "무인스터디카페": "스터디카페", "무인판매점(아이스크림)": "아이스크림",
         "무인판매점(카페)": "카페", "무인사진관": "사진관", "무인판매점(밀키트)": "밀키트"}
RANK = {"정확": 0, "정확(상호)": 1, "상호+지점": 2, "유사": 3, "포함": 4, "동명": 5}
GEN = ["스터디카페", "셀프빨래방", "코인빨래방", "아이스크림", "무인카페", "셀프사진관", "할인점", "전문점", "빨래방", "스터디",
       "스튜디오", "사진관", "밀키트", "세계과자", "24시", "무인", "셀프", "카페", "코인", "포토", "할인", "과자", "24"]
PUN = re.compile(r"[^0-9a-z가-힣]")
nfc = lambda s: ud.normalize("NFC", s) if isinstance(s, str) else ""
nz = lambda s: PUN.sub("", nfc(s).lower())
el = lambda: f"{time.time() - t0:.0f}s"

def find_list():
    p = os.environ.get("UNM_CSV")
    if p: return p
    c = [f for f in glob.glob(os.path.join(HERE, "..", "..", "*.csv")) if "무인점포 현황" in nfc(os.path.basename(f))]   # 종로구 '무인점포 운영시설' 표(키오스크 비율)는 다른 자료
    if not c: raise SystemExit("무인점포 명단 csv를 못 찾음 — UNM_CSV로 지정")
    return sorted(c)[-1]

def read_list():
    f = find_list()
    for enc in ("cp949", "utf-8-sig"):
        try: U = pd.read_csv(f, encoding=enc, dtype=str); break
        except UnicodeDecodeError: continue
    U.columns = [nfc(c).strip() for c in U.columns]
    for c in ("자치구", "업소명", "업종"): U[c] = U[c].map(lambda s: re.sub(r"\s+", " ", nfc(s)).strip())
    U["유형"] = U.업종.map(lambda s: SHORT.get(s, s))
    U["sgg"] = U.자치구.map(lambda g: g if g.endswith("구") else g + "구")
    U["key"] = U.업소명.map(nz); U["uid"] = np.arange(len(U))
    return U, os.path.basename(f)

def poi(q, cols, keys=True):
    f = f"{S}/poi_{q}.parquet"; have = set(pq.read_schema(f).names)
    P = pd.read_parquet(f, columns=[c for c in cols if c in have]).drop_duplicates("biz_no").reset_index(drop=True)
    for c in cols:
        if c not in P: P[c] = ""
    if keys: P["k_full"] = (P.name.fillna("") + P.branch.fillna("")).map(nz); P["k_name"] = P.name.fillna("").map(nz)
    return P

def core(s):
    """일반 낱말을 지운 나머지 — 2글자 미만이면 상호로 쓸 수 없는 이름"""
    for g in GEN: s = s.replace(g, "")
    return s

def parse(name):
    """명단 이름 → (상호 낱말, 지점 핵심). 괄호 안은 버린다. 예: '카페 만월경 논현점(본점)' → ('만월경', '논현')"""
    t = [x for x in (nz(w) for w in re.sub(r"\(.*?\)", " ", name).split()) if x]
    br = t[-1] if len(t) >= 2 and re.search(r"(점|센터)$", t[-1]) else ""
    bc = re.sub(r"(지점|점|센터)$", "", br) if br else ""
    rest = [x for x in (t[:-1] if br else t) if len(core(x)) >= 2]
    return (max(rest, key=lambda x: len(core(x))) if rest else ""), (bc if len(bc) >= 2 else "")

def tail_of(kf, brand):
    """상가 이름에서 상호 낱말을 한 번 지운 나머지 — 지점 핵심은 여기서 찾는다 ('픽미픽미아이스'의 '미아'가 지점으로 잡히지 않게)"""
    return kf.replace(brand, "", 1) if brand and brand in kf else kf

def branch_ok(bc, brand, kf, pbr):
    """명단 지점 핵심 bc가 상가 기록의 지점과 맞나. 상가 쪽에 지점 정보가 없으면 판단하지 않는다(통과).
    둘 다 있으면 2글자가 하나라도 겹쳐야 한다 ('구의동'↔'구의' 통과, '미아'↔'송천' 탈락)"""
    if not bc: return True
    t = tail_of(kf, brand)
    if bc in t: return True
    pb = re.sub(r"(지점|점|센터)$", "", pbr) if pbr else ""
    if not pb:
        m = re.search(r"([0-9a-z가-힣]{2,})(점|센터)$", t); pb = m.group(1) if m else ""
    if not pb: return True
    big = lambda x: {x[i:i + 2] for i in range(len(x) - 1)}
    return bool(big(bc) & big(pb))

def grams(s):
    if len(s) < 2: return [s] if s else []
    return [s[i:i + 2] for i in range(len(s) - 1)] + [s[i:i + 3] for i in range(len(s) - 2)]

def main_codes(C, P):
    """정확 연결에서 유형별로 몫 5% 이상인 업종코드"""
    a = C[C.how.isin(["정확", "정확(상호)"])]
    cs = P.set_index("biz_no").cat_s
    a = a.assign(cat_s=cs.reindex(a.biz_no if "biz_no" in a and a.biz_no.ne("").all() else P.biz_no.values[a.pi.astype(int)]).values)
    sh = a.groupby("유형").cat_s.value_counts(normalize=True)
    return {t: set(sh[t][sh[t] >= SHARE].index) for t in sh.index.get_level_values(0).unique()}

def exact_index(P):
    """(구, 정규화 이름) → 행 번호들. 상호명+지점명과 상호명 둘 다"""
    full, name = defaultdict(list), defaultdict(list)
    for i, (g, a, b) in enumerate(zip(P.sgg.values, P.k_full.values, P.k_name.values)):
        if a: full[(g, a)].append(i)
        if b and b != a: name[(g, b)].append(i)
    return full, name

# ════════════════════════════ 1. 연결 ════════════════════════════
U, LISTF = read_list()
PC = ["biz_no", "name", "branch", "cat_s", "cat_s_nm", "sgg", "floor", "h3_9", "adm_cd"]
if STAGE in ("all", "link"):
    P = poi(Q0, PC)
    print(f"명단 {LISTF}: {len(U):,}곳 · 유형 {U.유형.value_counts().to_dict()}")
    print(f"상가정보 {Q0}: {len(P):,}곳 · 지점명 채움 {(P.branch.fillna('') != '').mean():.0%} · {el()}")
    dup = U.duplicated(["sgg", "key"], keep=False)
    print(f"명단 안 같은 구·같은 이름 {int(dup.sum())}행 (서로 다른 가게일 수도, 중복 기재일 수도)")
    # TF-IDF: 문서 빈도는 상가 쪽 서로 다른 이름에서 센다. 명단에만 있는 그램도 벡터 길이에는 넣는다(맞출 짝 없음 = 감점)
    code, uk = pd.factorize(P.k_full.values)
    dfc = Counter()
    for s in uk: dfc.update(set(grams(s)))
    V = {g: j for j, g in enumerate(dfc)}
    for s in U.key.values:
        for g in grams(s):
            if g not in V: V[g] = len(V)
    N = len(uk); IDF = np.full(len(V), math.log(N + 1) + 1.0)
    for g, d in dfc.items(): IDF[V[g]] = math.log((N + 1) / (d + 1)) + 1.0
    def vec(strings):
        rows, cols, vals = [], [], []
        for r, s in enumerate(strings):
            for g, c in Counter(grams(s)).items():
                j = V[g]; rows.append(r); cols.append(j); vals.append((1.0 if c == 1 else 1.0 + math.log(c)) * IDF[j])
        X = sp.csr_matrix((vals, (rows, cols)), shape=(len(strings), len(V)), dtype=np.float64)
        n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1
        return sp.diags(1 / n).dot(X).tocsr()
    XP = vec(uk); XU = vec(U.key.values)
    print(f"글자 그램 {len(V):,}개 · 상가 이름 {N:,}개 벡터 · {el()}")
    full, name = exact_index(P); KF = P.k_full.values; PB = P.branch.fillna("").map(nz).values
    rec = []
    for g, ug in U.groupby("sgg"):
        prow = np.flatnonzero(P.sgg.values == g)
        if len(prow) == 0:
            for u in ug.uid: rec.append(dict(uid=u, how="구없음"))
            continue
        Sg = (XU[ug.uid.values] @ XP[code[prow]].T).tocsr()
        for r, (u, k, nm) in enumerate(zip(ug.uid.values, ug.key.values, ug.업소명.values)):
            lo, hi = Sg.indptr[r], Sg.indptr[r + 1]; d, ix = Sg.data[lo:hi], Sg.indices[lo:hi]
            o = np.argsort(-d)[:5]; top = [(int(prow[ix[t]]), float(d[t])) for t in o]
            s1 = top[0][1] if top else 0.0; s2 = top[1][1] if len(top) > 1 else 0.0
            ef, en = full.get((g, k), []), name.get((g, k), [])
            near = prow[ix[d >= 0.15]]; kf = KF[near]                     # 글자가 조금이라도 겹치는 후보만 본다
            brand, bc = parse(nm)
            bb = [p for p, x in zip(near, kf) if brand in x and bc in tail_of(x, brand)] if brand and bc else []
            inc = [p for p, x in zip(near, kf) if k in x] if len(k) >= 4 and len(core(k)) >= 2 else []
            row = dict(uid=u, s1=s1, s2=s2, top1=top[0][0] if top else -1, n_ex=len(ef) + len(en), n_bb=len(bb), n_inc=len(inc))
            if len(ef) == 1: row.update(how="정확", pi=ef[0], score=1.0)
            elif not ef and len(en) == 1: row.update(how="정확(상호)", pi=en[0], score=1.0)
            elif len(ef) + len(en) >= 2: row.update(how="동명후보", cands=list(ef or en), score=1.0)
            elif len(bb) == 1: row.update(how="상호+지점", pi=int(bb[0]), score=s1)
            elif s1 >= T_SIM and s1 - s2 >= M_GAP and branch_ok(bc, brand, KF[top[0][0]], PB[top[0][0]]): row.update(how="유사", pi=top[0][0], score=s1)
            elif s1 >= T_SIM and s1 - s2 >= M_GAP: row.update(how="지점다름", score=s1)
            elif s1 >= T_SIM: row.update(how="동명후보", cands=[p for p, s in top if s >= max(T_SIM, s1 - M_GAP)], score=s1)
            elif len(inc) == 1: row.update(how="포함", pi=int(inc[0]), score=s1)
            else: row.update(how="없음", score=s1)
            rec.append(row)
    C = pd.DataFrame(rec).merge(U[["uid", "유형", "sgg"]], on="uid")
    C["pi"] = C.get("pi", pd.Series(np.nan, index=C.index))
    C["top1_biz"] = np.where(C.top1.fillna(-1) >= 0, P.biz_no.values[C.top1.fillna(0).astype(int)], "")
    # 주 코드: ① 정확 연결에서 몫 5% 이상 (유사 연결의 잘못 붙은 몫이 섞이지 않게)
    MAIN = main_codes(C, P)
    print("주 코드(정확 연결 몫 5% 이상):", {t: sorted(v) for t, v in MAIN.items()})
    # ③ 동명: 주 코드 안에서 하나만 남으면
    amb = []
    for i in C.index[C.how == "동명후보"]:
        cs = C.at[i, "cands"]; keep = [p for p in cs if P.cat_s.values[p] in MAIN.get(C.at[i, "유형"], ())]
        codes = sorted(set(P.cat_s.values[cs]))
        amb.append((i, "|".join(codes)))
        if len(keep) == 1: C.at[i, "how"] = "동명"; C.at[i, "pi"] = keep[0]
        else: C.at[i, "how"] = "동명여럿"
    C["amb_codes"] = ""
    for i, c in amb: C.at[i, "amb_codes"] = c
    # 상가 기록 하나에 명단 하나 — 방법 순위, 점수 순
    L = C[C.how.isin(RANK)].copy(); L["rk"] = L.how.map(RANK)
    L = L.sort_values(["rk", "score"], ascending=[True, False]); lose = L.index[L.duplicated("pi")]
    C.loc[lose, "how"] = "중복"; C.loc[lose, "pi"] = np.nan
    ok = C.how.isin(RANK)
    C["biz_no"] = np.where(ok, P.biz_no.values[C.pi.fillna(0).astype(int)], "")
    # 못 붙은 곳: 앞뒤 분기에 정확 일치가 있나 (명단과 상가정보의 시점 차이 점검)
    for q in QS:
        f = f"{S}/poi_{q}.parquet"
        if not os.path.exists(f): continue
        Pq = poi(q, ["biz_no", "name", "branch", "sgg"]); fq, nq = exact_index(Pq)
        C[f"hit_{q}"] = [(not o) and (len(fq.get((g, k), [])) + len(nq.get((g, k), [])) == 1)
                         for o, g, k in zip(ok, C.sgg, U.key.values[C.uid.values])]
    C.drop(columns=["cands"], errors="ignore").to_parquet(CAND, index=False)
    print(f"후보표 저장 {CAND} · {el()}")

# ════════════════════════════ 2. 분석 ════════════════════════════
if STAGE in ("all", "analyze"):
    C = pd.read_parquet(CAND)
    P = poi(Q0, PC, keys=False)
    ok = C.how.isin(RANK)
    print(f"\n── 연결 ({len(C):,}곳) — 방법별:", C.how.value_counts().to_dict())
    for q in QS:
        if f"hit_{q}" in C: print(f"   못 붙은 곳 중 {q}에만 정확 일치: {int(C[f'hit_{q}'].sum())}곳")
    cs_of = P.set_index("biz_no").cat_s
    MAIN = main_codes(C, P)
    # 유사도 점수대별 정밀도 — 맞게 붙었다면 정확 연결만큼 주 코드에 실리고, 아무 가게에나 붙었다면 서울 전체 비율만큼 실린다
    base_rate = {t: P.cat_s.isin(v).mean() for t, v in MAIN.items()}
    ex = C[C.how.isin(["정확", "정확(상호)"])]
    p_ex = {t: cs_of.reindex(g.biz_no).isin(MAIN[t]).mean() for t, g in ex.groupby("유형")}
    F = C[(C.top1_biz != "") & ~C.how.isin(["정확", "정확(상호)"])].copy()
    F["main"] = [cs_of.get(b, "") in MAIN.get(t, ()) for b, t in zip(F.top1_biz, F.유형)]
    F["band"] = pd.cut(F.s1, [0, .4, .5, .6, .7, .8, .9, 1.0001], right=False)
    F["gap_ok"] = (F.s1 - F.s2) >= M_GAP
    print(f"\n── 유사도 점수대별 1위 후보가 주 코드에 실린 몫 (정확 연결 {np.mean(list(p_ex.values())):.0%}, 무작위 {np.mean(list(base_rate.values())):.1%})"
          f" — 추정 정밀도 = (몫 − 무작위) ÷ (정확 − 무작위). 2위와 차 ≥ {M_GAP}인 것만")
    for b, g in F[F.gap_ok].groupby("band", observed=True):
        pe = np.mean([p_ex.get(t, np.nan) for t in g.유형]); br = np.mean([base_rate.get(t, 0) for t in g.유형])
        print(f"   {str(b):12s} n={len(g):4d}  주 코드 몫 {g.main.mean():.0%}  추정 정밀도 {(g.main.mean() - br) / (pe - br):.0%}")
    lkm = C[ok].copy(); lkm["main"] = [cs_of.get(b, "") in MAIN.get(t, ()) for b, t in zip(lkm.biz_no, lkm.유형)]
    print("\n── 규칙별 정밀도 (주 코드 몫으로 추정, 정확 연결 = 100%)")
    for m in RANK:
        g = lkm[lkm.how == m]
        if len(g) == 0: continue
        pe = np.mean([p_ex.get(t, np.nan) for t in g.유형]); br = np.mean([base_rate.get(t, 0) for t in g.유형])
        print(f"   {m:8s} n={len(g):5d}  주 코드 몫 {g.main.mean():.0%}  추정 정밀도 {(g.main.mean() - br) / (pe - br):.0%}")
    dupk = U.duplicated(["sgg", "key"], keep=False).values[C.uid.values]
    print(f"   중복(상가 기록 하나를 두 명단 행이 원함) {int((C.how == '중복').sum())}곳 중 명단에 같은 구·같은 이름이 두 번 이상 실린 것 {int(((C.how == '중복') & dupk).sum())}곳")
    for t, g in ex.groupby("유형"):
        out_main = ~cs_of.reindex(g.biz_no).isin(MAIN[t])
        if out_main.any(): print(f"   정확 연결인데 주 코드 밖 [{t}] {int(out_main.sum())}곳: " +
                                 ", ".join(P.set_index("biz_no").cat_s_nm.reindex(g.biz_no[out_main.values]).value_counts().head(4).index))
    LL = pd.read_parquet(f"{S}/lineage_long.parquet", columns=["lineage", "quarter", "biz_no"], filters=[("quarter", "==", Q0)])
    P = P.merge(LL[["biz_no", "lineage"]].drop_duplicates("biz_no"), on="biz_no", how="left")
    have = set(pq.read_schema(f"{S}/lineage_enriched.parquet").names)
    E = pd.read_parquet(f"{S}/lineage_enriched.parquet",
                        columns=[c for c in ["lineage", "entry", "idm", "lag", "fresh", "suspect", "last"] if c in have])
    P = P.merge(E, on="lineage", how="left")
    G = pd.read_csv(os.path.join(R, "매출잠재_격자.csv"), encoding="utf-8-sig", usecols=["h3_9", "a_거주", "a_출근등교", "점포_반경300m"])
    P = P.merge(G, on="h3_9", how="left"); P["거주기울기"] = P.a_거주 - P.a_출근등교
    fl = P.floor.fillna("").astype(str).str.strip()
    P["f1"] = (fl == "1").astype(float); P["fb"] = fl.str.contains("지|B", regex=True).astype(float)
    P.loc[fl == "", ["f1", "fb"]] = np.nan
    P["closed"] = P["last"].isin(["2025Q4", "2026Q1"]).astype(float)
    P["recent"] = np.where(P.idm.notna(), (P.idm.fillna("") >= "202401").astype(float), np.nan)
    P["young"] = P.idm.fillna("").between("202301", "202505")          # 등록 3년 안쪽 — 오래 안 지워진 옛 기록이 섞이지 않는 비교
    P["susp"] = P.suspect.fillna(True).astype(bool); P["fresh"] = P.get("fresh", False)
    P["fresh"] = P.fresh.fillna(False).astype(bool)
    lk = C[ok].merge(U[["uid", "연번", "자치구", "업소명", "업종"]], on="uid")
    tp = dict(zip(lk.biz_no, lk.유형)); P["유형"] = P.biz_no.map(tp); P["무인"] = P.유형.notna()
    nl = int(P.무인.sum())
    print(f"\n   붙은 상가 기록 {nl:,} · 계보 붙음 {int(P[P.무인].lineage.notna().sum()):,} · 의심 기록(2025-06 이후 등록 등) "
          f"{int(P[P.무인].susp.sum()):,} · 격자 밖 {int(P[P.무인].점포_반경300m.isna().sum())} · {el()}")

    # 연결표
    W = U[["uid", "연번", "자치구", "업소명", "업종", "유형"]].merge(C[["uid", "how", "score", "s1", "s2", "biz_no", "amb_codes"] +
                                                               [c for c in C if c.startswith("hit_")]], on="uid")
    W = W.merge(P[["biz_no", "lineage", "name", "branch", "cat_s", "cat_s_nm", "floor", "h3_9", "entry", "idm", "last", "susp"]],
                on="biz_no", how="left")
    W.rename(columns={"how": "방법", "score": "점수", "s1": "유사도1위", "s2": "유사도2위", "biz_no": "상가업소번호", "lineage": "계보",
                      "name": "상호명", "branch": "지점명", "cat_s": "업종코드", "cat_s_nm": "업종명", "floor": "층", "entry": "첫등장",
                      "idm": "ID발급월", "last": "마지막등장", "susp": "의심기록", "amb_codes": "동명후보코드"}, inplace=True)
    W[["점수", "유사도1위", "유사도2위"]] = W[["점수", "유사도1위", "유사도2위"]].astype(float).round(4)   # 희소 행렬 곱의 끝자리 흔들림을 지운다
    W.drop(columns=["uid"]).to_csv(os.path.join(OUT, "무인_연결.csv"), index=False, encoding="utf-8-sig")

    # 유형별 연결률·코드
    print("\n── 유형별 연결률 (같은 구 안, ①~⑤)")
    tot = U.유형.value_counts(); got = lk.유형.value_counts(); g3 = lk[lk.how != "동명"].유형.value_counts()
    for t in tot.index: print(f"   {t:6s} {got.get(t, 0):5,}/{tot[t]:5,} = {got.get(t, 0) / tot[t]:.0%}  (동명 빼면 {g3.get(t, 0) / tot[t]:.0%})")
    rate_gu = (lk.groupby("sgg").size() / U.groupby("sgg").size()).fillna(0)
    print(f"   구별 연결률 최저 {rate_gu.idxmin()} {rate_gu.min():.0%} · 최고 {rate_gu.idxmax()} {rate_gu.max():.0%}")
    lk = lk.merge(P[["biz_no", "cat_s", "cat_s_nm"]], on="biz_no")
    print("\n── 유형별로 실린 업종코드 (상위)")
    for t in tot.index:
        v = lk[lk.유형 == t].cat_s_nm.value_counts(); n = v.sum()
        print(f"   {t:6s} " + " · ".join(f"{k} {c}({c / n:.0%})" for k, c in v.head(6).items()))
    am = C[(C.how == "동명여럿") & (C.amb_codes != "") & ~C.amb_codes.str.contains("[|]", regex=True)]
    if len(am): print("   (가게는 못 정했지만 후보가 모두 한 코드) " + " · ".join(f"{t} {g.amb_codes.value_counts().head(2).to_dict()}" for t, g in am.groupby("유형")))

    # 유형 × 코드 비교 (코드마다 무인 vs 나머지)
    base = P[P.lineage.notna()]
    rows = []
    for (t, cs), g in base[base.무인].groupby(["유형", "cat_s"]):
        rest = base[(base.cat_s == cs) & ~base.무인]; un = g
        su, sr = un[~un.susp], rest[~rest.susp]; yu, yr = su[su.young], sr[sr.young]
        rows.append(dict(유형=t, 업종코드=cs, 업종명=g.cat_s_nm.iat[0], 무인=len(un), 코드점포=len(un) + len(rest),
                         무인몫=len(un) / (len(un) + len(rest)),
                         개업무인=int(un.fresh.sum()), 개업전체=int(un.fresh.sum() + rest.fresh.sum()),
                         n무인=len(su), 폐업무인=su.closed.sum(), n나머지=len(sr), 폐업나머지=sr.closed.sum(),
                         n무인_젊은=len(yu), 폐업무인_젊은=yu.closed.sum(), n나머지_젊은=len(yr), 폐업나머지_젊은=yr.closed.sum(),
                         등록무인=un.recent.notna().sum(), 등록나머지=rest.recent.notna().sum(),
                         최근무인=un.recent.mean(), 최근나머지=rest.recent.mean(),
                         층무인=un.f1.notna().sum(), 층나머지=rest.f1.notna().sum(), 일층무인=un.f1.mean(), 일층나머지=rest.f1.mean(),
                         지하무인=un.fb.mean(), 지하나머지=rest.fb.mean(),
                         주변무인=un.점포_반경300m.median(), 주변나머지=rest.점포_반경300m.median(),
                         거주무인=un.거주기울기.median(), 거주나머지=rest.거주기울기.median()))
    K = pd.DataFrame(rows)
    K["개업무인몫"] = K.개업무인 / K.개업전체.replace(0, np.nan)
    K["반년폐업_무인"] = K.폐업무인 / K.n무인.replace(0, np.nan); K["반년폐업_나머지"] = K.폐업나머지 / K.n나머지.replace(0, np.nan)
    K = K.sort_values(["유형", "무인"], ascending=[True, False])
    K.to_csv(os.path.join(OUT, "무인_업종.csv"), index=False, encoding="utf-8-sig")

    def mh(k, x1, n1, x0, n0):
        """코드별 위험 차(무인−나머지)를 MH 가중으로 합치고 이항 모수 부트스트랩으로 95% 구간"""
        k = k[(k[n1] > 0) & (k[n0] > 0)]
        if k.empty: return np.nan, np.nan, np.nan, 0
        a1, m1, a0, m0 = (k[c].values.astype(float) for c in (x1, n1, x0, n0)); w = m1 * m0 / (m1 + m0)
        est = np.sum(w * (a1 / m1 - a0 / m0)) / w.sum()
        b1 = rng.binomial(m1.astype(int), a1 / m1, size=(NB, len(k))) / m1; b0 = rng.binomial(m0.astype(int), a0 / m0, size=(NB, len(k))) / m0
        bs = ((b1 - b0) * w).sum(1) / w.sum()
        return est, *np.percentile(bs, [2.5, 97.5]), int(m1.sum())
    out = []
    print("\n── 같은 코드 안 비교 (무인 − 나머지, MH 가중, 코드에 무인 5곳 이상)")
    for t in tot.index:
        k = K[(K.유형 == t) & (K.무인 >= 5)].copy().fillna(0)
        top = k.iloc[0] if len(k) else None
        r = dict(유형=t, 명단=int(tot[t]), 붙음=int(got.get(t, 0)), 연결률=got.get(t, 0) / tot[t],
                 동명제외_연결률=g3.get(t, 0) / tot[t],
                 주코드=" · ".join(f"{a}({b})" for a, b in zip(k.업종명.head(3), k.무인.head(3))),
                 주코드_무인몫=top.무인몫 if top is not None else np.nan, 주코드_개업무인몫=top.개업무인몫 if top is not None else np.nan,
                 주코드_개업수=int(top.개업전체) if top is not None else 0)
        e, lo, hi, n = mh(k, "폐업무인", "n무인", "폐업나머지", "n나머지")
        r.update(반년폐업_무인=k.폐업무인.sum() / max(k.n무인.sum(), 1), 반년폐업차=e, 반년폐업차_하=lo, 반년폐업차_상=hi, 폐업비교_n무인=n)
        ey, loy, hiy, ny = mh(k, "폐업무인_젊은", "n무인_젊은", "폐업나머지_젊은", "n나머지_젊은")
        r.update(반년폐업차_젊은=ey, 반년폐업차_젊은_하=loy, 반년폐업차_젊은_상=hiy, 젊은_n무인=ny)
        k["x_r1"] = (k.최근무인 * k.등록무인).round(); k["x_r0"] = (k.최근나머지 * k.등록나머지).round()
        e2, lo2, hi2, _ = mh(k, "x_r1", "등록무인", "x_r0", "등록나머지")
        r.update(최근등록_무인=k.x_r1.sum() / max(k.등록무인.sum(), 1), 최근등록차=e2, 최근등록차_하=lo2, 최근등록차_상=hi2)
        k["x_f1"] = (k.일층무인 * k.층무인).round(); k["x_f0"] = (k.일층나머지 * k.층나머지).round()
        e3, lo3, hi3, _ = mh(k, "x_f1", "층무인", "x_f0", "층나머지")
        r.update(일층_무인=k.x_f1.sum() / max(k.층무인.sum(), 1), 일층차=e3, 일층차_하=lo3, 일층차_상=hi3)
        out.append(r)
        print(f"   {t:6s} 반년 폐업 무인 {r['반년폐업_무인']:.1%} · 차 {e:+.1%} [{lo:+.1%}, {hi:+.1%}] (n={n}, 등록 3년 안쪽만 {ey:+.1%} [{loy:+.1%}, {hiy:+.1%}] n={ny})"
              f" | 최근 2년 등록 차 {e2:+.0%} [{lo2:+.0%}, {hi2:+.0%}] | 1층 차 {e3:+.0%} [{lo3:+.0%}, {hi3:+.0%}]")
        if top is not None:
            print(f"          주 코드 {top.업종명}: 점포 중 무인 {top.무인몫:.0%} · 2025 상반기 개업(2025Q4 생존) {int(top.개업전체)}곳 중 무인 {top.개업무인몫:.0%}"
                  f" · 주변 300m 점포 중앙값 무인 {top.주변무인:.0f} / 나머지 {top.주변나머지:.0f} · 거주 기울기 {top.거주무인:+.2f} / {top.거주나머지:+.2f}")
    O = pd.DataFrame(out); O.to_csv(os.path.join(OUT, "무인_검정.csv"), index=False, encoding="utf-8-sig")
    # 명단 효과 점검 — 명단은 2025년에 영업 중인 것을 확인한 가게다. 상가정보의 다른 가게에는 이미 닫았는데 기록만 남은 곳이 섞여
    # 다음 분기에 '폐업'으로 지워진다. 그러면 무인이 덜 닫히는 것처럼 보인다. 둘 다 무인인 무리 안에서 명단에 붙은 곳과 안 붙은 곳을 견준다
    sb = base[~base.susp]
    def cmp(mask_all, label):
        g = sb[mask_all]; a1, a0 = g[g.무인], g[~g.무인]
        y1, y0 = a1[a1.young], a0[a0.young]
        print(f"   {label}: 붙은 곳 {a1.closed.mean():.1%}(n={len(a1)}) vs 안 붙은 곳 {a0.closed.mean():.1%}(n={len(a0)})"
              f" · 등록 3년 안쪽 {y1.closed.mean():.1%}(n={len(y1)}) vs {y0.closed.mean():.1%}(n={len(y0)})")
    print("\n── 명단 효과 점검 — 둘 다 무인인 무리에서 반년 폐업 (명단에 붙은 곳 vs 안 붙은 곳)")
    cmp(sb.cat_s == "S20902", "셀프 빨래방 코드(거의 전부 무인)")
    cmp((sb.cat_s == "G20404") & (sb.무인 | sb.name.fillna("").str.contains("아이스|빙과|얼음")), "슈퍼마켓 코드의 아이스크림 가게(안 붙은 곳은 상호에 '아이스·빙과·얼음')")
    # 구별 명단 덮임 — 명단은 소방서가 포털 검색과 방문으로 만든 것이라 구마다 덮는 정도가 다를 수 있다. 상가정보의 셀프 빨래방·스터디카페 수와 견준다
    gl = U.groupby(["sgg", "유형"]).size().unstack(fill_value=0)
    gp = P[P.lineage.notna()].groupby("sgg").cat_s.value_counts().unstack(fill_value=0)
    GU = pd.DataFrame({"명단_빨래방": gl.get("빨래방"), "상가_셀프빨래방": gp.get("S20902"), "명단_스터디카페": gl.get("스터디카페"),
                       "상가_독서실스터디카페": gp.get("R10202"), "명단_아이스크림": gl.get("아이스크림"),
                       "연결률": (lk.groupby("sgg").size() / U.groupby("sgg").size())}).fillna(0)
    GU["빨래방_비"] = GU.명단_빨래방 / GU.상가_셀프빨래방.replace(0, np.nan); GU["스터디_비"] = GU.명단_스터디카페 / GU.상가_독서실스터디카페.replace(0, np.nan)
    GU.reset_index().rename(columns={"sgg": "자치구"}).to_csv(os.path.join(OUT, "무인_구별.csv"), index=False, encoding="utf-8-sig")
    print("\n── 구별 명단 덮임 — 명단 빨래방 ÷ 상가 셀프 빨래방, 명단 스터디카페 ÷ 상가 독서실/스터디카페")
    q = GU.sort_values("빨래방_비")
    print("   빨래방 비 낮은 구: " + " · ".join(f"{i} {r.빨래방_비:.2f}({int(r.명단_빨래방)}/{int(r.상가_셀프빨래방)})" for i, r in q.head(4).iterrows()) +
          " | 높은 구: " + " · ".join(f"{i} {r.빨래방_비:.2f}" for i, r in q.tail(3).iterrows()) + f" | 서울 {GU.명단_빨래방.sum() / GU.상가_셀프빨래방.sum():.2f}")
    q = GU.sort_values("스터디_비")
    print("   스터디카페 비 낮은 구: " + " · ".join(f"{i} {r.스터디_비:.2f}({int(r.명단_스터디카페)}/{int(r.상가_독서실스터디카페)})" for i, r in q.head(4).iterrows()) +
          " | 높은 구: " + " · ".join(f"{i} {r.스터디_비:.2f}" for i, r in q.tail(3).iterrows()) + f" | 서울 {GU.명단_스터디카페.sum() / GU.상가_독서실스터디카페.sum():.2f}")
    # 등록 연도별 무인 몫 — 주 코드에서 2025Q4에 실린 가게를 ID 발급 연도로 나눈다 (살아남은 가게의 몫이라 옛 연도일수록 생존이 섞인다)
    yb = lambda m: "2022 이전" if m < "2023" else m[:4]
    Y = []
    for t in tot.index:
        k = K[K.유형 == t]
        if k.empty: continue
        cs = k.업종코드.iat[0]; g = base[(base.cat_s == cs) & base.idm.notna()].copy(); g["연도"] = g.idm.map(yb)
        for y, h in g.groupby("연도"): Y.append(dict(유형=t, 업종코드=cs, 업종명=k.업종명.iat[0], 등록연도=y, 무인=int(h.무인.sum()), 전체=len(h), 무인몫=h.무인.mean()))
    YD = pd.DataFrame(Y)
    # 기준 — 셀프 빨래방 코드는 거의 전부 무인이다. 여기서 명단에 붙은 몫이 등록 연도에 따라 줄면 '새 가게일수록 명단에 덜 올라 있다'는 뜻이다.
    # 그 기울기(2022 이전 대비)로 다른 코드의 무인 몫을 나눠 추세만 보정한다 (수준은 여전히 하한)
    ctl = base[(base.cat_s == "S20902") & base.idm.notna()].copy(); ctl["연도"] = ctl.idm.map(yb)
    cy = ctl.groupby("연도").무인.mean(); c0 = cy.get("2022 이전", np.nan)
    YD["기준몫"] = YD.등록연도.map(cy); YD["보정무인몫"] = YD.무인몫 * c0 / YD.기준몫
    YD.to_csv(os.path.join(OUT, "무인_등록연도.csv"), index=False, encoding="utf-8-sig")
    cf = ctl[ctl.fresh].무인.mean() / ctl.무인.mean()
    O["주코드_개업무인몫_보정"] = O.주코드_개업무인몫 / cf; O.to_csv(os.path.join(OUT, "무인_검정.csv"), index=False, encoding="utf-8-sig")
    print("\n── 주 코드의 등록 연도별 무인 몫 (2025Q4에 실린 가게) — 괄호는 기울기 보정")
    print("   기준: 셀프 빨래방 코드(거의 전부 무인)에서 명단에 붙은 몫 " + " · ".join(f"{i} {v:.0%}({int((ctl.연도 == i).sum())})" for i, v in cy.items()) +
          f" · 2025 상반기 개업 {ctl[ctl.fresh].무인.mean():.0%}({int(ctl.fresh.sum())}) vs 재고 {ctl.무인.mean():.0%} → 개업 몫 보정 ÷{cf:.2f}")
    for t, g in YD.groupby("유형", sort=False):
        print(f"   {t:6s} {g.업종명.iat[0]}: " + " · ".join(f"{r.등록연도} {r.무인몫:.0%}({r.보정무인몫:.0%})" for r in g.itertuples()))
    print("   2025 상반기 개업 중 무인 몫(보정): " + " · ".join(f"{r.유형} {r.주코드_개업무인몫:.1%}({r.주코드_개업무인몫_보정:.1%}) vs 재고 {r.주코드_무인몫:.1%}" for r in O.itertuples()))
    print(f"\n저장: 무인_연결.csv {len(W):,}행 · 무인_업종.csv {len(K)}행 · 무인_검정.csv {len(O)}행 · 무인_등록연도.csv {len(YD)}행 · 무인_구별.csv {len(GU)}행 · {el()}")
