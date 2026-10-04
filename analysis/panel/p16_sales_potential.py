# -*- coding: utf-8 -*-
"""매출 잠재 v1 — 업종별 수요 재료를 상권 점포당 매출로 검증 (마스터플랜 H4).

새 점수 구조(2026-10-04)에서 지도 점수는 '매출 잠재' 하나다. 어떤 재료로 만들지 여기서 정한다.
대상: 상권분석 서비스와 상가정보가 1:1로 맞는 20개 업종 × 상권 (2025년 4분기 모두 매출 공개된 칸).
종속: log(분기당 점포당 매출).  설명(상권 안 그 업종 점포 위치에서 잰 값의 평균):
  a_거주 / a_출근등교 / a_기타 : 수요 접근성 = Σ D(o)·d^-β  (경쟁 차감 없음, β 1.216, 100m 래스터 FFT)
  t_거주 / t_출근등교 / t_기타 : Huff 수요장 = Σ D(o)·d^-β / Σ_j A(j)·d^-β (같은 업종 경쟁 차감, A = N^0.41)
  l_all300 : 반경 300m 전체 점포 수(상업 중심성)   l_N : res9 셀 안 같은 업종 수(자기 포함 — 이미 드러난 수요)
  w3_share : W3 원안의 1점포 몫 = (α−1)·l_N + t_(거주+출근등교)
검정: 자치구를 통째로 빼고 학습해 그 구를 맞히는 교차검증(25겹).
  기울기 두 방식 — 공통 기울기(업종 절편만 다름) / 업종별 기울기를 공통값 쪽으로 수축(DerSimonian–Laird)
  지표 — 교차검증 R² (업종 평균만 쓴 것 대비 오차 감소), 업종별 순위상관 양수 비율
H4 통과 기준: 교차검증 R² > 0, 과반 업종에서 순위상관 > 0, 핵심 계수의 95% 구간이 0을 포함하지 않음"""
import pandas as pd, numpy as np, sys, os, warnings, shapefile, h3
from shapely.geometry import shape, Point
from shapely import STRtree
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree
from scipy.stats import spearmanr
from pyproj import Transformer
import statsmodels.api as sm
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master")); ALPHA,BETA,DMIN=0.41,1.216,0.05
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
XW={"CS100010":["I21201"],"CS300002":["G20405"],"CS300001":["G20404"],"CS200028":["S20701"],"CS200030":["S20702"],
    "CS200029":["S20703"],"CS100007":["I21006"],"CS100005":["I21001"],"CS100002":["I20201"],"CS100008":["I21007"],
    "CS300018":["G21501"],"CS300022":["G21503"],"CS200037":["R10407"],"CS200031":["S20901","S20902"],"CS300004":["G20802"],
    "CS200019":["R10406"],"CS200016":["R10310"],"CS300028":["G21901"],"CS300016":["G21602"],"CS300009":["G20506"]}
inv={c:k for k,v in XW.items() for c in v}
# ── 100m 래스터와 수요
T4=Transformer.from_crs(4326,5179,always_xy=True)
snap=pd.read_parquet(f"{S}/poi_2025Q2.parquet",columns=["cat_s","h3_9","lon","lat","adm_cd"])
g=pd.read_parquet(f"{M}/sgis100_seoul.parquet"); sx,sy=T4.transform(snap.lon.values,snap.lat.values)
X0=min(g.x0.min(),sx.min())//100*100-500; Y0=min(g.y0.min(),sy.min())//100*100-500
NX=int((max(g.x0.max(),sx.max())-X0)//100)+6; NY=int((max(g.y0.max(),sy.max())-Y0)//100)+6
cell=lambda x,y:(((np.asarray(y)-Y0)//100).astype(int),((np.asarray(x)-X0)//100).astype(int))
Dres=np.zeros((NY,NX)); i,j=cell(g.x0+50,g.y0+50); np.add.at(Dres,(i,j),g.인구.fillna(0).values)
DD=pd.read_parquet(f"{M}/dong_demand.parquet"); DD.index=DD.index.astype(str)
yy,xx=np.mgrid[0:NY,0:NX]; dist,nn=cKDTree(np.c_[sx,sy]).query(np.c_[X0+xx.ravel()*100+50,Y0+yy.ravel()*100+50])
dong=pd.Series(np.where(dist<=300,snap.adm_cd.astype(str).values[nn],"")); cnt=dong[dong!=""].value_counts()
def spread(v): per=(v/14)/cnt.reindex(v.index).fillna(np.inf); return dong.map(per).fillna(0).values.reshape(NY,NX)
DV={"거주":Dres,"출근등교":spread(DD.출근+DD.등교),"기타":spread(DD.기타)}
ky,kx=np.mgrid[-(NY-1):NY,-(NX-1):NX]; K=np.maximum(np.hypot(ky,kx)*0.1,DMIN)**(-BETA)
ACC={k:fftconvolve(D,K,mode="same") for k,D in DV.items()}            # 경쟁 차감 없는 수요 접근성
# ── 상권 안 20개 업종 점포
sf=shapefile.Reader(SHP,encoding="utf-8")
codes=np.array([int(r["TRDAR_CD"]) for r in sf.records()]); gu_of=pd.Series([str(r["ADSTRD_CD"])[:5] for r in sf.records()],index=codes)
adm_of=pd.Series([str(r["ADSTRD_CD"]) for r in sf.records()],index=codes)
tree=STRtree([shape(s.__geo_interface__) for s in sf.shapes()])
p=snap[snap.cat_s.isin(inv)].reset_index(drop=True)
x5,y5=Transformer.from_crs(4326,5181,always_xy=True).transform(p.lon.values,p.lat.values)
hit=tree.query([Point(a,b) for a,b in zip(x5,y5)],predicate="within"); p["상권"]=-1; p.loc[hit[0],"상권"]=codes[hit[1]]
p["svc"]=p.cat_s.map(inv)
mxy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
p["all300"]=cKDTree(mxy(snap)).query_ball_point(mxy(p),300,return_length=True)-1
lat,lon=np.array([h3.cell_to_latlng(c) for c in p.h3_9]).T; p["ci"],p["cj"]=cell(*T4.transform(lon,lat))
for k in DV: p["a_"+k]=ACC[k][p.ci,p.cj]
for svc,grp in snap[snap.cat_s.isin(inv)].assign(svc=lambda d:d.cat_s.map(inv)).groupby("svc"):
    n=grp.groupby("h3_9").size(); la,lo=np.array([h3.cell_to_latlng(c) for c in n.index]).T
    ci,cj=cell(*T4.transform(lo,la)); A=np.zeros((NY,NX)); np.add.at(A,(ci,cj),n.values**ALPHA)
    den=np.maximum(fftconvolve(A,K,mode="same"),1e-12); ii=p.index[p.svc==svc]
    p.loc[ii,"N"]=p.loc[ii,"h3_9"].map(n).values
    Dsum=DV["거주"]+DV["출근등교"]
    for k,D in list(DV.items())+[("w3",Dsum)]:
        p.loc[ii,"t_"+k]=np.maximum(fftconvolve(D/den,K,mode="same"),1e-9)[p.loc[ii,"ci"],p.loc[ii,"cj"]]
p=p[p.상권>=0].copy()
lcols={"l_N":"N","l_all300":"all300"}; lcols.update({f"a_{k}":f"a_{k}" for k in DV}); lcols.update({f"t_{k}":f"t_{k}" for k in DV}); lcols["t_w3"]="t_w3"
for c,src in lcols.items(): p[c+"_"]=np.log1p(p[src]) if c=="l_all300" else np.log(np.maximum(p[src],1e-9))
d=p.groupby(["상권","svc"])[[c+"_" for c in lcols]].mean(); d.columns=list(lcols); d=d.reset_index()
d["w3_share"]=(ALPHA-1)*d.l_N+d.t_w3
c=pd.read_parquet(f"{M}/cell_panel.parquet"); c=c[c.기준_년분기_코드.astype(str).str.startswith("2025")&c.서비스_업종_코드.isin(XW)]
s=c.groupby(["상권_코드","서비스_업종_코드","서비스_업종_코드_명"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
s=s[(s.공개==4)&(s.점포>0)]; s["y"]=np.log(s.매출/s.점포)
d=d.merge(s,left_on=["상권","svc"],right_on=["상권_코드","서비스_업종_코드"]).dropna()
d["gu"]=d.상권.map(gu_of).values; d["adm"]=d.상권.map(adm_of).values; d["업종"]=d.서비스_업종_코드_명
print(f"상권×업종 {len(d):,}칸 · 업종 {d.svc.nunique()} · 자치구 {d.gu.nunique()}")

def fit(tr,cols,mode):
    """업종 안 편차로 기울기 추정. mode='pool' 공통 / 'eb' 업종별을 공통값 쪽으로 수축"""
    mu=tr.groupby("svc")[cols+["y"]].mean()
    Z=tr[cols+["y"]]-mu.loc[tr.svc].values
    Xp=Z[cols].values; bp=np.linalg.lstsq(Xp,Z.y.values,rcond=None)[0]
    B={k:bp for k in mu.index}
    if mode=="eb" and cols:
        est,var={},{}
        for k,ix in tr.groupby("svc").indices.items():
            X=Xp[ix]; yv=Z.y.values[ix]
            if len(ix)<len(cols)+5: continue
            bk=np.linalg.lstsq(X,yv,rcond=None)[0]; r=yv-X@bk; s2=r@r/(len(ix)-len(cols))
            est[k]=bk; var[k]=np.diag(np.linalg.pinv(X.T@X))*s2
        if len(est)>=3:
            E=np.array(list(est.values())); V=np.array(list(var.values())); W=1/V
            m=(W*E).sum(0)/W.sum(0); Q=(W*(E-m)**2).sum(0); dfree=len(E)-1
            tau2=np.maximum(0,(Q-dfree)/(W.sum(0)-(W**2).sum(0)/W.sum(0)))
            for k in est:
                w=tau2/(tau2+var[k]); B[k]=bp+w*(est[k]-bp)
    return mu,B
def cv(cols,mode):
    pred=np.full(len(d),np.nan); base=np.full(len(d),np.nan)
    for gname,te in d.groupby("gu").indices.items():
        tr=d.drop(index=d.index[te]); mu,B=fit(tr,cols,mode); t=d.iloc[te]
        ok=t.svc.isin(mu.index).values; t=t[ok]; idx=np.array(te)[ok]
        base[idx]=mu.loc[t.svc,"y"].values
        pred[idx]=base[idx]+(np.einsum("ij,ij->i",(t[cols].values-mu.loc[t.svc,cols].values),np.vstack([B[k] for k in t.svc])) if cols else 0)
    m=~np.isnan(pred); y=d.y.values
    r2=1-((y[m]-pred[m])**2).sum()/((y[m]-base[m])**2).sum()
    rho=d[m].assign(p=pred[m]).groupby("업종").apply(lambda z: spearmanr(z.p,z.y).correlation if len(z)>=20 else np.nan)
    return r2,rho
SETS={"W3 원안 (Huff 1점포 몫)":["w3_share"],
      "출근·등교 접근성":["a_출근등교"],
      "접근성 3종 (거주·출근등교·기타)":["a_거주","a_출근등교","a_기타"],
      "접근성 3종 + 전체 점포 밀도":["a_거주","a_출근등교","a_기타","l_all300"],
      "접근성 3종 + 전체 밀도 + 같은 업종 밀집":["a_거주","a_출근등교","a_기타","l_all300","l_N"],
      "Huff 수요장 3종 (경쟁 차감)":["t_거주","t_출근등교","t_기타"],
      "Huff 수요장 3종 + 같은 업종 밀집":["t_거주","t_출근등교","t_기타","l_N"],
      "전체 밀도 + 같은 업종 밀집만":["l_all300","l_N"]}
assert len(SETS)==8
print("\n① 자치구 제외 교차검증 — 처음 보는 구의 점포당 매출을 얼마나 맞히나")
print(f"   {'재료':<30}{'공통 기울기 R²':>14}{'업종별(수축) R²':>16}{'순위상관>0 업종':>16}")
res={}
for name,cols in SETS.items():
    r2p,_=cv(cols,"pool"); r2e,rho=cv(cols,"eb"); res[name]=(r2p,r2e,rho)
    print(f"   {name:<30}{r2p:>14.3f}{r2e:>16.3f}{f'{int((rho>0).sum())}/{int(rho.notna().sum())}':>16}")
best=max(SETS,key=lambda k:max(res[k][0],res[k][1])); bm="eb" if res[best][1]>=res[best][0] else "pool"
print(f"   → 가장 나은 조합: {best.strip()} ({'업종별 수축' if bm=='eb' else '공통 기울기'})")
# 수요만(같은 업종 밀집 없이) 가장 나은 조합도 따로 — 빈 셀(그 업종 가게가 없는 자리)에도 쓸 수 있는 판
demand_only=[k for k in SETS if "l_N" not in SETS[k] and k!="W3 원안 (Huff 1점포 몫)"]
best_d=max(demand_only,key=lambda k:max(res[k][0],res[k][1])); bdm="eb" if res[best_d][1]>=res[best_d][0] else "pool"
print(f"   → 같은 업종 밀집 없이 가장 나은 조합: {best_d.strip()} ({'업종별 수축' if bdm=='eb' else '공통 기울기'})")

print("\n② 공통 기울기 (전체 자료, 업종 고정효과, 행정동 군집 표준오차)")
for name in ["W3 원안 (Huff 1점포 몫)",best,best_d]:
    cols=SETS[name]; Z=d[cols+["y"]]-d.groupby("svc")[cols+["y"]].transform("mean")
    r=sm.OLS(Z.y,Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.adm)[0]})
    print(f"   [{name.strip()}]  "+"  ".join(f"{v} {r.params[v]:+.2f} ({r.params[v]-1.96*r.bse[v]:+.2f}~{r.params[v]+1.96*r.bse[v]:+.2f})" for v in cols))

print("\n③ 업종별 — 가장 나은 조합의 수축 계수와 처음 보는 구에서의 순위상관")
mu,B=fit(d,SETS[best],"eb"); _,rho=cv(SETS[best],bm)
nm=d.groupby("svc").업종.first(); nn=d.groupby("svc").size()
T=pd.DataFrame({k:B[k] for k in B},index=SETS[best]).T.round(2)
T.insert(0,"칸",nn); T.insert(0,"업종",nm); T["순위상관(교차검증)"]=T.업종.map(rho).round(2)
print(T.sort_values("순위상관(교차검증)").to_string(index=False))
T.to_csv(f"{S}/매출잠재_계수_밀집포함.csv",index=False,encoding="utf-8-sig")
mu,Bd=fit(d,SETS[best_d],"eb"); _,rho_d=cv(SETS[best_d],bdm)
Td=pd.DataFrame({k:Bd[k] for k in Bd},index=SETS[best_d]).T.round(2); Td.insert(0,"칸",nn); Td.insert(0,"업종",nm)
Td["순위상관(교차검증)"]=Td.업종.map(rho_d).round(2); Td.to_csv(f"{S}/매출잠재_계수_수요만.csv",index=False,encoding="utf-8-sig")
print("\n   (수요만 판 — 같은 업종 밀집 없이, 빈 셀에도 쓸 수 있음)"); print(Td.sort_values("순위상관(교차검증)").to_string(index=False))
for name,mm in [(best,bm),(best_d,bdm)]:
    r2p,r2e,rh=res[name]; r2=r2e if mm=="eb" else r2p
    print(f"\nH4 판정 [{name.strip()}] — 교차검증 R² {r2:.3f} · 순위상관 양수 {int((rh>0).sum())}/{int(rh.notna().sum())} 업종 → "
          f"{'통과' if r2>0 and (rh>0).sum()>rh.notna().sum()/2 else '불통과'}")
d.to_parquet(f"{S}/sales_potential_cells.parquet",index=False)
