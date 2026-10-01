# -*- coding: utf-8 -*-
"""① 추정매출이 '점포가 적은 셀'에서 비공개되는가 — 그렇다면 잠식 회귀는 선택된 표본이다
   ② 코로나 구간(2021~2022)을 빼도 결과가 같은가"""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
st=pd.read_parquet("master/store.parquet"); s=pd.read_parquet("master/sales.parquet")
for d_ in (st,s):
    d_["상권_코드"]=pd.to_numeric(d_["상권_코드"],errors="coerce").astype("Int64")
    d_["기준_년분기_코드"]=pd.to_numeric(d_["기준_년분기_코드"],errors="coerce").astype("Int64")
K=["상권_코드","기준_년분기_코드","서비스_업종_코드"]
sale_codes=set(s.서비스_업종_코드.unique())
a=st[st.서비스_업종_코드.isin(sale_codes)&(st.유사_업종_점포_수>0)].merge(
    s[K+["당월_매출_금액"]],on=K,how="left")
a["매출있음"]=a.당월_매출_금액.notna()
print("① 매출 공개 여부 × 전체 점포수 (매출 추정 대상 63업종 한정)")
t=a.groupby(a.유사_업종_점포_수.clip(upper=6)).매출있음.agg(["mean","size"])
t.index=[f"{int(i)}개" if i<6 else "6개 이상" for i in t.index]
t.columns=["매출 공개율","셀 수"]; t["매출 공개율"]=(t["매출 공개율"]*100).round(1)
print(t.to_string())
print("\n→ 점포 1~2개 셀은 대부분 비공개 → 잠식 회귀는 '이미 점포가 꽤 있는 셀'에서만 추정된다")
print("  점포 0→1, 1→2 같은 첫 진입(가장 궁금한 경우)은 이 데이터로 볼 수 없다")

d=pd.read_parquet("master/cell_panel.parquet")
def fe(data,label):
    z=data.copy()
    for c in ("l_매출","l_전체"): z[c+"_w"]=z[c]-z.groupby("cell")[c].transform("mean")
    for c in ("l_매출_w","l_전체_w"): z[c+"_w"]=z[c]-z.groupby("q")[c].transform("mean")
    r=smf.ols("l_매출_w_w ~ l_전체_w_w - 1",data=z).fit(cov_type="cluster",cov_kwds={"groups":z.상권_코드})
    b=r.params.iloc[0]; print(f"  {label:<40} β={b:.3f}  잠식 {1-b:.0%}   n={int(r.nobs):,}")
print("\n② 표본을 바꿔도 같은가 (상권×업종 + 분기 고정효과)")
fe(d,"전체 20분기")
n_obs=d.groupby("cell").q.transform("size")
fe(d[n_obs==20],"20분기 내내 매출 공개된 셀만 (선택 제거)")
fe(d[d.기준_년분기_코드>=20231],"2023Q1 이후 (코로나 구간 제외)")
fe(d[d.유사_업종_점포_수>=5],"점포 5개 이상 셀만")
fe(d[(d.유사_업종_점포_수>=3)&(d.유사_업종_점포_수<5)],"점포 3~4개 셀만")
