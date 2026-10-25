# -*- coding: utf-8 -*-
"""매출 잠재 v2 — 묶음 업종을 더하고, 출근 도착을 행정동 안에서 종사자 격자(1km)로 나눈다 (마스터플랜 §5.11·다음 할 일 9).

v1(p16)에서 바꾼 것 두 가지
  ① 업종 — 상권분석 서비스 업종 하나가 상가정보 코드 여러 개에 걸치는 '묶음'(한식 14개 코드 · 일식 · 양식 · 패스트푸드 · 호프 ·
     일반의원 · 일반의류 · 예술학원 · 스포츠 강습 · 수산물 · 섬유제품)과 v1에서 빠졌던 1:1 업종(입시·교과학원 · 외국어학원 · 치과 ·
     한의원 · 반찬가게 · 정육점 · 서점 …)을 후보로 넣는다. 쓰기 전에 두 자료가 같은 가게를 세는지 본다 — 2025Q2 상권마다
     서울 '유사 업종 점포 수'와 상가정보 그 코드들의 점포 수(상권 경계 안)를 견줘 순위상관 0.6 이상 · 합계 비율 0.5~2배인 것만 쓴다
  ② 출근 도착 — v1은 행정동의 출근·등교 도착을 그 동 가게 둘레(300m) 100m 칸에 고르게 폈다. v2는 출근만 SGIS 1km 격자
     종사자 수에 비례해 편다(1km 칸 안에서는 고르게). 등교·기타는 v1 그대로
검정 — v1과 같은 틀: 자치구 하나를 통째로 빼고 학습해 그 구를 맞히는 교차검증(25겹), 업종별 기울기를 공통값 쪽으로 수축.
  A v1 다시(20개 업종) · B ②만(20개 업종) · C ①(늘린 업종, ②는 B가 나으면 같이). ②는 20개 업종에서 R²가 오르고
  순위상관 양수 업종이 줄지 않으면 쓴다. 늘린 업종은 업종마다 처음 보는 구의 순위상관이 한쪽 5%로 0보다 크면 지도에서 칠한다(p18 규칙)

입력  S(인자) poi_2025Q2.parquet · MASTER_DIR sgis100_seoul·dong_demand·cell_panel · TRDAR_SHP · SGIS1K(1km 종사자, 아래 load_workers_1k)
출력  OUT_DIR(기본 ./결과): 매출잠재_업종대응_v2.csv · 매출잠재_검정_v2.csv · 매출잠재_계수_수요만_v2.csv · 수요래스터_v2.npz (p18용)
      S: sales_potential_cells_v2.parquet"""
import pandas as pd, numpy as np, sys, os, warnings, shapefile, h3, json, zipfile, io, re, unicodedata, fnmatch
from shapely.geometry import shape, Point
from shapely import STRtree
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree
from scipy.stats import spearmanr
from pyproj import Transformer
import statsmodels.api as sm
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
S=sys.argv[1]; M=os.environ.get("MASTER_DIR",os.path.join(HERE,"..","master")); ALPHA,BETA,DMIN=0.41,1.216,0.05
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
OUT=os.environ.get("OUT_DIR",os.path.join(HERE,"결과")); os.makedirs(OUT,exist_ok=True)
QUICK=os.environ.get("QUICK")=="1"           # 점검용 — 교차검증을 공통 기울기만
STAGE=os.environ.get("STAGE","all")            # feat: 재료까지 계산해 저장 · cv: 저장한 재료로 검정만 · all
# 다시 맞출 때 (마스터플랜 W7.15) — 상가정보 스냅샷 · 매출 분기 · 업종 대응을 볼 분기를 바꿀 수 있다. 기본은 처음 판(2025)
POI=os.environ.get("POI","poi_2025Q2"); SALES_QS=os.environ.get("SALES_QS","20251,20252,20253,20254").split(","); XWQ=os.environ.get("XW_Q","20252")
print(f"상가정보 {POI} · 매출 분기 {'·'.join(SALES_QS)} · 업종 대응 {XWQ}")
CACHE=os.path.join(OUT,"_p26_재료.parquet"); CACHE_XW=os.path.join(OUT,"매출잠재_업종대응_v2.csv"); CACHE_NPZ=os.path.join(OUT,"_p26_수요래스터_둘.npz")

# ── 업종 대응: v1 20개 + 후보 (상가정보 2023 업종코드, 247개)
XW1={"CS100010":["I21201"],"CS300002":["G20405"],"CS300001":["G20404"],"CS200028":["S20701"],"CS200030":["S20702"],
     "CS200029":["S20703"],"CS100007":["I21006"],"CS100005":["I21001"],"CS100002":["I20201"],"CS100008":["I21007"],
     "CS300018":["G21501"],"CS300022":["G21503"],"CS200037":["R10407"],"CS200031":["S20901","S20902"],"CS300004":["G20802"],
     "CS200019":["R10406"],"CS200016":["R10310"],"CS300028":["G21901"],"CS300016":["G21602"],"CS300009":["G20506"]}
CAND={"CS100001":["I20101","I20102","I20103","I20104","I20105","I20106","I20107","I20108","I20109","I20110","I20111","I20112","I20113","I20199"],
      "CS100003":["I20301","I20302","I20303","I20399"], "CS100004":["I20401","I20402","I20403","I20499"],
      "CS100006":["I21003","I21004","I21005"], "CS100009":["I21103","I21104"],
      "CS200001":["P10501"], "CS200002":["P10615"], "CS200003":["P10609","P10611"], "CS200005":["P10601","P10603"],
      "CS200006":["Q10201","Q10202","Q10203","Q10204","Q10205","Q10206","Q10207","Q10208","Q10209","Q10212"],
      "CS200007":["Q10210"], "CS200008":["Q10211"], "CS200017":["R10311"], "CS200024":["R10307"],
      "CS200025":["S20301"], "CS200026":["S20302"], "CS200032":["S20501"], "CS200034":["I10102"],
      "CS300003":["G20801"], "CS300006":["G20501"], "CS300007":["G20503"], "CS300008":["G20504","G20505"], "CS300010":["G20509"],
      "CS300011":["G20901","G20902","G20905"], "CS300014":["G20910"], "CS300015":["G20911"], "CS300017":["G21701"],
      "CS300019":["G21502"], "CS300020":["G21301"], "CS300021":["G21302"], "CS300024":["G21304"], "CS300025":["G21305"],
      "CS300026":["G21306"], "CS300027":["G20906","G20909"], "CS300029":["G22001"], "CS300031":["G21101"],
      "CS300032":["G20803"], "CS300033":["G21001"], "CS300036":["G21201"]}
assert not set(CAND)&set(XW1) and len({c for v in list(CAND.values())+list(XW1.values()) for c in v})==sum(len(v) for v in list(CAND.values())+list(XW1.values())), "코드가 두 업종에 걸쳤다"
RHO_XW,RATIO_XW=0.6,(0.5,2.0)

FC=[f"a{t}_{k}" for t in "12" for k in ["거주","출근등교","기타"]]+["l_all300"]
if STAGE!="cv":
    # ── 100m 래스터와 수요 (p16과 같은 코드) + 출근을 종사자로 나누는 판
    T4=Transformer.from_crs(4326,5179,always_xy=True)
    snap=pd.read_parquet(f"{S}/{POI}.parquet",columns=["cat_s","h3_9","lon","lat","adm_cd"])
    g=pd.read_parquet(f"{M}/sgis100_seoul.parquet"); sx,sy=T4.transform(snap.lon.values,snap.lat.values)
    X0=min(g.x0.min(),sx.min())//100*100-500; Y0=min(g.y0.min(),sy.min())//100*100-500
    NX=int((max(g.x0.max(),sx.max())-X0)//100)+6; NY=int((max(g.y0.max(),sy.max())-Y0)//100)+6
    cell=lambda x,y:(((np.asarray(y)-Y0)//100).astype(int),((np.asarray(x)-X0)//100).astype(int))
    Dres=np.zeros((NY,NX)); i,j=cell(g.x0+50,g.y0+50); np.add.at(Dres,(i,j),g.인구.fillna(0).values)
    DD=pd.read_parquet(f"{M}/dong_demand.parquet"); DD.index=DD.index.astype(str)
    yy,xx=np.mgrid[0:NY,0:NX]; dist,nn=cKDTree(np.c_[sx,sy]).query(np.c_[X0+xx.ravel()*100+50,Y0+yy.ravel()*100+50])
    dong=pd.Series(np.where(dist<=300,snap.adm_cd.astype(str).values[nn],"")); cnt=dong[dong!=""].value_counts()
    def spread(v): per=(v/14)/cnt.reindex(v.index).fillna(np.inf); return dong.map(per).fillna(0).values.reshape(NY,NX)

    SGIS_ZIP=os.path.join(HERE,"..","..","국가데이터처_SGIS 격자 통계 및 경계_20250630.zip")
    def load_workers_1k():
        """SGIS 1km 격자 종사자 수(2024, 통계항목 to_em_020 총종사자수) → DataFrame(x0, y0, 종사자) — EPSG:5179 1km 칸 좌하단.
        SGIS1K = 그 CSV 경로(기본: isohex의 'SGIS 격자 통계 및 경계' zip 안 '4. 2024년 격자통계(사업체, 종사자)/종사자(대분류)/2024년_종사자_다사_1K.csv', cp949)
        격자코드 '다사5452' → x0 = (7 + '가나다라마바사아'.index('다'))×100000 + 54×1000 = 954000, y0 = (13 + index('사'))×100000 + 52×1000 = 1952000"""
        f=os.environ.get("SGIS1K")
        if f and f.lower().endswith(".csv"): raw=open(f,"rb").read()
        else:
            z=zipfile.ZipFile(f or SGIS_ZIP); hit=None
            for zi in z.infolist():
                nm=zi.filename
                try: nm=nm.encode("cp437").decode("cp949")
                except Exception: pass
                if unicodedata.normalize("NFC",nm).endswith("종사자(대분류)/2024년_종사자_다사_1K.csv"): hit=zi
            assert hit is not None, "zip 안에 2024년_종사자_다사_1K.csv가 없다"
            raw=z.read(hit)
        t=pd.read_csv(io.BytesIO(raw),encoding="cp949",dtype=str); t.columns=["연도","격자코드","항목","값"]
        t=t[t.항목=="to_em_020"].copy(); t["종사자"]=pd.to_numeric(t.값,errors="raise")
        L="가나다라마바사아"
        t["x0"]=[(7+L.index(c[0]))*100000+int(c[2:4])*1000 for c in t.격자코드]; t["y0"]=[(13+L.index(c[1]))*100000+int(c[4:6])*1000 for c in t.격자코드]
        return t[["격자코드","x0","y0","종사자"]].reset_index(drop=True)

    def alloc(v,W):
        """행정동 값 v를 v1과 같은 칸(그 동 가게 둘레 300m)에 W(100m 래스터 가중치)에 비례해 편다. 동 안 W 합이 0이면 고르게"""
        w=W.ravel(); key=dong.values; m=key!=""
        tot=pd.Series(w[m]).groupby(key[m]).sum(); n=pd.Series(1,index=np.arange(m.sum())).groupby(key[m]).sum()
        out=np.zeros(NY*NX); vv=(v/14).reindex(tot.index).fillna(0)
        share=np.where(tot.reindex(key[m]).values>0, w[m]/np.maximum(tot.reindex(key[m]).values,1e-12), 1/n.reindex(key[m]).values)
        out[m]=vv.reindex(key[m]).values*share; return out.reshape(NY,NX)

    WK=load_workers_1k()
    Wr=np.zeros((NY,NX))                                   # 1km 칸의 종사자를 그 안 100m 칸 100개에 고르게
    for x0,y0,e in WK[["x0","y0","종사자"]].itertuples(index=False):
        i0,j0=cell(x0+50,y0+50); i0,j0=int(i0),int(j0)
        a,b=max(i0,0),min(i0+10,NY); c,d=max(j0,0),min(j0+10,NX)
        if a<b and c<d: Wr[a:b,c:d]+=e/100
    print(f"SGIS 1km 종사자 {len(WK):,}칸 · 합 {WK.종사자.sum():,.0f} · 래스터에 실린 합 {Wr.sum():,.0f}")
    DV1={"거주":Dres,"출근등교":spread(DD.출근+DD.등교),"기타":spread(DD.기타)}
    DV2={"거주":Dres,"출근등교":alloc(DD.출근,Wr)+spread(DD.등교),"기타":DV1["기타"]}
    print(f"출근·등교 래스터 합 v1 {DV1['출근등교'].sum():,.0f} · v2 {DV2['출근등교'].sum():,.0f} (같아야 한다)")
    ky,kx=np.mgrid[-(NY-1):NY,-(NX-1):NX]; K=np.maximum(np.hypot(ky,kx)*0.1,DMIN)**(-BETA)
    ACC1={k:fftconvolve(D,K,mode="same") for k,D in DV1.items()}
    ACC2={"거주":ACC1["거주"],"출근등교":fftconvolve(DV2["출근등교"],K,mode="same"),"기타":ACC1["기타"]}

    # ── 상권 경계와 점포
    sf=shapefile.Reader(SHP,encoding="utf-8"); recs=[r.as_dict() for r in sf.records()]
    codes=np.array([int(r["TRDAR_CD"]) for r in recs]); gu_of=pd.Series([str(r["ADSTRD_CD"])[:5] for r in recs],index=codes)
    adm_of=pd.Series([str(r["ADSTRD_CD"]) for r in recs],index=codes)
    tree=STRtree([shape(s.__geo_interface__) for s in sf.shapes()])
    ALLC={c for v in list(XW1.values())+list(CAND.values()) for c in v}
    p=snap[snap.cat_s.isin(ALLC)].reset_index(drop=True)
    x5,y5=Transformer.from_crs(4326,5181,always_xy=True).transform(p.lon.values,p.lat.values)
    hit=tree.query([Point(a,b) for a,b in zip(x5,y5)],predicate="within"); p["상권"]=-1; p.loc[hit[0],"상권"]=codes[hit[1]]

    # ── ① 업종 대응 점검 — 2025Q2 상권마다 점포 수
    c=pd.read_parquet(f"{M}/cell_panel.parquet")
    q2=c[c.기준_년분기_코드.astype(str)==XWQ].groupby(["상권_코드","서비스_업종_코드"]).유사_업종_점포_수.sum()
    NMS=c.drop_duplicates("서비스_업종_코드").set_index("서비스_업종_코드").서비스_업종_코드_명
    rows=[]
    for k,cs in list(XW1.items())+list(CAND.items()):
        a=q2.xs(k,level=1) if k in q2.index.get_level_values(1) else pd.Series(dtype=float); a.index=a.index.astype("int64")
        b=p[(p.상권>=0)&p.cat_s.isin(cs)].groupby("상권").size()
        z=pd.concat([a.rename("서울"),b.rename("상가")],axis=1).reindex(codes).fillna(0); z=z[(z.서울>0)|(z.상가>0)]
        rho=spearmanr(z.서울,z.상가).correlation if len(z)>=20 else np.nan; ratio=z.상가.sum()/max(z.서울.sum(),1)
        ok=(k in XW1) or (rho>=RHO_XW and RATIO_XW[0]<=ratio<=RATIO_XW[1])
        rows.append(dict(서비스_업종_코드=k,업종=NMS.get(k,k),상가코드=";".join(cs),코드수=len(cs),종류="v1" if k in XW1 else ("묶음" if len(cs)>1 else "1:1"),
                         상권수=len(z),서울점포=int(z.서울.sum()),상가점포=int(z.상가.sum()),합계비율=round(ratio,2),순위상관=round(rho,3) if rho==rho else np.nan,쓴다=ok))
    XWT=pd.DataFrame(rows); XW={r.서비스_업종_코드:r.상가코드.split(";") for r in XWT.itertuples() if r.쓴다}
    print("\n① 업종 대응 — 2025Q2 상권마다 서울 '유사 업종 점포 수'와 상가정보 점포 수 (상권 경계 안)")
    print(XWT.drop(columns=["상가코드"]).to_string(index=False))
    print(f"   → v1 {len(XW1)}개 + 새로 쓰는 업종 {len(XW)-len(XW1)}개 (기준: 순위상관 ≥ {RHO_XW} · 합계 비율 {RATIO_XW[0]}~{RATIO_XW[1]})")

    # ── 재료 — 상권 안 그 업종 점포 위치에서 잰 값의 상권 평균 (p16과 같은 정의)
    inv={cc:k for k,v in XW.items() for cc in v}
    p=p[p.cat_s.isin(inv)&(p.상권>=0)].reset_index(drop=True); p["svc"]=p.cat_s.map(inv)
    mxy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
    p["all300"]=cKDTree(mxy(snap)).query_ball_point(mxy(p),300,return_length=True)-1
    lat,lon=np.array([h3.cell_to_latlng(cc) for cc in p.h3_9]).T; p["ci"],p["cj"]=cell(*T4.transform(lon,lat))
    for tag,AC in [("1",ACC1),("2",ACC2)]:
        for k in AC: p[f"a{tag}_{k}"]=np.log(np.maximum(AC[k][p.ci,p.cj],1e-9))
    p["l_all300"]=np.log1p(p.all300)
    d=p.groupby(["상권","svc"])[FC].mean().reset_index()
    s=c[c.기준_년분기_코드.astype(str).isin(SALES_QS)&c.서비스_업종_코드.isin(XW)]
    s=s.groupby(["상권_코드","서비스_업종_코드"]).agg(매출=("당월_매출_금액","sum"),점포=("유사_업종_점포_수","sum"),공개=("당월_매출_금액",lambda v:(v>0).sum())).reset_index()
    s=s[(s.공개==len(SALES_QS))&(s.점포>0)]; s["y"]=np.log(s.매출/s.점포)
    d=d.merge(s,left_on=["상권","svc"],right_on=["상권_코드","서비스_업종_코드"]).dropna(subset=FC+["y"]).reset_index(drop=True)
    d["gu"]=d.상권.map(gu_of).values; d["adm"]=d.상권.map(adm_of).values; d["업종"]=d.svc.map(NMS)
    print(f"\n상권×업종 {len(d):,}칸 · 업종 {d.svc.nunique()} (v1 20개 업종 {d.svc.isin(XW1).sum():,}칸) · 자치구 {d.gu.nunique()}")

    # 재료 저장 — STAGE=cv에서 다시 쓴다 (Mac 한 번 호출 180초 제한)
    d.to_parquet(CACHE,index=False); XWT.to_csv(CACHE_XW,index=False,encoding="utf-8-sig")
    np.savez_compressed(CACHE_NPZ,X0=X0,Y0=Y0,NX=NX,NY=NY,**{f"A1_{k}":v.astype(np.float32) for k,v in ACC1.items()},**{f"A2_{k}":v.astype(np.float32) for k,v in ACC2.items()})
    if STAGE=="feat": print("재료 저장:",CACHE); sys.exit(0)
else:
    d=pd.read_parquet(CACHE); XWT=pd.read_csv(CACHE_XW,dtype={"상가코드":str,"서비스_업종_코드":str}); XW={r.서비스_업종_코드:r.상가코드.split(";") for r in XWT.itertuples() if r.쓴다}
    Z=np.load(CACHE_NPZ); X0,Y0,NX,NY=[Z[k].item() for k in ("X0","Y0","NX","NY")]
    ACC1={k:Z["A1_"+k] for k in ["거주","출근등교","기타"]}; ACC2={k:Z["A2_"+k] for k in ["거주","출근등교","기타"]}
    print(f"저장한 재료로 검정 — 상권×업종 {len(d):,}칸 · 업종 {d.svc.nunique()}")

def fit(tr,cols,mode):
    """업종 안 편차로 기울기 추정. mode='pool' 공통 / 'eb' 업종별을 공통값 쪽으로 수축 (p16과 같다)"""
    mu=tr.groupby("svc")[cols+["y"]].mean()
    Z=tr[cols+["y"]]-mu.loc[tr.svc].values
    Xp=Z[cols].values; bp=np.linalg.lstsq(Xp,Z.y.values,rcond=None)[0]
    B={k:bp for k in mu.index}
    if mode=="eb" and cols:
        est,var={},{}
        for k,ix in tr.groupby("svc").indices.items():
            X=Xp[ix]; yv=Z.y.values[ix]
            if len(ix)<len(cols)+5: continue
            bk=np.linalg.lstsq(X,yv,rcond=None)[0]; r=yv-X@bk; s2=r@r/(len(ix)-len(cols))
            est[k]=bk; var[k]=np.diag(np.linalg.pinv(X.T@X))*s2
        if len(est)>=3:
            E=np.array(list(est.values())); V=np.array(list(var.values())); W=1/V
            m=(W*E).sum(0)/W.sum(0); Q=(W*(E-m)**2).sum(0); dfree=len(E)-1
            tau2=np.maximum(0,(Q-dfree)/(W.sum(0)-(W**2).sum(0)/W.sum(0)))
            for k in est:
                w=tau2/(tau2+var[k]); B[k]=bp+w*(est[k]-bp)
    return mu,B
def cv(D,cols,mode):
    pred=np.full(len(D),np.nan); base=np.full(len(D),np.nan)
    for gname,te in D.groupby("gu").indices.items():
        tr=D.drop(index=D.index[te]); mu,B=fit(tr,cols,mode); t=D.iloc[te]
        ok=t.svc.isin(mu.index).values; t=t[ok]; idx=np.array(te)[ok]
        base[idx]=mu.loc[t.svc,"y"].values
        pred[idx]=base[idx]+np.einsum("ij,ij->i",(t[cols].values-mu.loc[t.svc,cols].values),np.vstack([B[k] for k in t.svc]))
    m=~np.isnan(pred); y=D.y.values
    r2=1-((y[m]-pred[m])**2).sum()/((y[m]-base[m])**2).sum()
    rho=D[m].assign(p=pred[m]).groupby("svc").apply(lambda z: spearmanr(z.p,z.y).correlation if len(z)>=20 else np.nan)
    n=D[m].groupby("svc").size()
    return r2,rho,n,pred,base
C1=["a1_거주","a1_출근등교","a1_기타","l_all300"]; C2=["a2_거주","a2_출근등교","a2_기타","l_all300"]
mode="pool" if QUICK else "eb"
d20=d[d.svc.isin(XW1)].reset_index(drop=True)
print("\n② 자치구 제외 교차검증 (업종별 수축)")
res={}
for lab,D,cols in [("A v1 다시 — 20개 업종 · 출근 고르게",d20,C1),("B 출근을 종사자로 — 20개 업종",d20,C2)]:
    r2,rho,n,_,_=cv(D,cols,mode); res[lab]=(r2,rho,n)
    print(f"   {lab:<34} R² {r2:.3f} · 순위상관 > 0 {int((rho>0).sum())}/{int(rho.notna().sum())}")
rA,rB=res["A v1 다시 — 20개 업종 · 출근 고르게"],res["B 출근을 종사자로 — 20개 업종"]
ALLOC=os.environ.get("ALLOC","auto")   # auto = 규칙대로 · 종사자/고르게 = 고정. 다시 맞출 때 R²가 거의 같으면 판마다 뒤집히지 않게 고정한다 (W7.15)
useB=((rB[0]>rA[0]) and ((rB[1]>0).sum()>=(rA[1]>0).sum())) if ALLOC=="auto" else (ALLOC=="종사자")
CC=C2 if useB else C1
print(f"   R² A {rA[0]:.5f} · B {rB[0]:.5f}")
print(f"   → 출근 배분: {'종사자 (B)' if useB else '고르게 (A, v1 그대로)'}{' — 고정(ALLOC)' if ALLOC!='auto' else ''}")
r2C,rhoC,nC,predC,baseC=cv(d,CC,mode)
m20=~np.isnan(predC)&d.svc.isin(XW1).values; yv=d.y.values
r2C20=1-((yv[m20]-predC[m20])**2).sum()/((yv[m20]-baseC[m20])**2).sum()       # 업종을 늘리면 수축의 공통값이 바뀐다 — v1 20개 업종에 무슨 일이 생기나
print(f"   C 늘린 업종 {d.svc.nunique()}개 · {'종사자' if useB else '고르게'}    R² {r2C:.3f} (그중 v1 20개 업종 {r2C20:.3f}) · 순위상관 > 0 {int((rhoC>0).sum())}/{int(rhoC.notna().sum())}")

# 업종별 — 처음 보는 구의 순위상관과 '칠함' 기준(한쪽 5%: ρ > 1.645/√(n−1))
mu,B=fit(d,CC,"eb")
T=pd.DataFrame({k:B[k] for k in B},index=CC).T.round(2); T.columns=["a_거주","a_출근등교","a_기타","l_all300"]
T.insert(0,"칸",d.groupby("svc").size()); T.insert(0,"업종",d.groupby("svc").업종.first())
T["순위상관(교차검증)"]=rhoC.round(2); T["칠함"]=[bool(r>1.645/np.sqrt(n-1)) if r==r else False for r,n in zip(rhoC.reindex(T.index),nC.reindex(T.index))]
T["종류"]=["v1" if k in XW1 else ("묶음" if len(XW[k])>1 else "1:1") for k in T.index]
T["상가코드"]=[";".join(XW[k]) for k in T.index]
print("\n③ 업종별 계수(수축)와 처음 보는 구의 순위상관"); print(T.drop(columns=["상가코드"]).sort_values("순위상관(교차검증)",ascending=False).to_string())
print(f"   칠하는 업종 {int(T.칠함.sum())}개 (v1 20개 중 {int(T[T.종류=='v1'].칠함.sum())} · 새 업종 {int(T[T.종류!='v1'].칠함.sum())})")

# ── 저장
T.reset_index().rename(columns={"index":"svc"}).to_csv(os.path.join(OUT,"매출잠재_계수_수요만_v2.csv"),index=False,encoding="utf-8-sig")
XWT.to_csv(os.path.join(OUT,"매출잠재_업종대응_v2.csv"),index=False,encoding="utf-8-sig")
pd.DataFrame([dict(판=k,R2=round(v[0],4),순위상관양수=int((v[1]>0).sum()),업종=int(v[1].notna().sum())) for k,v in res.items()]+
             [dict(판=f"C 늘린 업종 · {'종사자' if useB else '고르게'}",R2=round(r2C,4),순위상관양수=int((rhoC>0).sum()),업종=int(rhoC.notna().sum())),
              dict(판="C 중 v1 20개 업종",R2=round(r2C20,4),순위상관양수=int((rhoC.reindex(list(XW1))>0).sum()),업종=int(rhoC.reindex(list(XW1)).notna().sum()))]).to_csv(os.path.join(OUT,"매출잠재_검정_v2.csv"),index=False,encoding="utf-8-sig")
keep=["상권","svc","업종","gu","adm","y"]+FC
dd=d[keep].copy()
for k in ["거주","출근등교","기타"]: dd["a_"+k]=dd[("a2_" if useB else "a1_")+k]
dd.to_parquet(f"{S}/sales_potential_cells_v2.parquet",index=False)
AC=ACC2 if useB else ACC1
np.savez_compressed(os.path.join(OUT,"수요래스터_v2.npz"),X0=X0,Y0=Y0,NX=NX,NY=NY,거주=AC["거주"].astype(np.float32),출근등교=AC["출근등교"].astype(np.float32),기타=AC["기타"].astype(np.float32),
                    alloc=np.array("종사자" if useB else "고르게"))
json.dump({"sales_qs":SALES_QS,"poi":POI,"xw_q":XWQ,"alloc":"종사자" if useB else "고르게","made":pd.Timestamp.now().strftime("%Y-%m-%d")},
          open(os.path.join(OUT,"매출잠재_판.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)   # p18 → 웹 자료 manifest가 학습 기간을 적는다 (W7.15)
print("\n저장:",OUT)
