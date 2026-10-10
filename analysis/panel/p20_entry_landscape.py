# -*- coding: utf-8 -*-
"""개업 지형 — 같은 업종 새 가게는 어디에 생기나, 수요가 그걸 맞히나 (마스터플랜 W3 '개업 지형' · W4 H1, §5.15)

입력
  S (인자)  p3의 lineage_long.parquet (START 2024Q1) · p4의 lineage_enriched.parquet(2026Q2까지 — 개업 뒤 생존) ·
            poi_2024Q4.parquet(진입 직전 재고) · poi_2025Q2.parquet(점검용)
            · sales_potential_cells.parquet (p16 학습 표 — 매출 잠재 지수의 평균·범위)
  결과/     매출잠재_격자.csv (p18 — 셀 중심 수요 접근성) · label_landscape.csv (p4 — 업종 등급) · 매출잠재_계수_수요만.csv (p16)
출력 (OUT_DIR, 기본 ./결과)
  개업_격자.csv  A등급 업종 × res9 셀 — 2025 상반기 신뢰 개업 수, 2024Q4 같은 업종 점포 수(셀·이웃 6칸), 기존 점포로 본 기대 개업 수
                 (개업·점포가 둘 다 0인 칸은 뺀다)
  개업_검정.csv  업종별 H1 검정 — 처음 보는 구에서 예측 상위 10% 칸이 잡은 개업 몫(리프트)과 95% 구간, 이탈도 설명률, 점검 ③~⑤
  entry_data.json  뷰어용 (A등급 업종별 칸 단위 개업·자리 이어받기·2024Q4 점포 수, 이웃 칸 표, 업종 요약)
정의
  개업 = 신뢰 개업 (p4의 fresh를 그대로 쓴다): 2025Q1·Q2에 처음 실린 새 계보 중 ID 발급월이 첫 등장 3개월 이내이고 2025-05 이전,
         기록이 불안정한 체인(스타벅스)과 임시 대체 기록은 뺀다
  진입 직전 재고 = 2024Q4 상가정보. 전체 점포 밀도(셀 중심 반경 300m)도 2024Q4로 다시 잰다 — p18 값(2025Q2)에는 이 개업이 섞여 있다
  수요 접근성 = p16·p18의 거주·출근등교·기타 도착 접근성 (시점이 고정된 자료)
검정 — 자치구 하나씩 빼고 학습해 뺀 구의 칸을 예측 (25번), 포아송 회귀
  D  수요만 (H1)                    A  전체 점포 밀도만               P  매출 잠재 지수 (지도에 칠하는 값, 1:1 업종, 학습 없음)
  S  기존 점포 (같은 업종 셀·이웃 + 전체 밀도)                       SD 기존 점포 + 수요
  N  같은 업종 점포 수(셀 + 이웃) 그대로 (학습 없음 — '기존 가게가 많은 곳'이라는 가장 단순한 규칙)
  리프트 = 예측 상위 10% 칸이 잡은 개업 몫 ÷ 10%. 동점 칸은 칸 수 비율로 나눈다. 95% 구간 = res7 부모 칸 단위 블록 부트스트랩
  설명률 D² = 1 − 이탈도(모형) ÷ 이탈도(학습 구의 평균 개업률). 처음 보는 구 기준
  H1 통과 = D의 리프트 95% 구간 하한 > 1.3 (마스터플랜 W4)
점검 ① 점포 밀도 재계산 = p18 · ② 신뢰 개업 수 = p4 · ③ 상위 10% 칸의 기존 점포 몫 vs 개업 몫 · ④ 자리 이어받기 — 개업 1m 안(같은 건물 좌표)에서
  같은 업종 점포가 바로 그 분기에 사라졌나 (직전 분기에 있고 개업 분기에 없음). 같은 분기에 남은 기존 점포의 같은 비율과 비교 · ⑤ 지속성 — 기존 점포로 본
  기대보다 많이 열린 동이 1분기와 2분기에 같은가 (행정동 표준화 잔차 상관) · ⑥ 이어받은 가게와 새 자리 가게가 2026Q2에도 실려 있는 비율 (업종 층화)"""
import pandas as pd, numpy as np, sys, os, h3, time, json
from scipy.spatial import cKDTree
t0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
S = sys.argv[1]
R = os.path.join(HERE, "결과")
OUT = os.environ.get("OUT_DIR", R); os.makedirs(OUT, exist_ok=True)
pick = lambda f: os.path.join(S, f) if os.path.exists(os.path.join(S, f)) else os.path.join(R, f)
NB = int(os.environ.get("B_BOOT", 400)); rng = np.random.default_rng(20261010)
FM = {"2025Q1": "202503", "2025Q2": "202506"}; mi = lambda m: int(m[:4]) * 12 + int(m[4:]) - 1
XW = {"I21201": "CS100010", "G20405": "CS300002", "G20404": "CS300001", "S20701": "CS200028", "S20702": "CS200030",
      "S20703": "CS200029", "I21006": "CS100007", "I21001": "CS100005", "I20201": "CS100002", "I21007": "CS100008",
      "G21501": "CS300018", "G21503": "CS300022", "R10407": "CS200037", "G20802": "CS300004", "R10406": "CS200019",
      "R10310": "CS200016", "G21901": "CS300028", "G21602": "CS300016", "G20506": "CS300009"}   # 상가 코드 → 상권분석 업종 (p16·p18, 세탁소 제외)
CAT = {"G": "소매", "I": "숙박·음식", "S": "수리·개인", "R": "예술·스포츠", "M": "과학·기술", "N": "시설관리·임대", "L": "부동산", "P": "교육", "Q": "보건"}

# ── 격자 (p18과 같은 8,322칸)와 이웃
G = pd.read_csv(os.path.join(R, "매출잠재_격자.csv"), encoding="utf-8-sig",
                usecols=["h3_9", "자치구", "행정동", "a_거주", "a_출근등교", "a_기타", "점포_반경300m"])
n = len(G); idx = {c: i for i, c in enumerate(G.h3_9)}; HS = pd.Index(G.h3_9)
lat, lon = np.array([h3.cell_to_latlng(c) for c in G.h3_9]).T
nb = np.full((n, 6), n)                                              # n = 없는 이웃(0으로 더함)
for i, c in enumerate(G.h3_9):
    for j, x in enumerate(x for x in h3.grid_ring(c, 1) if x in idx): nb[i, j] = idx[x]
ring = lambda v: np.r_[v, 0][nb].sum(1)
blk = pd.factorize(np.array([h3.cell_to_parent(c, 7) for c in G.h3_9]))[0]; nblk = blk.max() + 1
gu = G.자치구.values; GU = np.unique(gu)

# ── 점포 밀도: 2025Q2로 다시 재면 p18 값과 같아야 한다 → 같은 방법으로 2024Q4를 잰다
cen = np.c_[lon * 88200, lat * 111000]
def n300(f):
    s = pd.read_parquet(f, columns=["lon", "lat"]); return cKDTree(np.c_[s.lon.values * 88200, s.lat.values * 111000]).query_ball_point(cen, 300, return_length=True)
chk = n300(f"{S}/poi_2025Q2.parquet")
print(f"점검 ① 셀 중심 반경 300m 점포 수를 2025Q2로 다시 재면 p18과 같은 칸 {np.mean(chk == G['점포_반경300m'].values):.2%}")
s24 = pd.read_parquet(f"{S}/poi_2024Q4.parquet", columns=["cat_s", "h3_9", "lon", "lat"])
G["n300_24"] = n300(f"{S}/poi_2024Q4.parquet"); G["l_all300_24"] = np.log1p(G.n300_24)

# ── 신뢰 개업 (p4 정의)
EN = pd.read_parquet(os.path.join(S, "lineage_enriched.parquet"), columns=["lineage", "fresh", "last"])
N = pd.read_parquet(f"{S}/lineage_long.parquet", columns=["lineage", "quarter", "how", "cat_s", "h3_9", "floor", "lon", "lat"],
                    filters=[("quarter", "in", ["2025Q1", "2025Q2"]), ("how", "==", "new")])
O = N[N.lineage.isin(set(EN.lineage[EN.fresh]))].copy()
L = pd.read_csv(os.path.join(R, "label_landscape.csv"))
print(f"점검 ② 신뢰 개업 {len(O):,}건 — p4 표 합계 {int(L['개업_2분기'].sum()):,}건과 "
      + ("같다" if len(O) == int(L['개업_2분기'].sum()) else "다르다 (!)"))
inside = O.h3_9.isin(HS); print(f"   격자 밖(서울 경계에 걸친 칸) 개업 {(~inside).mean():.2%}")
O = O[inside]
A = L[L.등급.str.startswith("A")].set_index("cat_s")
LL = pd.read_parquet(f"{S}/lineage_long.parquet", columns=["lineage", "quarter", "cat_s", "lon", "lat"], filters=[("quarter", "in", ["2024Q4", "2025Q1", "2025Q2"])])
GONE, STAY = {}, {}
for qa, qb in (("2024Q4", "2025Q1"), ("2025Q1", "2025Q2")):            # 개업 분기 qb에 바로 사라진 점포 / 그대로 남은 점포
    pa_ = LL[LL.quarter == qa]; inb = pa_.lineage.isin(set(LL.lineage[LL.quarter == qb]))
    GONE[qb] = pa_[~inb]; STAY[qb] = pa_[inb]
del LL
LAST = EN.set_index("lineage")["last"]
O["alive_end"] = O.lineage.map(LAST).eq("2026Q2") if LAST is not None else np.nan   # 2026Q2에도 실려 있나 (개업 뒤 12~15개월)
OFFICE = {"M10301", "M10402", "M10501", "M10703", "M10901", "M11201", "M11203", "N10101", "N10201", "N10501", "N10802", "P10701", "P10799"}   # 사무실형 업종
SV = pd.read_csv(os.path.join(R, "업종별_생존.csv")).set_index("cat_s")
dong_of = G.행정동.values
Y = O.groupby(["cat_s", "h3_9"]).size(); K = s24.groupby(["cat_s", "h3_9"]).size()
def vec(ser, code):
    v = np.zeros(n)
    if code in ser.index.get_level_values(0):
        s = ser.loc[code]; s = s[s.index.isin(HS)]; v[[idx[c] for c in s.index]] = s.values
    return v

# ── 매출 잠재 지수 (p18 v1.1 — 끝값 맞춤, 전체 점포 밀도만 2024Q4로)
P16 = pd.read_parquet(f"{S}/sales_potential_cells.parquet"); Kf = pd.read_csv(pick("매출잠재_계수_수요만.csv"))
Kf["svc"] = Kf.업종.map(P16.groupby("업종").svc.first()); Kf = Kf.set_index("svc")
C4 = ["a_거주", "a_출근등교", "a_기타", "l_all300"]
mu = P16.groupby("svc")[C4].mean(); lo = P16.groupby("svc")[C4].min(); hi = P16.groupby("svc")[C4].max()
X4 = np.c_[G.a_거주, G.a_출근등교, G.a_기타, G.l_all300_24]
def pscore(k): return (np.clip(X4, lo.loc[k].values, hi.loc[k].values) - mu.loc[k].values) @ Kf.loc[k, C4].values.astype(float)

# ── 포아송 회귀 (뉴턴법) · 처음 보는 구 예측 · 이탈도 · 리프트
LAM = 1.0                                                           # 표준화 계수에 거는 작은 릿지 — 한 구에 몰린 업종(변호사)에서 계수가 터지는 것을 막는다
def fit(X, y):
    Z = np.c_[np.ones(len(X)), X]; b = np.zeros(Z.shape[1]); b[0] = np.log(max(y.mean(), 1e-9)); P_ = LAM * np.eye(len(b)); P_[0, 0] = 0
    for _ in range(100):
        m = np.exp(np.clip(Z @ b, -30, 30)); H = Z.T @ (m[:, None] * Z) + P_ + 1e-9 * np.eye(len(b))
        st = np.linalg.solve(H, Z.T @ (y - m) - P_ @ b); b += st
        if np.abs(st).max() < 1e-9: break
    return b
def cv(X, y):
    p = np.zeros(n); p0 = np.zeros(n)
    for g in GU:
        tr = gu != g; te = ~tr; m_ = X[tr].mean(0); s_ = X[tr].std(0); s_ = np.where(s_ > 0, s_, 1.0)
        Xt = np.clip(X[te], X[tr].min(0), X[tr].max(0))                 # 처음 보는 구의 값은 학습 범위 끝값으로 맞춘다 (관통 규칙 18)
        b = fit((X[tr] - m_) / s_, y[tr]); p[te] = np.exp(np.clip(b[0] + ((Xt - m_) / s_) @ b[1:], -30, 30)); p0[te] = y[tr].mean()
    return p, p0
def dev(y, m):
    m = np.maximum(m, 1e-12); return 2 * (np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / m), 0) - (y - m))
W = np.vstack([np.ones(nblk), rng.multinomial(nblk, np.full(nblk, 1 / nblk), size=NB)])[:, blk]   # 0행 = 원표본, 칸 가중치
def lift(score, y, frac=0.10):
    o = np.argsort(-score, kind="stable"); s = score[o]; st = np.r_[0, np.flatnonzero(s[1:] != s[:-1]) + 1]
    w = W[:, o]; gw = np.add.reduceat(w, st, axis=1); gy = np.add.reduceat(w * y[o], st, axis=1)
    cw = np.cumsum(gw, 1); thr = frac * cw[:, -1:]; take = np.clip((thr - (cw - gw)) / np.where(gw > 0, gw, 1), 0, 1)
    v = (take * gy).sum(1) / np.maximum(gy.sum(1), 1e-12) / frac
    return v[0], np.percentile(v[1:], 2.5), np.percentile(v[1:], 97.5)

rows, grid, VJ, SURV = [], [], {}, []
for code, a in A.iterrows():
    y = vec(Y, code); k0 = vec(K, code); kr = ring(k0)
    D_ = np.c_[G.a_거주, G.a_출근등교, G.a_기타]; S_ = np.c_[np.log1p(k0), np.log1p(kr), G.l_all300_24]
    M = {"D": cv(D_, y), "A": cv(G[["l_all300_24"]].values, y), "S": cv(S_, y), "SD": cv(np.c_[S_, D_], y)}
    r = dict(cat_s=code, 업종=a.cat_s_nm, 대분류=CAT.get(code[0], ""), 개업=int(y.sum()), 개업셀=int((y > 0).sum()),
             새자리_셀=round(float(y[k0 == 0].sum() / y.sum()), 3), 새자리_이웃까지=round(float(y[(k0 == 0) & (kr == 0)].sum() / y.sum()), 3),
             점포_2024Q4=int(k0.sum()))
    for nm, (p, p0) in M.items():
        r[f"리프트_{nm}"], r[f"리프트_{nm}_하"], r[f"리프트_{nm}_상"] = lift(p, y)
        d0 = dev(y, p0); dm = dev(y, p); r[f"설명률_{nm}"] = 1 - dm.sum() / d0.sum()
        M[nm] = (p, p0, dm, d0)
    r["리프트_N"], r["리프트_N_하"], r["리프트_N_상"] = lift(k0 + kr, y)
    if code in XW and XW[code] in Kf.index:
        r["리프트_P"], r["리프트_P_하"], r["리프트_P_상"] = lift(pscore(XW[code]), y)
    dS, dSD, d0 = M["S"][2], M["SD"][2], M["S"][3]
    g = 1 - (W @ dSD) / (W @ d0) - (1 - (W @ dS) / (W @ d0))           # 수요를 더해 늘어난 설명률 (블록 부트스트랩)
    r["설명률_증가_수요"], r["설명률_증가_하"], r["설명률_증가_상"] = g[0], np.percentile(g[1:], 2.5), np.percentile(g[1:], 97.5)
    r["H1"] = "통과" if r["리프트_D_하"] > 1.3 else "불통과"
    # 점검 ③ 집중도 — 같은 업종 점포가 많은 상위 10% 칸이 '기존 점포'와 '개업'을 각각 얼마나 담나
    sc = k0 + kr; r["상위10_점포몫"] = round(lift(sc, k0)[0] * 0.1, 3); r["상위10_개업몫"] = round(r["리프트_N"] * 0.1, 3)
    # 점검 ④ 자리 이어받기 — 개업 지점 1m 안(같은 건물 좌표)에서 같은 업종 점포가 바로 그 분기에 사라졌나
    o = O[O.cat_s == code]; xy = lambda d: np.c_[d.lon.values * 88200, d.lat.values * 111000]
    rep_ = np.zeros(len(o), bool); base = []
    for qb in ("2025Q1", "2025Q2"):
        gz = GONE[qb][GONE[qb].cat_s == code]; sz = STAY[qb][STAY[qb].cat_s == code]; mq = (o.quarter == qb).values
        if len(gz) == 0: continue
        tg = cKDTree(xy(gz))
        if mq.any(): rep_[mq] = tg.query(xy(o[mq]), distance_upper_bound=1)[0] <= 1
        if len(sz): base.append(tg.query(xy(sz), distance_upper_bound=1)[0] <= 1)
    r["자리교체_기준"] = round(float(np.concatenate(base).mean()), 3) if base else 0.0
    r["자리교체"] = round(float(rep_.mean()), 3)
    # 점검 ⑥ 개업 뒤 생존 — 2026Q2에도 실려 있는 비율, 이어받은 가게 vs 새 자리
    if LAST is not None:
        al = o.alive_end.values.astype(bool)
        r["생존_이어받기_n"], r["생존_이어받기"] = int(rep_.sum()), (round(float(al[rep_].mean()), 3) if rep_.any() else np.nan)
        r["생존_그외_n"], r["생존_그외"] = int((~rep_).sum()), (round(float(al[~rep_].mean()), 3) if (~rep_).any() else np.nan)
        SURV.append((code, code in OFFICE, int(rep_.sum()), int(al[rep_].sum()), int((~rep_).sum()), int(al[~rep_].sum())))
    yr = vec(o[rep_].groupby(["cat_s", "h3_9"]).size(), code)
    yx = vec(o[~rep_].groupby(["cat_s", "h3_9"]).size(), code); r["리프트_N_교체제외"] = round(lift(k0 + kr, yx)[0], 3)
    # 점검 ⑤ 지속성 — 기존 점포로 본 기대보다 많이 열린 동이 1분기와 2분기에 같은가 (행정동 단위)
    pS = M["S"][0]
    for qq in ("2025Q1", "2025Q2"):
        yq = vec(o[o.quarter == qq].groupby(["cat_s", "h3_9"]).size(), code)
        OD = pd.DataFrame({"d": dong_of, "o": yq, "e": pS * yq.sum() / pS.sum()}).groupby("d").sum()
        r[f"_z{qq}"] = ((OD.o - OD.e) / np.sqrt(OD.e + 1e-9)).values
    r["지속성_r"] = round(float(np.corrcoef(r["_z2025Q1"], r["_z2025Q2"])[0, 1]), 3)
    r["사무실형"] = code in OFFICE
    sv = SV.loc[code] if code in SV.index else None
    r["S12"] = None if sv is None else float(sv.S12_추정); r["S12_하"] = None if sv is None else float(sv.S12_하)
    r["S12_상"] = None if sv is None else float(sv.S12_상); r["기존_연폐업률"] = None if sv is None else float(sv.기존_연폐업률)
    VJ[code] = dict(O=[int(v) for i in np.flatnonzero(y) for v in (i, y[i], yr[i])], K=[int(v) for i in np.flatnonzero(k0) for v in (i, k0[i])])
    rows.append(r)
    # 지도용: 전체 칸으로 다시 맞춘 기존 점포 모형의 기대 개업 수
    m_ = S_.mean(0); s_ = S_.std(0); s_ = np.where(s_ > 0, s_, 1.0); b = fit((S_ - m_) / s_, y); ex = np.exp(b[0] + ((S_ - m_) / s_) @ b[1:])
    keep = (y > 0) | (k0 > 0)
    grid.append(pd.DataFrame({"h3_9": G.h3_9.values[keep], "cat_s": code, "업종": a.cat_s_nm, "개업_2025상반기": y[keep].astype(int),
                              "자리이어받기": yr[keep].astype(int), "점포_2024Q4": k0[keep].astype(int), "이웃점포_2024Q4": kr[keep].astype(int),
                              "기대개업_기존점포": ex[keep].round(4)}))
Z1 = np.concatenate([r.pop("_z2025Q1") for r in rows]); Z2 = np.concatenate([r.pop("_z2025Q2") for r in rows])
T = pd.DataFrame(rows).sort_values("개업", ascending=False)
for c in T.columns:
    if c.startswith(("리프트", "설명률")): T[c] = T[c].astype(float).round(3)
T.to_csv(os.path.join(OUT, "개업_검정.csv"), index=False, encoding="utf-8-sig")
r3 = lambda v: None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), 3)
VJS = {"meta": {"period": "2025Q1~Q2", "stock": "2024Q4", "cells": n, "boot": NB, "blocks": int(nblk),
                "nb": [int(v) if v < n else -1 for v in nb.ravel()]},
       "ind": [{"k": r.cat_s, "nm": r.업종, "grp": r.대분류, "office": bool(r.사무실형), "n": int(r.개업), "cells": int(r.개업셀),
                "stock": int(r.점포_2024Q4), "newsite": r3(r.새자리_셀), "nr": r3(r.새자리_이웃까지), "rep": r3(r.자리교체), "rep0": r3(r.자리교체_기준),
                "lD": [r3(r.리프트_D), r3(r.리프트_D_하), r3(r.리프트_D_상)], "lN": r3(r.리프트_N), "lS": r3(r.리프트_S), "lSD": r3(r.리프트_SD),
                "lP": r3(getattr(r, "리프트_P", None)), "gain": [r3(r.설명률_증가_수요), r3(r.설명률_증가_하), r3(r.설명률_증가_상)],
                "pers": r3(r.지속성_r), "h1": r.H1 == "통과",
                "alive": [r3(getattr(r, "생존_이어받기", None)), r3(getattr(r, "생존_그외", None))], "s12": [r3(r.S12), r3(r.S12_하), r3(r.S12_상)], "close": r3(r.기존_연폐업률),
                **VJ[r.cat_s]} for r in T.itertuples()]}
json.dump(VJS, open(os.path.join(OUT, "entry_data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
pd.concat(grid).to_csv(os.path.join(OUT, "개업_격자.csv"), index=False, encoding="utf-8-sig")

# ── 요약
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
print(f"\nA등급 {len(T)}개 업종 · 개업 {T.개업.sum():,}건 · 블록 {nblk}개(res7) · 부트스트랩 {NB}회")
print(f"H1 (수요만, 리프트 구간 하한 > 1.3): 통과 {int((T.H1 == '통과').sum())} / {len(T)}")
for m in ["D", "A", "P", "S", "SD", "N"]:
    c = f"리프트_{m}"; v = T[c].dropna()
    print(f"  리프트 {m:>2}: 업종 중앙 {v.median():.2f} (가운데 50% {v.quantile(.25):.2f}~{v.quantile(.75):.2f}) · 업종 {len(v)}개"
          + (f" · 설명률 중앙 {T['설명률_' + m].median():.3f}" if f"설명률_{m}" in T else ""))
print(f"  수요를 더한 설명률 증가(SD − S): 중앙 {T.설명률_증가_수요.median():+.4f} · 구간이 0보다 큰 업종 {int((T.설명률_증가_하 > 0).sum())} / {len(T)}")
print(f"  새 자리(셀에 같은 업종이 없던 곳) 개업 비율: 중앙 {T.새자리_셀.median():.0%} · 이웃까지 없던 곳 {T.새자리_이웃까지.median():.0%}")
print(f"\n점검 ③ 집중도 — 같은 업종 점포 상위 10% 칸이 담은 몫: 기존 점포 중앙 {T.상위10_점포몫.median():.0%} · 개업 중앙 {T.상위10_개업몫.median():.0%}")
print(f"점검 ④ 자리 이어받기 — 개업 1m 안(같은 건물)에서 그 사이 같은 업종이 사라졌다: 업종 중앙 {T.자리교체.median():.0%} (가운데 50% {T.자리교체.quantile(.25):.0%}~{T.자리교체.quantile(.75):.0%})"
      f" · 남은 기존 점포의 같은 비율 중앙 {T.자리교체_기준.median():.0%} · 이어받기를 빼도 N 리프트 중앙 {T.리프트_N_교체제외.median():.2f} (전체 {T.리프트_N.median():.2f})")
print(f"점검 ⑤ 지속성 — 기존 점포로 본 기대 대비 초과 개업(행정동 표준화 잔차) 1분기 ↔ 2분기 상관: 업종 중앙 {T.지속성_r.median():+.3f}"
      f" · 업종×동 전체 {np.corrcoef(Z1, Z2)[0, 1]:+.3f} (동 {len(G.행정동.unique())}곳 × 업종 {len(T)}개)"
      f" · 생활형 업종 중앙 {T[~T.사무실형].지속성_r.median():+.3f} · 사무실형 {T[T.사무실형].지속성_r.median():+.3f}")
print(f"   (반기 전체의 신뢰도 ≈ 2r/(1+r) = {2 * T.지속성_r.median() / (1 + T.지속성_r.median()):.2f} — 동별 초과 개업을 지도 점수로 쓰기엔 잡음이 크다)")
if SURV:   # 점검 ⑥ — 업종 층화(맨텔–헨젤) 위험차, 모수 부트스트랩 구간
    U = pd.DataFrame(SURV, columns=["k", "office", "n1", "s1", "n0", "s0"]); U = U[(U.n1 > 0) & (U.n0 > 0)]
    def mh(d): w = d.n1 * d.n0 / (d.n1 + d.n0); return float((w * (d.s1 / d.n1 - d.s0 / d.n0)).sum() / w.sum())
    for lab, d in (("생활형", U[~U.office]), ("전체", U)):
        bs = [mh(d.assign(s1=rng.binomial(d.n1, d.s1 / d.n1), s0=rng.binomial(d.n0, d.s0 / d.n0))) for _ in range(NB)]
        print(f"점검 ⑥ 2026Q2에도 실려 있는 비율 ({lab} {len(d)}개 업종): 이어받은 가게 {d.s1.sum() / d.n1.sum():.1%} (n={d.n1.sum():,}) · 그 밖 {d.s0.sum() / d.n0.sum():.1%} (n={d.n0.sum():,})"
              f" · 업종 층화 차이 {mh(d) * 100:+.1f}%p (95% {np.percentile(bs, 2.5) * 100:+.1f}~{np.percentile(bs, 97.5) * 100:+.1f})")
print(f"생활형 {int((~T.사무실형).sum())}개 업종: H1 통과 {int(((T.H1 == '통과') & ~T.사무실형).sum())} · 리프트 D 중앙 {T[~T.사무실형].리프트_D.median():.2f} · N 중앙 {T[~T.사무실형].리프트_N.median():.2f}"
      f" · 자리 이어받기 중앙 {T[~T.사무실형].자리교체.median():.0%}")
show = T[["업종", "개업", "새자리_셀", "자리교체", "자리교체_기준", "생존_이어받기", "생존_그외", "리프트_D", "리프트_D_하", "리프트_A", "리프트_P", "리프트_S", "리프트_SD", "리프트_N", "설명률_S", "설명률_증가_수요", "지속성_r", "H1"]]
print(show.to_string(index=False))
print(f"\n저장 → {OUT}: 개업_검정.csv · 개업_격자.csv · entry_data.json ({os.path.getsize(os.path.join(OUT, 'entry_data.json')) / 1e6:.2f}MB)  ({time.time() - t0:.0f}s)")
