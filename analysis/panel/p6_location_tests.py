# -*- coding: utf-8 -*-
"""입지 가설 검정 — 신규점의 생존이 '주변 포화'와 관련 있나, 새 가게는 덜 포화된 곳을 고르나.
변수(진입 분기 기준)
  comp300/500 : 같은 업종(소분류) 점포 수, 반경 300m/500m (자기 제외)
  all300      : 업종 무관 전체 점포 수, 300m (집적)
  res500      : 거주인구, 500m (SGIS 100m 격자 2024)
  arr         : 행정동 출근+등교 도착 밀도 (생활이동 2주, /㎢)
  포화도 지수  : log(1+comp500) − log(res500 + arr500)   ← 수요 1인당 같은 업종 점포
모형: 층화 Cox (업종별 기저위험), 진입 분기 고정효과"""
import pandas as pd, numpy as np, sys, warnings, os
from scipy.spatial import cKDTree
from pyproj import Transformer
from statsmodels.duration.hazard_regression import PHReg
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
warnings.filterwarnings("ignore")
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))   # 상권 실험실 산출물 (analysis/master)
C=pd.read_parquet(f"{S}/cohort_2025.parquet")
C=C[C.cat_s!="G21202"].reset_index(drop=True)          # 주방/가정용품 소매업: 한 분기 일괄 등록·삭제 이상 업종
xy=lambda lon,lat: np.c_[np.asarray(lon)*88200, np.asarray(lat)*111000]
Q=sorted(C.entry.unique())
L=pd.read_parquet(f"{S}/lineage_long.parquet",columns=["quarter","cat_s","lon","lat","name_norm","lineage"],
                  filters=[("quarter","in",Q)])
C["comp300"]=0; C["comp500"]=0; C["all300"]=0; C["chain"]=0
for q in Q:
    snap=L[L.quarter==q]; idx=C.index[C.entry==q]
    P=xy(C.loc[idx,"lon"],C.loc[idx,"lat"])
    ta=cKDTree(xy(snap.lon,snap.lat)); C.loc[idx,"all300"]=np.array([len(h) for h in ta.query_ball_point(P,300)])-1
    freq=snap.groupby(["cat_s","name_norm"]).size()
    for cat,ii in C.loc[idx].groupby("cat_s").groups.items():
        s=snap[snap.cat_s==cat]; t=cKDTree(xy(s.lon,s.lat)); Pc=xy(C.loc[ii,"lon"],C.loc[ii,"lat"])
        C.loc[ii,"comp300"]=np.array([len(h) for h in t.query_ball_point(Pc,300)])-1
        C.loc[ii,"comp500"]=np.array([len(h) for h in t.query_ball_point(Pc,500)])-1
        C.loc[ii,"chain"]=(C.loc[ii].apply(lambda r: freq.get((cat,r.name_norm),0),axis=1)>=10).astype(int).values
# 거주인구 500m
g=pd.read_parquet(f"{M}/sgis100_seoul.parquet")
lon,lat=Transformer.from_crs(5179,4326,always_xy=True).transform((g.x0+50).values,(g.y0+50).values)
tg=cKDTree(xy(lon,lat)); pop=g.인구.fillna(0).values
C["res500"]=[pop[h].sum() for h in tg.query_ball_point(xy(C.lon,C.lat),500)]
# 출근·등교 도착 밀도
D=pd.read_parquet(f"{M}/dong_demand.parquet"); D.index=D.index.astype(str)
den=((D.출근+D.등교)/(D.면적_m2/1e6)/14)              # 하루 평균, /㎢
C["arr"]=C.adm_cd.astype(str).map(den)
C["arr500"]=C.arr*np.pi*0.25
C=C.dropna(subset=["arr"]).copy()
LL=pd.read_parquet(f"{S}/lineage_long.parquet",columns=["lineage","floor"],filters=[("lineage","in",list(C.lineage))])
LL=LL[LL.floor.astype(str).str.strip()!=""]
fill=LL.groupby("lineage").floor.agg(lambda s:s.astype(str).str.strip().mode().iat[0])
C["floor"]=np.where(C.floor.astype(str).str.strip()=="",C.lineage.map(fill).fillna(""),C.floor)
fl=C.floor.astype(str).str.strip()
C["floor1"]=(fl=="1").astype(int); C["floor_up"]=fl.str.fullmatch(r"[2-9]|\d\d").astype(int)
C["floor_b"]=fl.str.contains("지|B",regex=True).astype(int)
for c in ["comp300","comp500","all300","res500","arr"]: C["l_"+c]=np.log1p(C[c].clip(lower=0))
C["sat"]=np.log1p(C.comp500)-np.log(C.res500+C.arr500+1)
C["e_Q2"]=(C.entry=="2025Q2").astype(int)
C["sat_q"]=C.groupby("cat_s").sat.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False) if len(s)>=25 else np.nan)
C.to_parquet(f"{S}/cohort_features.parquet",index=False)
print(f"분석 신규점 {len(C):,}곳 · 폐업 {int(C.event.sum()):,} · 업종 {C.cat_s.nunique()}")
print("변수 요약(중앙값): 같은업종300m", C.comp300.median(), "· 500m", C.comp500.median(), "· 전체점포300m", C.all300.median(),
      "· 거주500m", int(C.res500.median()), "· 체인 비중", f"{C.chain.mean():.0%}", "· 1층", f"{C.floor1.mean():.0%}")

def cox(df,f,label):
    m=PHReg.from_formula(f"dur ~ {f}",data=df,status=df.event.values,strata=df.cat_s.values,ties="efron").fit()
    nm=m.model.exog_names; ci=np.asarray(m.conf_int())
    t=pd.DataFrame({"위험비":np.exp(np.asarray(m.params)),"하한":np.exp(ci[:,0]),"상한":np.exp(ci[:,1]),"p":np.asarray(m.pvalues)},index=nm)
    keep=[k for k in t.index if not k.startswith("e_")]
    print(f"\n━━ {label}  (n={len(df):,}, 폐업 {int(df.event.sum()):,}) — 위험비 >1 이면 더 빨리 닫음")
    print(t.loc[keep].round(3).to_string()); return m
C["floor_na"]=(fl=="").astype(int)
base="l_comp500 + l_all300 + l_res500 + l_arr + floor1 + floor_b + floor_na + chain + e_Q2"   # 기준 = 2층 이상
cox(C,base,"① 기본 — 같은 업종 500m")
cox(C,base.replace("l_comp500","l_comp300"),"② 같은 업종 300m")
cox(C,"sat + l_all300 + floor1 + floor_b + floor_na + chain + e_Q2","③ 포화도 지수 하나로")

# 포화도 5분위별 12개월 생존 (업종 안에서 나눈 분위를 합침)
sys.path.insert(0,HERE); from p5_survival import km
print("\n④ 포화도 5분위별 12개월 생존율 (각 업종 안에서 5등분한 뒤 합침)")
for q,g in C.dropna(subset=["sat_q"]).groupby("sat_q"):
    r=km(g.dur,g.event); print(f"   {int(q)+1}분위 {'(가장 덜 포화)' if q==0 else '(가장 포화)' if q==4 else '':<10} n={len(g):>6,}  6개월 {r[6][0]:.1%}  12개월 {r[12][0]:.1%}±{1.96*r[12][1]:.1%}")
print("\n⑤ 대분류별 같은 업종 경쟁(500m) 효과")
G={"G":"소매","I":"숙박·음식","S":"수리·개인","R":"예술·스포츠","M":"과학·기술","N":"시설관리·임대","P":"교육","Q":"보건","L":"부동산"}
for k,g in C.groupby(C.cat_s.str[0]):
    if g.event.sum()<150: continue
    m=PHReg.from_formula(f"dur ~ {base}",data=g,status=g.event.values,strata=g.cat_s.values,ties="efron").fit()
    i=m.model.exog_names.index("l_comp500"); ci=np.asarray(m.conf_int())[i]; b=np.asarray(m.params)[i]
    print(f"   {G.get(k,k):<8} n={len(g):>6,} 폐업 {int(g.event.sum()):>5,}  위험비 {np.exp(b):.3f} ({np.exp(ci[0]):.3f}~{np.exp(ci[1]):.3f})")
