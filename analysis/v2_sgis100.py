# -*- coding: utf-8 -*-
"""SGIS 100m 격자 검토 — 코드→좌표 검증, 서울 커버리지, 행정동 합계 검산, 노이즈 패턴.
격자코드(예: 다사000395)만으로 셀 위치가 정해진다 — 112MB 경계 SHP 없이 조인 가능:
  x0 = (7 + '가나다라마바사아'.index(1번째 글자)) * 100000 + 앞 3자리 * 100     (EPSG:5179, 셀 좌하단)
  y0 = (13 + '가나다라마바사아'.index(2번째 글자)) * 100000 + 뒤 3자리 * 100
경계 SHP와 대조해 표본 21개 전부 일치 확인 (2026-10-01)."""
import pandas as pd, numpy as np, shapefile, glob, warnings, os
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
warnings.filterwarnings("ignore")
G=os.environ.get("SGIS100_DIR","../격자통계/")          # SGIS 포털에서 받은 100m 격자통계 CSV 폴더
cols=["기준연도","격자코드","통계항목","통계값"]
pop=pd.read_csv(os.path.join(G,"2024년_인구_다사_100M.csv"),encoding="cp949",header=None,names=cols)
hh =pd.read_csv(os.path.join(G,"2024년_가구_다사_100M.csv"),encoding="cp949",header=None,names=cols)
ho =pd.read_csv(os.path.join(G,"2024년_주택_다사_100M.csv"),encoding="cp949",header=None,names=cols)
w=pop.pivot_table(index="격자코드",columns="통계항목",values="통계값",aggfunc="first").rename(
   columns={"to_in_001":"인구","to_in_007":"남","to_in_008":"여"})
w=w.join(hh.set_index("격자코드").통계값.rename("가구"),how="outer").join(ho.set_index("격자코드").통계값.rename("주택"),how="outer")
L="가나다라마바사아"
c=w.index.to_series()
w["x0"]=(7+c.str[0].map(L.index))*100000+c.str[2:5].astype(int)*100     # EPSG:5179 좌하단
w["y0"]=(13+c.str[1].map(L.index))*100000+c.str[5:8].astype(int)*100
# 서울 행정동 폴리곤(5181)에 셀 중심점 공간조인
sf=shapefile.Reader(glob.glob("raw/*영역-행정동*/*.shp")[0][:-4],encoding="utf-8")
F=[f[0] for f in sf.fields[1:]]; R=pd.DataFrame(sf.records(),columns=F)
polys=[shape(s.__geo_interface__) for s in sf.shapes()]; tree=STRtree(polys)
tf=Transformer.from_crs(5179,5181,always_xy=True)
px,py=tf.transform((w.x0+50).values,(w.y0+50).values)
hit=tree.query([Point(a,b) for a,b in zip(px,py)],predicate="within")
dcol=[f for f in F if f.upper().startswith("ADSTRD_CD") and not f.endswith("_")][0]
w["행정동코드"]=pd.NA; w.iloc[hit[0],w.columns.get_loc("행정동코드")]=R[dcol].values[hit[1]]
s=w[w.행정동코드.notna()].copy()
print(f"다사 도엽 셀 {len(w):,}개 중 서울 안: {len(s):,}개 (서울 605㎢ ≈ 100m 셀 60,500개)")
for k in ["인구","가구","주택"]:
    v=s[k].dropna(); print(f"  {k}: 값 있는 셀 {len(v):,}  합계 {v.sum():,.0f}  0인 셀 {(v==0).mean():.0%}  값이 정확히 5인 셀 {(v==5).mean():.0%}")
print(f"  남+여 = 인구 일치율: {((s.남+s.여)==s.인구).mean():.1%}")
vc=s.인구.value_counts().sort_index().head(12); print("  인구 작은 값 분포:", dict(vc))
# 행정동 합계 검산: 상권분석 상주인구-행정동 최신 분기
U=os.environ.get("SANGGWON_DIR","../서울시 상권분석 서비스")
sj=pd.read_csv(os.path.join(U,"서울시 상권분석서비스(상주인구-행정동).csv"),encoding="cp949")
sj.columns=[x.strip('"') for x in sj.columns]
sj=sj[sj.기준_년분기_코드==sj.기준_년분기_코드.max()][["행정동_코드","총_상주인구_수"]]
agg=s.groupby("행정동코드").인구.sum().rename("SGIS100m").reset_index()
agg["행정동코드"]=agg.행정동코드.astype(str); sj["행정동코드"]=sj.행정동_코드.astype(str)
m=agg.merge(sj,on="행정동코드")
from scipy.stats import pearsonr, spearmanr
print(f"\n행정동 {len(m)}개 — SGIS 100m 합 vs 상권분석 상주인구:  피어슨 {pearsonr(m.SGIS100m,m.총_상주인구_수)[0]:.3f}  스피어만 {spearmanr(m.SGIS100m,m.총_상주인구_수)[0]:.3f}")
print(f"  서울 합계: SGIS {m.SGIS100m.sum():,.0f}  /  상권분석 상주인구 {m.총_상주인구_수.sum():,.0f}  (비 {m.SGIS100m.sum()/m.총_상주인구_수.sum():.3f})")
s.reset_index().to_parquet("master/sgis100_seoul.parquet",index=False)
