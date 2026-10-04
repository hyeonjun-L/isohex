# -*- coding: utf-8 -*-
"""임대료 붙이기 — 한국부동산원 상권(공식 경계)을 상권분석 상권·격자에 겹치고, 매출과의 관계를 본다.

입력
  RENT_DIR (기본 ../../임대료)
    부동산원_임대료_긴형식.csv        — 정리_부동산원_임대료.py 산출 (소규모·집합 '기준(1층)', 중대형 층별)
    경계/상권구획도2024.shp           — 부동산원 공표 '상권구획도(업로드용)'. 368개 상권, EPSG:3857, UTF-8
  TRDAR_SHP — 상권분석 영역-상권 (1,650개, EPSG:5181)
  MASTER_DIR — cell_panel.parquet(상권×업종 매출·점포), agg_v2.parquet(상권 속성)
  S (인자) — poi_2025Q2.parquet(격자), sales_potential_cells.parquet·매출잠재_계수_수요만.csv(p16)
출력 (OUT_DIR, 기본 RENT_DIR/결과)
  부동산원상권_서울.geojson — 서울 상권 폴리곤(EPSG:4326) + 임대료
  상권분석상권_임대료.csv   — 1,650개 상권분석 상권마다 겹치는 부동산원 상권·겹침 비율·임대료
  격자_임대료.csv           — 점포가 있는 H3 res9 셀 중 부동산원 상권 안에 든 셀
  임대료_지도.png           — 눈으로 확인하는 지도"""
import pandas as pd, numpy as np, sys, os, json, warnings, shapefile, h3
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform as stransform
from shapely import STRtree
from pyproj import Transformer
import statsmodels.api as sm
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
S=sys.argv[1]
RENT=os.environ.get("RENT_DIR",os.path.join(HERE,"..","..","임대료"))
OUT=os.environ.get("OUT_DIR",os.path.join(RENT,"결과")); os.makedirs(OUT,exist_ok=True)
M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))

# ── 임대료 표: 부동산원 상권마다 2025년 평균과 2026Q2
L=pd.read_csv(os.path.join(RENT,"부동산원_임대료_긴형식.csv")); L=L[L.시도=="서울"]
def piv(sel,label):
    d=L[sel]; y25=d[d.분기.str.startswith("2025")].groupby("상권").값.mean().rename(f"{label}_2025")
    last=d[d.분기=="2026Q2"].groupby("상권").값.mean().rename(f"{label}_2026Q2"); return pd.concat([y25,last],axis=1)
rent=pd.concat([piv((L.유형=="소규모 상가")&(L.항목=="임대료"),"소규모1층"),
                piv((L.유형=="집합 상가")&(L.항목=="임대료"),"집합1층"),
                piv((L.유형=="중대형 상가")&(L.항목=="임대료")&(L.층=="1층"),"중대형1층"),
                piv((L.유형=="중대형 상가")&(L.항목=="효용비율")&(L.층=="2층"),"중대형2층효용"),
                piv((L.유형=="중대형 상가")&(L.항목=="효용비율")&(L.층=="지하1층"),"중대형지하효용")],axis=1)
kw=L.drop_duplicates("상권").set_index("상권").권역; rent["권역"]=kw.reindex(rent.index)
rent=rent[rent.index!=rent.권역]                                  # 서울·권역 합계 줄 제외
rent["대표1층"]=rent.소규모1층_2025.fillna(rent.중대형1층_2025).fillna(rent.집합1층_2025)   # 소규모 → 중대형 → 집합 순
print(f"서울 부동산원 상권 {len(rent)}개 (소규모 {rent.소규모1층_2025.notna().sum()} · 중대형 {rent.중대형1층_2025.notna().sum()} · 집합 {rent.집합1층_2025.notna().sum()})")

# ── 부동산원 경계 (3857 → 5181)
rf=shapefile.Reader(os.path.join(RENT,"경계","상권구획도2024"),encoding="utf-8")
to5181=Transformer.from_crs(3857,5181,always_xy=True).transform; to4326=Transformer.from_crs(3857,4326,always_xy=True).transform
B=pd.DataFrame([r.as_dict() for r in rf.records()]); B["geom3857"]=[shape(s.__geo_interface__) for s in rf.shapes()]
B=B[B.sec_nm.isin(rent.index)].copy()
miss=sorted(set(rent.index)-set(B.sec_nm)); print("경계에 이름이 없는 서울 상권:", miss if miss else "없음")
B["g"]=[stransform(to5181,g) for g in B.geom3857]; B["km2"]=[g.area/1e6 for g in B.g]
B=B.join(rent,on="sec_nm")
print(f"경계 매칭 {len(B)}개 · 면적 중앙 {B.km2.median():.2f}㎢ (범위 {B.km2.min():.2f}~{B.km2.max():.2f}) · 조사 유형 예: {B.buld_nm.iloc[0]}")

# ── 1,650 상권분석 상권과 겹치기
sf=shapefile.Reader(SHP,encoding="utf-8"); T=pd.DataFrame([r.as_dict() for r in sf.records()])
T["g"]=[shape(s.__geo_interface__) for s in sf.shapes()]
tree=STRtree(list(B.g)); rows=[]
for i,r in T.iterrows():
    best=(None,0.0)
    for j in tree.query(r.g):
        a=r.g.intersection(B.g.iloc[j]).area/r.g.area
        if a>best[1]: best=(j,a)
    rows.append(dict(TRDAR_CD=int(r.TRDAR_CD),상권명=r.TRDAR_CD_N,구분=r.TRDAR_SE_1,자치구=r.SIGNGU_CD_,
                     부동산원상권=B.sec_nm.iloc[best[0]] if best[0] is not None else "",겹침비율=round(best[1],3)))
X=pd.DataFrame(rows); X=X.merge(rent.drop(columns="권역"),left_on="부동산원상권",right_index=True,how="left")
X.loc[X.겹침비율<0.3,[c for c in rent.columns if c!="권역"]]=np.nan     # 30% 미만 겹침은 임대료를 주지 않는다
X["배정"]=np.select([X.겹침비율>=0.3,X.겹침비율>0],["부동산원 상권 안 (≥30%)","일부만 겹침 (<30%)"],"밖")
X.to_csv(os.path.join(OUT,"상권분석상권_임대료.csv"),index=False,encoding="utf-8-sig")
print("\n상권분석 상권 1,650개 중:",X.배정.value_counts().to_dict())
print("  구분별 '안' 비율:",(X.assign(안=X.겹침비율>=0.3).groupby("구분").안.mean()*100).round(1).to_dict())
cov=X[X.겹침비율>=0.3].groupby("부동산원상권").size()
print(f"  부동산원 상권마다 들어온 상권분석 상권 수: 중앙 {cov.median():.0f}, 0개인 부동산원 상권 {len(set(B.sec_nm)-set(cov.index))}개")

# ── H3 res9 격자 (점포가 있는 셀)
snap=pd.read_parquet(f"{S}/poi_2025Q2.parquet",columns=["h3_9"]); cells=snap.h3_9.unique()
lat,lon=np.array([h3.cell_to_latlng(c) for c in cells]).T
x5,y5=Transformer.from_crs(4326,5181,always_xy=True).transform(lon,lat)
hit=tree.query([Point(a,b) for a,b in zip(x5,y5)],predicate="within")
G=pd.DataFrame({"h3_9":cells[hit[0]],"부동산원상권":B.sec_nm.values[hit[1]]}).merge(rent.drop(columns="권역"),left_on="부동산원상권",right_index=True)
G.to_csv(os.path.join(OUT,"격자_임대료.csv"),index=False,encoding="utf-8-sig")
print(f"\n점포 있는 res9 셀 {len(cells):,}개 중 부동산원 상권 안 {G.h3_9.nunique():,}개 ({G.h3_9.nunique()/len(cells):.1%})")

# ── GeoJSON
feats=[]
for _,r in B.iterrows():
    g=stransform(to4326,r.geom3857).simplify(0.00002)
    props={"상권":r.sec_nm,"권역":r.권역,"조사유형":r.buld_nm,"면적_km2":round(r.km2,3)}
    props.update({c:(None if pd.isna(r[c]) else round(float(r[c]),2)) for c in rent.columns if c not in ("권역",)})
    feats.append({"type":"Feature","geometry":mapping(g),"properties":props})
json.dump({"type":"FeatureCollection","features":feats},open(os.path.join(OUT,"부동산원상권_서울.geojson"),"w",encoding="utf-8"),ensure_ascii=False)

# ── 매출과의 관계
print("\n① 점포당 매출 ~ 임대료 (상권분석 상권 중 부동산원 상권 안에 든 곳, 2025년, 업종 고정효과, 부동산원 상권 단위 군집 SE)")
c=pd.read_parquet(f"{M}/cell_panel.parquet"); c=c[c.기준_년분기_코드.astype(str).str.startswith("2025")]
s=c.groupby(["상권_코드","서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
s=s[(s.공개==4)&(s.점포>0)]; s["l_ps"]=np.log(s.매출/s.점포)
D=s.merge(X[X.겹침비율>=0.3][["TRDAR_CD","부동산원상권","대표1층","소규모1층_2025","중대형1층_2025"]],left_on="상권_코드",right_on="TRDAR_CD")
for v in ["대표1층","소규모1층_2025","중대형1층_2025"]:
    d=D.dropna(subset=[v]).copy(); d["l_r"]=np.log(d[v])
    Z=d[["l_ps","l_r"]]-d.groupby("서비스_업종_코드")[["l_ps","l_r"]].transform("mean")
    r=sm.OLS(Z.l_ps,Z[["l_r"]]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.부동산원상권)[0]})
    print(f"   {v:<14} 탄력성 {r.params['l_r']:+.2f} (95% {r.params['l_r']-1.96*r.bse['l_r']:+.2f}~{r.params['l_r']+1.96*r.bse['l_r']:+.2f}) · 칸 {len(d):,} · 상권분석 상권 {d.상권_코드.nunique()} · 부동산원 상권 {d.부동산원상권.nunique()}")

print("\n② 임대료는 무엇을 따라가나 — 부동산원 상권 단위 (상권분석 상권 속성 합계, log)")
a=pd.read_parquet(f"{M}/agg_v2.parquet")[["상권_코드","유동인구","상주인구","직장인구","집객시설","면적_m2"]]
A=X[X.겹침비율>=0.3][["TRDAR_CD","부동산원상권"]].merge(a,left_on="TRDAR_CD",right_on="상권_코드")
A=A.groupby("부동산원상권")[["유동인구","상주인구","직장인구","집객시설","면적_m2"]].sum()
A=A.join(rent[["대표1층"]]).dropna(); A=A[(A>0).all(axis=1)]
Y=np.log(A.대표1층); Xa=np.log(A[["유동인구","상주인구","직장인구","집객시설"]].div(A.면적_m2,axis=0))   # 밀도
r=sm.OLS(Y,sm.add_constant(Xa)).fit(cov_type="HC1")
print(f"   n={len(A)}  R² {r.rsquared:.2f}  "+"  ".join(f"{k}밀도 {r.params[k]:+.2f}{'*' if r.pvalues[k]<0.05 else ''}" for k in Xa.columns))
print("   단순 상관(log):",{k:round(np.corrcoef(Y,Xa[k])[0,1],2) for k in Xa.columns})

print("\n③ 매출 잠재 v1과 임대료 — 20개 업종 칸에서 예측한 매출 잠재(업종 평균 대비)를 부동산원 상권별로 평균")
P=pd.read_parquet(f"{S}/sales_potential_cells.parquet"); Kf=pd.read_csv(f"{S}/매출잠재_계수_수요만.csv")
cols=["a_거주","a_출근등교","a_기타","l_all300"]; Kf=Kf.set_index("업종")[cols]
P=P[P.업종.isin(Kf.index)].copy()
P["idx"]=np.einsum("ij,ij->i",P[cols].values-P.groupby("svc")[cols].transform("mean").values,Kf.loc[P.업종].values)
Q=P.merge(X[X.겹침비율>=0.3][["TRDAR_CD","부동산원상권"]],left_on="상권",right_on="TRDAR_CD").groupby("부동산원상권").agg(매출잠재=("idx","mean"),칸=("idx","size"))
Q=Q.join(rent[["대표1층"]]).dropna(subset=["대표1층"]); Q=Q[Q.칸>=3]
rho=pd.Series(Q.매출잠재).corr(np.log(Q.대표1층),method="spearman")
print(f"   부동산원 상권 {len(Q)}개 — 매출 잠재 평균 vs log 임대료 순위상관 {rho:+.2f}")

# ── 지도
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from matplotlib import font_manager
for f in ["NanumGothic","AppleGothic","Malgun Gothic","Noto Sans CJK KR","Noto Sans KR","Noto Sans CJK JP"]:
    if any(f in x.name for x in font_manager.fontManager.ttflist): plt.rcParams["font.family"]=f; break
fig,ax=plt.subplots(figsize=(13,10.5),dpi=110)
for g in T.g:
    for p in getattr(g,"geoms",[g]): ax.fill(*p.exterior.xy,fc="#e9ece8",ec="#c9cfc7",lw=0.3)
v=B.대표1층; norm=matplotlib.colors.LogNorm(v.min(),v.max()); cmap=plt.get_cmap("YlOrBr")
for _,r in B.iterrows():
    for p in getattr(r.g,"geoms",[r.g]): ax.fill(*p.exterior.xy,fc=cmap(norm(r.대표1층)) if pd.notna(r.대표1층) else "#bbbbbb",ec="#5b3a1a",lw=0.6,alpha=0.85)
    cx,cy=r.g.representative_point().coords[0]; ax.text(cx,cy,r.sec_nm,fontsize=5.5,ha="center",va="center",color="#222")
sm_=plt.cm.ScalarMappable(norm=norm,cmap=cmap); cb=fig.colorbar(sm_,ax=ax,shrink=0.55,pad=0.01); cb.set_label("1층 임대료 2025 평균 (천원/㎡·월, 소규모→중대형→집합 순)")
tk=[t for t in [25,30,40,60,100,150] if v.min()<=t<=v.max()]; cb.set_ticks(tk); cb.set_ticklabels([str(t) for t in tk]); cb.minorticks_off()
ax.set_aspect("equal"); ax.set_axis_off(); ax.set_title(f"한국부동산원 서울 상권 {len(B)}개 (공식 경계) 위에 상권분석 상권 1,650개(회색)",fontsize=11)
fig.tight_layout(); fig.savefig(os.path.join(OUT,"임대료_지도.png")); print("\n저장:",OUT)
