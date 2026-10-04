# -*- coding: utf-8 -*-
"""기존 점포에서도 포화도가 폐업을 못 가르나 — 신규점 결과(p6)가 '1년·신규점'이라서 생긴 것인지 확인.
모집단: 2024Q4와 2025Q2 모두 영업 중인 점포(ID 2025-05 이전 등록), 이상 업종(X등급) 제외.
결과: 2026Q2(12개월 뒤) 스냅샷에서 사라졌나.
변수: 2025Q2 스냅샷 기준 — 같은 업종(소분류) 300·500m, 같은 중분류의 다른 업종 500m(대체재), 전체 점포 300m,
      거주 500m(SGIS 100m 격자 → 원형 합산), 출근·등교 도착 밀도, 포화 지수.
모형: ① 업종 안 5분위 폐업률  ② 업종 고정효과 선형확률모형(행정동 군집 표준오차)  ③ 자치구 단위 교차검증 AUC"""
import pandas as pd, numpy as np, sys, warnings, os
from scipy.spatial import cKDTree
from scipy.signal import fftconvolve
from pyproj import Transformer
import statsmodels.api as sm
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
warnings.filterwarnings("ignore")
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))   # 상권 실험실 산출물 (analysis/master)
LS=pd.read_csv(f"{S}/label_landscape.csv"); X_CAT=set(LS.cat_s[LS.등급.str.startswith("X")])|{"G21202"}
DAE=dict(zip(LS.cat_s,LS.대분류))
A=pd.read_parquet(f"{S}/lineage_enriched.parquet",
    columns=["lineage","cat_s","cat_s_nm","adm_cd","floor","lon","lat","2024Q1","2024Q4","2025Q2","2026Q2","suspect","last"])
P=A[(A["2024Q4"]==1)&(A["2025Q2"]==1)&~A.suspect&~A.cat_s.isin(X_CAT)].reset_index(drop=True)   # 분기 열은 0/1 정수
P["y"]=(P["2026Q2"]==0).astype(int)                    # 12개월 뒤 없음
P["old"]=(P["2024Q1"]==1).astype(int)                       # 2024Q1부터 있던 점포(나이 대용)
snap=pd.read_parquet(f"{S}/poi_2025Q2.parquet",columns=["cat_s","lon","lat"])
xy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
Pxy=xy(P)
P["all300"]=cKDTree(xy(snap)).query_ball_point(Pxy,300,return_length=True)-1
P["comp300"]=0; P["comp500"]=0; P["mid500"]=0
snap["mid"]=snap.cat_s.str[:4]; P["mid"]=P.cat_s.str[:4]
for cat,ii in P.groupby("cat_s").groups.items():
    t=cKDTree(xy(snap[snap.cat_s==cat])); pts=Pxy[ii]
    P.loc[ii,"comp300"]=t.query_ball_point(pts,300,return_length=True)-1
    P.loc[ii,"comp500"]=t.query_ball_point(pts,500,return_length=True)-1
for mid,ii in P.groupby("mid").groups.items():
    s=snap[snap.mid==mid]
    if len(s)==0: continue
    P.loc[ii,"mid500"]=cKDTree(xy(s)).query_ball_point(Pxy[ii],500,return_length=True)-1-P.loc[ii,"comp500"]-0  # 같은 중분류의 '다른' 업종
P[["comp300","comp500","mid500","all300"]]=P[["comp300","comp500","mid500","all300"]].clip(lower=0)
# 거주 500m: 100m 격자 래스터를 반경 500m 원형 커널로 합산
g=pd.read_parquet(f"{M}/sgis100_seoul.parquet"); x0,y0=g.x0.min(),g.y0.min()
nx=int((g.x0.max()-x0)//100)+1; ny=int((g.y0.max()-y0)//100)+1
R=np.zeros((ny,nx)); R[((g.y0-y0)//100).astype(int),((g.x0-x0)//100).astype(int)]=g.인구.fillna(0).values
yy,xx=np.mgrid[-5:6,-5:6]; R5=np.maximum(fftconvolve(R,((xx**2+yy**2)<=25).astype(float),mode="same"),0)
gx,gy=Transformer.from_crs(4326,5179,always_xy=True).transform(P.lon.values,P.lat.values)
i=((gy-y0)//100).astype(int); j=((gx-x0)//100).astype(int); ok=(i>=0)&(i<ny)&(j>=0)&(j<nx)
P["res500"]=0.0; P.loc[ok,"res500"]=R5[i[ok],j[ok]]
D=pd.read_parquet(f"{M}/dong_demand.parquet"); D.index=D.index.astype(str)
P["arr"]=P.adm_cd.astype(str).map((D.출근+D.등교)/(D.면적_m2/1e6)/14); P=P.dropna(subset=["arr"]).reset_index(drop=True)
P["arr500"]=P.arr*np.pi*0.25
fl=P.floor.astype(str).str.strip()
P["floor1"]=(fl=="1").astype(int); P["floor_b"]=fl.str.contains("지|B",regex=True).astype(int); P["floor_na"]=(fl=="").astype(int)
for c in ["comp300","comp500","mid500","all300","res500","arr"]: P["l_"+c]=np.log1p(P[c])
P["sat"]=np.log1p(P.comp500)-np.log(P.res500+P.arr500+1)
P["대분류"]=P.cat_s.map(DAE)
print(f"기존 점포 {len(P):,}곳 · 업종 {P.cat_s.nunique()} · 12개월 안에 사라짐 {P.y.mean():.1%}")

print("\n① 업종 안에서 포화 5분위로 나눴을 때 12개월 폐업률 (1=가장 덜 포화)")
P["sat_q"]=P.groupby("cat_s").sat.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=50 else np.nan)
P["comp_q"]=P.groupby("cat_s").comp500.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=50 else np.nan)
P["dem_q"]=P.groupby("cat_s")["res500"].transform(lambda s: pd.qcut((s).rank(method="first"),5,labels=False)+1 if len(s)>=50 else np.nan)
t=pd.DataFrame({"포화 5분위":P.groupby("sat_q").y.mean(),"같은업종수 5분위":P.groupby("comp_q").y.mean(),"거주인구 5분위":P.groupby("dem_q").y.mean()})
print((t*100).round(1).to_string())

print("\n② 업종 고정효과 선형확률모형 — 변수 1(log) 늘 때 12개월 폐업 확률 변화(%p), 행정동 군집 표준오차")
def fe_ols(df,cols,label):
    d=df.dropna(subset=cols).copy()
    Z=d[cols+["y"]].astype(float); Z=Z-Z.groupby(d.cat_s).transform("mean")   # 업종 안 편차
    m=sm.OLS(Z.y,Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.adm_cd)[0]})
    out=pd.DataFrame({"%p":m.params*100,"95%하":(m.params-1.96*m.bse)*100,"95%상":(m.params+1.96*m.bse)*100,"p":m.pvalues}).round(3)
    print(f"  [{label}] n={len(d):,}"); print(out.to_string())
    return m
fe_ols(P,["l_comp500","l_mid500","l_all300","l_res500","l_arr","floor1","floor_b","floor_na","old"],"개별 변수")
fe_ols(P,["sat","l_all300","floor1","floor_b","floor_na","old"],"포화 지수 하나로")

print("\n   대분류별 — 포화 지수와 같은 업종 수의 효과(%p)")
rows=[]
for dae,d in P.groupby("대분류"):
    d=d.copy()
    for v in ["sat","l_comp500"]:
        Z=d[[v,"l_all300","floor1","floor_na","old","y"]].astype(float); Z=Z-Z.groupby(d.cat_s).transform("mean")
        m=sm.OLS(Z.y,Z.drop(columns="y")).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.adm_cd)[0]})
        rows.append(dict(대분류=dae,변수=v,n=len(d),폐업률=round(d.y.mean()*100,1),효과=round(m.params[v]*100,2),
                         하=round((m.params[v]-1.96*m.bse[v])*100,2),상=round((m.params[v]+1.96*m.bse[v])*100,2),p=round(m.pvalues[v],3)))
print(pd.DataFrame(rows).pivot(index=["대분류","n","폐업률"],columns="변수",values=["효과","p"]).to_string())

print("\n③ 12개월 안에 사라질지 — 무엇이 얼마나 맞히나 (자치구 단위 5겹 교차검증 AUC)")
P["gu"]=P.adm_cd.astype(str).str[:5]
def run(cols,use_cat):
    pred=np.zeros(len(P))
    for tr,te in GroupKFold(5).split(P,groups=P.gu):
        a=P.iloc[tr]; b=P.iloc[te]
        Xa=a[cols].values if cols else np.zeros((len(a),0)); Xb=b[cols].values if cols else np.zeros((len(b),0))
        if use_cat:
            n=a.groupby("cat_s").y.size(); r=a.groupby("cat_s").y.mean(); gl=a.y.mean(); s=(r*n+gl*20)/(n+20)
            Xa=np.c_[Xa,a.cat_s.map(s).fillna(gl)]; Xb=np.c_[Xb,b.cat_s.map(s).fillna(gl)]
        mu=Xa.mean(0); sd=Xa.std(0)+1e-9
        pred[te]=LogisticRegression(max_iter=2000).fit((Xa-mu)/sd,a.y).predict_proba((Xb-mu)/sd)[:,1]
    return roc_auc_score(P.y,pred)
loc=["l_comp300","l_comp500","l_mid500","l_all300","l_res500","l_arr","sat"]; fl_=["floor1","floor_b","floor_na"]
for lab,c,u in [("업종만",[],True),("입지만",loc,False),("층만",fl_,False),("업종+입지",loc,True),("업종+입지+층",loc+fl_,True),("업종+입지+층+점포나이",loc+fl_+["old"],True)]:
    print(f"   {lab:<14} AUC {run(c,u):.3f}")
P.drop(columns=["2024Q1","2024Q4","2025Q2","2026Q2"]).to_parquet(f"{S}/incumbent_features.parquet",index=False)
