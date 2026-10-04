# -*- coding: utf-8 -*-
"""관찰 기간을 늘려도 같은가 — 2024년 신규 등록 코호트로 18~24개월 폐업을 본다.
  2024Q2 코호트: 2024-06 등록(접수 재개 첫 달) 7천여 곳 → 2026Q2까지 24개월
  2024Q4 코호트: 2024-09~11 등록 6만여 곳(밀린 등록 일괄 반영분이라 실제 개업은 더 이른 가게가 섞임) → 18개월
변수는 진입 분기 스냅샷 기준(p10과 같은 정의). 모형: 업종 안 5분위 폐업률, 업종 고정효과 선형확률모형."""
import pandas as pd, numpy as np, sys, warnings, os
from scipy.spatial import cKDTree
from scipy.signal import fftconvolve
from pyproj import Transformer
import statsmodels.api as sm
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
warnings.filterwarnings("ignore")
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))   # 상권 실험실 산출물 (analysis/master)
sys.path.insert(0,HERE); from p5_survival import km
LS=pd.read_csv(f"{S}/label_landscape.csv"); X_CAT=set(LS.cat_s[LS.등급.str.startswith("X")])|{"G21202"}
A=pd.read_parquet(f"{S}/lineage_enriched.parquet",
    columns=["lineage","entry","lag","suspect","last","cat_s","cat_s_nm","adm_cd","floor","lon","lat"]+
            ["2024Q2","2024Q3","2024Q4","2025Q1","2025Q2","2025Q3","2025Q4","2026Q1","2026Q2"])
g=pd.read_parquet(f"{M}/sgis100_seoul.parquet"); x0,y0=g.x0.min(),g.y0.min()
nx=int((g.x0.max()-x0)//100)+1; ny=int((g.y0.max()-y0)//100)+1
R=np.zeros((ny,nx)); R[((g.y0-y0)//100).astype(int),((g.x0-x0)//100).astype(int)]=g.인구.fillna(0).values
yy,xx=np.mgrid[-5:6,-5:6]; R5=np.maximum(fftconvolve(R,((xx**2+yy**2)<=25).astype(float),mode="same"),0)
T5179=Transformer.from_crs(4326,5179,always_xy=True)
D=pd.read_parquet(f"{M}/dong_demand.parquet"); D.index=D.index.astype(str); den=(D.출근+D.등교)/(D.면적_m2/1e6)/14
xy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
FM={"2024Q2":"202406","2024Q3":"202409","2024Q4":"202412","2025Q1":"202503","2025Q2":"202506","2025Q3":"202510","2025Q4":"202512","2026Q1":"202603","2026Q2":"202606"}
mi=lambda m:int(m[:4])*12+int(m[4:])-1
def features(P,q):
    snap=pd.read_parquet(f"{S}/poi_{q}.parquet",columns=["cat_s","lon","lat"]); Pxy=xy(P)
    P["all300"]=cKDTree(xy(snap)).query_ball_point(Pxy,300,return_length=True)
    P["comp500"]=0
    for cat,ii in P.groupby("cat_s").groups.items():
        s=snap[snap.cat_s==cat]
        if len(s): P.loc[ii,"comp500"]=cKDTree(xy(s)).query_ball_point(Pxy[ii],500,return_length=True)
    P["comp500"]=(P.comp500-1).clip(lower=0); P["all300"]=(P.all300-1).clip(lower=0)   # 자기 자신 제외
    gx,gy=T5179.transform(P.lon.values,P.lat.values); i=((gy-y0)//100).astype(int); j=((gx-x0)//100).astype(int)
    ok=(i>=0)&(i<ny)&(j>=0)&(j<nx); P["res500"]=0.0; P.loc[ok,"res500"]=R5[i[ok],j[ok]]
    P["arr"]=P.adm_cd.astype(str).map(den); P=P.dropna(subset=["arr"]).copy()
    fl=P.floor.astype(str).str.strip(); P["floor1"]=(fl=="1").astype(int); P["floor_na"]=(fl=="").astype(int)
    for c in ["comp500","all300","res500","arr"]: P["l_"+c]=np.log1p(P[c])
    P["sat"]=np.log1p(P.comp500)-np.log(P.res500+P.arr*np.pi*0.25+1)
    return P
def fe(P,cols):
    Z=P[cols+["y"]].astype(float); Z=Z-Z.groupby(P.cat_s).transform("mean")
    m=sm.OLS(Z.y,Z[cols]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(P.adm_cd)[0]})
    return pd.DataFrame({"%p":m.params*100,"95%하":(m.params-1.96*m.bse)*100,"95%상":(m.params+1.96*m.bse)*100,"p":m.pvalues}).round(3)
QS=list(FM)
for q,months in [("2024Q2",24),("2024Q4",18)]:
    P=A[(A.entry==q)&(A.lag<=3)&~A.suspect&~A.cat_s.isin(X_CAT)].reset_index(drop=True)
    P["y"]=(P["2026Q2"]==0).astype(int)
    # 생존곡선(월): 마지막으로 보인 분기와 다음 분기의 중간에 닫혔다고 본다
    t0=mi(FM[q]); nxt={QS[k]:QS[k+1] for k in range(len(QS)-1)}
    ev=P["last"].isin(nxt).astype(int)
    dur=np.where(ev==1,P["last"].map(lambda l:(mi(FM[l])+mi(FM[nxt[l]]))/2 if l in nxt else np.nan)-t0, mi("202606")-t0)
    o=km(dur,ev,ts=(6,12,18,24))
    P=features(P,q)
    print(f"\n■ {q} 코호트 {len(P):,}곳 · {months}개월 뒤 사라짐 {P.y.mean():.1%} · 업종 {P.cat_s.nunique()}")
    print("  생존율:", "  ".join(f"{T}개월 {v[0]:.1%}" for T,v in o.items() if T<=months))
    P["sat_q"]=P.groupby("cat_s").sat.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=25 else np.nan)
    P["comp_q"]=P.groupby("cat_s").comp500.transform(lambda s: pd.qcut(s.rank(method="first"),5,labels=False)+1 if len(s)>=25 else np.nan)
    t=pd.DataFrame({"포화 5분위":P.groupby("sat_q").y.mean(),"같은업종수 5분위":P.groupby("comp_q").y.mean()})
    print("  업종 안 5분위별 폐업률(1=가장 덜 포화):", " / ".join(f"{v:.1%}" for v in t["포화 5분위"]),
          "  | 같은업종수:", " / ".join(f"{v:.1%}" for v in t["같은업종수 5분위"]))
    print("  업종 고정효과 선형확률모형(%p, 행정동 군집 표준오차)")
    print(fe(P,["l_comp500","l_all300","l_res500","l_arr","floor1","floor_na"]).to_string())
    print(fe(P,["sat","l_all300","floor1","floor_na"]).loc[["sat"]].to_string(header=False))
