# -*- coding: utf-8 -*-
"""폐업률 R²가 0.055로 낮은 게 '입지가 무관해서'인지 '분기 폐업률이 잡음이라서'인지 가른다.
한 분기 폐업률은 점포 200개 중 5개 닫히는 식이라 흔들린다 → 20분기 평균으로 잡음을 줄인다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
m = pd.read_parquet("master/panel.parquet")

# 분기 폐업률의 신뢰도: 상권내 분기간 변동 vs 상권간 변동
w = m.groupby("상권_코드").폐업률.std().median()
b = m.groupby("상권_코드").폐업률.mean().std()
print(f"폐업률  상권내 분기간 표준편차(중앙) {w:.4f}   상권간 표준편차 {b:.4f}")
print(f"→ 신호 대 잡음 = {b/w:.2f}.  1보다 작으면 한 분기 값은 거의 잡음이다\n")

# 20분기 누적 폐업률 = 폐업수 총합 / 점포수 총합  (비율의 평균이 아니라 합의 비율)
agg = m.groupby("상권_코드").agg(
    폐업합=("폐업수","sum"), 개업합=("개업수","sum"), 점포합=("점포수","sum"),
    매출합=("매출액","sum"), 운영개월=("운영개월","mean"), 폐업개월=("폐업개월","mean"),
    유동인구=("유동인구","mean"), 상주인구=("상주인구","mean"), 직장인구=("직장인구","mean"),
    집객시설=("집객시설","mean"), 지하철역=("지하철역","mean"), 면적_m2=("면적_m2","first"),
    상권구분=("상권구분","first"), 자치구=("자치구","first"), 상권명=("상권명","first")).reset_index()
agg["누적폐업률"] = agg.폐업합/agg.점포합*100
agg["누적개업률"] = agg.개업합/agg.점포합*100
agg["역세권"] = (agg.지하철역>0).astype(int)
for c in ["매출합","유동인구","상주인구","직장인구","집객시설","면적_m2","점포합"]:
    agg["l_"+c] = np.log(pd.to_numeric(agg[c],errors="coerce").clip(lower=0)+1)

RHS=("l_면적_m2 + l_유동인구 + l_상주인구 + l_직장인구 + l_집객시설 + 역세권 "
     "+ C(상권구분) + C(자치구)")
def run(y,label):
    d=agg.dropna(subset=[y,"l_유동인구","l_상주인구","l_직장인구","l_집객시설"])
    r=smf.ols(f"{y} ~ {RHS}",data=d).fit(cov_type="HC3")
    keep=[p for p in r.params.index if not p.startswith("C(") and p!="Intercept"]
    o=pd.DataFrame({"계수":r.params[keep].round(3),"표준오차":r.bse[keep].round(3),"p":r.pvalues[keep]})
    o["유의"]=np.where(o.p<0.001,"***",np.where(o.p<0.01,"**",np.where(o.p<0.05,"*","")))
    print(f"━━━ {label}  n={int(r.nobs):,}  R²={r.rsquared:.3f}")
    print(o.drop(columns='p').to_string()); print()
    return r
print("="*70); print("20분기 누적 기준 — 잡음 줄인 뒤"); print("="*70)
run("누적폐업률","종속: 20분기 누적 폐업률(%)")
run("누적개업률","종속: 20분기 누적 개업률(%)")
run("l_매출합","종속: log 20분기 누적 매출  (비교용)")
agg.to_parquet("master/agg20.parquet", index=False)
