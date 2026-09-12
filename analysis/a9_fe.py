# -*- coding: utf-8 -*-
"""단면 상관은 교란이 많다. 상권 고정효과로 '같은 상권 안에서 시간에 따라' 본다.
분기마다 실제로 변하는 변수는 유동인구·점포수·매출뿐이라 식별 가능한 건 이것뿐이다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
m = pd.read_parquet("master/panel.parquet").copy()
m = m[(m.기준_년분기_코드>=20211)&(m.기준_년분기_코드<=20254)]
for c in ["매출액","점포수","유동인구"]:
    m["l_"+c]=np.log(pd.to_numeric(m[c],errors="coerce").clip(lower=0)+1)
m["q"]=m.기준_년분기_코드.astype(str)

def demean(d, cols, by):
    d=d.copy()
    for c in cols: d[c+"_w"]=d[c]-d.groupby(by)[c].transform("mean")
    return d

def fe(y,x,label):
    d=m.dropna(subset=[y,x]).copy()
    d=demean(d,[y,x],"상권_코드")          # 상권 고정효과
    d=demean(d,[y+"_w",x+"_w"],"q")        # 분기 고정효과 (경기·계절 제거)
    r=smf.ols(f"{y}_w_w ~ {x}_w_w - 1", data=d).fit(
        cov_type="cluster", cov_kwds={"groups":d.상권_코드})
    k=f"{x}_w_w"
    print(f"{label:<44} 계수 {r.params[k]:+.3f}  (SE {r.bse[k]:.3f})  "
          f"p={r.pvalues[k]:.3f}  n={int(r.nobs):,}  상권내 R²={r.rsquared:.3f}")
    return r

print("상권·분기 고정효과 (상권 클러스터 표준오차)")
print("-"*100)
fe("l_매출액","l_유동인구","매출 ~ 유동인구            (단면에선 +0.29)")
fe("l_점포수","l_유동인구","점포수 ~ 유동인구           (단면에선 +0.26)")
fe("l_매출액","l_점포수",  "매출 ~ 점포수              (단면에선 +0.78 편상관)")

print("\n같은 걸 단면(2025Q4)으로 하면")
q=m[m.기준_년분기_코드==20254]
for y,x,lab in [("l_매출액","l_유동인구","매출 ~ 유동인구"),("l_점포수","l_유동인구","점포수 ~ 유동인구")]:
    d=q.dropna(subset=[y,x])
    r=smf.ols(f"{y} ~ {x}",data=d).fit(cov_type="HC3")
    print(f"  {lab:<22} 계수 {r.params[x]:+.3f}  n={int(r.nobs):,}")

print("""
읽는 법 — 단면 계수가 크고 고정효과 계수가 0에 가까우면,
그 상관은 '유동인구가 많아서 매출이 오른다'가 아니라
'원래 좋은 자리는 유동인구도 매출도 둘 다 높다'였다는 뜻이다.""")
