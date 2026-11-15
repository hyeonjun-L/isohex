# -*- coding: utf-8 -*-
# 다음 해에도 맞나 (v3, 2026-11-16, 마스터플랜 W7.16) — 2025(매출 2025Q1~Q4 · 상가정보 2025Q2)로 배운 모형의 '처음 보는 구' 예측이 2026년 상반기 가게당 매출 순서를 맞히나. v2(재료 넷)와 v3(+묶음 일곱)를 나란히
# 실행: python3 20261116_next_year_v3.py <2025 판 재료 _p26_재료.parquet> [isohex 폴더]
#   재료는 p26을 2025 판으로 STAGE=feat까지 돌려 만든다 — OUT_DIR=<작업> ALLOC=종사자 STAGE=feat python3 p26_sales_potential_v2.py <poi_2025Q2가 있는 폴더>
# 2026-11-16 결과: v2 2026H1 순위상관 가운데 0.157 · 통과(BH 5%) 22 → v3 0.246 · 33 (2025 안에서는 0.200 · 24 → 0.255 · 34)
import pandas as pd, numpy as np, os, sys
from scipy.stats import spearmanr, norm
H=os.path.expanduser
ROOT=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..")
d=pd.read_parquet(sys.argv[1]).reset_index(drop=True)
c=pd.read_parquet(os.path.join(ROOT,"analysis","master","cell_panel.parquet"))
def ystore(qs):
    s=c[c.기준_년분기_코드.astype(str).isin(qs)]
    s=s.groupby(["상권_코드","서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
    s=s[(s.공개==len(qs))&(s.점포>0)]; s["y"]=np.log(s.매출/s.점포); return s.set_index(["상권_코드","서비스_업종_코드"]).y
y26=ystore(["20261","20262"]); y25h=ystore(["20251","20252"])
src=open(os.path.join(ROOT,"analysis","panel","p26_sales_potential_v2.py"),encoding="utf-8").read()
ns={"np":np,"pd":pd,"spearmanr":spearmanr}; exec(src[src.index("def fit(tr,cols,mode):"):src.index('C1=["a1_거주"')],ns)   # p26의 fit · cv 그대로
C=["a2_거주","a2_출근등교","a2_기타","l_all300"]; B=[x for x in d.columns if x.startswith("b_")]; assert len(B)==7
d=d.join(y26.rename("y26"),on=["상권","svc"]).join(y25h.rename("y25h"),on=["상권","svc"])
out={}
for lab,cols in (("v2",C),("v3",C+B)):
    r2,rho,n,pred,base=ns["cv"](d,cols,"eb"); d["p_"+lab]=pred
    rows=[]
    for k,g in d.groupby("svc"):
        e=g.dropna(subset=["y26","y25h","p_"+lab]); 
        if len(e)<20: continue
        rows.append(dict(svc=k,업종=g.업종.iloc[0],n=len(e),cv25=spearmanr(g["p_"+lab],g.y).correlation,cv26=spearmanr(e["p_"+lab],e.y26).correlation,cv25h=spearmanr(e["p_"+lab],e.y25h).correlation))
    R=pd.DataFrame(rows).set_index("svc"); pv=np.sort(1-norm.cdf(R.cv26.values*np.sqrt(R.n.values-1))); ok=pv<=0.05*(np.arange(len(pv))+1)/len(pv)
    pv0=np.sort(1-norm.cdf(R.cv25.values*np.sqrt(d.groupby("svc").size().reindex(R.index).values-1))); ok0=pv0<=0.05*(np.arange(len(pv0))+1)/len(pv0)
    out[lab]=R
    # 2026H1 R² (업종 평균 대비)
    e=d.dropna(subset=["y26","p_"+lab]); mu26=e.groupby("svc").y26.transform("mean"); mup=e.groupby("svc")["p_"+lab].transform("mean")
    r2_26=1-(((e.y26-mu26)-(e["p_"+lab]-mup))**2).sum()/((e.y26-mu26)**2).sum()
    print(f"{lab}: 2025 처음 보는 구 R² {r2:.4f} · 통과(BH) {int(np.where(ok0)[0].max()+1) if ok0.any() else 0} | 2026H1 — 순위상관 가운데 {R.cv26.median():.3f} (같은 줄 2025H1 {R.cv25h.median():.3f} · 2025 전체 {R.cv25.median():.3f}) · 0보다 큰 업종 {int((R.cv26>0).sum())}/{len(R)} · 통과(BH 5%) {int(np.where(ok)[0].max()+1) if ok.any() else 0} · R²(2026H1, 업종 평균 뺀 값) {r2_26:.4f}")
T=out["v2"][["업종","n","cv26"]].rename(columns={"cv26":"v2_2026H1"}).join(out["v3"][["cv25","cv26"]].rename(columns={"cv25":"v3_2025","cv26":"v3_2026H1"})).round(2)
print(T.sort_values("v3_2026H1",ascending=False).to_string())
