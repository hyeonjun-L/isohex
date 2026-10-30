# -*- coding: utf-8 -*-
"""p25 — 서울 전역 임대료: 상권분석서비스 '임대시세'를 행정동·격자에 붙이고 점검한다 (마스터플랜 §5.12·§5.13).

값: 서울신용보증재단 보증 고객 통계로 추정한 환산임대료 — 3.3㎡당 월(원) = 보증금 × 12% ÷ 12 + 월세, 최근 1년 자료.
    공공누리 표시가 없는 자료라 개인 분석에만 쓴다 — 파일로 다시 나누려면 서울시와 협의가 필요하다.

입력 — 둘 중 있는 것을 쓴다 (새 자료가 있으면 그쪽)
  ① 새 자료  상권분석서비스_임대시세/임대시세_긴형식.csv  (임대시세_수집.py 산출, 2026-10-30~)
     지역·상권별 현황 화면(/stateArea.do)이 부르는 /region/selectRentalPrice.json에서 받는다.
     서울시·자치구·행정동이 한 파일에 있고, **층 구분(전체 / 1층 / 1층 외)**과 2021Q1~ 분기가 들어 있다.
     재단이 2026-10-28 전화로 "개인은 엑셀 불가, 화면의 행정동 기능을 쓰라"고 안내한 그 화면이다.
  ② 옛 자료  상권분석서비스_임대시세/임대시세_행정동_원자료_*.csv + 임대시세_자치구_서울_원자료_*.csv
     분석 리포트를 행정동마다 425번 읽은 것 (2026-10-20). 1층만, 최근 5개 분기만.
  TRDAR_SHP   상권분석 영역-상권 SHP — 옆의 영역-행정동 SHP도 쓴다 (EPSG:5181)
  MASTER_DIR  cell_panel.parquet (상권×업종 2025년 매출·점포)
  결과/매출잠재_격자.csv (p18) — 칸 h3·부동산원 상권과 그 1층 임대료·업종별 매출 잠재
출력 — 옛 열은 그대로 두고 층·장기 관련 열만 덧붙인다 (뷰어·func_rent 호환)
  RENT_DIR/결과/임대시세_행정동.csv         + 대표값_1층외 · 대표값_전체 · 층비율 · 대표값_8분기
  RENT_DIR/결과/임대시세_행정동_긴형식.csv   행정동 × 분기 (1층) — 층까지 필요하면 임대시세_행정동_층별.csv
  RENT_DIR/결과/임대시세_행정동_층별.csv     행정동 × 분기 × 층 (새 자료일 때만)
  결과/격자_임대시세.csv (OUT_DIR)          + 임대시세_1층외 · 임대시세_전체 · 층비율
  결과/임대시세_데이터.json (OUT_DIR)       뷰어용 — dong[*].s 는 최신 5개 분기로 자른다(뷰어 툴팁이 다섯 개를 쓴다)
  RENT_DIR/결과/임대시세_점검.json          부동산원 72곳 대조·탄력성·매출 잠재 상관 + 층비율
대표값: 최근 4분기 중 있는 값의 평균(두 분기 이상). **규칙을 바꾸지 않았다** — §5.12에 적힌 숫자와 이어진다.
       분기가 길어졌으므로 8분기 평균을 대표값_8분기로 함께 내 두고 차이만 찍는다. 바꿀지는 보고 정한다.
층비율 = 1층 외 ÷ 1층. 지금까지는 부동산원 서울 평균 효용비율(2층 44.6 등)을 425개 동에 똑같이 곱했는데,
       이제 동마다 실측이 있다. 다만 '1층 외'는 2층·3층·지하를 섞은 값이라 특정 층의 효용비율과 같지 않다."""
import pandas as pd, numpy as np, os, json, warnings, shapefile, unicodedata, fnmatch
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
from scipy.stats import spearmanr
import statsmodels.api as sm
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
RENT=os.environ.get("RENT_DIR",os.path.join(HERE,"..","..","임대료"))
M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
RAW=os.path.dirname(os.path.dirname(SHP)); shp=lambda n: os.path.join(RAW,f"서울시 상권분석서비스({n})",f"서울시 상권분석서비스({n})")
OUT=os.environ.get("OUT_DIR",os.path.join(HERE,"결과")); ROUT=os.path.join(RENT,"결과"); os.makedirs(ROUT,exist_ok=True)
PY=3.3058                                                     # 3.3㎡(1평) = 3.3058㎡
FL=["전체","1층","1층외"]
qk=lambda q:(int(q[:4]),int(q[5]))
def files(d,pat):
    try: names=os.listdir(d)
    except FileNotFoundError: return []
    P=unicodedata.normalize("NFC",pat)
    return sorted(os.path.join(d,n) for n in names if fnmatch.fnmatch(unicodedata.normalize("NFC",n),P))
RD=os.path.join(RENT,"상권분석서비스_임대시세")

# ── 입력: 구분·코드·이름·분기·층구분·값 의 긴 형식 R 로 모은다
NEWF=files(RD,"임대시세_긴형식.csv")
if NEWF:
    SRC=os.path.basename(NEWF[-1]); MODE="지역별 현황 화면 (층 구분·장기)"
    R=pd.read_csv(NEWF[-1],dtype={"코드":str},encoding="utf-8-sig")
    vc=[c for c in R.columns if c.startswith("환산임대료")][0]
    R=R.rename(columns={vc:"값"}); R["분기"]=R.기준년.astype(str)+"Q"+R.기준분기.astype(str)
    R["층구분"]=R.층구분.str.replace(" ","",regex=False).replace({"1층외":"1층외","1층 외":"1층외"})
    R["값"]=pd.to_numeric(R["값"],errors="coerce"); R=R.dropna(subset=["값"])
else:
    fd=files(RD,"임대시세_행정동_원자료_*.csv"); fg=files(RD,"임대시세_자치구_서울_원자료_*.csv")
    assert fd and fg, f"{RD}에 원자료가 없다 — 임대시세_수집.py를 먼저 돌릴 것"
    SRC=os.path.basename(fd[-1]); MODE="분석 리포트 화면 읽기 (1층·5분기)"
    rows=[]
    for line in open(fd[-1],encoding="utf-8").read().strip().split("\n"):
        t=line.split(","); cd,nm=t[0],t[1]
        for tok in t[2:]:
            q,v=tok.split(":")
            if q=="x" or v=="": continue
            rows.append(("행정동",cd,nm,f"20{q[:2]}Q{q[2]}","1층",float(v)))
    g0=pd.read_csv(fg[-1],dtype={"자치구코드":str})
    for _,r in g0.iterrows():
        for q in [c for c in g0.columns if "Q" in c]:
            if pd.notna(r[q]):
                rows.append(("서울시" if r.자치구코드=="11" else "자치구",r.자치구코드,r.자치구,q,"1층",float(r[q])))
    R=pd.DataFrame(rows,columns=["구분","코드","이름","분기","층구분","값"])
HAS_FLOOR=R.층구분.nunique()>1
QS=sorted(R[R.구분=="행정동"].분기.unique(),key=qk)
LAST4=QS[-4:]; LAST8=QS[-8:]; Q5=QS[-5:][::-1]; QL=QS[-1]
print(f"원자료 {SRC} — {MODE}")
print(f"  행정동 {R[R.구분=='행정동'].코드.nunique()} · 자치구 {R[R.구분=='자치구'].코드.nunique()} · 분기 {len(QS)}개 {QS[0]}~{QL}"
      f" · 층 {sorted(R.층구분.unique()) if HAS_FLOOR else ['1층']} · 행 {len(R):,}")
print(f"  대표값 창 {LAST4[0]}~{LAST4[-1]}" + (f" · 8분기 창 {LAST8[0]}~{LAST8[-1]}" if len(LAST8)>4 else ""))

def wide(d): return d.pivot_table(index="코드",columns="분기",values="값",aggfunc="first").reindex(columns=QS)
def rep(W):
    """행정동 × 분기 표 → 대표값·상태·최근4분기수·최근분기·흔들림."""
    r4=W[LAST4]; n4=r4.notna().sum(axis=1); m4=r4.mean(axis=1)
    lq=W.apply(lambda row: next((q for q in reversed(QS) if pd.notna(row[q])),None),axis=1)
    lv=pd.Series([W.at[i,q] if isinstance(q,str) else np.nan for i,q in lq.items()],index=W.index)
    v=np.where(n4>=1,m4,lv)
    st=np.where(n4>=2,"최근 "+n4.astype(str)+"분기 평균",np.where(n4==1,"한 분기","오래됨("+lq.fillna("")+")"))
    vol=(r4.max(axis=1)/r4.min(axis=1)).where(n4>=2)
    return pd.DataFrame({"대표값":np.round(v),"상태":st,"최근4분기_수":n4,"최근분기":lq,"변동_최대÷최소":vol.round(2)},index=W.index)

DG=R[R.구분=="행정동"]; name=DG.drop_duplicates("코드").set_index("코드").이름
Wf={f:wide(DG[DG.층구분==f]) for f in FL if (DG.층구분==f).any()}
D=rep(Wf["1층"]).reset_index().rename(columns={"코드":"행정동코드"})
D.insert(1,"행정동",D.행정동코드.map(name))
D[QL]=Wf["1층"][QL].reindex(D.행정동코드).values
if len(LAST8)>4: D["대표값_8분기"]=np.round(Wf["1층"][LAST8].mean(axis=1).reindex(D.행정동코드).values)
for f,col in [("1층외","대표값_1층외"),("전체","대표값_전체")]:
    # 1층과 같은 보정 규칙을 쓴다 — 최근 4분기가 비면 가장 최근 값(2022년만 있는 동 4곳)
    if f in Wf: D[col]=rep(Wf[f]).대표값.reindex(D.행정동코드).values
if "대표값_1층외" in D: D["층비율"]=(D.대표값_1층외/D.대표값).round(3)

# ── 자치구·서울시
GW=wide(R[(R.구분=="자치구")&(R.층구분=="1층")] if HAS_FLOOR else R[R.구분=="자치구"])
gname=R[R.구분=="자치구"].drop_duplicates("코드").set_index("코드").이름
G=pd.DataFrame({"자치구":gname.reindex(GW.index)}).join(GW[Q5]); G["4분기평균"]=GW[LAST4].mean(axis=1).round()
SW=wide(R[(R.구분=="서울시")&(R.층구분=="1층")] if HAS_FLOOR else R[R.구분=="서울시"])
seoul=SW.iloc[0]; seoul4=round(float(seoul[LAST4].mean()))
D["자치구코드"]=D.행정동코드.str[:5]; D["자치구"]=D.자치구코드.map(G.자치구)
D["자치구_4분기평균"]=D.자치구코드.map(G["4분기평균"]); D["자치구÷"]=(D.대표값/D["자치구_4분기평균"]).round(2)
D["원/㎡"]=(D.대표값/PY).round(0)
D["주의"]=np.select([D["자치구÷"]>=2.5,D["자치구÷"]<=0.4],["자치구 값의 2.5배 이상","자치구 값의 0.4배 이하"],"")
head=["행정동코드","행정동","자치구코드","자치구","대표값",QL,"최근분기","최근4분기_수","상태","변동_최대÷최소","자치구_4분기평균","자치구÷","원/㎡","주의"]
D=D[head+[c for c in D.columns if c not in head]]

print(f"\n대표값 상태: {D.상태.value_counts().to_dict()}")
print(f"대표값(만 원/3.3㎡, 1층) 서울 동 가운데 {D.대표값.median()/1e4:.1f} · 10% {np.percentile(D.대표값,10)/1e4:.1f} · 90% {np.percentile(D.대표값,90)/1e4:.1f}"
      f" · 범위 {D.대표값.min()/1e4:.1f}~{D.대표값.max()/1e4:.1f} · 서울 {QL} {seoul[QL]/1e4:.1f} · 서울 4분기 평균 {seoul4/1e4:.1f}")
print(f"분기 사이 흔들림(최근 4분기 최대÷최소) 가운데 {D['변동_최대÷최소'].median():.2f} · 90% {np.nanpercentile(D['변동_최대÷최소'],90):.2f} · 1.5배 넘는 동 {int((D['변동_최대÷최소']>1.5).sum())}")
if "대표값_8분기" in D:
    d8=(D.대표값_8분기/D.대표값).dropna()
    print(f"8분기 평균 ÷ 4분기 평균 — 가운데 {d8.median():.3f} · 5%~95% {d8.quantile(.05):.2f}~{d8.quantile(.95):.2f} · 10% 넘게 다른 동 {int(((d8-1).abs()>0.10).sum())} (기본값은 그대로 4분기)")
print("자치구 값과 크게 다른 동:",D[D.주의!=""][["자치구","행정동","대표값","자치구÷"]].to_string(index=False))
hi=D.nlargest(5,"대표값")[["자치구","행정동","대표값"]]; lo=D.nsmallest(5,"대표값")[["자치구","행정동","대표값"]]
print("높은 동:",", ".join(f"{r.자치구} {r.행정동} {r.대표값/1e4:.1f}" for r in hi.itertuples()),"\n낮은 동:",", ".join(f"{r.자치구} {r.행정동} {r.대표값/1e4:.1f}" for r in lo.itertuples()))

L=DG[DG.층구분=="1층"][["코드","이름","분기","값"]].rename(columns={"코드":"행정동코드","이름":"행정동","값":"환산임대료_3.3㎡"})
L["환산임대료_3.3㎡"]=L["환산임대료_3.3㎡"].round().astype(int)
L["자치구코드"]=L.행정동코드.str[:5]; L["자치구"]=L.자치구코드.map(G.자치구)
D.to_csv(os.path.join(ROUT,"임대시세_행정동.csv"),index=False,encoding="utf-8-sig")
L.to_csv(os.path.join(ROUT,"임대시세_행정동_긴형식.csv"),index=False,encoding="utf-8-sig")
if HAS_FLOOR:
    R.assign(자치구코드=R.코드.str[:5]).to_csv(os.path.join(ROUT,"임대시세_행정동_층별.csv"),index=False,encoding="utf-8-sig")

# ── 상권분석서비스 행정동 경계와 코드 맞추기
dsf=shapefile.Reader(shp("영역-행정동"),encoding="utf-8"); drec=[r.as_dict() for r in dsf.records()]
dcode=[str(r["ADSTRD_CD"]) for r in drec]; dname={str(r["ADSTRD_CD"]):r["ADSTRD_NM"] for r in drec}
miss_shp=sorted(set(dcode)-set(D.행정동코드)); miss_raw=sorted(set(D.행정동코드)-set(dcode))
print(f"\n행정동 경계 {len(dcode)}곳 · 임대시세 {len(D)}곳 · 코드로 맞음 {len(set(dcode)&set(D.행정동코드))}"
      f" · 경계에만 {[(c,dname[c]) for c in miss_shp]} · 임대시세에만 {miss_raw}")
diffnm=[(c,dname[c],n) for c,n in zip(D.행정동코드,D.행정동) if c in dname and unicodedata.normalize("NFC",dname[c]).replace(".","·")!=n]
print(f"코드는 같고 이름이 다른 동 {len(diffnm)}: {diffnm[:8]}")

# ── 칸 → 행정동 (p18과 같은 규칙: 칸 중심이 든 동, 없으면 가장 가까운 동)
C=pd.read_csv(os.path.join(OUT,"매출잠재_격자.csv"),encoding="utf-8-sig")
to5181=Transformer.from_crs(4326,5181,always_xy=True).transform
dgeo=[shape(s.__geo_interface__) for s in dsf.shapes()]; dtree=STRtree(dgeo)
gx,gy=to5181(C.lon.values,C.lat.values); pts=[Point(a,b) for a,b in zip(gx,gy)]
hit=dtree.query(pts,predicate="within"); di=np.full(len(C),-1); di[hit[0]]=hit[1]
for q in np.where(di<0)[0]: di[q]=dtree.nearest(pts[q])
C["행정동코드"]=[dcode[q] for q in di]
same=(C.행정동==[dname[c] for c in C.행정동코드]).mean(); print(f"칸 {len(C):,} — p18 행정동 이름과 같은 배정 {same:.1%}")
mc=["행정동코드","대표값",QL,"상태"]+[c for c in ["대표값_1층외","대표값_전체","층비율"] if c in D]
C=C.merge(D[mc],on="행정동코드",how="left")
print(f"임대시세가 붙은 칸 {C.대표값.notna().sum():,} / {len(C):,}")
oc=["h3_9","행정동코드","행정동","자치구","대표값",QL,"상태"]+[c for c in ["대표값_1층외","대표값_전체","층비율"] if c in C]
C[oc].rename(columns={"대표값":"임대시세_대표","대표값_1층외":"임대시세_1층외","대표값_전체":"임대시세_전체"}).to_csv(
    os.path.join(OUT,"격자_임대시세.csv"),index=False,encoding="utf-8-sig")

# ── 점검 ① 부동산원 상권 72곳과 견주기 (같은 칸들 — 부동산원 상권 안의 칸)
B=C[C.임대료_1층.notna()].copy(); B["동_천원㎡"]=B.대표값/PY/1000
A=B.groupby("부동산원상권").agg(부동산원=("임대료_1층","first"),서울신보=("동_천원㎡","mean"),칸=("h3_9","size"))
rho=spearmanr(A.부동산원,A.서울신보).correlation; rr=(A.서울신보/A.부동산원)
print(f"\n점검 ① 부동산원 상권 {len(A)}곳 — 1층 임대료(부동산원, 천원/㎡) vs 그 안 칸들의 동 환산임대료 평균: 순위상관 {rho:+.2f} · "
      f"서울신보 ÷ 부동산원 가운데 {rr.median():.2f} (25~75% {rr.quantile(.25):.2f}~{rr.quantile(.75):.2f}) · log 상관 {np.corrcoef(np.log(A.부동산원),np.log(A.서울신보))[0,1]:.2f}")
print("   차이가 큰 곳:",", ".join(f"{k} {r.부동산원:.0f}→{r.서울신보:.0f}" for k,r in A.assign(x=np.log(rr)).sort_values("x").iloc[[0,1,2,-3,-2,-1]].iterrows()))

# ── 점검 ② 점포당 매출 ~ 임대료 — 상권분석 상권 전부 (상권이 속한 행정동의 값)
tsf=shapefile.Reader(SHP,encoding="utf-8"); T=pd.DataFrame([r.as_dict() for r in tsf.records()])
T["TRDAR_CD"]=T.TRDAR_CD.astype(int); T["행정동코드"]=T.ADSTRD_CD.astype(str); T=T.merge(D[["행정동코드","대표값"]],on="행정동코드",how="left")
print(f"\n점검 ② 상권 {len(T):,}곳 중 행정동 임대시세가 붙은 곳 {T.대표값.notna().sum():,}")
c=pd.read_parquet(f"{M}/cell_panel.parquet"); c=c[c.기준_년분기_코드.astype(str).str.startswith("2025")]
s=c.groupby(["상권_코드","서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
s=s[(s.공개==4)&(s.점포>0)]; s["l_ps"]=np.log(s.매출/s.점포)
X=s.merge(T[["TRDAR_CD","행정동코드","대표값"]],left_on="상권_코드",right_on="TRDAR_CD").dropna(subset=["대표값"])
rb=pd.read_csv(os.path.join(ROUT,"상권분석상권_임대료.csv"))[["TRDAR_CD","겹침비율"]] if os.path.exists(os.path.join(ROUT,"상권분석상권_임대료.csv")) else None
def elas(d,lab):
    d=d.copy(); d["l_r"]=np.log(d.대표값); Z=d[["l_ps","l_r"]]-d.groupby("서비스_업종_코드")[["l_ps","l_r"]].transform("mean")
    r=sm.OLS(Z.l_ps,Z[["l_r"]]).fit(cov_type="cluster",cov_kwds={"groups":pd.factorize(d.행정동코드)[0]})
    b,se=r.params["l_r"],r.bse["l_r"]
    print(f"   {lab:<28} 탄력성 {b:+.2f} (95% {b-1.96*se:+.2f}~{b+1.96*se:+.2f}) · 칸 {len(d):,} · 상권 {d.상권_코드.nunique():,} · 행정동 {d.행정동코드.nunique()}")
    EL[lab]=[round(float(b),3),round(float(b-1.96*se),3),round(float(b+1.96*se),3),int(d.상권_코드.nunique()),int(d.행정동코드.nunique())]
    return b
EL={}
e_all=elas(X,"전체 상권")
if rb is not None:
    X2=X.merge(rb,on="TRDAR_CD",how="left"); elas(X2[X2.겹침비율>=0.3],"부동산원 상권 안(≥30%)만"); elas(X2[~(X2.겹침비율>=0.3)],"그 밖 상권")
gb=T.set_index("TRDAR_CD").TRDAR_SE_1 if "TRDAR_SE_1" in T else None
if gb is not None:
    for k,g_ in X.assign(구분=X.상권_코드.map(gb)).groupby("구분"):
        if g_.상권_코드.nunique()>=50: elas(g_,k)

# ── 점검 ③ 매출 잠재 v1(칠하는 업종) ↔ 동 임대료 — 동마다 칠한 칸 평균
pc=[c_ for c_ in C.columns if c_.startswith("잠재_")]; out=[]
for c_ in pc:
    z=C[C[c_].notna()].assign(v=lambda d: np.log1p(d[c_]/100)).groupby("행정동코드").agg(v=("v","mean"),n=("v","size"),r=("대표값","first"))
    z=z[(z.n>=3)&z.r.notna()]
    if len(z)>=30: out.append((c_[3:],len(z),spearmanr(z.v,np.log(z.r)).correlation))
O=pd.DataFrame(out,columns=["업종","행정동","순위상관"]).sort_values("순위상관")
print(f"\n점검 ③ 매출 잠재(칠한 칸, 동 평균) ↔ 동 임대시세 순위상관 — 업종 가운데 {O.순위상관.median():+.2f} (범위 {O.순위상관.min():+.2f}~{O.순위상관.max():+.2f})")
print("   "+" · ".join(f"{r.업종} {r.순위상관:+.2f}({r.행정동})" for r in O.itertuples()))

# ── 점검 ④ 층비율 — 여태 모든 동에 똑같이 곱하던 부동산원 효용비율을 동별 실측으로 바꿀 수 있나
FR=None
if "층비율" in D:
    f=D.층비율.dropna()
    FR={"median":round(float(f.median()),3),"q1":round(float(f.quantile(.25)),3),"q3":round(float(f.quantile(.75)),3),"n":int(len(f)),"seoul":None}
    sw_ex=wide(R[(R.구분=="서울시")&(R.층구분=="1층외")]); sw_f=wide(R[(R.구분=="서울시")&(R.층구분=="1층")])
    if len(sw_ex) and len(sw_f):
        FR["seoul"]=round(float(sw_ex[LAST4].mean(axis=1).iloc[0]/sw_f[LAST4].mean(axis=1).iloc[0]),3)
    sv="—" if FR["seoul"] is None else f"{FR['seoul']:.2f}"
    print(f"\n점검 ④ 층비율(1층 외 ÷ 1층) — 서울 {sv} · 동 가운데 {FR['median']:.2f} (25~75% {FR['q1']:.2f}~{FR['q3']:.2f}, {FR['n']}곳)")
    print(f"   참고: 부동산원 서울 중대형 효용비율은 2층 0.45 · 지하1층 0.28 (1층=1). '1층 외'는 2층·3층·지하를 섞은 값이라 특정 층과 같지 않다")
    lowr=D.dropna(subset=["층비율"]).nsmallest(4,"층비율")[["자치구","행정동","층비율"]]; hir=D.dropna(subset=["층비율"]).nlargest(4,"층비율")[["자치구","행정동","층비율"]]
    print("   낮은 동:",", ".join(f"{r.자치구} {r.행정동} {r.층비율:.2f}" for r in lowr.itertuples()),
          "· 높은 동:",", ".join(f"{r.자치구} {r.행정동} {r.층비율:.2f}" for r in hir.itertuples()))
    adj=(f/f.median()).clip(0.6,1.5)        # 뷰어 template.html drAdjD 와 같은 식 (1층은 기준 층이라 보정하지 않는다)
    FR["adj"]={"base":"median","lo":0.6,"hi":1.5,"q1":round(float(adj.quantile(.25)),3),"q3":round(float(adj.quantile(.75)),3),
               "clip_lo":int((adj<=0.6).sum()),"clip_hi":int((adj>=1.5).sum())}
    print(f"   → 뷰어는 효용비율에 clip(fr ÷ 동 가운데값, 0.6, 1.5)를 곱한다 — 보정배수 가운데 {adj.median():.2f} · "
          f"25~75% {adj.quantile(.25):.2f}~{adj.quantile(.75):.2f} · 자르기 걸림 아래 {int((adj<=0.6).sum())}곳 · 위 {int((adj>=1.5).sum())}곳")
    print(f"      2층이면 {0.446*adj.quantile(.25):.2f}~{0.446*adj.quantile(.75):.2f}(가운데 {0.446*adj.median():.2f}) 사이가 된다. 자르기 전 원자료는 {f.max()/f.min():.1f}배까지 벌어진다")

CHK={"made":pd.Timestamp.now().strftime("%Y-%m-%d"),"src":SRC,"mode":MODE,
     "rule":f"최근 4분기({LAST4[0]}~{LAST4[-1]}) 중 있는 값 평균 — 두 분기 이상",
     "quarters":{"n":len(QS),"first":QS[0],"last":QL},"floors":sorted(R.층구분.unique()) if HAS_FLOOR else ["1층"],
     "seoul":{**{q:int(seoul[q]) for q in Q5 if pd.notna(seoul[q])},"4분기평균":seoul4},"dong_median":int(D.대표값.median()),
     "reb72":{"rho":round(float(rho),3),"ratio_median":round(float(rr.median()),3),"ratio_q1":round(float(rr.quantile(.25)),3),"ratio_q3":round(float(rr.quantile(.75)),3),"n":int(len(A)),
              "ext":[[k,round(float(A.부동산원[k]),1),round(float(A.서울신보[k]),1)] for k in rr.sort_values().index[[0,1,-2,-1]]]},
     "elasticity":EL,"pot_rho":{"median":round(float(O.순위상관.median()),3),"min":round(float(O.순위상관.min()),3),"max":round(float(O.순위상관.max()),3)}}
if FR: CHK["floor_ratio"]=FR
json.dump(CHK,open(os.path.join(ROUT,"임대시세_점검.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)

# ── 뷰어(build_viewer.py)용 — p18 행정동 키("행정동|자치구")마다 코드·대표값·분기 값
#    s 는 최신 5개로 자른다: viewer/tools/func_rent.py 가 툴팁의 '분기 값 다섯 개'를 s 전부와 맞춰 본다
K=C.groupby(["행정동","자치구"]).행정동코드.agg(lambda v: sorted(set(v)))
assert all(len(v)==1 for v in K), "한 p18 행정동 키에 코드가 둘 이상"
Di=D.set_index("행정동코드"); dong={}
for (nm,gu),cs in K.items():
    r=Di.loc[cs[0]]; s_=L[L.행정동코드==cs[0]].sort_values("분기",key=lambda s: s.map(qk),ascending=False).head(5)
    e={"c":cs[0],"v":int(r.대표값),"n":int(r.최근4분기_수),"last":r.최근분기,"s":[[q,int(v)] for q,v in zip(s_.분기,s_["환산임대료_3.3㎡"])]}
    if "대표값_1층외" in D and pd.notna(r.대표값_1층외): e["vx"]=int(r.대표값_1층외)
    if "대표값_전체" in D and pd.notna(r.대표값_전체):  e["vt"]=int(r.대표값_전체)
    if "층비율" in D and pd.notna(r.층비율):            e["fr"]=float(r.층비율)
    dong[f"{nm}|{gu}"]=e
gi=lambda x: int(x) if pd.notna(x) else None
VJ={"meta":{**CHK,"unit":"원/3.3㎡·월","py":PY,"q":Q5},
    "gu":{r.자치구:[gi(r[q]) for q in Q5]+[gi(r["4분기평균"])] for _,r in G.iterrows()},"dong":dong}
if HAS_FLOOR:
    gx_=wide(R[(R.구분=="자치구")&(R.층구분=="1층외")]); VJ["gu_ex"]={G.자치구[i]:gi(round(gx_.loc[i,LAST4].mean())) for i in gx_.index if i in G.index}
json.dump(VJ,open(os.path.join(OUT,"임대시세_데이터.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(f"\n뷰어용 임대시세_데이터.json — p18 행정동 {len(dong)}곳 (임대시세 {len(D)}곳 중) · 분기 {Q5[-1]}~{Q5[0]}"
      + (f" · 층 구분 포함({sum('vx' in v for v in dong.values())}곳)" if HAS_FLOOR else ""))
print("저장:",ROUT,"·",os.path.join(OUT,"격자_임대시세.csv"),"·",os.path.join(OUT,"임대시세_데이터.json"))
