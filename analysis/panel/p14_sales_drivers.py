# -*- coding: utf-8 -*-
"""점포당 매출은 무엇을 따라가나 — 매출 축을 다시 짜기 위한 점검 (p13 후속).
p13: Huff 1점포 몫은 상권 점포당 매출과 '반대로' 움직였다(탄력성 −0.49). 수요장 T는 0, 셀 점포수 N은 +0.33.
여기서는 ① 수요(D)를 바꿔 Huff 수요장을 다시 계산하고 ② 상권 속성(유동·상주·직장·집객)으로 직접 본다.
대상: p13과 같은 20개 1:1 업종 × 상권, 2025년 분기당 점포당 매출. 업종 고정효과, 행정동 군집 표준오차."""
import pandas as pd, numpy as np, sys, warnings, shapefile, h3, os
from shapely.geometry import shape, Point
from shapely import STRtree
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree
from pyproj import Transformer
import statsmodels.api as sm
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
warnings.filterwarnings("ignore")
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master")); ALPHA,BETA,DMIN=0.41,1.216,0.05
XW={"CS100010":["I21201"],"CS300002":["G20405"],"CS300001":["G20404"],"CS200028":["S20701"],"CS200030":["S20702"],
    "CS200029":["S20703"],"CS100007":["I21006"],"CS100005":["I21001"],"CS100002":["I20201"],"CS100008":["I21007"],
    "CS300018":["G21501"],"CS300022":["G21503"],"CS200037":["R10407"],"CS200031":["S20901","S20902"],"CS300004":["G20802"],
    "CS200019":["R10406"],"CS200016":["R10310"],"CS300028":["G21901"],"CS300016":["G21602"],"CS300009":["G20506"]}
inv={c:k for k,v in XW.items() for c in v}
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
def spread(v):  # 행정동 하루 도착 → 그 동의 100m 셀에 고르게
    per=(v/14)/cnt.reindex(v.index).fillna(np.inf); return dong.map(per).fillna(0).values.reshape(NY,NX)
DV={"거주":Dres,"출근·등교":spread(DD.출근+DD.등교),"기타 목적 도착":spread(DD.기타),"도착 전체":spread(DD.도착_전체)}
DV["거주+출근·등교(p12)"]=DV["거주"]+DV["출근·등교"]
ky,kx=np.mgrid[-(NY-1):NY,-(NX-1):NX]; K=np.maximum(np.hypot(ky,kx)*0.1,DMIN)**(-BETA)
# 상권 공간조인
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))   # build_master.py가 푼 영역-상권 SHP
sf=shapefile.Reader(SHP,encoding="utf-8")
codes=np.array([int(r["TRDAR_CD"]) for r in sf.records()]); tree=STRtree([shape(s.__geo_interface__) for s in sf.shapes()])
p=snap[snap.cat_s.isin(inv)].reset_index(drop=True)
x,y=Transformer.from_crs(4326,5181,always_xy=True).transform(p.lon.values,p.lat.values)
hit=tree.query([Point(a,b) for a,b in zip(x,y)],predicate="within"); p["상권"]=-1; p.loc[hit[0],"상권"]=codes[hit[1]]
p["svc"]=p.cat_s.map(inv)
for k in DV: p["T_"+k]=np.nan
p["Ncell"]=np.nan
for cat,grp in snap[snap.cat_s.isin(inv)].groupby("cat_s"):
    n=grp.groupby("h3_9").size(); lat,lon=np.array([h3.cell_to_latlng(h) for h in n.index]).T
    ci,cj=cell(*T4.transform(lon,lat)); A=np.zeros((NY,NX)); np.add.at(A,(ci,cj),n.values**ALPHA)
    den=np.maximum(fftconvolve(A,K,mode="same"),1e-12); ii=p.index[p.cat_s==cat]
    lat,lon=np.array([h3.cell_to_latlng(h) for h in p.loc[ii,"h3_9"]]).T; pi,pj=cell(*T4.transform(lon,lat))
    p.loc[ii,"Ncell"]=p.loc[ii,"h3_9"].map(n).values
    for k,D in DV.items(): p.loc[ii,"T_"+k]=np.maximum(fftconvolve(D/den,K,mode="same"),1e-9)[pi,pj]
p=p[p.상권>=0]
agg={"l_Ncell":("Ncell",lambda s:np.log(s).mean())}; agg.update({"l_T_"+k:("T_"+k,lambda s:np.log(s).mean()) for k in DV})
gq=p.groupby(["상권","svc"]).agg(**agg).reset_index()
c=pd.read_parquet(f"{M}/cell_panel.parquet"); c=c[c.기준_년분기_코드.astype(str).str.startswith("2025")&c.서비스_업종_코드.isin(XW)]
s=c.groupby(["상권_코드","서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
s=s[(s.공개==4)&(s.점포>0)]; s["l_ps"]=np.log(s.매출/s.점포); s["l_n"]=np.log(s.점포/4)
a=pd.read_parquet(f"{M}/agg_v2.parquet")[["상권_코드","l_유동인구","l_상주인구","l_직장인구","l_집객시설","l_면적_m2","행정동코드","상권구분"]]
d=gq.merge(s,left_on=["상권","svc"],right_on=["상권_코드","서비스_업종_코드"]).merge(a,on="상권_코드").dropna()
print(f"상권×업종 {len(d):,}칸 · 업종 {d.svc.nunique()}")
def fe(cols,label):
    Z=d[cols+["l_ps"]].astype(float); Z=Z-Z.groupby(d.svc).transform("mean")
    r=sm.OLS(Z.l_ps,Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.행정동코드.astype(str))[0]})
    print(f"  {label:<26} 업종 안 R² {r.rsquared:.3f} | "+"  ".join(f"{v.replace('l_','')} {r.params[v]:+.2f}{'*' if r.pvalues[v]<0.01 else ' '}" for v in cols))
print("\n① Huff 수요장 T를 수요 정의별로 — 점포당 매출(log) ~ log T + log(셀 같은업종 점포수)   (* p<0.01)")
for k in DV: fe(["l_T_"+k,"l_Ncell"],k)
print("\n② 상권 속성으로 직접")
fe(["l_유동인구","l_상주인구","l_직장인구","l_집객시설","l_면적_m2"],"속성 5개")
fe(["l_유동인구","l_상주인구","l_직장인구","l_집객시설","l_면적_m2","l_n"],"속성 5개 + 같은업종 점포수")
fe(["l_n"],"같은업종 점포수 하나만")
d.to_parquet(f"{S}/sales_drivers.parquet",index=False)
