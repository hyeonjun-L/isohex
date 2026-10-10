# -*- coding: utf-8 -*-
"""마스터플랜 W3의 '포화도'를 정의 그대로 계산해서 생존과 대조한다 (p6~p11의 반경 500m 근사가 아니라 원래 정의).
  포획수요  S(c,k) = Σ_o D(o) · A(c) · d(o,c)^-β / Σ_j A(j) · d(o,j)^-β
  매력도    A(c,k) = N(c,k)^α  (c = H3 res9 셀, N = 셀 안 업종 k 점포 수),  α = 0.41,  β = 1.216
  1점포 몫 = S(c,k) / N(c,k)          포화도 = 1점포 몫 ÷ 업종 k 서울 중앙값  (높을수록 '나눠먹고도 남는' 자리)
  D(o) = 100m 셀 거주인구 + 출근·등교 하루 도착(행정동 값을 그 동의 100m 셀에 고르게 배분)
계산: 서울을 100m 래스터로 깔고 분모·분자를 FFT 합성곱 두 번으로 구한다 (업종마다).
검정: ① 2025 신규점 층화 Cox  ② 기존 점포 12개월 업종 고정효과 선형확률모형  ③ 2024 코호트(18·24개월)로 재현
각각 업종 안 5분위 폐업률을 함께 본다."""
import pandas as pd, numpy as np, sys, warnings, h3, os
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree
from pyproj import Transformer
import statsmodels.api as sm
from statsmodels.duration.hazard_regression import PHReg
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
warnings.filterwarnings("ignore")
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master")); ALPHA,BETA,DMIN=0.41,1.216,0.05   # 상권 실험실 산출물 (analysis/master)
T=Transformer.from_crs(4326,5179,always_xy=True)
g=pd.read_parquet(f"{M}/sgis100_seoul.parquet")
snaps={q:pd.read_parquet(f"{S}/poi_{q}.parquet",columns=["cat_s","h3_9","lon","lat","adm_cd"]) for q in ["2024Q2","2024Q4","2025Q1","2025Q2"]}
allp=pd.concat(snaps.values()); sx,sy=T.transform(allp.lon.values,allp.lat.values)
X0=min(g.x0.min(),sx.min())//100*100-500; Y0=min(g.y0.min(),sy.min())//100*100-500
NX=int((max(g.x0.max(),sx.max())-X0)//100)+6; NY=int((max(g.y0.max(),sy.max())-Y0)//100)+6
cell=lambda x,y:(((np.asarray(y)-Y0)//100).astype(int),((np.asarray(x)-X0)//100).astype(int))
# 수요 래스터
Dres=np.zeros((NY,NX)); i,j=cell(g.x0+50,g.y0+50); np.add.at(Dres,(i,j),g.인구.fillna(0).values)
DD=pd.read_parquet(f"{M}/dong_demand.parquet"); DD.index=DD.index.astype(str); arr_day=(DD.출근+DD.등교)/14
yy,xx=np.mgrid[0:NY,0:NX]; cx=X0+xx.ravel()*100+50; cy=Y0+yy.ravel()*100+50
st=snaps["2025Q2"]; tree=cKDTree(np.c_[T.transform(st.lon.values,st.lat.values)]); dist,nn=tree.query(np.c_[cx,cy])
dong=np.where(dist<=300, st.adm_cd.astype(str).values[nn], "")          # 100m 셀 → 가장 가까운 점포의 행정동 (300m 안)
cnt=pd.Series(dong[dong!=""]).value_counts()
Darr=pd.Series(dong).map(lambda d: arr_day.get(d,0)/cnt.get(d,1) if d else 0).values.reshape(NY,NX)
D=Dres+Darr
print(f"래스터 {NY}×{NX} (100m) · 거주 합 {Dres.sum():,.0f} · 하루 도착 합 {Darr.sum():,.0f} (원자료 {arr_day[arr_day.index.isin(cnt.index)].sum():,.0f})")
ky,kx=np.mgrid[-(NY-1):NY,-(NX-1):NX]; K=np.maximum(np.hypot(ky,kx)*0.1,DMIN)**(-BETA)   # 거리 km
def per_store(q):
    """스냅샷 q에서 업종×res9 셀마다 1점포 몫 = N^(α-1) · Σ_o D(o) d(o,c)^-β / Den(o)"""
    s=snaps[q]; out=[]
    for cat,grp in s.groupby("cat_s"):
        n=grp.groupby("h3_9").size()
        lat,lon=np.array([h3.cell_to_latlng(h) for h in n.index]).T
        x,y=T.transform(lon,lat); ci,cj=cell(x,y); A=np.zeros((NY,NX)); np.add.at(A,(ci,cj),n.values**ALPHA)
        den=fftconvolve(A,K,mode="same"); Tq=fftconvolve(D/np.maximum(den,1e-12),K,mode="same")
        share=(n.values**(ALPHA-1))*Tq[ci,cj]
        out.append(pd.DataFrame({"cat_s":cat,"h3_9":n.index,"N":n.values,"share":share}))
    o=pd.concat(out); o["포화도"]=o.share/o.groupby("cat_s").share.transform("median"); o["q"]=q
    return o
H=pd.concat([per_store(q) for q in snaps]); H.to_parquet(f"{S}/huff_share.parquet",index=False)
print("1점포 몫 계산:", len(H), "개 (업종×셀×분기) · 포화도 분포(업종 중앙값=1):", H.포화도.quantile([.1,.25,.5,.75,.9]).round(2).tolist())
def fl(df):
    f=df.floor.astype(str).str.strip(); df["floor1"]=(f=="1").astype(int); df["floor_b"]=f.str.contains("지|B",regex=True).astype(int); df["floor_na"]=(f=="").astype(int)
# ① 2025 신규점
C=pd.read_parquet(f"{S}/cohort_features.parquet"); fl(C)
C=C.merge(H.rename(columns={"q":"entry"})[["entry","cat_s","h3_9","포화도","N"]],on=["entry","cat_s","h3_9"],how="left")
C["l_huff"]=np.log(C.포화도)
print(f"\n① 2025 신규점 {C.l_huff.notna().sum():,}곳 — 층화 Cox (업종별 기저위험), 포화도 log 1단위(약 2.7배)당 위험비")
m=PHReg.from_formula("dur ~ l_huff + l_all300 + floor1 + floor_b + floor_na + chain + e_Q2",data=C.dropna(subset=["l_huff"]),
     status=C.dropna(subset=["l_huff"]).event.values,strata=C.dropna(subset=["l_huff"]).cat_s.values,ties="efron").fit()
ci=np.exp(m.conf_int()); nm=m.model.exog_names; k=nm.index("l_huff")
print(f"   포화도 위험비 {np.exp(m.params[k]):.3f} (95% {ci[k,0]:.3f}~{ci[k,1]:.3f}), p={m.pvalues[k]:.3f}   ← 1보다 작아야 '몫이 큰 자리가 덜 망한다'")
d=C.dropna(subset=["l_huff"]).copy(); d["y12"]=((d.event==1)&(d.dur<=12)).astype(int); d=d[(d.y12==1)|(d.dur>=12)]
d["hq"]=d.groupby("cat_s").l_huff.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=25 else np.nan)
print("   업종 안 5분위별 12개월 폐업률 (1=몫이 가장 작은 자리 … 5=가장 큰 자리):"," / ".join(f"{v:.1%}" for v in d.groupby("hq").y12.mean()))
# ② 기존 점포
P=pd.read_parquet(f"{S}/incumbent_features.parquet")
P["h3_9"]=[h3.latlng_to_cell(a,b,9) for a,b in zip(P.lat.values,P.lon.values)]
P=P.merge(H[H.q=="2025Q2"][["cat_s","h3_9","포화도"]],on=["cat_s","h3_9"],how="left"); P["l_huff"]=np.log(P.포화도)
print(f"\n② 기존 점포 {P.l_huff.notna().sum():,}곳 (2025Q2 셀 매칭 {P.l_huff.notna().mean():.1%}) — 12개월 폐업, 업종 고정효과 선형확률모형")
Q=P.dropna(subset=["l_huff"]); cols=["l_huff","l_all300","floor1","floor_b","floor_na","old"]
Z=Q[cols+["y"]].astype(float); Z=Z-Z.groupby(Q.cat_s).transform("mean")
r=sm.OLS(Z.y,Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(Q.adm_cd)[0]})
print(f"   포화도 log 1단위당 {r.params['l_huff']*100:+.2f}%p (95% {(r.params['l_huff']-1.96*r.bse['l_huff'])*100:+.2f}~{(r.params['l_huff']+1.96*r.bse['l_huff'])*100:+.2f}), p={r.pvalues['l_huff']:.3f}  · 기준 폐업률 {Q.y.mean():.1%}")
Q=Q.copy(); Q["hq"]=Q.groupby("cat_s").l_huff.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=50 else np.nan)
print("   업종 안 5분위별 12개월 폐업률:"," / ".join(f"{v:.1%}" for v in Q.groupby("hq").y.mean()))
print("\n   (참고) 포화도와 반경 500m 근사 지수의 상관 — 신규점:",round(C[["l_huff","sat"]].corr(method="spearman").iat[0,1],2),
      "· 기존 점포:",round(P[["l_huff","sat"]].corr(method="spearman").iat[0,1],2))

# ③ 2024 코호트로 재현 — 관찰 기간이 더 길다
LS=pd.read_csv(f"{S}/label_landscape.csv"); X_CAT=set(LS.cat_s[LS.등급.str.startswith("X")])|{"G21202"}
A=pd.read_parquet(f"{S}/lineage_enriched.parquet",columns=["entry","lag","suspect","cat_s","h3_9","adm_cd","floor","2026Q2"])
print("\n③ 2024 코호트 재현 (진입 분기 스냅샷으로 포화도 계산, 업종 고정효과 선형확률모형)")
for q,mo in [("2024Q2",24),("2024Q4",18)]:
    R=A[(A.entry==q)&(A.lag<=3)&~A.suspect&~A.cat_s.isin(X_CAT)].copy(); fl(R); R["y"]=(R["2026Q2"]==0).astype(int)
    R=R.merge(H[H.q==q][["cat_s","h3_9","포화도"]],on=["cat_s","h3_9"],how="left").dropna(subset=["포화도"]); R["l_huff"]=np.log(R.포화도)
    cols=["l_huff","floor1","floor_b","floor_na"]; Z=R[cols+["y"]].astype(float); Z=Z-Z.groupby(R.cat_s).transform("mean")
    r=sm.OLS(Z.y,Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(R.adm_cd)[0]})
    R["hq"]=R.groupby("cat_s").l_huff.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=25 else np.nan)
    print(f"   {q} {len(R):,}곳 · {mo}개월 폐업 {R.y.mean():.1%} · 포화도 log 1단위당 {r.params['l_huff']*100:+.2f}%p "
          f"(95% {(r.params['l_huff']-1.96*r.bse['l_huff'])*100:+.2f}~{(r.params['l_huff']+1.96*r.bse['l_huff'])*100:+.2f}), p={r.pvalues['l_huff']:.3f}")
    print("      5분위(1=몫 작음 … 5=몫 큼):"," / ".join(f"{v:.1%}" for v in R.groupby("hq").y.mean()))

# ④ 새 가게는 '몫이 큰 자리'를 고르나 (마스터플랜 H2의 점포 단위 판) — 진입 직전(2024Q4) 지형에서
#    신규점이 들어간 셀의 '들어간 뒤 1점포 몫'((N+1)^(α-1)·T)을 같은 업종 기존 점포의 몫 분포에 놓는다
print("\n④ 새 가게는 몫이 큰 자리를 고르나 — 2025 신규점의 '진입 후 1점포 몫'이 기존 점포 분포의 몇 백분위인가 (50%=기존과 같음)")
s=snaps["2024Q4"]; rows=[]
for cat,grp in C.dropna(subset=["l_huff"]).groupby("cat_s"):
    inc=s[s.cat_s==cat]
    if len(grp)<100 or len(inc)<300: continue
    n=inc.groupby("h3_9").size(); lat,lon=np.array([h3.cell_to_latlng(h) for h in n.index]).T
    x,y=T.transform(lon,lat); ci,cj=cell(x,y); A=np.zeros((NY,NX)); np.add.at(A,(ci,cj),n.values**ALPHA)
    Tq=fftconvolve(D/np.maximum(fftconvolve(A,K,mode="same"),1e-12),K,mode="same")
    inc_share=np.repeat((n.values**(ALPHA-1))*Tq[ci,cj],n.values)            # 기존 점포마다 자기 셀의 몫
    lat,lon=np.array([h3.cell_to_latlng(h) for h in grp.h3_9]).T; x,y=T.transform(lon,lat); ei,ej=cell(x,y)
    npre=grp.h3_9.map(n).fillna(0).values
    ent_share=((npre+1)**(ALPHA-1))*Tq[ei,ej]
    pct=np.searchsorted(np.sort(inc_share),ent_share,side="right")/len(inc_share)
    rows.append(dict(업종=grp.cat_s_nm.iat[0],신규=len(grp),몫_백분위=pct.mean(),빈셀진입=(npre==0).mean()))
E=pd.DataFrame(rows); w=E.신규/E.신규.sum()
print(f"   업종 {len(E)}개, 신규점 {E.신규.sum():,}곳 · 가중 평균 백분위 {np.average(E.몫_백분위,weights=w):.1%}"
      f" · 같은 업종이 없던 셀로 들어간 비율 {np.average(E.빈셀진입,weights=w):.1%}")
print("   몫이 큰 자리를 가장 뚜렷이 고른 업종:", ", ".join(f"{r.업종} {r.몫_백분위:.0%}" for r in E.nlargest(5,"몫_백분위").itertuples()))
print("   오히려 몫이 작은 자리로 간 업종:", ", ".join(f"{r.업종} {r.몫_백분위:.0%}" for r in E.nsmallest(5,"몫_백분위").itertuples()))
