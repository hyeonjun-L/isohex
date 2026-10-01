# -*- coding: utf-8 -*-
# ⚠ v1 기록용 — 점포수로 `점포_수`(프랜차이즈 제외 일반 점포)를 써서 결과가 틀렸다.
#   대체: v2_longdiff.py · v2_selection.py  (2026-10-01 재검증)
"""잠식 -0.73은 진짜인가, 나눗셈 편향인가?
점포당매출 = 매출/점포수 라서 점포수가 양변에 있다. 점포수에 측정오차가 있으면
계수는 자동으로 -1 쪽으로 끌려간다. 세 가지로 교차검증한다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
st=pd.read_parquet("master/store.parquet"); s=pd.read_parquet("master/sales.parquet")
st=st[(st.기준_년분기_코드>=20211)&(st.기준_년분기_코드<=20254)]
s =s [(s .기준_년분기_코드>=20211)&(s .기준_년분기_코드<=20254)]
d=(st[["상권_코드","기준_년분기_코드","서비스_업종_코드","점포_수"]]
   .merge(s[["상권_코드","기준_년분기_코드","서비스_업종_코드","당월_매출_금액","당월_매출_건수"]],
          on=["상권_코드","기준_년분기_코드","서비스_업종_코드"]))
d=d[(d.점포_수>0)&(d.당월_매출_금액>0)].copy()
d["cell"]=d.상권_코드.astype(str)+"_"+d.서비스_업종_코드
d=d.sort_values(["cell","기준_년분기_코드"])
d["l_매출"]=np.log(d.당월_매출_금액); d["l_점포수"]=np.log(d.점포_수)
d["l_건수"]=np.log(d.당월_매출_건수.clip(lower=1))
d["l_점포당매출"]=d.l_매출-d.l_점포수
d["l_점포수_전분기"]=d.groupby("cell").l_점포수.shift(1)
d["q"]=d.기준_년분기_코드.astype(str)

def fe(y,x,data,label):
    z=data.dropna(subset=[y,x]).copy()
    for c in (y,x): z[c+"_w"]=z[c]-z.groupby("cell")[c].transform("mean")
    for c in (y+"_w",x+"_w"): z[c+"_w"]=z[c]-z.groupby("q")[c].transform("mean")
    r=smf.ols(f"{y}_w_w ~ {x}_w_w - 1",data=z).fit(cov_type="cluster",cov_kwds={"groups":z.상권_코드})
    k=x+"_w_w"
    print(f"  {label:<46} {r.params[k]:+.3f} (SE {r.bse[k]:.3f})  n={int(r.nobs):,}")
    return r.params[k]

print("① 총매출로 직접 (나눗셈 없음).  1.0이면 잠식 없음, 0이면 완전 잠식")
b1=fe("l_매출","l_점포수",d,"log 총매출 ~ log 점포수 (동시점)")
print(f"     → 여기서 나오는 잠식계수 = {b1-1:+.3f}")

print("\n② 전분기 점포수로 (측정오차 연결 끊기)")
b2=fe("l_점포당매출","l_점포수_전분기",d,"log 점포당매출 ~ log 점포수(t-1)")
b3=fe("l_매출","l_점포수_전분기",d,"log 총매출   ~ log 점포수(t-1)")
print(f"     → 잠식계수 = {b3-1:+.3f}")

print("\n③ 매출 '건수'로 (금액 대신 거래 수 — 물가·객단가 영향 제거)")
b4=fe("l_건수","l_점포수",d,"log 매출건수 ~ log 점포수")
print(f"     → 잠식계수 = {b4-1:+.3f}")

print("\n④ 상권 전체(업종 합산) 수준 — 다른 업종이 서로 보완하는지")
g=(d.groupby(["상권_코드","기준_년분기_코드"],as_index=False)
     .agg(매출=("당월_매출_금액","sum"),점포=("점포_수","sum")))
g["cell"]=g.상권_코드.astype(str); g["q"]=g.기준_년분기_코드.astype(str)
g["l_매출"]=np.log(g.매출); g["l_점포수"]=np.log(g.점포)
b5=fe("l_매출","l_점포수",g,"log 상권총매출 ~ log 상권총점포수")
print(f"     → 잠식계수 = {b5-1:+.3f}")

print(f"""
정리
  같은 업종 안에서는 점포가 1% 늘 때 그 업종 총매출이 {b1:.2f}%만 는다
  → 새 점포가 가져오는 매출의 {100*(1-b1):.0f}%는 기존 점포에서 옮겨온 것이다
  상권 전체로는 {b5:.2f} — 업종이 다르면 서로 덜 뺏는다""")
