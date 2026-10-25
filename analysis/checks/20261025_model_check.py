# 모형 점검 — 37개 업종 계수·순위상관을 다시 계산해 파일과 대조, 구 단위 부트스트랩으로 순위상관 신뢰구간, 여러 업종 동시 검정(BH)
import os, numpy as np, pandas as pd, warnings
from scipy.stats import spearmanr, norm
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
    return mu,B
pred=np.full(len(s),np.nan)
for gname,te in s.groupby("gu").indices.items():
    tr=s.drop(index=s.index[te]); mu,B=fit(tr,CC); t=s.iloc[te]; ok=t.svc.isin(mu.index).values; t=t[ok]; idx=np.array(te)[ok]
    pred[idx]=mu.loc[t.svc,"y"].values+np.einsum("ij,ij->i",(t[CC].values-mu.loc[t.svc,CC].values),np.vstack([B[k] for k in t.svc]))
s["pred"]=pred
mu,B=fit(s,CC)
T=pd.read_csv(f"{H}/work/out26/매출잠재_계수_수요만_v2.csv",encoding="utf-8-sig")
rows=[]; rng=np.random.default_rng(7)
for r in T.itertuples():
    d=s[s.svc==r.svc]; rho=spearmanr(d.pred,d.y).correlation; n=len(d)
    db=np.abs(np.round(B[r.svc],2)-np.array([r.a_거주,r.a_출근등교,r.a_기타,r.l_all300])).max()
    gus=d.gu.unique(); G={g:d[d.gu==g] for g in gus}; bs=[]
    for _ in range(1000):
        pick=rng.choice(gus,len(gus),replace=True); dd=pd.concat([G[g] for g in pick]); bs.append(spearmanr(dd.pred,dd.y).correlation)
    lo,hi=np.nanpercentile(bs,[5,95])
    p=1-norm.cdf(rho*np.sqrt(n-1))   # 파일 규칙과 같은 근사(한쪽)
    rows.append(dict(업종=r.업종,n=n,rho=round(rho,3),rho_file=r._8,계수차=round(db,3),칠함=r.칠함,p=p,구부트_5=round(lo,3),구부트_95=round(hi,3)))
R=pd.DataFrame(rows).sort_values("rho",ascending=False)
# BH 5% (한쪽)
m=len(R); R=R.sort_values("p"); R["bh"]=(R.p.values<=0.05*np.arange(1,m+1)/m); 
R["bh"]=R.bh[::-1].cummax()[::-1]
R=R.sort_values("rho",ascending=False)
print(R.to_string(index=False))
print("계수 최대 차이:", R.계수차.max(), "· 순위상관 최대 차이:", (R.rho-R.rho_file).abs().max().round(3))
print("칠함(파일)", int(R.칠함.sum()), "· BH 5%로도 통과", int((R.칠함&R.bh).sum()), "· 구 부트스트랩 5% 하한>0", int((R.칠함&(R.구부트_5>0)).sum()))
print("칠했지만 구 부트스트랩 하한≤0:", R[R.칠함&(R.구부트_5<=0)].업종.tolist())
R.to_csv(f"{H}/work/diag25/model_check.csv",index=False)
