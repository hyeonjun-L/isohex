# -*- coding: utf-8 -*-
"""크로스워크 검증 — 상권 실험실(100업종)의 결론이 목표 업종(247업종 코드)에도 성립하나?
세탁소(100) ⊃ 셀프빨래방 S20902 + 일반세탁소 S20901 → 둘을 갈라서 다시 본다.
그리고 목표 업종 점포가 '상권 경계 안'에 얼마나 있는지 — 실험실이 볼 수 있는 범위를 잰다."""
import pandas as pd, numpy as np, shapefile, warnings, statsmodels.formula.api as smf
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
warnings.filterwarnings("ignore")

import glob
sf=shapefile.Reader(glob.glob("raw/**/*영역-상권).shp",recursive=True)[0][:-4],encoding="utf-8")
codes=[int(r["TRDAR_CD"]) for r in sf.records()]
polys=[shape(s.__geo_interface__) for s in sf.shapes()]
tree=STRtree(polys)

import os
POI=os.environ.get("POI_PARQUET","../data/snapshots/poi_2026Q2.parquet")   # ingest_sangga.py 산출물
poi=pd.read_parquet(POI)
T=["S20902","S20901","R10202","I21201"]
p=poi[poi.cat_s.isin(T)].copy()
tf=Transformer.from_crs(4326,5181,always_xy=True)   # SHP prj: False_Northing 500000 → EPSG:5181 (5186 아님)
x,y=tf.transform(p.lon.values,p.lat.values)
pts=[Point(a,b) for a,b in zip(x,y)]
hit=tree.query(pts,predicate="within")          # (point_idx, poly_idx)
idx=pd.Series(-1,index=range(len(p)))
idx.iloc[hit[0]]=hit[1]
p["상권_코드"]=[codes[i] if i>=0 else pd.NA for i in idx]

NM={"S20902":"셀프빨래방","S20901":"일반세탁소","R10202":"스터디카페","I21201":"카페"}
print("① 목표 업종 점포 중 상권 경계 안에 있는 비율 (2026Q2)")
for c in T:
    s=p[p.cat_s==c]; inside=s.상권_코드.notna().mean()
    print(f"   {NM[c]:<7} {len(s):>6,}개 중 {inside:>5.1%} 가 상권 안")
print("   (상권은 서울 면적의 약 27%)")

a=pd.read_parquet("master/agg_v2.parquet")
cnt=(p.dropna(subset=["상권_코드"]).groupby(["상권_코드","cat_s"]).size()
       .unstack(fill_value=0).reindex(columns=T,fill_value=0).reset_index())
cnt["상권_코드"]=cnt.상권_코드.astype(int)
a["상권_코드"]=a.상권_코드.astype(int)
d=a.merge(cnt,on="상권_코드",how="left").fillna({c:0 for c in T})
RHS="l_면적_m2 + l_유동인구 + l_상주인구 + l_직장인구 + l_집객시설 + 역세권 + C(상권구분) + C(자치구)"
print("\n② 상권별 점포수(log1p) ~ 입지 변수 — 행정동 클러스터 SE.  * p<0.01")
print(f"   {'업종':<7}{'상권수':>6}{'R²':>6}{'유동인구':>10}{'상주인구':>10}{'직장인구':>10}{'집객시설':>10}{'역세권':>9}")
for c in T:
    d["y"]=np.log1p(d[c])
    z=d.dropna(subset=["l_유동인구","l_상주인구","l_직장인구","l_집객시설"])
    r=smf.ols(f"y ~ {RHS}",data=z).fit(cov_type="cluster",cov_kwds={"groups":z.행정동코드.astype(str)})
    f=lambda v:f"{r.params[v]:+.2f}{'*' if r.pvalues[v]<0.01 else ' '}"
    print(f"   {NM[c]:<7}{(z[c]>0).sum():>6,}{r.rsquared:>6.2f}{f('l_유동인구'):>10}{f('l_상주인구'):>10}"
          f"{f('l_직장인구'):>10}{f('l_집객시설'):>10}{f('역세권'):>9}")
p[["fp","cat_s","상권_코드"]].to_parquet("master/poi_target_in_trdar.parquet",index=False)
