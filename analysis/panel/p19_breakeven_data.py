# -*- coding: utf-8 -*-
"""손익 점검표 데이터 — 상권·행정동 × 서비스 업종의 점포당 월매출(2025), 서울 분포, 결제 포착 판정 (마스터플랜 §5.14).

창업자가 보는 매물(위치·업종·면적·월세)의 손익분기 매출을 '그 동네 같은 업종 가게들이 실제로 카드로 버는 매출'과 비교하는 데 쓴다.
손익분기 계산 자체는 뷰어에서 한다. 여기서는 비교할 매출 쪽을 만든다.

입력
  MASTER_DIR  store.parquet · sales.parquet (상권×업종×분기 점포·매출, build_master). cell_panel은 쓰지 않는다 —
              v2_cannibal이 일반 점포 0인 칸(편의점처럼 전부 프랜차이즈인 상권)을 빼 두었기 때문
  RAW_DIR     상권분석 원본을 푼 곳 — 추정매출-행정동·점포-행정동 2024·2025, 영역-상권·영역-행정동 SHP (기본: TRDAR_SHP의 두 단계 위)
  결과/       매출잠재_격자.csv (p18, 셀 중심), 업종별_생존.csv (p15)
  ../업종별_잠식률.csv  업종별 α (v2_alpha_table)
출력 (OUT_DIR, 기본 ./결과)
  손익_상권업종.csv · 손익_행정동업종.csv  — 2025 네 분기 모두 매출이 공개된 칸의 점포당 월매출·하루 결제 건수·객단가·점포 수(2025Q4)
  손익_업종.csv  — 업종별 서울 분포(점포 가중 분위), 결제 포착 판정과 근거, 기본 변동비율, α, 생존(1:1 업종만)
  breakeven_data.json — 뷰어용
정의
  점포당 월매출 = 2025 네 분기 매출 합 ÷ 네 분기 점포 수 합 ÷ 3. 매출은 '추정매출'(신한카드 결제액에 서울신용보증재단 보정비율을 적용한 값)
  하루 결제 건수 = 네 분기 건수 합 ÷ 점포 수 합 ÷ 91.25 · 객단가 = 매출 ÷ 건수
  진입 뒤 점포당 매출 = 지금 점포당 매출 × ((N+1)/N)^(α−1)  (N = 2025Q4 같은 업종 점포 수, α = 업종별 매력도 지수, 없으면 0.41)
점검: 2024와 2025 점포당 매출이 같은 칸에서 얼마나 같게 나오나 (지역 평균이 믿을 만한 수준인지), 상권과 행정동 값이 얼마나 다른가"""
import pandas as pd, numpy as np, sys, os, glob, json, warnings, shapefile
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
RAW=os.environ.get("RAW_DIR",os.path.dirname(os.path.dirname(SHP)))
RES=os.path.join(HERE,"결과"); OUT=os.environ.get("OUT_DIR",RES); os.makedirs(OUT,exist_ok=True)
ALPHA0=0.41
XW={"CS100010":["I21201"],"CS300002":["G20405"],"CS300001":["G20404"],"CS200028":["S20701"],"CS200030":["S20702"],
    "CS200029":["S20703"],"CS100007":["I21006"],"CS100005":["I21001"],"CS100002":["I20201"],"CS100008":["I21007"],
    "CS300018":["G21501"],"CS300022":["G21503"],"CS200037":["R10407"],"CS200031":["S20901","S20902"],"CS300004":["G20802"],
    "CS200019":["R10406"],"CS200016":["R10310"],"CS300028":["G21901"],"CS300016":["G21602"],"CS300009":["G20506"]}   # p16과 같다
EXCLUDE={"CS200033":"중개보수는 대부분 계좌이체라 카드 매출로 잡히지 않는다 (하루 결제 3건·객단가 1.1만 원)",
         "CS300043":"온라인 판매라 매장 위치와 매출이 무관하다"}
# 결제 포착 판정 — 외부 기준과 맞춰 본 업종만 ok/low. 나머지는 '검증 안 됨'
# 포착근거·변동비율출처는 뷰어에 그대로 보이므로 합니다체로 쓴다
CAP={"CS300002":("ok","공정위 가맹사업 현황: GS25 6.2억·CU 5.9억(2021, 전국 가맹점 평균 연매출) — 이 자료의 서울 평균 연 5.8억과 비슷합니다"),
     "CS100001":("ok","외식업체 평균 연 2.55억(전국, 외식업체 경영실태조사 2024년 기준)·한식 가맹점 평균 연 3.57억(공정위 2024년 가맹사업현황 통계) — 이 자료의 서울 평균 연 3.0억은 그 사이입니다"),
     "CS100007":("low","하루 카드 결제가 8.7건으로 잡힙니다. 교촌 가맹점 평균 연 6.9억(공정위)인데 이 자료의 서울 평균은 연 1.2억입니다. 치킨집의 86%가 배달앱을 씁니다(외식업체 경영실태조사 2021) — 배달앱 결제가 빠졌을 가능성이 큽니다"),
     "CS200028":("low","하루 카드 결제가 3.1건으로 잡힙니다 — 현금·계좌이체·선불권이 많으면 실제 매출은 더 큽니다"),
     "CS200029":("low","하루 카드 결제가 0.8건으로 잡힙니다 — 선불권·계좌이체가 많은 업종으로 보입니다"),
     "CS200030":("low","하루 카드 결제가 0.6건으로 잡힙니다 — 회원권(선불) 결제가 많은 업종으로 보입니다"),
     "CS100010":("unk","가맹점 평균 연 2.34억(공정위 2024년 가맹사업현황 통계)의 약 56%입니다 — 개인 카페가 많아서인지 결제 누락인지 가릴 수 없습니다"),
     "CS100002":("unk","배달 비중이 큰 업종입니다(매출의 42%, 외식업체 경영실태조사 2021) — 배달앱 결제가 들어갔는지 확인하지 못했습니다"),
     "CS100006":("unk","피자·햄버거는 79%가 배달앱을 씁니다(외식업체 경영실태조사 2021) — 배달앱 결제가 들어갔는지 확인하지 못했습니다")}
GRP={"CS1":"외식","CS2":"서비스","CS3":"소매"}
V_DEFAULT={"외식":(0.407,"외식업체 경영실태조사(2024년 기준, 농식품부·한국농촌경제연구원) — 매출 대비 식재료비 40.7%"),"서비스":(0.15,"예시값 — 재료비 비중은 업종·가게마다 크게 다릅니다"),
           "소매":(0.65,"예시값 — 매입원가 비중은 업종·계약마다 크게 다릅니다")}
# 업종별 덧붙임 — 기본 비율에 안 들어간 큰 비용
V_NOTE={"CS300002":". 편의점은 가맹본부가 매출총이익의 일부를 가져갑니다(계약마다 다름) — 그 몫을 기타 변동비에 넣으세요"}

def rd(p,cols):
    for e in ("cp949","utf-8-sig","utf-8"):
        try: d=pd.read_csv(p,encoding=e,usecols=cols,low_memory=False); d.columns=[c.strip('"') for c in d.columns]; return d
        except (UnicodeDecodeError,ValueError): pass
    raise ValueError(p)
def metrics(df,key,year):
    d=df[df.기준_년분기_코드.astype(str).str.startswith(str(year))]
    g=d.groupby([key,"서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),건수=("당월_매출_건수","sum"),점포합=("유사_업종_점포_수","sum"),
                                         공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
    q4=d[d.기준_년분기_코드.astype(str)==f"{year}4"].groupby([key,"서비스_업종_코드"]).유사_업종_점포_수.sum().rename("점포_Q4")
    g=g.join(q4,on=[key,"서비스_업종_코드"])
    g=g[(g.공개==4)&(g.점포합>0)&(g.점포_Q4>0)].copy()
    g["월매출"]=g.매출/g.점포합/3; g["일건수"]=g.건수/g.점포합/91.25; g["객단가"]=g.매출/g.건수.clip(lower=1)
    return g

# ── 상권 단위 (cell_panel)
K3=["기준_년분기_코드","상권_코드","서비스_업종_코드"]
st=pd.read_parquet(f"{M}/store.parquet",columns=K3+["서비스_업종_코드_명","유사_업종_점포_수"])
sa=pd.read_parquet(f"{M}/sales.parquet",columns=K3+["당월_매출_금액","당월_매출_건수"])
c=st.merge(sa,on=K3,how="inner")
NAMES=st.drop_duplicates("서비스_업종_코드").set_index("서비스_업종_코드").서비스_업종_코드_명
S25=metrics(c,"상권_코드",2025); S24=metrics(c,"상권_코드",2024)
# ── 행정동 단위 (원본)
def dongpanel(year):
    fs=glob.glob(os.path.join(RAW,f"*추정매출-행정동*{year}*","*.csv")); ft=glob.glob(os.path.join(RAW,f"*점포-행정동*{year}*","*.csv"))
    assert fs and ft, f"행정동 원본 없음 {year}"
    sa=rd(fs[0],["기준_년분기_코드","행정동_코드","서비스_업종_코드","당월_매출_금액","당월_매출_건수"])
    st=rd(ft[0],["기준_년분기_코드","행정동_코드","서비스_업종_코드","유사_업종_점포_수"])
    return sa.merge(st,on=["기준_년분기_코드","행정동_코드","서비스_업종_코드"],how="inner")
D25=metrics(dongpanel(2025),"행정동_코드",2025); D24=metrics(dongpanel(2024),"행정동_코드",2024)
for d in (S25,S24): d["상권_코드"]=d.상권_코드.astype(int)
for d in (D25,D24): d["행정동_코드"]=d.행정동_코드.astype(str)
S25=S25[~S25.서비스_업종_코드.isin(EXCLUDE)]; D25=D25[~D25.서비스_업종_코드.isin(EXCLUDE)]
print(f"상권×업종 {len(S25):,}칸 (상권 {S25.상권_코드.nunique():,} · 업종 {S25.서비스_업종_코드.nunique()}) · 행정동×업종 {len(D25):,}칸 (행정동 {D25.행정동_코드.nunique()})")

# ── 점검: 해마다 같은 값이 나오나 · 상권과 행정동은 얼마나 다른가
def yoy(a,b,key):
    m=a.merge(b,on=[key,"서비스_업종_코드"],suffixes=("25","24")); x=np.log(m.월매출25); y=np.log(m.월매출24)
    per=m.assign(x=x,y=y).groupby("서비스_업종_코드").apply(lambda z: np.corrcoef(z.x,z.y)[0,1] if len(z)>=20 else np.nan)
    return len(m),np.corrcoef(x,y)[0,1],per.median(),np.median(np.abs(x-y))
n,r,rm,ad=yoy(S25,S24,"상권_코드"); print(f"\n점검 ① 2024 vs 2025 점포당 월매출 (log) — 상권 {n:,}칸 상관 {r:.3f} · 업종 안 상관 중앙 {rm:.2f} · 차이 중앙 {np.expm1(ad)*100:.0f}%")
n,r,rm,ad=yoy(D25,D24,"행정동_코드"); print(f"   행정동 {n:,}칸 상관 {r:.3f} · 업종 안 상관 중앙 {rm:.2f} · 차이 중앙 {np.expm1(ad)*100:.0f}%")

# ── 격자 셀 → 상권·행정동 (셀 중심)
G=pd.read_csv(os.path.join(RES,"매출잠재_격자.csv"),usecols=["h3_9","lat","lon"])
to5181=Transformer.from_crs(4326,5181,always_xy=True).transform; gx,gy=to5181(G.lon.values,G.lat.values); pts=[Point(a,b) for a,b in zip(gx,gy)]
tsf=shapefile.Reader(SHP,encoding="utf-8"); trec=[r.as_dict() for r in tsf.records()]; tgeo=[shape(s.__geo_interface__) for s in tsf.shapes()]
h=STRtree(tgeo).query(pts,predicate="within"); c2s=np.full(len(G),-1); c2s[h[0]]=h[1]
dsf=shapefile.Reader(os.path.join(RAW,"서울시 상권분석서비스(영역-행정동)","서울시 상권분석서비스(영역-행정동)"),encoding="utf-8")
drec=[r.as_dict() for r in dsf.records()]; dgeo=[shape(s.__geo_interface__) for s in dsf.shapes()]; dtree=STRtree(dgeo)
h=dtree.query(pts,predicate="within"); c2d=np.full(len(G),-1); c2d[h[0]]=h[1]
for q in np.where(c2d<0)[0]: c2d[q]=dtree.nearest(pts[q])
SC=np.array([int(r["TRDAR_CD"]) for r in trec]); DC=np.array([str(r["ADSTRD_CD"]) for r in drec])
print(f"\n격자 {len(G):,}셀 — 상권 안 {int((c2s>=0).sum()):,}셀 ({(c2s>=0).mean():.0%}) · 행정동은 전부")
# 상권과 행정동 값 비교 (같은 셀에서)
cell=pd.DataFrame({"상권_코드":np.where(c2s>=0,SC[np.maximum(c2s,0)],-1),"행정동_코드":DC[c2d]})
pair=cell[cell.상권_코드>=0].drop_duplicates().merge(S25[["상권_코드","서비스_업종_코드","월매출"]],on="상권_코드").merge(
     D25[["행정동_코드","서비스_업종_코드","월매출"]],on=["행정동_코드","서비스_업종_코드"],suffixes=("_상권","_동"))
lr=np.log(pair.월매출_상권/pair.월매출_동)
print(f"   점검 ② 같은 셀의 상권 값 ÷ 행정동 값 — {len(pair):,}쌍, 중앙 ×{np.exp(np.median(lr)):.2f} · 4분위 ×{np.exp(np.percentile(lr,25)):.2f}~×{np.exp(np.percentile(lr,75)):.2f} · log 상관 {np.corrcoef(np.log(pair.월매출_상권),np.log(pair.월매출_동))[0,1]:.2f}")

# ── 업종 표
A=pd.read_csv(os.path.join(HERE,"..","업종별_잠식률.csv")).set_index("코드")
SV=pd.read_csv(os.path.join(RES,"업종별_생존.csv")).set_index("cat_s")
def wq(v,w,qs):
    o=np.argsort(v); v=np.asarray(v)[o]; w=np.asarray(w,float)[o]; cw=(np.cumsum(w)-w/2)/w.sum(); return np.interp(qs,cw,v)
QS=[0.05,0.1,0.25,0.5,0.75,0.9,0.95]; rows=[]
for k,d in S25.groupby("서비스_업종_코드"):
    grp=GRP[k[:3]]
    cap,note=CAP.get(k,("unk","외식 전체 평균(외식업체 경영실태조사 2024년 기준, 전국 연 2.55억 = 월 약 2,130만 원)과 견줘 크게 어긋나지 않습니다. 이 업종만의 외부 기준과는 맞춰 보지 못했습니다"
                        if grp=="외식" else "외부 자료와 맞춰 보지 못했습니다 — 수준은 참고만 하세요"))
    v,vsrc=V_DEFAULT[grp]; vsrc=vsrc+V_NOTE.get(k,""); tot=d.매출.sum(); ts=d.점포합.sum()
    sv=[{"code":cc,"nm":SV.loc[cc,"업종"],"S12":round(float(SV.loc[cc,"S12_추정"]),3),"S12lo":round(float(SV.loc[cc,"S12_하"]),3),"S12hi":round(float(SV.loc[cc,"S12_상"]),3),
         "close":round(float(SV.loc[cc,"기존_연폐업률"]),3)} for cc in XW.get(k,[]) if cc in SV.index]
    q=wq(d.월매출.values,d.점포합.values,QS)
    rows.append(dict(코드=k,업종=NAMES[k],분류=grp,상권칸=len(d),행정동칸=int((D25.서비스_업종_코드==k).sum()),점포분기=int(ts),
                     서울평균=tot/ts/3,**{f"p{int(a*100)}":b for a,b in zip(QS,q)},하루결제=d.건수.sum()/ts/91.25,객단가=tot/max(d.건수.sum(),1),
                     α=float(A.loc[k,"α"]) if k in A.index else ALPHA0,α출처="업종별 수축 추정" if k in A.index else "전체 평균 0.41",
                     포착=cap,포착근거=note,변동비율=v,변동비율출처=vsrc,생존=json.dumps(sv,ensure_ascii=False)))
U=pd.DataFrame(rows).sort_values(["분류","점포분기"],ascending=[True,False])
U.to_csv(os.path.join(OUT,"손익_업종.csv"),index=False,encoding="utf-8-sig")
print(f"\n업종 {len(U)}개 (제외 {len(EXCLUDE)}: {', '.join(NAMES[k] for k in EXCLUDE)}) — 결제 포착 ok {int((U.포착=='ok').sum())} · 낮게 잡힘 {int((U.포착=='low').sum())} · 검증 안 됨 {int((U.포착=='unk').sum())}")
show=U[U.업종.isin(["편의점","한식음식점","커피-음료","치킨전문점","제과점","미용실","세탁소","일반교습학원","슈퍼마켓","분식전문점"])]
print(show[["업종","상권칸","서울평균","p25","p50","p75","하루결제","객단가","α","포착"]].assign(서울평균=lambda z:(z.서울평균/1e4).round(0),
      p25=lambda z:(z.p25/1e4).round(0),p50=lambda z:(z.p50/1e4).round(0),p75=lambda z:(z.p75/1e4).round(0),하루결제=lambda z:z.하루결제.round(1),
      객단가=lambda z:z.객단가.round(-2),α=lambda z:z.α.round(2)).to_string(index=False))
print("   (월매출 단위 만 원)")

# 셀 덮기: 업종별로 상권 값이 있는 셀 비율, 없으면 행정동
cov=[]
for k in U.코드:
    s_ok=set(S25[S25.서비스_업종_코드==k].상권_코드); d_ok=set(D25[D25.서비스_업종_코드==k].행정동_코드)
    ins=np.array([(c2s[i]>=0 and SC[c2s[i]] in s_ok) for i in range(len(G))]); ind=np.array([DC[c2d[i]] in d_ok for i in range(len(G))])
    cov.append((ins.mean(),(ins|ind).mean()))
cov=np.array(cov); print(f"\n점검 ③ 셀 덮기 — 상권 값 있는 셀 업종 중앙 {np.median(cov[:,0]):.0%} · 상권 또는 행정동 값 있는 셀 중앙 {np.median(cov[:,1]):.0%} (최소 {cov[:,1].min():.0%})")

# ── 저장
keepS=["상권_코드","서비스_업종_코드","월매출","일건수","객단가","점포_Q4"]
S25.merge(pd.DataFrame({"상권_코드":SC,"상권명":[r["TRDAR_CD_N"] for r in trec],"상권구분":[r["TRDAR_SE_1"] for r in trec],"자치구":[r["SIGNGU_CD_"] for r in trec]}),on="상권_코드")\
   .assign(업종=lambda z:z.서비스_업종_코드.map(NAMES))[["상권_코드","상권명","상권구분","자치구","서비스_업종_코드","업종","월매출","일건수","객단가","점포_Q4"]]\
   .round({"월매출":0,"일건수":1,"객단가":0}).to_csv(os.path.join(OUT,"손익_상권업종.csv"),index=False,encoding="utf-8-sig")
D25.merge(pd.DataFrame({"행정동_코드":DC,"행정동":[r["ADSTRD_NM"] for r in drec]}),on="행정동_코드").assign(업종=lambda z:z.서비스_업종_코드.map(NAMES))\
   [["행정동_코드","행정동","서비스_업종_코드","업종","월매출","일건수","객단가","점포_Q4"]].round({"월매출":0,"일건수":1,"객단가":0})\
   .to_csv(os.path.join(OUT,"손익_행정동업종.csv"),index=False,encoding="utf-8-sig")
ki={k:i for i,k in enumerate(U.코드)}; si={c:i for i,c in enumerate(SC)}; di={c:i for i,c in enumerate(DC)}
pack=lambda d,key,ix: [[ix[getattr(r,key)],ki[r.서비스_업종_코드],int(round(r.월매출/1e3)),int(r.점포_Q4),int(round(r.일건수*10)),int(round(r.객단가/100))] for r in d.itertuples(index=False) if r.서비스_업종_코드 in ki]
IND=[{"k":r.코드,"nm":r.업종,"grp":r.분류,"v":r.변동비율,"vsrc":r.변동비율출처,"cap":r.포착,"capnote":r.포착근거,"alpha":round(r.α,3),"asrc":r.α출처,
      "mean":int(round(r.서울평균/1e3)),"q":[int(round(getattr(r,f"p{int(a*100)}")/1e3)) for a in QS],"tx":round(r.하루결제,1),"ticket":int(round(r.객단가/100)),
      "nS":int(r.상권칸),"surv":json.loads(r.생존)} for r in U.itertuples(index=False)]
BE={"meta":{"year":2025,"unit":"월매출 천 원 · 객단가 백 원 · 하루 결제 0.1건","qs":QS,"alpha0":ALPHA0,
            "card":[[3e8,0.004,0.0015],[5e8,0.01,0.0075],[1e9,0.0115,0.009],[3e9,0.0145,0.0115]],"card_src":"금융위원회 우대수수료율, 2025-08-14부터 (연매출 구간별 신용·체크)",
            "src":"서울시 상권분석서비스 추정매출 — 신한카드 결제액에 서울신용보증재단 보정비율을 적용한 추정치. 현금 포함 여부는 공개돼 있지 않다",
            "excluded":{NAMES[k]:v for k,v in EXCLUDE.items()}},
    "ind":IND,"sang":{"code":SC.tolist(),"nm":[r["TRDAR_CD_N"] for r in trec],"se":[r["TRDAR_SE_1"] for r in trec]},
    "dong":{"code":DC.tolist(),"nm":[r["ADSTRD_NM"] for r in drec]},"c2s":c2s.tolist(),"c2d":c2d.tolist(),
    "S":pack(S25,"상권_코드",si),"D":pack(D25,"행정동_코드",di)}
json.dump(BE,open(os.path.join(OUT,"breakeven_data.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(f"\n저장 → {OUT}: 손익_업종.csv · 손익_상권업종.csv · 손익_행정동업종.csv · breakeven_data.json ({os.path.getsize(os.path.join(OUT,'breakeven_data.json'))/1e6:.2f}MB)")
