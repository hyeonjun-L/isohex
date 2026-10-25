# 빨래방 진단 C — 처음 보는 구 교차검증 예측이 셀프빨래방 많은 상권에서도 맞나
import os, numpy as np, pandas as pd, warnings
from scipy.stats import spearmanr
warnings.filterwarnings("ignore")
H=os.environ["HOME"]
s=pd.read_parquet(f"{H}/work/snapshots/sales_potential_cells_v2.parquet")
CC=["a_거주","a_출근등교","a_기타","l_all300"]
def fit(tr,cols):
    mu=tr.groupby("svc")[cols+["y"]].mean(); Z=tr[cols+["y"]]-mu.loc[tr.svc].values
    Xp=Z[cols].values; bp=np.linalg.lstsq(Xp,Z.y.values,rcond=None)[0]; B={k:bp for k in mu.index}; est,var={},{}
    for k,ix in tr.groupby("svc").indices.items():
        X=Xp[ix]; yv=Z.y.values[ix]
        if len(ix)<len(cols)+5: continue
        bk=np.linalg.lstsq(X,yv,rcond=None)[0]; r=yv-X@bk; s2=r@r/(len(ix)-len(cols)); est[k]=bk; var[k]=np.diag(np.linalg.pinv(X.T@X))*s2
    E=np.array(list(est.values())); V=np.array(list(var.values())); W=1/V
    m=(W*E).sum(0)/W.sum(0); Q=(W*(E-m)**2).sum(0); dfree=len(E)-1
    tau2=np.maximum(0,(Q-dfree)/(W.sum(0)-(W**2).sum(0)/W.sum(0)))
    for k in est: w=tau2/(tau2+var[k]); B[k]=bp+w*(est[k]-bp)
    return mu,B,tau2,var
pred=np.full(len(s),np.nan)
for gname,te in s.groupby("gu").indices.items():
    tr=s.drop(index=s.index[te]); mu,B,_,_=fit(tr,CC); t=s.iloc[te]; ok=t.svc.isin(mu.index).values; t=t[ok]; idx=np.array(te)[ok]
    pred[idx]=mu.loc[t.svc,"y"].values+np.einsum("ij,ij->i",(t[CC].values-mu.loc[t.svc,CC].values),np.vstack([B[k] for k in t.svc]))
s["pred"]=pred
rho=s.groupby("svc").apply(lambda z: spearmanr(z.pred,z.y).correlation)
print("세탁소 교차검증 순위상관(다시 계산):", round(rho["CS200031"],3), "· 파일 값 0.20")
mu,B,tau2,var=fit(s,CC)
print("세탁소 수축 뒤 계수:", np.round(B["CS200031"],2), "· 업종 사이 퍼짐 tau²:", np.round(tau2,3), "· 세탁소 자기 추정 분산:", np.round(var["CS200031"],3))
w=tau2/(tau2+var["CS200031"]); print("세탁소 자기 자료 무게(0=공통값, 1=자기 값):", np.round(w,2))
d=pd.read_csv(f"{H}/work/diag25/laundry_train.csv")
d=d.merge(s[s.svc=="CS200031"][["상권","pred"]],on="상권")
for lab,mm in [("전체",d.y==d.y),("셀프 없음",d.S20902==0),("셀프 있음",d.S20902>0),("셀프 비중≥1/3",d.share>=1/3),("셀프 비중≥1/2",d.share>=1/2)]:
    dd=d[mm]; print(f"  {lab:12s} 상권 {len(dd):3d} · 처음 보는 구 순위상관 {spearmanr(dd.pred,dd.y).correlation:+.3f}")
# 구분별
for k,dd in d.groupby("kind"): print(f"  {k:6s} 상권 {len(dd):3d} · 순위상관 {spearmanr(dd.pred,dd.y).correlation:+.3f}" if len(dd)>=15 else f"  {k} {len(dd)} 적음")
