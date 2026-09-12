# -*- coding: utf-8 -*-
"""검증: 매출_밀도 상위가 전부 동대문 전통시장인 게 진짜인가, 면적 분모 인공물인가."""
import pandas as pd, numpy as np
from scipy.stats import spearmanr
a = pd.read_parquet("master/agg16.parquet")

print("── 매출_밀도는 면적의 역수인가? ──────────────────")
r1,_ = spearmanr(a.매출_밀도, 1/a.면적_m2); r2,_ = spearmanr(a.매출_밀도, a.매출평균)
print(f"  매출_밀도 ↔ 1/면적   ρ={r1:+.3f}")
print(f"  매출_밀도 ↔ 매출총액  ρ={r2:+.3f}")
print("  → 분모가 분자보다 순위를 더 많이 결정하면 밀도는 '작은 상권 찾기'가 된다\n")

print("── 상권구분별 프로필 ──────────────────────────")
g = a.groupby("상권구분").agg(
    상권수=("상권_코드","size"), 면적중앙=("면적_m2","median"),
    매출중앙=("매출평균","median"), 매출밀도중앙=("매출_밀도","median"),
    점포중앙=("점포평균","median"), 폐업률중앙=("누적폐업률","median"),
    운영개월중앙=("운영개월","median"))
g["면적중앙"]=(g.면적중앙/1e4).round(1); g["매출중앙"]=(g.매출중앙/1e8).round(0)
g["매출밀도중앙"]=(g.매출밀도중앙/1e8).round(0)
print(g.rename(columns={"면적중앙":"면적(ha)","매출중앙":"분기매출(억)","매출밀도중앙":"매출억/km2"})
        .round(2).to_string())

print("\n── 골목상권만 (1,090개) — 무인·소형 매장이 실제로 들어갈 곳 ──")
gm = a[a.상권구분=="골목상권"].copy()
for x,y in [("매출_밀도","누적폐업률"),("매출평균","누적폐업률"),
            ("점포당매출","누적폐업률"),("매출_밀도","운영개월"),("점포당매출","운영개월")]:
    r,p = spearmanr(gm[x], gm[y], nan_policy="omit")
    print(f"  {x:<8} ↔ {y:<7} ρ={r:+.3f}  n={gm[[x,y]].dropna().shape[0]:,}  {'유의' if p<0.05 else '무의미'}")

print("\n── 골목상권 매출5분위 × 폐업5분위 ───────────────")
gm["매출등급"]=pd.qcut(gm.점포당매출,5,labels=["1(낮음)","2","3","4","5(높음)"])
gm["폐업등급"]=pd.qcut(gm.누적폐업률,5,labels=["1(적음)","2","3","4","5(많음)"])
ct=pd.crosstab(gm.매출등급,gm.폐업등급)
print("  (매출은 '점포당매출' — 면적 분모 인공물을 피한다)")
print(ct.to_string())
n=len(gm); exp=n/25
print(f"\n  기대값(무관계) 칸당 {exp:.0f}개")
print(f"  5×1(돈되고 안망함) {ct.iloc[4,0]:>3}  /  5×5 {ct.iloc[4,4]:>3}  /  1×1 {ct.iloc[0,0]:>3}  /  1×5 {ct.iloc[0,4]:>3}")
from scipy.stats import chi2_contingency
chi2,p,dof,_=chi2_contingency(ct)
print(f"  카이제곱 p={p:.4f}  (크래머 V={np.sqrt(chi2/(n*4)):.3f})")
