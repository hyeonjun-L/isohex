# -*- coding: utf-8 -*-
"""포화도(Huff 1점포 몫)를 매출 축으로 옮겨도 되나 — 상권 점포당 매출과 대조.
상권분석 서비스(100업종)와 상가정보(247업종)가 1:1로 맞는 업종 20개만 쓴다(한식·일식처럼 여러 코드가 섞이는 업종은 제외).
  상권×업종마다: 상가 2025Q2 점포를 상권 폴리곤(EPSG:5181)에 공간조인 → 점포별 Huff 몫(p12)의 평균
  매출: 2025년 4개 분기 합 ÷ 전체 점포(유사_업종_점포_수) 합 = 분기당 점포당 매출
검정: 업종 고정효과 회귀, 행정동 군집 표준오차. 몫 = N^(α-1)·T 이므로 점포 수 N과 수요장 T를 갈라서도 본다."""
import pandas as pd, numpy as np, sys, warnings, shapefile, os
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
import statsmodels.api as sm
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
warnings.filterwarnings("ignore")
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master")); ALPHA=0.41
XW={"CS100010":["I21201"],"CS300002":["G20405"],"CS300001":["G20404"],"CS200028":["S20701"],"CS200030":["S20702"],
    "CS200029":["S20703"],"CS100007":["I21006"],"CS100005":["I21001"],"CS100002":["I20201"],"CS100008":["I21007"],
    "CS300018":["G21501"],"CS300022":["G21503"],"CS200037":["R10407"],"CS200031":["S20901","S20902"],"CS300004":["G20802"],
    "CS200019":["R10406"],"CS200016":["R10310"],"CS300028":["G21901"],"CS300016":["G21602"],"CS300009":["G20506"]}
inv={c:k for k,v in XW.items() for c in v}
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))   # build_master.py가 푼 영역-상권 SHP
sf=shapefile.Reader(SHP,encoding="utf-8")
codes=np.array([int(r["TRDAR_CD"]) for r in sf.records()]); adm=np.array([str(r["ADSTRD_CD"]) for r in sf.records()])
tree=STRtree([shape(s.__geo_interface__) for s in sf.shapes()])
p=pd.read_parquet(f"{S}/poi_2025Q2.parquet",columns=["cat_s","h3_9","lon","lat"]); p=p[p.cat_s.isin(inv)].reset_index(drop=True)
x,y=Transformer.from_crs(4326,5181,always_xy=True).transform(p.lon.values,p.lat.values)
hit=tree.query([Point(a,b) for a,b in zip(x,y)],predicate="within")
p["상권"]=-1; p.loc[hit[0],"상권"]=codes[hit[1]]; p=p[p.상권>=0].copy()
H=pd.read_parquet(f"{S}/huff_share.parquet"); H=H[H.q=="2025Q2"]
p=p.merge(H[["cat_s","h3_9","share","N"]],on=["cat_s","h3_9"],how="left")
p["T"]=p.share/p.N**(ALPHA-1); p["svc"]=p.cat_s.map(inv)
g=p.groupby(["상권","svc"]).agg(n_sg=("share","size"),l_share=("share",lambda s:np.log(s).mean()),l_T=("T",lambda s:np.log(s).mean()),
                                  l_Ncell=("N",lambda s:np.log(s).mean())).reset_index()
c=pd.read_parquet(f"{M}/cell_panel.parquet"); c=c[c.기준_년분기_코드.astype(str).str.startswith("2025")&c.서비스_업종_코드.isin(XW)]
s=c.groupby(["상권_코드","서비스_업종_코드","서비스_업종_코드_명"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),
                                                     공개분기=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
s=s[(s.공개분기==4)&(s.점포>0)]; s["l_ps"]=np.log(s.매출/s.점포); s["l_tot"]=np.log(s.매출/4)
d=g.merge(s,left_on=["상권","svc"],right_on=["상권_코드","서비스_업종_코드"])
d["adm"]=pd.Series(adm,index=codes).reindex(d.상권.values).values
print(f"상권×업종 {len(d):,}칸 (업종 {d.svc.nunique()}개, 매출 4분기 모두 공개된 칸만)")
def fe(cols,y="l_ps",label=""):
    Z=d[cols+[y]].astype(float); Z=Z-Z.groupby(d.svc).transform("mean")
    r=sm.OLS(Z[y],Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.adm)[0]})
    print(f"  {label:<34}"+"  ".join(f"{v} {r.params[v]:+.2f} (±{1.96*r.bse[v]:.2f})" for v in cols)+f"   업종 안 R² {r.rsquared:.3f}")
print("\n① 점포당 매출(log) ~ Huff 1점포 몫(log) — 계수 = 탄력성, 업종 고정효과")
fe(["l_share"],label="1점포 몫 하나로")
fe(["l_T","l_Ncell"],label="수요장 T와 셀 점포수 N으로 분해")
print("\n② 업종 안 순위상관 (스피어만) — 업종별")
r=d.groupby("서비스_업종_코드_명").apply(lambda z: pd.Series({"칸":len(z),"ρ":z[["l_share","l_ps"]].corr(method="spearman").iat[0,1]})).sort_values("ρ")
print("   "+" · ".join(f"{k} {v.ρ:+.2f}({int(v.칸)})" for k,v in r.iterrows()))
print(f"   중앙값 {r.ρ.median():+.2f} · 양수 업종 {int((r.ρ>0).sum())}/{len(r)}")
print("\n③ (참고) 업종 총매출(log) ~ Huff 포획수요 총량(log) — 매출 축의 원래 정의 S(c,k)")
d["l_S"]=np.log(np.exp(d.l_share)*d.n_sg)
fe(["l_S"],y="l_tot",label="포획수요 총량")
