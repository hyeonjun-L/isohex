# -*- coding: utf-8 -*-
"""매출 잠재 지도 — 서울 전역 H3 res9 격자에 매출 잠재·진입 희석·임대료를 붙인다 (마스터플랜 W2·§5.13).
v2 (2026-10-22, p26): 결과/에 `매출잠재_계수_수요만_v2.csv`가 있으면 그 판을 쓴다 — 업종 37개(v1 20 + 묶음·1:1 17, `매출잠재_업종대응_v2.csv`),
  출근 도착을 행정동 안에서 종사자 격자(1km)로 나눈 수요 래스터(`수요래스터_v2.npz`), 칠하는 업종은 p26의 `칠함`(한쪽 5%). SP_VERSION=v1이면 예전 판

입력
  S (인자)    poi_2025Q2.parquet · sales_potential_cells.parquet (p16)
              매출잠재_계수_수요만.csv (p16) · 업종별_생존.csv (p15) — S에 없으면 이 폴더의 결과/에서 읽는다
  MASTER_DIR  sgis100_seoul.parquet · dong_demand.parquet — p16과 같은 수요 래스터
  TRDAR_SHP   상권분석 영역-상권 SHP. 같은 폴더 옆의 영역-서울시·영역-행정동 SHP도 쓴다 (모두 EPSG:5181)
  RENT_DIR    결과/부동산원상권_서울.geojson (p17 산출, 부동산원 상권 72개 + 임대료). 기본 ../../임대료
출력 (OUT_DIR, 기본 ./결과)
  매출잠재_격자.csv      셀마다 재료 4개 · 업종별 매출 잠재(%)와 학습 범위 · 같은 업종 점포 수 · 부동산원 상권과 임대료
  매출잠재_격자.geojson  같은 내용, EPSG:4326 (OpenLayers·QGIS에서 바로)
  viewer_data.json       지도 뷰어용 압축본 (좌표 EPSG:3857 정수 m)
방법
  격자      서울 경계를 res9로 채운다 (셀 중심이 경계 안)
  재료      p16과 똑같이 잰다. 접근성 3종 = 100m 래스터 FFT 값을 셀 중심에서 읽어 log
            전체 점포 밀도 = 셀 중심 반경 300m 안 점포 수의 log1p (p16은 점포 위치에서 재고 자기를 뺐다)
            뷰어(정수/1000)와 CSV가 같은 값으로 계산하도록 재료를 소수 셋째 자리에서 먼저 반올림한다
  지수      Σ_j b_kj·(x_j − m_kj). b = 업종 k의 수축 계수(p16 표), m = 그 업종 학습 칸 평균
            exp(지수) − 1 = '그 업종의 평균적인 상권'보다 점포당 매출이 몇 % 높게(낮게) 기대되나
  칠하는 칸 반경 300m 점포 수가 그 업종 매출이 관측된 가장 한산한 상권(학습 칸 l_all300 최소) 이상인 칸만 값을 낸다.
            매출은 같은 업종이 3곳 이상인 상권에서만 공개돼 업종마다 학습한 상권의 번화함이 다르다 (카페 28곳 ~ 핸드폰 268곳).
            나머지 재료가 학습 범위(최소~최대)를 벗어나면 끝값으로 맞춰 계산한다 — 외삽하지 않는다. `끝값맞춤` 열에 업종을 적는다
            (2026-10-10 v1.1. v1은 재료 넷 중 하나라도 벗어나면 비워서 명동·강남역처럼 가장 번화한 칸이 비었다)
  칠하는 업종 p16 교차검증 순위상관이 0보다 확실히 큰(한쪽 5%, ρ > 1.645/√(n−1)) 13개만 뷰어에서 칠한다 — 기준값 0.1로 잘라도 같은 13개
  진입 희석 같은 업종 N곳인 셀에 한 곳 더 → 기존 점포 몫 ((N+1)/N)^(α−1) − 1, α = 0.41 (뷰어에서 계산)
  점포 수는 2025년 2분기 상가정보 — 모델 학습과 같은 시점이고, 2025-06 이후 등록 의심 건이 섞이기 전이다
점검: 점포가 있는 셀에서 다시 잰 재료로 p16의 상권 평균을 재현한다 (접근성은 반올림만큼만, 밀도는 정의 차이만큼만 다르다)"""
import pandas as pd, numpy as np, sys, os, json, warnings, shapefile, h3
from shapely.geometry import shape, Point
from shapely.ops import unary_union, transform as stransform
from shapely import STRtree
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree
from scipy.stats import spearmanr
from pyproj import Transformer
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
S=sys.argv[1]; ALPHA,BETA,DMIN,RHO_MIN=0.41,1.216,0.05,0.10
M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
RAW=os.path.dirname(os.path.dirname(SHP)); shp=lambda n: os.path.join(RAW,f"서울시 상권분석서비스({n})",f"서울시 상권분석서비스({n})")
RENT=os.environ.get("RENT_DIR",os.path.join(HERE,"..","..","임대료"))
RENT_GJ=os.environ.get("RENT_GEOJSON",os.path.join(RENT,"결과","부동산원상권_서울.geojson"))
OUT=os.environ.get("OUT_DIR",os.path.join(HERE,"결과")); os.makedirs(OUT,exist_ok=True)
pick=lambda f: os.path.join(S,f) if os.path.exists(os.path.join(S,f)) else os.path.join(HERE,"결과",f)
V2=os.environ.get("SP_VERSION","v2")=="v2" and os.path.exists(pick("매출잠재_계수_수요만_v2.csv"))
PAN=json.load(open(pick("매출잠재_판.json"),encoding="utf-8")) if os.path.exists(pick("매출잠재_판.json")) else {}   # p26이 적은 학습 기간·스냅샷 (W7.15)
XW={"CS100010":["I21201"],"CS300002":["G20405"],"CS300001":["G20404"],"CS200028":["S20701"],"CS200030":["S20702"],
    "CS200029":["S20703"],"CS100007":["I21006"],"CS100005":["I21001"],"CS100002":["I20201"],"CS100008":["I21007"],
    "CS300018":["G21501"],"CS300022":["G21503"],"CS200037":["R10407"],"CS200031":["S20901","S20902"],"CS300004":["G20802"],
    "CS200019":["R10406"],"CS200016":["R10310"],"CS300028":["G21901"],"CS300016":["G21602"],"CS300009":["G20506"]}   # p16과 같다
NAME={"CS100010":"카페","CS300002":"편의점","CS300001":"슈퍼마켓","CS200028":"미용실","CS200030":"피부관리실","CS200029":"네일숍",
      "CS100007":"치킨","CS100005":"빵집·제과","CS100002":"중식","CS100008":"분식","CS300018":"약국","CS300022":"화장품",
      "CS200037":"노래방","CS200031":"세탁소·셀프빨래방","CS300004":"휴대폰","CS200019":"PC방","CS200016":"당구장",
      "CS300028":"꽃집","CS300016":"안경","CS300009":"청과"}
if V2:          # p26 업종 대응에서 쓰기로 한 업종 (두 자료 점포 수가 상권마다 맞는 것)
    XT=pd.read_csv(pick("매출잠재_업종대응_v2.csv"),dtype=str); XW={r.서비스_업종_코드:r.상가코드.split(";") for r in XT.itertuples() if r.쓴다=="True"}
    NAME.update({"CS100001":"한식","CS100003":"일식","CS100004":"양식","CS100006":"패스트푸드","CS100009":"호프·주점","CS200001":"입시·교과학원",
                 "CS200003":"예술학원","CS200005":"태권도·요가","CS200006":"일반의원","CS200007":"치과","CS200008":"한의원","CS200017":"골프연습장",
                 "CS200024":"헬스장","CS200025":"자동차 정비","CS200034":"여관·모텔","CS300007":"정육점","CS300008":"수산물"})
    assert all(k in NAME for k in XW), [k for k in XW if k not in NAME]
COLS=["a_거주","a_출근등교","a_기타","l_all300"]
T4=Transformer.from_crs(4326,5179,always_xy=True); to5181=Transformer.from_crs(4326,5181,always_xy=True).transform
to3857=Transformer.from_crs(4326,3857,always_xy=True).transform; f5181_4326=Transformer.from_crs(5181,4326,always_xy=True).transform

# ── 서울 경계 → res9 격자
sb=shape(shapefile.Reader(shp("영역-서울시"),encoding="utf-8").shape(0).__geo_interface__); sb4=stransform(f5181_4326,sb)
cells=set()
for P in getattr(sb4,"geoms",[sb4]):
    cells|=set(h3.polygon_to_cells(h3.LatLngPoly([(y,x) for x,y in P.exterior.coords],*[[(y,x) for x,y in r.coords] for r in P.interiors]),9))
cells=np.array(sorted(cells)); print(f"서울 res9 격자 {len(cells):,}셀 (서울 면적 {sb.area/1e6:.0f}㎢)")

# ── 수요 래스터 (p16과 같은 코드)
POI=os.environ.get("POI","poi_2025Q2")   # 다시 맞출 때 p26과 같은 스냅샷 (W7.15)
snap=pd.read_parquet(f"{S}/{POI}.parquet",columns=["cat_s","h3_9","lon","lat","adm_cd"])
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
ACC={k:fftconvolve(D,K,mode="same") for k,D in DV.items()}
if V2:          # p26이 만든 수요 래스터 (출근을 종사자로 나눈 판) — 같은 격자인지 확인하고 갈아 끼운다
    Z=np.load(pick("수요래스터_v2.npz"))
    assert (Z["X0"].item(),Z["Y0"].item(),Z["NX"].item(),Z["NY"].item())==(X0,Y0,NX,NY), "p26 수요 래스터의 격자가 다르다 — 같은 스냅샷으로 p26을 다시 돌릴 것"
    assert np.allclose(Z["거주"],ACC["거주"],rtol=1e-5), "거주 접근성이 p26과 다르다"
    ACC={k:Z[k].astype(float) for k in ["거주","출근등교","기타"]}; print(f"수요 래스터 v2 — 출근 배분 {Z['alloc'].item()}")
allxy=cKDTree(np.c_[snap.lon.values*88200,snap.lat.values*111000])

def features(cs):
    """셀 중심에서 재료 4개 (p16 정의)"""
    lat,lon=np.array([h3.cell_to_latlng(c) for c in cs]).T; ci,cj=cell(*T4.transform(lon,lat))
    assert ci.min()>=0 and cj.min()>=0 and ci.max()<NY and cj.max()<NX, "래스터 밖 셀"
    f=pd.DataFrame({"h3_9":cs,"lat":lat,"lon":lon})
    for k in DV: f["a_"+k]=np.log(np.maximum(ACC[k][ci,cj],1e-9))
    f["n300"]=allxy.query_ball_point(np.c_[lon*88200,lat*111000],300,return_length=True); f["l_all300"]=np.log1p(f.n300)
    return f
F=features(cells); F[COLS]=F[COLS].round(3)

# ── 업종별 지수와 학습 범위
if V2:
    P=pd.read_parquet(f"{S}/sales_potential_cells_v2.parquet"); Kf=pd.read_csv(pick("매출잠재_계수_수요만_v2.csv")).set_index("svc")
else:
    P=pd.read_parquet(f"{S}/sales_potential_cells.parquet"); Kf=pd.read_csv(pick("매출잠재_계수_수요만.csv"))
    svc_of=P.groupby("업종").svc.first(); Kf["svc"]=Kf.업종.map(svc_of); Kf=Kf.set_index("svc")
PAINT={k:(bool(Kf.loc[k,"칠함"]) if "칠함" in Kf.columns else bool(Kf.loc[k,"순위상관(교차검증)"]>=RHO_MIN)) for k in XW}
if V2:          # 처음 보는 자치구 교차검증 R² (p26 'C' — 늘린 업종 전체, 업종별 수축)
    _cv=pd.read_csv(pick("매출잠재_검정_v2.csv")); TR2=float(_cv[_cv.판.str.startswith("C 늘린")].R2.iloc[0])
else: TR2=0.066                                          # p16 (마스터플랜 §5.11)
mu=P.groupby("svc")[COLS].mean(); lo=P.groupby("svc")[COLS].min(); hi=P.groupby("svc")[COLS].max()
SVC=sorted(XW,key=lambda k:-Kf.loc[k,"순위상관(교차검증)"])
X=F[COLS].values; IDX,DOM,CLP={},{},{}
for k in SVC:
    L,H=lo.loc[k].values,hi.loc[k].values
    DOM[k]=X[:,3]>=L[3]                                   # 칠함: 주변 점포가 그 업종 매출이 관측된 가장 한산한 상권 이상
    Xc=np.clip(X,L,H)                                      # 나머지 재료는 학습 범위 끝값으로 맞춘다 (외삽하지 않음)
    IDX[k]=(Xc-mu.loc[k].values)@Kf.loc[k,COLS].values.astype(float)
    CLP[k]=(X!=Xc).any(1)&DOM[k]

# ── 같은 업종 점포 수 (21개 상가 코드)
codes=[c for k in SVC for c in XW[k]]
N=snap[snap.cat_s.isin(codes)].groupby(["h3_9","cat_s"]).size().unstack(fill_value=0).reindex(columns=codes,fill_value=0)
N=N.reindex(cells,fill_value=0)

# ── 행정동·자치구 (셀 중심)
dsf=shapefile.Reader(shp("영역-행정동"),encoding="utf-8"); drec=[r.as_dict() for r in dsf.records()]
dgeo=[shape(s.__geo_interface__) for s in dsf.shapes()]; dtree=STRtree(dgeo)
gx,gy=to5181(F.lon.values,F.lat.values); pts=[Point(a,b) for a,b in zip(gx,gy)]
hit=dtree.query(pts,predicate="within"); di=np.full(len(F),-1); di[hit[0]]=hit[1]
for q in np.where(di<0)[0]: di[q]=dtree.nearest(pts[q])
tsf=shapefile.Reader(SHP,encoding="utf-8"); gu_nm={r["SIGNGU_CD"]:r["SIGNGU_CD_"] for r in tsf.records()}
F["행정동"]=[drec[q]["ADSTRD_NM"] for q in di]; F["adm"]=[drec[q]["ADSTRD_CD"] for q in di]; F["자치구"]=F.adm.str[:5].map(gu_nm)
print(f"행정동 배정: 경계 안 {len(hit[0]):,} · 가장 가까운 동으로 {int((len(F)-len(hit[0])))}셀 · 자치구 이름 없는 셀 {int(F.자치구.isna().sum())}")

# ── 부동산원 상권 (p17 산출)
RG=json.load(open(RENT_GJ,encoding="utf-8"))["features"]; rgeo=[shape(f["geometry"]) for f in RG]; rtree=STRtree(rgeo)
hit=rtree.query([Point(a,b) for a,b in zip(F.lon,F.lat)],predicate="within"); ri=np.full(len(F),-1); ri[hit[0]]=hit[1]
F["부동산원상권"]=[RG[q]["properties"]["상권"] if q>=0 else "" for q in ri]
F["임대료_1층"]=[RG[q]["properties"]["대표1층"] if q>=0 else np.nan for q in ri]
print(f"부동산원 상권 72개 안의 셀 {int((ri>=0).sum()):,}개 ({(ri>=0).mean():.1%})")

# ── 점검 ①: 점포 셀에서 다시 잰 재료로 p16 상권 평균 재현
p=snap[snap.cat_s.isin(codes)].reset_index(drop=True); p["svc"]=p.cat_s.map({c:k for k in XW for c in XW[k]})
tgeo=[shape(s.__geo_interface__) for s in tsf.shapes()]; tcode=np.array([int(r["TRDAR_CD"]) for r in tsf.records()])
x5,y5=to5181(p.lon.values,p.lat.values); h=STRtree(tgeo).query([Point(a,b) for a,b in zip(x5,y5)],predicate="within")
p["상권"]=-1; p.loc[h[0],"상권"]=tcode[h[1]]; p=p[p.상권>=0]
need=np.setdiff1d(p.h3_9.unique(),cells); Fn=features(need); Fn[COLS]=Fn[COLS].round(3)
Fs=pd.concat([F[["h3_9"]+COLS],Fn[["h3_9"]+COLS]]).set_index("h3_9")
R=p.join(Fs,on="h3_9").groupby(["상권","svc"])[COLS].mean().reset_index().merge(P[["상권","svc"]+COLS],on=["상권","svc"],suffixes=("","_p16"))
print(f"\n점검 ① p16 상권×업종 {len(R):,}칸 재현 — 접근성 최대 차이 "+" · ".join(f"{c} {np.abs(R[c]-R[c+'_p16']).max():.1e}" for c in COLS[:3])
      +f" · 전체 점포 밀도(셀 중심 vs 점포 위치) 상관 {np.corrcoef(R.l_all300,R.l_all300_p16)[0,1]:.3f}, 평균 차이 {np.mean(R.l_all300-R.l_all300_p16):+.3f}")
B_=np.vstack([Kf.loc[k,COLS].values.astype(float) for k in R.svc]); MU=mu.loc[R.svc].values
ig=np.einsum("ij,ij->i",R[COLS].values-MU,B_); ip=np.einsum("ij,ij->i",R[[c+"_p16" for c in COLS]].values-MU,B_)
print(f"   상권 단위 지수: 셀 중심 재료로 잰 값 vs p16 값 상관 {np.corrcoef(ig,ip)[0,1]:.3f}")

# ── 요약
print(f"\n② 업종별 — 칠한 칸 비율·끝값 맞춤과 매출 잠재 분포 (칠한 칸, 업종 평균 상권 대비 %)")
rows=[]
for k in SVC:
    v=IDX[k][DOM[k]]; q=np.percentile(v,[5,25,50,75,95]) if len(v) else [np.nan]*5
    dm=DOM[k]&(ri>=0)
    Q=pd.DataFrame({"r":ri[dm],"v":IDX[k][dm]}).groupby("r").v.agg(["mean","size"]); Q=Q[Q["size"]>=3]
    rr=np.log([RG[q]["properties"]["대표1층"] or np.nan for q in Q.index]); ok=~np.isnan(rr)
    rho_r=spearmanr(Q["mean"].values[ok],rr[ok]).correlation if ok.sum()>=10 else np.nan
    rows.append(dict(업종=NAME[k],교차검증ρ=Kf.loc[k,"순위상관(교차검증)"],칠함="O" if PAINT[k] else "",
                     칠한칸=f"{DOM[k].mean():.0%}",끝값맞춤=f"{CLP[k].mean():.1%}",기준점포=int(round(np.expm1(lo.loc[k,"l_all300"]))),**{f"p{a}":f"{(np.exp(b)-1)*100:+.0f}%" for a,b in zip([5,25,50,75,95],q)},
                     임대료상관=round(rho_r,2),임대료상권=int(ok.sum())))
print(pd.DataFrame(rows).to_string(index=False))
allin=np.mean([DOM[k] for k in SVC],axis=0)
print(f"   셀 기준: {len(SVC)}개 업종 모두 칠함 {np.mean(allin==1):.0%} · 모두 비움 {np.mean(allin==0):.0%} · 모두 비운 셀의 반경 300m 점포 수 중앙값 {np.median(F.n300[allin==0]):.0f}곳 (모두 칠한 셀 {np.median(F.n300[allin==1]):.0f}곳)")
why=pd.DataFrame({c:[np.mean([(X[:,j]<lo.loc[k].values[j]).mean() for k in SVC]),np.mean([(X[:,j]>hi.loc[k].values[j]).mean() for k in SVC])] for j,c in enumerate(COLS)},index=["최소보다 작음","최대보다 큼"])
print("   학습 범위를 벗어나는 재료 (업종 평균, 셀 비율 %) — 점포 수가 최소보다 적으면 비우고, 나머지는 끝값으로 맞춘다:"); print((why*100).round(1).to_string())

# ── CSV · GeoJSON
O=F[["h3_9","자치구","행정동","부동산원상권","임대료_1층","lat","lon"]].copy()
for c in COLS: O[c]=F[c]
O["점포_반경300m"]=F.n300
for k in SVC: O[f"잠재_{NAME[k]}"]=np.where(DOM[k],np.round((np.exp(IDX[k])-1)*100,1),np.nan)
O["끝값맞춤"]=[";".join(NAME[k] for k in SVC if CLP[k][q]) for q in range(len(F))]
for c in codes: O[f"점포_{c}"]=N[c].values
O.to_csv(os.path.join(OUT,"매출잠재_격자.csv"),index=False,encoding="utf-8-sig")
feats=[]
for r in O.itertuples(index=False):
    ring=[[round(lo_,6),round(la_,6)] for la_,lo_ in h3.cell_to_boundary(r.h3_9)]; ring.append(ring[0])
    pr={k_:(None if (isinstance(v,float) and np.isnan(v)) else (v.item() if hasattr(v,"item") else v)) for k_,v in zip(O.columns,r) if k_ not in ("lat","lon")}
    feats.append({"type":"Feature","geometry":{"type":"Polygon","coordinates":[ring]},"properties":pr})
json.dump({"type":"FeatureCollection","name":"매출잠재_격자_v2" if V2 else "매출잠재_격자_v1","features":feats},open(os.path.join(OUT,"매출잠재_격자.geojson"),"w",encoding="utf-8"),ensure_ascii=False)

# ── 뷰어용 압축본 (EPSG:3857 정수 m — 이웃 셀이 꼭짓점을 공유하도록 꼭짓점을 먼저 반올림)
cx,cy=to3857(F.lon.values,F.lat.values); cx=np.round(cx).astype(int); cy=np.round(cy).astype(int); off=[]
for q,c in enumerate(cells):
    b=h3.cell_to_boundary(c); vx,vy=to3857([v[1] for v in b],[v[0] for v in b])
    off+=[int(round(a))-int(cx[q]) for a in vx]+[int(round(a))-int(cy[q]) for a in vy]   # x 6개 다음 y 6개
def rings3857(geom4326,tol):
    g_=stransform(lambda x,y: to3857(x,y),geom4326).simplify(tol); out=[]
    for P_ in getattr(g_,"geoms",[g_]): out.append([int(round(v)) for xy in P_.exterior.coords for v in xy])
    return out
gpoly={}
for r,gm in zip(drec,dgeo): gpoly.setdefault(r["ADSTRD_CD"][:5],[]).append(gm)
GU=[]
for cd,gs in sorted(gpoly.items()):
    u4=stransform(f5181_4326,unary_union(gs).buffer(0)); lp=stransform(lambda x,y: to3857(x,y),u4).representative_point()
    GU.append({"n":gu_nm.get(cd,cd),"r":rings3857(u4,25),"l":[int(lp.x),int(lp.y)]})
RENTS=[]
for f_,gm in zip(RG,rgeo):
    pr=f_["properties"]; lp=stransform(lambda x,y: to3857(x,y),gm).representative_point()
    RENTS.append({"n":pr["상권"],"k":pr.get("권역"),"t":pr.get("조사유형"),"r":rings3857(gm,4),"l":[int(lp.x),int(lp.y)],
                  "v":{c:pr.get(c) for c in ["대표1층","소규모1층_2025","소규모1층_2026Q2","중대형1층_2025","중대형1층_2026Q2","집합1층_2025","집합1층_2026Q2","중대형2층효용_2025","중대형지하효용_2025"]}})
SV=pd.read_csv(pick("업종별_생존.csv")).set_index("cat_s")
def surv(c):
    r=SV.loc[c]; f_=lambda v: None if pd.isna(v) else round(float(v),3)
    return {"code":c,"nm":r.업종,"S12":f_(r.S12_추정),"S12lo":f_(r.S12_하),"S12hi":f_(r.S12_상),"close":f_(r.기존_연폐업률),
            "stores":int(r.점포수_2026Q1),"new":int(r.신규점_2025),"note":r.비고,"grade":r.등급}
IND=[{"k":k,"nm":NAME[k],"sn":Kf.loc[k,"업종"],"codes":XW[k],"b":[float(Kf.loc[k,c]) for c in COLS],
      "mu":[float(v) for v in mu.loc[k]],"lo":[float(v) for v in lo.loc[k]],"hi":[float(v) for v in hi.loc[k]],
      "rho":float(Kf.loc[k,"순위상관(교차검증)"]),"n":int(Kf.loc[k,"칸"]),"paint":PAINT[k],
      "surv":[surv(c) for c in XW[k]]} for k in SVC]
DONG=sorted(set(F.행정동+"|"+F.자치구.fillna(""))); dix={d:q for q,d in enumerate(DONG)}
VD={"meta":{"cells":len(cells),"alpha":ALPHA,"beta":BETA,"rho_min":RHO_MIN,"cols":COLS,"snapshot":POI.split("_")[-1],"made":pd.Timestamp.now().strftime("%Y-%m-%d"),"rule":"v1.1 — 칠함: l_all300 ≥ 업종 학습 최소, 나머지 재료는 학습 범위 끝값으로 맞춤","version":"v2" if V2 else "v1",
            "paint_rule":"교차검증 순위상관 > 1.645/√(n−1) (한쪽 5%)" if V2 else f"교차검증 순위상관 ≥ {RHO_MIN}",
            **({"sales":PAN["sales_qs"],"alloc":PAN.get("alloc")} if PAN else {}),
            "train":{"cells":int(len(P)),"ind":len(SVC),"paint":int(sum(PAINT.values())),"r2":TR2}},
    "ind":IND,"x":cx.tolist(),"y":cy.tolist(),"off":off,
    "f":np.round(F[COLS].values*1000).astype(int).ravel().tolist(),"n300":F.n300.astype(int).tolist(),
    "dong":[dix[d] for d in F.행정동+"|"+F.자치구.fillna("")],"dongs":DONG,"rent":ri.tolist(),
    "cnt":{c:[[int(q),int(v)] for q,v in enumerate(N[c].values) if v>0] for c in codes},
    "gu":GU,"seoul":rings3857(sb4,25),"rents":RENTS}
json.dump(VD,open(os.path.join(OUT,"viewer_data.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(f"\n저장 → {OUT}: 매출잠재_격자.csv ({len(O):,}행) · 매출잠재_격자.geojson · viewer_data.json ({os.path.getsize(os.path.join(OUT,'viewer_data.json'))/1e6:.2f}MB)")
