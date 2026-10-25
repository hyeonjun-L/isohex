# -*- coding: utf-8 -*-
"""다음 해에도 맞나 (마스터플랜 W7.15) — 2025로 배운 매출 수준 모형이 2026년 상반기 상권 가게당 매출 순서를 맞히는지 본다.

입력  MASTER_DIR(2025 연도 파일로 만든 master/sales·store.parquet) · SP(학습 칸 sales_potential_cells_v2.parquet)
      API_DIR(서울시 상권분석 서비스/api — pipeline/fetch_seoul.py가 받은 2026 분기, 점검/ 아래 2025Q4)
비교  ① 2025Q4: API로 받은 값 = 연도 파일 값인가 (제공 기준이 2026-07에 바뀌었다)
      ② 업종마다 순위상관 — 처음 보는 구 예측(2025 학습, 구 하나씩 빼고) vs 2026H1 실제 · 전체 모형 예측 vs 2026H1 ·
         같은 길이로 견줄 2025H1 · 가게당 매출 자체가 해를 넘어 얼마나 이어지나(2025H1 vs 2026H1)
가게당 매출 정의는 p26과 같다: 분기 매출 합 ÷ 분기 유사_업종_점포_수 합, 그 분기들 모두 매출 공개 · 점포_수>0 (v2_cannibal의 cell_panel 거름)"""
import os, glob, numpy as np, pandas as pd, warnings
from scipy.stats import spearmanr, norm
warnings.filterwarnings("ignore")
H=os.environ["HOME"]
M=os.environ.get("MASTER_DIR",f"{H}/work/analysis/master")
SP=os.environ.get("SP",f"{H}/work/snapshots/sales_potential_cells_v2.parquet")
API=os.environ.get("API_DIR",f"{H}/mnt/isohex/서울시 상권분석 서비스/api")
OUT=os.environ.get("OUT",f"{H}/work/diag25/next_year.csv")
EN2KO={"stdr_yyqu_cd":"기준_년분기_코드","trdar_cd":"상권_코드","svc_induty_cd":"서비스_업종_코드","stor_co":"점포_수",
       "similr_induty_stor_co":"유사_업종_점포_수","thsmon_selng_amt":"당월_매출_금액","thsmon_selng_co":"당월_매출_건수"}
K=["기준_년분기_코드","상권_코드","서비스_업종_코드"]
def rd(pat):
    fs=sorted(glob.glob(pat)); assert fs, pat
    d=pd.concat([pd.read_csv(f,encoding="cp949",low_memory=False) for f in fs],ignore_index=True).rename(columns=EN2KO)
    for c in K[:2]: d[c]=pd.to_numeric(d[c],errors="coerce").astype("int64")
    return d
# ── ① 2025Q4 대조
st=pd.read_parquet(f"{M}/store.parquet",columns=K+["점포_수","유사_업종_점포_수"]); sa=pd.read_parquet(f"{M}/sales.parquet",columns=K+["당월_매출_금액","당월_매출_건수"])
for d in (st,sa):
    for c in K[:2]: d[c]=pd.to_numeric(d[c],errors="coerce").astype("int64")
chk=[]
for kind,pat,cols,base in [("매출",f"{API}/점검/*추정매출-상권)_API_점검_*.csv",["당월_매출_금액","당월_매출_건수"],sa),("점포",f"{API}/점검/*점포-상권)_API_점검_*.csv",["점포_수","유사_업종_점포_수"],st)]:
    a=rd(pat); q=sorted(a.기준_년분기_코드.unique())
    b=base[base.기준_년분기_코드.isin(q)]
    j=a[K+cols].merge(b[K+cols],on=K,how="outer",suffixes=("_api","_연도"),indicator=True)
    both=j[j._merge=="both"]; same=np.mean([(both[c+"_api"]==both[c+"_연도"]).mean() for c in cols])
    print(f"① {kind} {q}: API {len(a):,}줄 · 연도 파일 {len(b):,}줄 · 둘 다 {len(both):,} · 값이 같은 비율 {same:.4f} · API에만 {int((j._merge=='left_only').sum())} · 연도 파일에만 {int((j._merge=='right_only').sum())}")
    chk.append((kind,same))
# ── 2026H1 · 2025H1 가게당 매출
a_s=rd(f"{API}/*추정매출-상권)_API_*.csv"); a_t=rd(f"{API}/*점포-상권)_API_*.csv")
Q26=sorted(a_s.기준_년분기_코드.unique()); print("2026 분기:",Q26)
def ystore(sales,store,qs):
    d=store[store.기준_년분기_코드.isin(qs)][K+["점포_수","유사_업종_점포_수"]].merge(sales[sales.기준_년분기_코드.isin(qs)][K+["당월_매출_금액"]],on=K)
    d=d[(d.유사_업종_점포_수>0)&(d.당월_매출_금액>0)&(d.점포_수>0)]
    g=d.groupby(["상권_코드","서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),n=("당월_매출_금액","size"))
    g=g[g.n==len(qs)]; return np.log(g.매출/g.점포).rename("y")
y26=ystore(a_s,a_t,Q26); y25h=ystore(sa,st,[20251,20252][:len(Q26)])
print(f"2026H1 칸 {len(y26):,} · 2025H1 칸 {len(y25h):,}")
# ── 2025 모형: 처음 보는 구 예측(구 하나씩 빼고)과 전체 모형 예측 — p26 fit과 같은 수축
s=pd.read_parquet(SP); CC=["a_거주","a_출근등교","a_기타","l_all300"]
def fit(tr):
    mu=tr.groupby("svc")[CC+["y"]].mean(); Z=tr[CC+["y"]]-mu.loc[tr.svc].values
    Xp=Z[CC].values; bp=np.linalg.lstsq(Xp,Z.y.values,rcond=None)[0]; B={k:bp for k in mu.index}; est,var={},{}
    for k,ix in tr.groupby("svc").indices.items():
        X=Xp[ix]; yv=Z.y.values[ix]
        if len(ix)<len(CC)+5: continue
        bk=np.linalg.lstsq(X,yv,rcond=None)[0]; r=yv-X@bk; s2=r@r/(len(ix)-len(CC)); est[k]=bk; var[k]=np.diag(np.linalg.pinv(X.T@X))*s2
    E=np.array(list(est.values())); V=np.array(list(var.values())); W=1/V
    m=(W*E).sum(0)/W.sum(0); Q=(W*(E-m)**2).sum(0); dfree=len(E)-1
    tau2=np.maximum(0,(Q-dfree)/(W.sum(0)-(W**2).sum(0)/W.sum(0)))
    for k in est: w=tau2/(tau2+var[k]); B[k]=bp+w*(est[k]-bp)
    return mu,B
pred=lambda mu,B,t: mu.loc[t.svc,"y"].values+np.einsum("ij,ij->i",(t[CC].values-mu.loc[t.svc,CC].values),np.vstack([B[k] for k in t.svc]))
s["cv"]=np.nan
for gname,te in s.groupby("gu").indices.items():
    tr=s.drop(index=s.index[te]); mu,B=fit(tr); t=s.iloc[te]; ok=t.svc.isin(mu.index).values
    s.loc[s.index[np.array(te)[ok]],"cv"]=pred(mu,B,t[ok])
mu,B=fit(s); s["full"]=pred(mu,B,s)
s=s.join(y26.rename("y26"),on=["상권","svc"]).join(y25h.rename("y25h"),on=["상권","svc"])
T=pd.read_csv(f"{H}/work/out26/매출잠재_계수_수요만_v2.csv",encoding="utf-8-sig").set_index("svc")
rows=[]
for k,d in s.groupby("svc"):
    e=d.dropna(subset=["y26","y25h"]); n=len(e)
    if n<20: continue
    r=lambda a,b: spearmanr(e[a],e[b]).correlation
    rows.append(dict(svc=k,업종=T.loc[k,"업종"],칠함=bool(T.loc[k,"칠함"]),n25=len(d),n=n,
        cv_2025=round(spearmanr(d.cv,d.y).correlation,3),cv_2026H1=round(r("cv","y26"),3),full_2026H1=round(r("full","y26"),3),
        cv_2025H1=round(r("cv","y25h"),3),지속_25H1_26H1=round(r("y25h","y26"),3)))
R=pd.DataFrame(rows)
R["p26"]=[1-norm.cdf(x*np.sqrt(n-1)) for x,n in zip(R.cv_2026H1,R.n)]
m=len(R); o=np.argsort(R.p26.values); ok=np.zeros(m,bool); kmax=0
for rnk,i in enumerate(o,1):
    if R.p26.values[i]<=0.05*rnk/m: kmax=rnk
for rnk,i in enumerate(o,1): ok[i]=rnk<=kmax
R["2026도_통과"]=ok
R=R.sort_values("cv_2025",ascending=False)
print(R.drop(columns=["p26"]).to_string(index=False))
P=R[R.칠함]
print(f"\n칠한 업종 {len(P)}개 — 처음 보는 구 순위상관 가운데: 2025 {P.cv_2025.median():.3f} → 2026H1 {P.cv_2026H1.median():.3f} (같은 길이 2025H1 {P.cv_2025H1.median():.3f}) · 전체 모형 2026H1 {P.full_2026H1.median():.3f} · 가게당 매출 지속(25H1→26H1) {P.지속_25H1_26H1.median():.3f}")
print(f"2026H1로도 0보다 확실히 큼(BH 5%): 칠한 {len(P)}개 중 {int(P['2026도_통과'].sum())}개 · 빠지는 것 {P[~P['2026도_통과']].업종.tolist()} · 칠하지 않은 것 중 통과 {R[~R.칠함 & R['2026도_통과']].업종.tolist()}")
R.to_csv(OUT,index=False,encoding="utf-8-sig"); print("저장:",OUT)
