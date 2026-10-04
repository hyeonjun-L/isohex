# -*- coding: utf-8 -*-
"""새 가게는 어디에 여나 — 기존 점포와 비교해 '덜 포화된 곳'을 고르나, '수요 많은 곳'을 고르나.
기준: 2024Q4 스냅샷의 기존 점포 분포. 비교 대상: 2025Q1·Q2 신규점(신뢰 코호트).
각 업종 안에서 신규점의 값이 기존 점포 분포의 몇 백분위인지 → 평균이 50%보다 낮으면 '덜 그런 곳'을 고른 것."""
import pandas as pd, numpy as np, sys, os
from scipy.spatial import cKDTree
from scipy.signal import fftconvolve
from pyproj import Transformer
HERE=os.path.dirname(os.path.abspath(__file__))   # isohex/analysis/panel
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))   # 상권 실험실 산출물 (analysis/master)
to5179=Transformer.from_crs(4326,5179,always_xy=True)
# 100m 거주인구 래스터 → 반경 500m 합 (원형 커널)
g=pd.read_parquet(f"{M}/sgis100_seoul.parquet")
x0,y0=g.x0.min(),g.y0.min(); nx=int((g.x0.max()-x0)//100)+1; ny=int((g.y0.max()-y0)//100)+1
R=np.zeros((ny,nx)); R[((g.y0-y0)//100).astype(int),((g.x0-x0)//100).astype(int)]=g.인구.fillna(0).values
yy,xx=np.mgrid[-5:6,-5:6]; K=((xx**2+yy**2)<=25).astype(float)
R500=fftconvolve(R,K,mode="same")
def res500(lon,lat):
    x,y=to5179.transform(np.asarray(lon),np.asarray(lat))
    i=((y-y0)//100).astype(int); j=((x-x0)//100).astype(int)
    ok=(i>=0)&(i<ny)&(j>=0)&(j<nx); out=np.zeros(len(i)); out[ok]=np.maximum(R500[i[ok],j[ok]],0); return out
D=pd.read_parquet(f"{M}/dong_demand.parquet"); D.index=D.index.astype(str)
den=((D.출근+D.등교)/(D.면적_m2/1e6)/14)
xy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
def feats(df,ref):
    """df 점포마다: ref(같은 시점 전체 스냅샷) 기준 같은 업종 500m 수, 거주 500m, 도착 밀도, 포화 지수"""
    df=df.copy(); df["comp500"]=0
    for cat,ii in df.groupby("cat_s").groups.items():
        r=ref[ref.cat_s==cat]
        if len(r)==0: continue
        df.loc[ii,"comp500"]=np.array([len(h) for h in cKDTree(xy(r)).query_ball_point(xy(df.loc[ii]),500)])
    df["res500"]=res500(df.lon,df.lat); df["arr"]=df.adm_cd.astype(str).map(den)
    df["dem"]=df.res500+df.arr*np.pi*0.25
    return df
inc=pd.read_parquet(f"{S}/poi_2024Q4.parquet",columns=["cat_s","cat_s_nm","lon","lat","adm_cd"])
I=feats(inc,inc); I["comp500"]-=1                                    # 자기 제외
N=pd.read_parquet(f"{S}/cohort_2025.parquet",columns=["cat_s","cat_s_nm","lon","lat","adm_cd","entry"])
N=feats(N,inc)                                                       # 들어오기 직전(2024Q4) 기준 주변 상황
for d in (I,N):
    d["sat"]=np.log1p(d.comp500)-np.log(d.dem+1); d["l_dem"]=np.log(d.dem+1); d["l_comp"]=np.log1p(d.comp500)
rows=[]
for cat,n in N.groupby("cat_s"):
    i=I[I.cat_s==cat].dropna(subset=["sat"])
    if len(n)<100 or len(i)<300: continue
    n=n.dropna(subset=["sat"])
    pct=lambda v,col: np.searchsorted(np.sort(i[col].values),v,side="right")/len(i)
    rows.append(dict(cat_s=cat,업종=n.cat_s_nm.iat[0],신규=len(n),기존=len(i),
                     포화_백분위=pct(n.sat.values,"sat").mean(),수요_백분위=pct(n.l_dem.values,"l_dem").mean(),
                     경쟁_백분위=pct(n.l_comp.values,"l_comp").mean()))
T=pd.DataFrame(rows)
w=T.신규/T.신규.sum()
print(f"업종 {len(T)}개, 신규점 {T.신규.sum():,}곳 — 기존 점포 분포 대비 신규점 평균 백분위 (50% = 기존과 같음)")
print(f"   포화 지수   {np.average(T.포화_백분위,weights=w):.1%}   (낮으면 덜 포화된 곳을 고름)")
print(f"   주변 수요   {np.average(T.수요_백분위,weights=w):.1%}")
print(f"   같은업종 수  {np.average(T.경쟁_백분위,weights=w):.1%}")
print(f"   포화 백분위 < 45% 업종 {int((T.포화_백분위<0.45).sum())}개 / > 55% 업종 {int((T.포화_백분위>0.55).sum())}개")
T=T.sort_values("포화_백분위")
f=lambda c:c.map(lambda v:f"{v:.0%}")
show=T.assign(포화_백분위=f(T.포화_백분위),수요_백분위=f(T.수요_백분위),경쟁_백분위=f(T.경쟁_백분위)).drop(columns="cat_s")
print("\n덜 포화된 곳을 가장 뚜렷이 고른 업종"); print(show.head(8).to_string(index=False))
print("\n오히려 더 포화된 곳에 들어간 업종"); print(show.tail(8).to_string(index=False))
T.to_csv(f"{S}/entry_choice.csv",index=False,encoding="utf-8-sig")
