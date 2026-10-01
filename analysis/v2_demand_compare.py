# -*- coding: utf-8 -*-
"""수요 지표 비교 — 생활이동 도착인구(목적별) vs 길단위 유동인구.
단위: 서울 행정동 425개. 종속: 2025년 업종별 추정매출(4분기 합), 2025Q4 전체 점포수.
비교 방식:
  ① 같은 통제(면적·자치구) 아래 지표 하나씩 넣었을 때 설명력
  ② 둘 다 넣고 경쟁(표준화 계수)
  ③ 자치구 하나씩 빼고 맞히기(공간 교차검증) — 과적합 없이 '새 동네'를 맞히는 힘
생활이동은 2026-04-06~12, 06-01~07 두 주(14일). 매출과 시점이 다르다(행정동 단위 구조 비교로만 해석)."""
import pandas as pd, numpy as np, glob, shapefile, warnings, os, statsmodels.formula.api as smf
from sklearn.linear_model import LinearRegression
warnings.filterwarnings("ignore")
U=os.environ.get("SANGGWON_DIR","../서울시 상권분석 서비스")+"/"
MV=os.environ.get("MOVE_DIR","../수도권 생활이동")      # seoul_purpose_admdong1_in_YYYYMM 폴더들
def rd(p):
    for e in ("cp949","utf-8-sig"):
        try: d=pd.read_csv(p,encoding=e,low_memory=False); d.columns=[c.strip('"') for c in d.columns]; return d
        except UnicodeDecodeError: pass

# ── 생활이동 도착인구 (목적별, 14일 합)
P={1:"출근",2:"등교",3:"귀가",4:"쇼핑",5:"관광",6:"병원",7:"기타"}
fs=[f for f in sorted(glob.glob(MV+"/*/*.csv")) if f[-12:-4] in {f"202604{d:02d}" for d in range(6,13)}|{f"202606{d:02d}" for d in range(1,8)}]
assert fs, f"생활이동 파일 없음: {MV}"
parts=[]
for f in fs:
    d=pd.read_csv(f,usecols=["d_admdong_cd","time_cd","move_purpose","total_cnt","male_10_cnt","feml_10_cnt","male_20_cnt","feml_20_cnt","male_30_cnt","feml_30_cnt"])
    d["wk"]="4월" if "202604" in f else "6월"; parts.append(d)
mv=pd.concat(parts); mv["행정동코드"]=mv.d_admdong_cd.astype(str)
arr=mv.pivot_table(index="행정동코드",columns="move_purpose",values="total_cnt",aggfunc="sum").rename(columns=P).fillna(0)
arr["도착_전체"]=arr.sum(axis=1); arr["도착_비귀가"]=arr.도착_전체-arr.귀가
wk=mv.pivot_table(index="행정동코드",columns="wk",values="total_cnt",aggfunc="sum")
# 유동인구 (2025 4개 분기 평균)
fo=rd(U+"서울시 상권분석서비스(길단위인구-행정동).csv"); fo=fo[fo.기준_년분기_코드.between(20251,20254)]
fo=fo.groupby("행정동_코드").총_유동인구_수.mean().rename("유동인구"); fo.index=fo.index.astype(str)
# 상주·직장인구
rs=rd(U+"서울시 상권분석서비스(상주인구-행정동).csv"); rs=rs[rs.기준_년분기_코드==20254].set_index("행정동_코드").총_상주인구_수.rename("상주인구"); rs.index=rs.index.astype(str)
wp=rd(U+"서울시 상권분석서비스(직장인구-행정동).csv"); wp=wp[wp.기준_년분기_코드==20254].set_index("행정동_코드").총_직장_인구_수.rename("직장인구"); wp.index=wp.index.astype(str)
# 면적·자치구
sf=shapefile.Reader(glob.glob("raw/*영역-행정동*/*.shp")[0][:-4],encoding="utf-8"); F=[f[0] for f in sf.fields[1:]]
ar=pd.DataFrame(sf.records(),columns=F); print("행정동 SHP 필드:",F)
ccol=[f for f in F if f.startswith("ADSTRD_CD") and not f.endswith("_")][0]
acol=[f for f in F if "AR" in f.upper() and "RELM" in f.upper()][0]
ar=ar.rename(columns={ccol:"행정동코드",acol:"면적_m2"}); ar["행정동코드"]=ar.행정동코드.astype(str)
ar["자치구"]=ar.행정동코드.str[:5]                     # 행정동코드 앞 5자리 = 자치구
ar=ar.set_index("행정동코드")[["면적_m2","자치구"]]
# 종속: 2025 매출 (업종별·전체), 2025Q4 전체 점포수
sa=rd(glob.glob("raw/*추정매출-행정동*2025*/*.csv")[0]); sa["행정동코드"]=sa.행정동_코드.astype(str)
st=rd(glob.glob("raw/*점포-행정동*2025*/*.csv")[0]);    st["행정동코드"]=st.행정동_코드.astype(str)
st=st[st.기준_년분기_코드==20254]
WANT={"CS100010":"커피","CS300002":"편의점","CS200031":"세탁소","CS200038":"독서실","CS100005":"제과점","CS100001":"한식","CS300010":"반찬가게"}
Y={"매출_전체":sa.groupby("행정동코드").당월_매출_금액.sum(),"점포_전체":st.groupby("행정동코드").유사_업종_점포_수.sum()}
for c,n in WANT.items():
    if c in set(sa.서비스_업종_코드): Y[f"매출_{n}"]=sa[sa.서비스_업종_코드==c].groupby("행정동코드").당월_매출_금액.sum()
    Y[f"점포_{n}"]=st[st.서비스_업종_코드==c].groupby("행정동코드").유사_업종_점포_수.sum()
D=ar.join([arr,fo,rs,wp],how="inner").join(pd.concat([v.rename(k) for k,v in Y.items()],axis=1),how="left")
for k in Y:
    if k.startswith("점포_"): D[k]=D[k].fillna(0)
print("행정동: SHP", len(ar), "/ 생활이동", len(arr), "/ 유동", len(fo), "/ 결합", len(D))
print(f"\n분석 행정동 {len(D)}개 / 생활이동 두 주 행정동 합계 상관 {np.corrcoef(np.log(wk['4월']),np.log(wk['6월']))[0,1]:.3f}")
for c in list(P.values())+["도착_전체","도착_비귀가","유동인구","상주인구","직장인구","면적_m2"]+list(Y):
    D["l_"+c]=np.log(D[c].clip(lower=0)+1)
D.to_parquet("master/dong_demand.parquet")

X={"유동인구":["l_유동인구"],"도착(전체)":["l_도착_전체"],"도착(귀가 제외)":["l_도착_비귀가"],
   "도착(목적 7종)":[f"l_{p}" for p in P.values()],"상주+직장":["l_상주인구","l_직장인구"]}
def cv_r2(y,xs):
    d=D.dropna(subset=[y]+xs); d=d[d[y.replace('l_','')]>0] if 'l_매출' in y else d
    Z=pd.get_dummies(d.자치구,drop_first=False).astype(float)   # 자치구 고정효과는 학습 구에서만 추정 불가 → 면적+지표만으로 예측
    pred=np.zeros(len(d))
    for g in d.자치구.unique():
        tr=d.자치구!=g; te=~tr
        A=d.loc[tr,xs+["l_면적_m2"]].values; m=LinearRegression().fit(A,d.loc[tr,y]); pred[te.values]=m.predict(d.loc[te,xs+["l_면적_m2"]].values)
    ss=((d[y]-pred)**2).sum(); st_=((d[y]-d[y].mean())**2).sum(); return 1-ss/st_, len(d)
def in_r2(y,xs):
    d=D.dropna(subset=[y]+xs); d=d[d[y.replace('l_','')]>0] if 'l_매출' in y else d
    r=smf.ols(f"{y} ~ {' + '.join(xs)} + l_면적_m2 + C(자치구)",data=d).fit(); return r.rsquared
ys=["l_매출_전체","l_점포_전체"]+[f"l_매출_{n}" for n in WANT.values() if f"매출_{n}" in D]+[f"l_점포_{n}" for n in WANT.values()]
rows=[]
for y in ys:
    dd=D[D[y.replace('l_','')]>0] if 'l_매출' in y else D.dropna(subset=[y]); base=smf.ols(f"{y} ~ l_면적_m2 + C(자치구)",data=dd).fit().rsquared
    row={"종속":y[2:],"기준(면적+구)":round(base,3)}
    for k,xs in X.items():
        row[k]=f"{in_r2(y,xs):.3f} / {cv_r2(y,xs)[0]:.3f}"
    rows.append(row)
T=pd.DataFrame(rows); pd.set_option("display.width",250)
print("\n각 칸 = 표본 내 R²(면적+자치구 통제) / 자치구 하나씩 빼고 맞힌 R²(면적만 통제)")
print(T.to_string(index=False))

print("\n② 경쟁 — 유동인구와 도착인구를 같이 넣었을 때 표준화 계수 (면적·자치구 통제, 행정동 내 군집 없음 → HC3)")
for y in ["l_매출_전체","l_점포_전체","l_매출_커피","l_매출_편의점","l_매출_세탁소","l_점포_독서실"]:
    d=(D[D[y.replace('l_','')]>0] if 'l_매출' in y else D).copy()
    for c in ["l_유동인구","l_도착_비귀가","l_귀가"]: d[c+"_z"]=(d[c]-d[c].mean())/d[c].std()
    r=smf.ols(f"{y} ~ l_유동인구_z + l_도착_비귀가_z + l_귀가_z + l_면적_m2 + C(자치구)",data=d).fit(cov_type="HC3")
    f=lambda v:f"{r.params[v]:+.2f}{'*' if r.pvalues[v]<0.01 else ' '}"
    print(f"  {y[2:]:<10} 유동 {f('l_유동인구_z')}   도착(귀가제외) {f('l_도착_비귀가_z')}   귀가 {f('l_귀가_z')}   R² {r.rsquared:.3f}")

print("\n③ 업종별로 어떤 목적의 도착이 가장 잘 맞나 (단일 목적, 면적+자치구 통제 R²)")
for y in [f"l_매출_{n}" for n in WANT.values() if f"매출_{n}" in D]+["l_점포_독서실"]:
    d=D[D[y.replace('l_','')]>0] if 'l_매출' in y else D
    res={p:smf.ols(f"{y} ~ l_{p} + l_면적_m2 + C(자치구)",data=d).fit().rsquared for p in P.values()}
    best=sorted(res.items(),key=lambda kv:-kv[1])[:3]
    print(f"  {y[2:]:<10} " + "  ".join(f"{p} {v:.3f}" for p,v in best))


print("\n④ 목적을 외생(출근·등교·귀가) / 내생 의심(쇼핑·기타·관광·병원)으로 나눠서 — 자치구 제외 교차검증 R²")
X2={"유동인구":["l_유동인구"],"출근·등교·귀가":["l_출근","l_등교","l_귀가"],
    "쇼핑·기타·관광·병원":["l_쇼핑","l_기타","l_관광","l_병원"],"외생+유동":["l_출근","l_등교","l_귀가","l_유동인구"]}
for y in ["l_매출_전체","l_점포_전체","l_매출_커피","l_매출_편의점","l_매출_세탁소","l_점포_세탁소","l_점포_독서실"]:
    print(f"  {y[2:]:<10} " + "  ".join(f"{k} {cv_r2(y,xs)[0]:.3f}" for k,xs in X2.items()))
from scipy.stats import spearmanr
D["비중_쇼핑기타"]=(D.쇼핑+D.기타)/D.도착_전체
print("  점포 밀도 ↔ 쇼핑·기타 도착 비중 ρ =", round(spearmanr(D.점포_전체/D.면적_m2,D.비중_쇼핑기타)[0],3), " (점포가 도착을 부른다 = 순환 위험)")
