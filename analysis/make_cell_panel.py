# v2_cannibal.py 앞부분과 같은 코드 — master/cell_panel.parquet만 만든다 (잠식 회귀는 돌리지 않는다)
import pandas as pd, numpy as np
st=pd.read_parquet("master/store.parquet"); s=pd.read_parquet("master/sales.parquet")
for d_ in (st,s):
    d_["상권_코드"]=pd.to_numeric(d_["상권_코드"],errors="coerce").astype("Int64")
    d_["기준_년분기_코드"]=pd.to_numeric(d_["기준_년분기_코드"],errors="coerce").astype("Int64")
K=["상권_코드","기준_년분기_코드","서비스_업종_코드"]
d=st.merge(s[K+["당월_매출_금액","당월_매출_건수"]],on=K)
d=d[(d.유사_업종_점포_수>0)&(d.당월_매출_금액>0)&(d.점포_수>0)].copy()
d["cell"]=d.상권_코드.astype(str)+"_"+d.서비스_업종_코드
d["q"]=d.기준_년분기_코드.astype(str)
d["l_매출"]=np.log(d.당월_매출_금액)
d["l_일반"]=np.log(d.점포_수); d["l_전체"]=np.log(d.유사_업종_점포_수)
d.to_parquet("master/cell_panel.parquet",index=False)
print("cell_panel", len(d), "분기", sorted(d.q.unique())[-6:])
