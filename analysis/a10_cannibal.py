# -*- coding: utf-8 -*-
# ⚠ v1 기록용 — 점포수로 `점포_수`(프랜차이즈 제외 일반 점포)를 써서 결과가 틀렸다.
#   대체: v2_cannibal.py  (2026-10-01 재검증)
"""점포가 늘면 기존 점포 매출이 깎이나? (잠식 테스트)
창업 판단에서 제일 중요한 질문이다. 같은 상권 안에서 시간에 따라 본다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")

st=pd.read_parquet("master/store.parquet"); s=pd.read_parquet("master/sales.parquet")
st=st[(st.기준_년분기_코드>=20211)&(st.기준_년분기_코드<=20254)]
s =s [(s .기준_년분기_코드>=20211)&(s .기준_년분기_코드<=20254)]
d = (st[["상권_코드","기준_년분기_코드","서비스_업종_코드","점포_수"]]
     .merge(s[["상권_코드","기준_년분기_코드","서비스_업종_코드","당월_매출_금액","당월_매출_건수"]],
            on=["상권_코드","기준_년분기_코드","서비스_업종_코드"], how="inner"))
d = d[(d.점포_수>0)&(d.당월_매출_금액>0)]
d["점포당매출"]=d.당월_매출_금액/d.점포_수
d["l_점포당매출"]=np.log(d.점포당매출)
d["l_점포수"]=np.log(d.점포_수)
d["cell"]=d.상권_코드.astype(str)+"_"+d.서비스_업종_코드   # 상권×업종 고정효과
d["q"]=d.기준_년분기_코드.astype(str)
print(f"관측 {len(d):,}  상권×업종 {d.cell.nunique():,}  분기 {d.q.nunique()}")

def fe2(y,x,data,label):
    z=data.copy()
    for c in (y,x): z[c+"_w"]=z[c]-z.groupby("cell")[c].transform("mean")
    for c in (y+"_w",x+"_w"): z[c+"_w"]=z[c]-z.groupby("q")[c].transform("mean")
    r=smf.ols(f"{y}_w_w ~ {x}_w_w - 1",data=z).fit(cov_type="cluster",
        cov_kwds={"groups":z.상권_코드})
    k=x+"_w_w"
    print(f"  {label:<34} {r.params[k]:+.3f}  (SE {r.bse[k]:.3f})  n={int(r.nobs):,}")
    return r.params[k]

print("\n종속: log(점포당 매출)   설명: log(같은 상권·같은 업종 점포수)")
print("계수 0 = 점포 늘어도 1점포당 매출 그대로 (잠식 없음)")
print("계수 -1 = 파이가 고정, 나눠먹기 (완전 잠식)\n")
fe2("l_점포당매출","l_점포수",d,"전체 업종 평균")

WANT={"CS100010":"커피-음료","CS200031":"세탁소","CS300002":"편의점","CS100005":"제과점",
      "CS200019":"PC방","CS300022":"화장품","CS300010":"반찬가게","CS200037":"노래방",
      "CS200028":"미용실","CS100001":"한식음식점"}
print()
for c,n in WANT.items():
    sub=d[d.서비스_업종_코드==c]
    if sub.cell.nunique()<100: continue
    fe2("l_점포당매출","l_점포수",sub,n)

print("\n골목상권만")
a=pd.read_parquet("master/agg16.parquet")[["상권_코드","상권구분"]]
dg=d.merge(a,on="상권_코드"); dg=dg[dg.상권구분=="골목상권"]
fe2("l_점포당매출","l_점포수",dg,"골목상권 전체")
