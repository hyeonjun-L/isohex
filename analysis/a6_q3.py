# -*- coding: utf-8 -*-
"""Q3. 매출 높은 상권과 생존 좋은 상권은 같은 곳인가?"""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
from scipy.stats import spearmanr
warnings.filterwarnings("ignore")
m = pd.read_parquet("master/panel.parquet")

# 매출은 '합'이 아니라 '관측된 분기 평균'으로 — 분기 결측이 상권마다 달라서
cov = m.groupby("상권_코드").매출액.apply(lambda s: s.notna().sum())
ok  = cov[cov>=16].index
a = (m[m.상권_코드.isin(ok)].groupby("상권_코드")
     .agg(매출평균=("매출액","mean"), 점포평균=("점포수","mean"),
          폐업합=("폐업수","sum"), 점포합=("점포수","sum"), 개업합=("개업수","sum"),
          운영개월=("운영개월","mean"), 폐업개월=("폐업개월","mean"),
          유동인구=("유동인구","mean"), 상주인구=("상주인구","mean"),
          직장인구=("직장인구","mean"), 집객시설=("집객시설","mean"),
          면적_m2=("면적_m2","first"), 상권구분=("상권구분","first"),
          자치구=("자치구","first"), 상권명=("상권명","first")).reset_index())
a["누적폐업률"] = a.폐업합/a.점포합*100
a["점포당매출"] = a.매출평균/a.점포평균
a["매출_밀도"]  = a.매출평균/(a.면적_m2/1e6)
print(f"대상 상권 {len(a):,}개 (20분기 중 16분기 이상 매출 관측)\n")

print("── 매출 지표 ↔ 생존 지표 (스피어만) ─────────────────")
pairs = [("매출_밀도","누적폐업률"),("매출_밀도","운영개월"),("매출_밀도","폐업개월"),
         ("점포당매출","누적폐업률"),("점포당매출","운영개월"),("점포당매출","폐업개월")]
for x,y in pairs:
    r,p = spearmanr(a[x], a[y], nan_policy="omit")
    print(f"  {x:<8} ↔ {y:<7} ρ={r:+.3f}  {'(유의)' if p<0.05 else '(무의미)'}")

print("\n── 매출 5분위 × 폐업률 5분위 교차표 (상권 수) ────────")
a["매출등급"] = pd.qcut(a.매출_밀도, 5, labels=["매출1(낮음)","2","3","4","매출5(높음)"])
a["폐업등급"] = pd.qcut(a.누적폐업률, 5, labels=["폐업1(적음)","2","3","4","폐업5(많음)"])
ct = pd.crosstab(a.매출등급, a.폐업등급)
print(ct.to_string())
diag = np.trace(ct.values[::-1])  # 매출높음&폐업적음 방향
print(f"\n  매출5×폐업1 (돈 되고 안 망함) : {ct.iloc[4,0]:>3}개")
print(f"  매출5×폐업5 (돈 되지만 망함)   : {ct.iloc[4,4]:>3}개")
print(f"  매출1×폐업1 (조용하고 안 망함) : {ct.iloc[0,0]:>3}개")
print(f"  매출1×폐업5 (안 되고 망함)     : {ct.iloc[0,4]:>3}개")

print("\n── 매출5×폐업1 상권 상위 12 ──────────────────────")
good = a[(a.매출등급=="매출5(높음)")&(a.폐업등급=="폐업1(적음)")].nlargest(12,"매출_밀도")
print(good[["상권명","자치구","상권구분","매출_밀도","누적폐업률","운영개월","직장인구","상주인구"]]
      .assign(매출_밀도=lambda d:(d.매출_밀도/1e8).round(0)).rename(columns={"매출_밀도":"매출억/km2"})
      .round(1).to_string(index=False))
print("\n── 매출5×폐업5 상권 상위 8 (돈은 되는데 갈린다) ────")
bad = a[(a.매출등급=="매출5(높음)")&(a.폐업등급=="폐업5(많음)")].nlargest(8,"매출_밀도")
print(bad[["상권명","자치구","상권구분","매출_밀도","누적폐업률","운영개월"]]
      .assign(매출_밀도=lambda d:(d.매출_밀도/1e8).round(0)).rename(columns={"매출_밀도":"매출억/km2"})
      .round(1).to_string(index=False))
a.to_parquet("master/agg16.parquet", index=False)
