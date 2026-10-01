# -*- coding: utf-8 -*-
# ⚠ v1 기록용 — 점포수로 `점포_수`(프랜차이즈 제외 일반 점포)를 써서 결과가 틀렸다.
#   대체: v2_alpha_table.py  (2026-10-01 재검증)
"""업종별 잠식계수 — 나눗셈 없는 형태(총매출~점포수)로 다시.
이 숫자가 '이 자리에 점포가 몇 개까지 들어갈 수 있나'를 결정한다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
st=pd.read_parquet("master/store.parquet"); s=pd.read_parquet("master/sales.parquet")
st=st[(st.기준_년분기_코드>=20211)&(st.기준_년분기_코드<=20254)]
s =s [(s .기준_년분기_코드>=20211)&(s .기준_년분기_코드<=20254)]
d=(st[["상권_코드","기준_년분기_코드","서비스_업종_코드","서비스_업종_코드_명","점포_수"]]
   .merge(s[["상권_코드","기준_년분기_코드","서비스_업종_코드","당월_매출_금액"]],
          on=["상권_코드","기준_년분기_코드","서비스_업종_코드"]))
d=d[(d.점포_수>0)&(d.당월_매출_금액>0)].copy()
d["cell"]=d.상권_코드.astype(str)+"_"+d.서비스_업종_코드
d["l_매출"]=np.log(d.당월_매출_금액); d["l_점포수"]=np.log(d.점포_수)
d["q"]=d.기준_년분기_코드.astype(str)

def fe(sub):
    z=sub.copy()
    for c in ("l_매출","l_점포수"): z[c+"_w"]=z[c]-z.groupby("cell")[c].transform("mean")
    for c in ("l_매출_w","l_점포수_w"): z[c+"_w"]=z[c]-z.groupby("q")[c].transform("mean")
    if z.cell.nunique()<80: return None
    r=smf.ols("l_매출_w_w ~ l_점포수_w_w - 1",data=z).fit(
        cov_type="cluster",cov_kwds={"groups":z.상권_코드})
    return r.params["l_점포수_w_w"], r.bse["l_점포수_w_w"], int(r.nobs), z.cell.nunique()

rows=[]
for (code,nm),sub in d.groupby(["서비스_업종_코드","서비스_업종_코드_명"]):
    out=fe(sub)
    if out is None: continue
    b,se,n,cells=out
    tot=sub[sub.기준_년분기_코드==20254].점포_수.sum()
    rows.append((nm,code,cells,n,tot,b,se,1-b))
t=pd.DataFrame(rows,columns=["업종","코드","상권수","관측","2025Q4점포","매출탄력성","SE","잠식률"])
t=t[t.관측>=800].sort_values("잠식률")
pd.set_option("display.width",200)
print("잠식률 = 새 점포 매출 중 기존 점포에서 옮겨온 비중")
print("낮을수록 '새로 열어도 파이가 커지는' 업종\n")
print(f"{'업종':<16}{'2025Q4점포':>10}{'상권수':>7}{'매출탄력성':>11}{'잠식률':>9}")
print("-"*56)
for _,r in t.iterrows():
    print(f"{r.업종:<16}{r['2025Q4점포']:>10,}{r.상권수:>7,}{r.매출탄력성:>+11.2f}{r.잠식률:>9.0%}")
t.to_parquet("master/cannibal.parquet",index=False)
print(f"\n대상 업종 {len(t)}개 / 잠식률 중앙 {t.잠식률.median():.0%}")
