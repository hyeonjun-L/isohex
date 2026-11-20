# -*- coding: utf-8 -*-
"""곳 이름 찾기 자료 — 서울시 상권 이름 · 법정동 이름을 격자 칸에 잇는다 (첫 화면 · 후보 찾기의 '곳 찾기').

행정동 · 역 이름으로만 찾던 것에 '가로수길' · '서촌' · '상수동' 같은 이름을 더한다. 값은 만들지 않는다 — 이름과 가서 설 칸 하나뿐이다.
입력
  결과/매출잠재_격자.csv   p18 (칸 중심 — 칸 순서의 기준, 웹 cells.json과 같은 순서)
  TRDAR_SHP                서울시 상권분석서비스(영역-상권) SHP (p19와 같다)
  argv[1]                  상가(상권)정보 그 분기 zip 또는 서울 CSV — 법정동 이름과 가게 좌표만 읽는다
출력 (OUT_DIR, 기본 ./결과)
  곳_이름.json  {"meta":…, "gu":[자치구…], "se":[상권 구분…], "sang":[[이름, 구분 번호, 자치구 번호, 칸]…], "bdong":[[법정동, 자치구 번호, 칸]…],
                 "cell":{"bd":[[법정동, 자치구 번호]…], "c":[칸마다 bd 번호]}}
                 cell = 칸이 든 법정동 — 자리 카드의 '근처 상가 매물' 링크(당근부동산 지역 주소가 법정동 이름)에 쓴다
정의
  상권 → 칸  중심이 상권 안에 든 칸 가운데 상권 무게중심에 가장 가까운 칸. 든 칸이 없으면 상권 안 한 점에서 가장 가까운 칸 — SANG_MAX m 넘게 떨어지면 뺀다
             '○○역 3번' 꼴(역 출구 이름 골목상권)은 뺀다 — 역 찾기와 겹친다
             순서: 발달상권 → 관광특구 → 전통시장 → 골목상권, 그 안에서는 넓은 상권 먼저 (같은 이름으로 걸리면 앞의 것이 먼저 나온다)
  법정동 → 칸  그 법정동 가게들의 가운데(경도 · 위도 중앙값)에서 가장 가까운 칸 — BD_MAX m 넘게 떨어지면 뺀다. 가게 BD_MIN곳 미만이면 뺀다
               자치구와 이름이 행정동과 똑같은 법정동은 뺀다 — 동 찾기에 이미 있다. 순서: 가게 많은 법정동 먼저
  칸 → 법정동  칸 안 가게들의 법정동 가운데 가장 많은 것. 가게가 없는 칸은 가게가 있는 가장 가까운 칸의 법정동
"""
import pandas as pd, numpy as np, sys, os, io, json, re, zipfile, hashlib, shapefile, h3
from shapely.geometry import shape, Point
from shapely import STRtree
from scipy.spatial import cKDTree
from pyproj import Transformer
HERE=os.path.dirname(os.path.abspath(__file__))
SHP=os.environ.get("TRDAR_SHP",os.path.join(HERE,"..","raw","서울시 상권분석서비스(영역-상권)","서울시 상권분석서비스(영역-상권)"))
RES=os.path.join(HERE,"결과"); OUT=os.environ.get("OUT_DIR",RES); os.makedirs(OUT,exist_ok=True)
SANG_MAX=400; BD_MAX=500; BD_MIN=10
src=sys.argv[1]

G=pd.read_csv(os.path.join(RES,"매출잠재_격자.csv"),usecols=["h3_9","lat","lon","행정동","자치구"])
to5181=Transformer.from_crs(4326,5181,always_xy=True).transform
gx,gy=to5181(G.lon.values,G.lat.values); gxy=np.c_[gx,gy]; tree=cKDTree(gxy)

# ── 상권
tsf=shapefile.Reader(SHP,encoding="utf-8"); trec=[r.as_dict() for r in tsf.records()]; tgeo=[shape(s.__geo_interface__) for s in tsf.shapes()]
pts=[Point(a,b) for a,b in gxy]; h=STRtree(tgeo).query(pts,predicate="within")
inside={}
for ci,si in zip(h[0],h[1]): inside.setdefault(int(si),[]).append(int(ci))
GU=sorted(G.자치구.unique()); gi={g:i for i,g in enumerate(GU)}; SE=["발달상권","골목상권","전통시장","관광특구"]
sang=[]; skip_exit=0; skip_far=0
for i,(r,g) in enumerate(zip(trec,tgeo)):
    nm=r["TRDAR_CD_N"].strip()
    if re.search(r"역\s*\d+번$",nm): skip_exit+=1; continue
    c=g.centroid
    if i in inside:
        cs=np.array(inside[i]); cell=int(cs[np.argmin(((gxy[cs]-[c.x,c.y])**2).sum(1))])
    else:
        p=g.representative_point(); d,cell=tree.query([p.x,p.y]); cell=int(cell)
        if d>SANG_MAX: skip_far+=1; continue
    sang.append([nm,SE.index(r["TRDAR_SE_1"]),gi[r["SIGNGU_CD_"]],cell,float(r["RELM_AR"])])
# 찾기 목록의 순서 — 같은 이름으로 걸리면 앞의 것이 먼저다: 발달상권 → 관광특구 → 전통시장 → 골목상권, 그 안에서는 넓은 상권 먼저
RANK={"발달상권":0,"관광특구":1,"전통시장":2,"골목상권":3}
sang=[r[:4] for r in sorted(sang,key=lambda r:(RANK[SE[r[1]]],-r[4],r[0]))]
print(f"상권 {len(trec):,} → {len(sang):,} (역 출구 이름 {skip_exit} · 칸에서 {SANG_MAX}m 넘음 {skip_far} 뺌)")

# ── 법정동
COLS=["시군구명","법정동명","경도","위도"]
if src.lower().endswith(".zip"):
    z=zipfile.ZipFile(src)
    def fix(n):
        try: return n.encode("cp437").decode("cp949")
        except Exception: return n
    name=[n for n in z.namelist() if "서울" in fix(n) and n.lower().endswith(".csv")][0]
    S=pd.read_csv(io.BytesIO(z.read(name)),usecols=COLS,encoding="utf-8",low_memory=False)
else:
    S=pd.read_csv(src,usecols=COLS,encoding="utf-8",low_memory=False)
S=S.dropna(subset=["법정동명","경도","위도"])
adm=set(zip(G.자치구,G.행정동))
bd=[]; small=0; far=0; same=0
for (gu,nm),d in S.groupby(["시군구명","법정동명"]):
    if len(d)<BD_MIN: small+=1; continue
    if (gu,nm) in adm: same+=1; continue
    x,y=to5181(d.경도.median(),d.위도.median()); dist,cell=tree.query([x,y])
    if dist>BD_MAX: far+=1; continue
    bd.append([nm,gi[gu],int(cell),len(d)])
bd=[r[:3] for r in sorted(bd,key=lambda r:(-r[3],r[0],r[1]))]   # 가게 많은 법정동 먼저 — 이름이 같은 '신정동'(양천구 · 마포구)은 큰 쪽이 앞
print(f"법정동 {S.groupby(['시군구명','법정동명']).ngroups} → {len(bd)} (가게 {BD_MIN}곳 미만 {small} · 행정동과 같은 이름 {same} · 칸에서 {BD_MAX}m 넘음 {far} 뺌)")
# ── 칸 → 법정동 (가게가 가장 많은 법정동, 가게 없는 칸은 가장 가까운 가게 있는 칸을 따른다)
ci={c:i for i,c in enumerate(G.h3_9.astype(str))}
S["칸"]=[ci.get(h3.latlng_to_cell(la,lo,9),-1) for la,lo in zip(S.위도.values,S.경도.values)]
T=S[S.칸>=0].groupby(["칸","시군구명","법정동명"]).size().rename("n").reset_index().sort_values(["칸","n","법정동명"],ascending=[True,False,True]).drop_duplicates("칸")
BD=sorted(set(zip(T.법정동명,T.시군구명)),key=lambda r:(r[1],r[0])); bi={b:i for i,b in enumerate(BD)}
own=np.full(len(G),-1); own[T.칸.values]=[bi[(a,b)] for a,b in zip(T.법정동명,T.시군구명)]
has=np.where(own>=0)[0]; _,nn=cKDTree(gxy[has]).query(gxy[own<0]); c2b=own.copy(); c2b[own<0]=own[has[nn]]
same_gu=np.mean([BD[c2b[q]][1]==G.자치구[q] for q in range(len(G))])
print(f"칸 → 법정동 {len(BD)}곳 — 가게로 정한 칸 {len(has):,} · 가까운 칸을 따른 칸 {int((own<0).sum()):,} · 칸의 자치구와 같은 몫 {same_gu:.1%}")
assert all(g in gi for _,g in BD), [g for _,g in BD if g not in gi]
# 칸 순서 확인용 — 내보내기(export_web.py)가 격자의 h3 목록 sha1과 맞춰 본다 (이동 그래프와 같은 방식)
h3sha=hashlib.sha1("\n".join(G.h3_9.astype(str)).encode()).hexdigest()
json.dump({"meta":{"sang":"서울시 상권분석서비스(영역-상권)","bdong":os.path.basename(src),"cells":len(G),"h3sha":h3sha},"gu":GU,"se":SE,"sang":sang,"bdong":bd,
           "cell":{"bd":[[n_,gi[g_]] for n_,g_ in BD],"c":c2b.tolist()}},
          open(os.path.join(OUT,"곳_이름.json"),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(f"저장 → {os.path.join(OUT,'곳_이름.json')} ({os.path.getsize(os.path.join(OUT,'곳_이름.json'))/1e3:.0f}KB)")
