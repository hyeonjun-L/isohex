# -*- coding: utf-8 -*-
"""생존(Q2)·매출vs생존(Q3)·업종별(Q4)을 올바른 점포수(전체)로 다시.
추가: 공간 군집 표준오차(행정동 클러스터), 다중검정 보정(BH-FDR)."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
from scipy.stats import spearmanr
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings("ignore")
st=pd.read_parquet("master/store.parquet")
st["상권_코드"]=pd.to_numeric(st["상권_코드"],errors="coerce").astype("Int64")
st["기준_년분기_코드"]=pd.to_numeric(st["기준_년분기_코드"],errors="coerce").astype("Int64")
p=pd.read_parquet("master/panel.parquet"); area=pd.read_parquet("master/area.parquet")

# 상권 × 분기 전체 점포·개폐업 (프랜차이즈 포함)
tot=st.groupby(["상권_코드","기준_년분기_코드"],as_index=False).agg(
    전체점포=("유사_업종_점포_수","sum"),일반점포=("점포_수","sum"),
    개업=("개업_점포_수","sum"),폐업=("폐업_점포_수","sum"),프랜=("프랜차이즈_점포_수","sum"))
x=p.drop(columns=["점포수","개업수","폐업수","프랜차이즈수"]).merge(tot,on=["상권_코드","기준_년분기_코드"])
cov=x.groupby("상권_코드").매출액.apply(lambda s:s.notna().sum())
a=(x[x.상권_코드.isin(cov[cov>=16].index)].groupby("상권_코드").agg(
    매출평균=("매출액","mean"),전체점포평균=("전체점포","mean"),폐업합=("폐업","sum"),
    점포합_전체=("전체점포","sum"),점포합_일반=("일반점포","sum"),프랜합=("프랜","sum"),
    운영개월=("운영개월","mean"),유동인구=("유동인구","mean"),상주인구=("상주인구","mean"),
    직장인구=("직장인구","mean"),집객시설=("집객시설","mean"),지하철역=("지하철역","max"),
    면적_m2=("면적_m2","first"),상권구분=("상권구분","first"),자치구=("자치구","first")).reset_index())
a=a.merge(area[["상권_코드","행정동코드"]],on="상권_코드")
a["폐업률_기존"]=a.폐업합/a.점포합_일반*100
a["폐업률"]=a.폐업합/a.점포합_전체*100
a["프랜비중"]=a.프랜합/a.점포합_전체
a["매출_밀도"]=a.매출평균/(a.면적_m2/1e6)
a["점포당매출"]=a.매출평균/a.전체점포평균
a["역세권"]=(a.지하철역>0).astype(int)
for c in ["유동인구","상주인구","직장인구","집객시설","면적_m2","매출평균"]:
    a["l_"+c]=np.log(a[c].clip(lower=0)+1)
a.to_parquet("master/agg_v2.parquet",index=False)

RHS="l_면적_m2 + l_유동인구 + l_상주인구 + l_직장인구 + l_집객시설 + 역세권 + C(상권구분) + C(자치구)"
def run(y,data,label,extra=""):
    d=data.dropna(subset=[y,"l_유동인구","l_상주인구","l_직장인구","l_집객시설"])
    r=smf.ols(f"{y} ~ {RHS}{extra}",data=d).fit(cov_type="cluster",cov_kwds={"groups":d.행정동코드.astype(str)})
    keep=[k for k in r.params.index if not k.startswith("C(") and k!="Intercept"]
    o=pd.DataFrame({"계수":r.params[keep].round(3),"p":r.pvalues[keep].round(4)})
    print(f"━━ {label}  n={int(r.nobs):,}  R²={r.rsquared:.3f}  (행정동 클러스터 SE)")
    print(o.to_string()); print()
    return r

print("="*72); print("Q2 생존 — 20분기 누적 폐업률, 분모 교정"); print("="*72)
run("폐업률_기존",a,"[기존] 폐업 ÷ 일반점포")
r2=run("폐업률",a,"[수정] 폐업 ÷ 전체점포")
run("폐업률",a,"[수정 + 프랜차이즈 비중 통제]"," + 프랜비중")

print("="*72); print("Q3 매출 ↔ 생존 — 분모 교정 후"); print("="*72)
for lab,sub in [("전체 상권",a),("골목상권만",a[a.상권구분=="골목상권"])]:
    for xv,yv in [("매출_밀도","폐업률"),("점포당매출","폐업률"),("매출_밀도","폐업률_기존")]:
        rr,pp=spearmanr(sub[xv],sub[yv],nan_policy="omit")
        print(f"  {lab:<8} {xv:<6} ↔ {yv:<8} ρ={rr:+.3f}  {'유의' if pp<0.05 else '무의미'}")
rr,_=spearmanr(a.프랜비중,a.폐업률_기존-a.폐업률,nan_policy="omit")
print(f"\n  프랜차이즈 비중 ↔ 기존 폐업률의 부풀림 ρ={rr:+.2f}")
