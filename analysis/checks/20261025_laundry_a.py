# 빨래방 진단 A — 서울시 '세탁소' 점포 수에 셀프빨래방이 들어 있나, 학습 상권에서 셀프빨래방 비중에 따라 기울기가 다른가
import os, numpy as np, pandas as pd, shapefile, warnings
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
from scipy.stats import spearmanr
import statsmodels.api as sm
warnings.filterwarnings("ignore")
H=os.environ["HOME"]
SHP=f"{H}/work/analysis/raw/서울시 상권분석서비스(영역-상권)/서울시 상권분석서비스(영역-상권)"
sf=shapefile.Reader(SHP,encoding="utf-8"); recs=[r.as_dict() for r in sf.records()]
print("shp fields:", list(recs[0].keys()))
codes=np.array([int(r["TRDAR_CD"]) for r in recs])
kind=pd.Series([r.get("TRDAR_SE_1", r.get("TRDAR_SE_C","")) for r in recs],index=codes)
tree=STRtree([shape(s.__geo_interface__) for s in sf.shapes()])
p=pd.read_parquet(f"{H}/work/snapshots/poi_2025Q2.parquet",columns=["cat_s","lon","lat","name"])
p=p[p.cat_s.isin(["S20901","S20902"])].reset_index(drop=True)
x5,y5=Transformer.from_crs(4326,5181,always_xy=True).transform(p.lon.values,p.lat.values)
hit=tree.query([Point(a,b) for a,b in zip(x5,y5)],predicate="within"); p["상권"]=-1; p.loc[hit[0],"상권"]=codes[hit[1]]
print("상권 안 비율:", p.groupby("cat_s").apply(lambda z:(z.상권>=0).mean()).round(3).to_dict())
cnt=p[p.상권>=0].groupby(["상권","cat_s"]).size().unstack(fill_value=0).reindex(codes,fill_value=0)
c=pd.read_parquet(f"{H}/work/analysis/master/cell_panel.parquet")
q=c[(c.기준_년분기_코드.astype(str)=="20252")&(c.서비스_업종_코드=="CS200031")]
cols=[k for k in q.columns if "점포" in k]; print("점포 열:", cols)
sv=q.groupby("상권_코드")[cols].sum(); sv.index=sv.index.astype("int64")
z=pd.concat([sv,cnt],axis=1).fillna(0); z=z[(z.유사_업종_점포_수>0)|(z.S20901>0)|(z.S20902>0)]
print(f"\n상권 {len(z)}곳 · 서울 세탁소 점포 {z.유사_업종_점포_수.sum():.0f} · 상가정보 세탁소 {z.S20901.sum():.0f} · 셀프빨래방 {z.S20902.sum():.0f}")
for k in ["S20901","S20902"]:
    print(f"  순위상관 서울 vs {k}: {spearmanr(z.유사_업종_점포_수,z[k]).correlation:.3f}")
print(f"  순위상관 서울 vs 둘 합: {spearmanr(z.유사_업종_점포_수,z.S20901+z.S20902).correlation:.3f}")
r=sm.OLS(z.유사_업종_점포_수,sm.add_constant(z[["S20901","S20902"]])).fit(cov_type="HC1")
print("  서울 점포 = a + b1·세탁소 + b2·셀프빨래방 →", r.params.round(3).to_dict(), " SE", r.bse.round(3).to_dict())
# 셀프빨래방만 있고 세탁소는 없는 상권 — 서울 세탁소 점포 수는?
only=z[(z.S20902>0)&(z.S20901==0)]
print(f"  셀프빨래방만 있는 상권 {len(only)}곳: 서울 세탁소 점포 0인 곳 {(only.유사_업종_점포_수==0).sum()} · 평균 서울 점포 {only.유사_업종_점포_수.mean():.2f} · 평균 셀프 {only.S20902.mean():.2f}")
z.to_csv(f"{H}/work/diag25/laundry_trdar_counts.csv")

# ── 학습 자료(403 상권)에서 셀프빨래방 비중별 기울기
s=pd.read_parquet(f"{H}/work/snapshots/sales_potential_cells_v2.parquet")
F=["a_거주","a_출근등교","a_기타","l_all300"]
d=s[s.svc=="CS200031"].copy(); d=d.merge(cnt,left_on="상권",right_index=True,how="left").fillna({"S20901":0,"S20902":0})
d["share"]=d.S20902/(d.S20901+d.S20902).replace(0,np.nan); d["kind"]=d.상권.map(kind)
print(f"\n학습 상권 {len(d)} · 셀프빨래방 있는 곳 {(d.S20902>0).sum()} · 비중 평균 {d.share.mean():.3f}")
print("상권 구분:", d.kind.value_counts().to_dict())
Xc=d[F]-d[F].mean()
r1=sm.OLS(d.y,sm.add_constant(Xc)).fit(cov_type="HC1")
print("세탁소만 OLS(수축 전):", r1.params.round(2).to_dict(), "\n   SE", r1.bse.round(2).to_dict(), " R2", round(r1.rsquared,3))
# 모든 업종 공통 기울기 (업종 안 편차)
mu=s.groupby("svc")[F+["y"]].transform("mean"); Z=s[F+["y"]]-mu
bp=np.linalg.lstsq(Z[F].values,Z.y.values,rcond=None)[0]; print("37개 업종 공통 기울기:", dict(zip(F,bp.round(2))))
for lab,mm in [("셀프 없음",d.S20902==0),("셀프 있음",d.S20902>0),("셀프 비중≥1/3",d.share>=1/3)]:
    dd=d[mm]; 
    if len(dd)<15: print(lab,len(dd),"적음"); continue
    rr=sm.OLS(dd.y,sm.add_constant(dd[F]-dd[F].mean())).fit(cov_type="HC1")
    print(f"  {lab:12s} n={len(dd):3d}  거주 {rr.params['a_거주']:+.2f}(±{rr.bse['a_거주']:.2f})  출근 {rr.params['a_출근등교']:+.2f}(±{rr.bse['a_출근등교']:.2f})  기타 {rr.params['a_기타']:+.2f}  가게 {rr.params['l_all300']:+.2f}(±{rr.bse['l_all300']:.2f}) · y~거주 순위상관 {spearmanr(dd.y,dd.a_거주).correlation:+.2f}")
d["sh0"]=d.share.fillna(0)
Xi=pd.concat([Xc,d.sh0.rename("share"),(d.sh0*Xc.a_거주).rename("share×거주"),(d.sh0*Xc.a_출근등교).rename("share×출근")],axis=1)
r2=sm.OLS(d.y,sm.add_constant(Xi)).fit(cov_type="HC1")
print("상호작용:", r2.params.round(2).to_dict(), "\n   SE", r2.bse.round(2).to_dict())
print("가게당 매출(y) ~ 셀프 비중 순위상관:", round(spearmanr(d.y,d.sh0).correlation,3), "· 셀프 있음/없음 y 평균", round(d[d.S20902>0].y.mean(),3), round(d[d.S20902==0].y.mean(),3))
d.to_csv(f"{H}/work/diag25/laundry_train.csv",index=False)
