# -*- coding: utf-8 -*-
"""손님 구성 — 상권·행정동 × 서비스 업종의 2025년 매출을 요일 · 시간대 · 성별 · 연령대로 나눈 몫과 가게 드나듦(개업 · 폐업 · 프랜차이즈) (2026-11-20 전체 검토 3번).

자리 카드의 '이 동네 손님은'에 쓴다 — 영업시간(언제 팔리나)과 손님(누가 사나)을 정할 때 바로 보는 숫자. 손익 점검과 같은 칸만 싣는다:
p19(breakeven_data.json)가 남긴 상권·행정동 × 업종(2025 네 분기 매출이 모두 공개된 곳). 지역 번호 · 업종 순서도 p19와 같다.
입력
  결과/breakeven_data.json  p19 — 상권 · 행정동 코드 순서, 업종 순서, 남긴 칸(S · D 행)
  SANG_ZIP   추정매출-상권 2025 (연도 파일 zip, 기본: 저장소 '서울시 상권분석 서비스/…(추정매출-상권)/…_2025년.zip')
  RAW_DIR    추정매출-행정동 · 점포-행정동 2025 (p19와 같은 곳)
  MASTER_DIR store.parquet — 상권 점포(개업 · 폐업 · 프랜차이즈)
출력 (OUT_DIR, 기본 ./결과)
  손님_구성.json {"meta":…, "ind":{업종:{"seoul":[…], "S":[[상권 번호, …]…], "D":[[행정동 번호, …]…]}}}
  한 줄 = [지역, 주말%, 시간대% 여섯(0~6 · 6~11 · 11~14 · 14~17 · 17~21 · 21~24시), 여성%, 연령대% 여섯(10 · 20 · 30 · 40 · 50 · 60대 이상),
           개업 수, 폐업 수(2025 네 분기 합), 평균 가게 수 ×10, 프랜차이즈%(2025Q4, 가게 없으면 −1)]
  seoul = 같은 순서에서 지역을 뺀 것 — 서울 행정동 전부를 더한 값. 개업 · 폐업은 가게 100곳당(한 해)
정의
  몫은 정수 % — 매출 금액으로 나눈다(건수가 아니라). 시간대 · 연령대는 그 묶음의 합으로, 성별은 남 + 여로 나눈다(법인카드 등 주인을 모르는 결제는 빠진다)
  '주말' = 토 · 일 매출 ÷ 당월 매출. 한 묶음의 합이 0이면 그 묶음은 −1
점검: 몫의 합(시간대 · 연령대가 100 ± 3) · 상권 행 수가 p19 S 행과 같은가 · 망리단길 카페 같은 몇 곳을 찍어 본다"""
import pandas as pd, numpy as np, sys, os, io, glob, json, zipfile
HERE=os.path.dirname(os.path.abspath(__file__))
M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master"))
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
RAW=os.environ.get("RAW_DIR",os.path.dirname(os.path.dirname(SHP)))
SANG_ZIP=os.environ.get("SANG_ZIP",os.path.join(HERE,"..","..","서울시 상권분석 서비스","서울시 상권분석서비스(추정매출-상권)","서울시 상권분석서비스(추정매출-상권)_2025년.zip"))
RES=os.path.join(HERE,"결과"); OUT=os.environ.get("OUT_DIR",RES); os.makedirs(OUT,exist_ok=True)
YEAR="2025"
TB=["00~06","06~11","11~14","14~17","17~21","21~24"]; AG=["10","20","30","40","50","60_이상"]
AMT=["당월_매출_금액","주말_매출_금액"]+[f"시간대_{t}_매출_금액" for t in TB]+["남성_매출_금액","여성_매출_금액"]+[f"연령대_{a}_매출_금액" for a in AG]

def rd(src,cols,name=None):
    if src.lower().endswith(".zip"):
        z=zipfile.ZipFile(src); n=name or [i.filename for i in z.infolist() if i.filename.lower().endswith(".csv")][0]; raw=z.read(n)
    else: raw=open(src,"rb").read()
    for e in ("cp949","utf-8-sig","utf-8"):
        try: d=pd.read_csv(io.BytesIO(raw),encoding=e,usecols=cols,low_memory=False); d.columns=[c.strip('"') for c in d.columns]; return d
        except (UnicodeDecodeError,ValueError): pass
    raise ValueError(src)

B=json.load(open(os.path.join(RES,"breakeven_data.json"),encoding="utf-8"))
K=[d["k"] for d in B["ind"]]; SC=B["sang"]["code"]; DC=B["dong"]["code"]
keepS={(r[0],r[1]) for r in B["S"]}; keepD={(r[0],r[1]) for r in B["D"]}       # (지역 번호, 업종 번호)
si={int(c):i for i,c in enumerate(SC)}; di={str(c):i for i,c in enumerate(DC)}; ki={k:i for i,k in enumerate(K)}

def shares(g):
    """금액 합 → 몫 줄 (지역 · 가게 수는 뒤에서 붙인다)"""
    tot=g["당월_매출_금액"]; t=g[[f"시간대_{x}_매출_금액" for x in TB]].values; a=g[[f"연령대_{x}_매출_금액" for x in AG]].values
    mf=g["남성_매출_금액"]+g["여성_매출_금액"]
    pct=lambda num,den: np.where(den>0,np.rint(num/np.where(den>0,den,1)*100),-1).astype(int)
    out=np.c_[pct(g["주말_매출_금액"].values,tot.values),
              pct(t,t.sum(1,keepdims=True).repeat(len(TB),1)),
              pct(g["여성_매출_금액"].values,mf.values),
              pct(a,a.sum(1,keepdims=True).repeat(len(AG),1))]
    return out

def mix(sales,stores,key,keep,ix):
    s=sales[sales.기준_년분기_코드.astype(str).str.startswith(YEAR)]
    g=s.groupby([key,"서비스_업종_코드"])[AMT].sum().reset_index()
    g["r"]=g[key].map(ix); g["k"]=g.서비스_업종_코드.map(ki)
    g=g[g.r.notna()&g.k.notna()].copy(); g["r"]=g.r.astype(int); g["k"]=g.k.astype(int)
    g=g[[ (a,b) in keep for a,b in zip(g.r,g.k)]].reset_index(drop=True)
    sh=shares(g)
    t=stores[stores.기준_년분기_코드.astype(str).str.startswith(YEAR)]
    o=t.groupby([key,"서비스_업종_코드"]).agg(개업=("개업_점포_수","sum"),폐업=("폐업_점포_수","sum"),가게=("유사_업종_점포_수","mean")).reset_index()
    q4=t[t.기준_년분기_코드.astype(str)==f"{YEAR}4"].groupby([key,"서비스_업종_코드"])[["프랜차이즈_점포_수","유사_업종_점포_수"]].sum().reset_index()
    g=g.merge(o,on=[key,"서비스_업종_코드"],how="left").merge(q4,on=[key,"서비스_업종_코드"],how="left")
    fr=np.where(g.유사_업종_점포_수.fillna(0)>0,np.rint(g.프랜차이즈_점포_수.fillna(0)/g.유사_업종_점포_수.where(g.유사_업종_점포_수>0,1)*100),-1).astype(int)
    rows={}
    for q in range(len(g)):
        rows.setdefault(int(g.k[q]),[]).append([int(g.r[q])]+sh[q].tolist()+[int(g.개업.fillna(0)[q]),int(g.폐업.fillna(0)[q]),int(round(float(g.가게.fillna(0)[q])*10)),int(fr[q])])
    return rows,len(g)

# ── 상권
SS=rd(SANG_ZIP,["기준_년분기_코드","상권_코드","서비스_업종_코드"]+AMT); SS["상권_코드"]=SS.상권_코드.astype(int)
ST=pd.read_parquet(f"{M}/store.parquet",columns=["기준_년분기_코드","상권_코드","서비스_업종_코드","유사_업종_점포_수","개업_점포_수","폐업_점포_수","프랜차이즈_점포_수"])
ST["상권_코드"]=ST.상권_코드.astype(int)
RS,nS=mix(SS,ST,"상권_코드",keepS,si)
# ── 행정동
fs=glob.glob(os.path.join(RAW,f"*추정매출-행정동*{YEAR}*","*.csv")); ft=glob.glob(os.path.join(RAW,f"*점포-행정동*{YEAR}*","*.csv"))
assert fs and ft, "행정동 원본 없음"
DS=rd(fs[0],["기준_년분기_코드","행정동_코드","서비스_업종_코드"]+AMT); DS["행정동_코드"]=DS.행정동_코드.astype(str)
DT=rd(ft[0],["기준_년분기_코드","행정동_코드","서비스_업종_코드","유사_업종_점포_수","개업_점포_수","폐업_점포_수","프랜차이즈_점포_수"]); DT["행정동_코드"]=DT.행정동_코드.astype(str)
RD,nD=mix(DS,DT,"행정동_코드",keepD,di)
print(f"상권×업종 {nS:,}줄 (p19 {len(B['S']):,}) · 행정동×업종 {nD:,}줄 (p19 {len(B['D']):,})")
assert nS==len(B["S"]) and nD==len(B["D"]), "p19가 남긴 칸과 수가 다르다"

# ── 서울 (행정동 전부) — 같은 순서, 개업 · 폐업은 가게 100곳당
Y=DS[DS.기준_년분기_코드.astype(str).str.startswith(YEAR)].groupby("서비스_업종_코드")[AMT].sum().reset_index()
Ysh=shares(Y); T=DT[DT.기준_년분기_코드.astype(str).str.startswith(YEAR)]
seoul={}
for q,k in enumerate(Y.서비스_업종_코드):
    if k not in ki: continue
    t=T[T.서비스_업종_코드==k]; avg=t.groupby("기준_년분기_코드").유사_업종_점포_수.sum().mean(); q4=t[t.기준_년분기_코드.astype(str)==f"{YEAR}4"]
    fr=int(round(q4.프랜차이즈_점포_수.sum()/q4.유사_업종_점포_수.sum()*100)) if q4.유사_업종_점포_수.sum()>0 else -1
    seoul[ki[k]]=Ysh[q].tolist()+[round(t.개업_점포_수.sum()/avg*100,1) if avg>0 else -1,round(t.폐업_점포_수.sum()/avg*100,1) if avg>0 else -1,fr]

# ── 점검
allr=[r for d in (RS,RD) for v in d.values() for r in v]
ts=np.array([sum(r[2:8]) for r in allr if r[2]>=0]); ag=np.array([sum(r[9:15]) for r in allr if r[9]>=0])
print(f"몫의 합 — 시간대 {ts.min()}~{ts.max()} · 연령대 {ag.min()}~{ag.max()} (100 ± 3이면 반올림)")
assert ts.min()>=97 and ts.max()<=103 and ag.min()>=97 and ag.max()<=103
miss=sum(1 for r in allr if min(r[1],r[2],r[8],r[9])<0); print(f"묶음 합이 0인 줄 {miss}")
nm={d["k"]:d["nm"] for d in B["ind"]}
def show(k,sn):
    i=ki[k]; s=B["sang"]["nm"].index(sn); r=[x for x in RS.get(i,[]) if x[0]==s]
    print(f"   {sn} · {nm[k]}: {r[0][1:] if r else '없음'}  | 서울 {seoul[i]}")
show("CS100010","망리단길"); show("CS100010","가로수길"); show("CS100009","망리단길") if "CS100009" in ki else None; show("CS200028","성수동카페거리")
ind={K[i]:{"seoul":seoul.get(i),"S":sorted(RS.get(i,[])),"D":sorted(RD.get(i,[]))} for i in range(len(K))}
json.dump({"meta":{"year":int(YEAR),"cols":["region","weekend","t0006","t0611","t1114","t1417","t1721","t2124","female","a10","a20","a30","a40","a50","a60","open","close","n10","fr"],
                   "seoul_cols":"같은 순서에서 region을 빼고 open · close는 가게 100곳당, n10은 없다",
                   "src":"서울시 상권분석서비스 추정매출(요일 · 시간대 · 성별 · 연령대 금액) · 점포(개업 · 폐업 · 프랜차이즈) — 2025년 네 분기"},
           "ind":ind},open(os.path.join(OUT,"손님_구성.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(f"저장 → {os.path.join(OUT,'손님_구성.json')} ({os.path.getsize(os.path.join(OUT,'손님_구성.json'))/1e6:.2f}MB)")
