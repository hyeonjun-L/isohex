# -*- coding: utf-8 -*-
"""Q4 업종별 입지 계수 — 전체 점포수 기준 + 행정동 클러스터 SE + BH-FDR 다중검정 보정."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings("ignore")
st=pd.read_parquet("master/store.parquet")
st["상권_코드"]=pd.to_numeric(st["상권_코드"],errors="coerce").astype("Int64")
a=pd.read_parquet("master/agg_v2.parquet")
WANT={"CS100010":"커피-음료","CS200031":"세탁소","CS300002":"편의점","CS100005":"제과점",
      "CS200019":"PC방","CS200038":"독서실","CS300022":"화장품","CS300010":"반찬가게",
      "CS200041":"사진관","CS300021":"문구","CS200037":"노래방","CS200028":"미용실"}
ind=(st[st.서비스_업종_코드.isin(WANT)].groupby(["상권_코드","서비스_업종_코드"],as_index=False)
     .agg(전체평균=("유사_업종_점포_수","mean"),일반평균=("점포_수","mean")))
ind=ind.merge(a,on="상권_코드",how="inner")
ind["l_전체"]=np.log(ind.전체평균+1); ind["l_일반"]=np.log(ind.일반평균+1)
RHS="l_면적_m2 + l_유동인구 + l_상주인구 + l_직장인구 + l_집객시설 + 역세권 + C(상권구분) + C(자치구)"
V=["l_유동인구","l_상주인구","l_직장인구","l_집객시설","역세권"]
rows=[]
for code,nm in WANT.items():
    d=ind[(ind.서비스_업종_코드==code)&(ind.전체평균>0)].dropna(subset=["l_유동인구","l_상주인구","l_직장인구","l_집객시설"])
    for y in ["l_일반","l_전체"]:
        r=smf.ols(f"{y} ~ {RHS}",data=d).fit(cov_type="cluster",cov_kwds={"groups":d.행정동코드.astype(str)})
        for v in V: rows.append((nm,y,v,r.params[v],r.pvalues[v],r.rsquared,int(r.nobs)))
t=pd.DataFrame(rows,columns=["업종","y","변수","계수","p","R2","n"])
for y in ["l_일반","l_전체"]:
    m=t.y==y; t.loc[m,"q_FDR"]=multipletests(t.loc[m,"p"],method="fdr_bh")[1]
def cell(r): return f"{r.계수:+.2f}{'*' if r.q_FDR<0.05 else ' '}"
for y,lab in [("l_일반","[기존] 일반 점포수"),("l_전체","[수정] 전체 점포수")]:
    print(f"\n{lab} — 행정동 클러스터 SE, * = FDR 보정 q<0.05 (60개 검정 동시 보정)")
    print(f"{'업종':<8}{'R²':>6}" + "".join(f"{v.replace('l_',''):>10}" for v in V))
    s=t[t.y==y]
    for nm in WANT.values():
        rr=s[s.업종==nm]
        print(f"{nm:<8}{rr.R2.iloc[0]:>6.2f}" + "".join(f"{cell(rr[rr.변수==v].iloc[0]):>10}" for v in V))
print("\n세탁소 상주인구 — 일반:",
      t[(t.업종=="세탁소")&(t.변수=="l_상주인구")&(t.y=="l_일반")][["계수","p","q_FDR"]].round(4).to_dict("records"),
      "\n               전체:",
      t[(t.업종=="세탁소")&(t.변수=="l_상주인구")&(t.y=="l_전체")][["계수","p","q_FDR"]].round(4).to_dict("records"))
