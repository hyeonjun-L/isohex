# -*- coding: utf-8 -*-
"""매출 잠재 지도 뷰어 조립 — template.html + ol-10.10.0.css + p18 산출(viewer_data.json, 매출잠재_격자.csv의 h3 id) + p19 산출(breakeven_data.json, 손익 점검) + p20 산출(entry_data.json, 개업) + p21 산출(무인_업종.csv·무인_검정.csv, 무인 가게 칸) + p22 산출(무인_브랜드*.csv, 손익 점검의 무인 유형) + p23·p24 산출(이동_그래프.json·후보_조건.json, 후보 찾기) + p25 산출(임대시세_데이터.json, 행정동 임대시세)

사용:  python3 build_viewer.py [p18 결과 폴더]      (기본 ../analysis/panel/결과)
출력:  매출잠재_지도.html   — 전체 문서. 브라우저로 바로 연다 (OpenLayers 10.10.0은 jsDelivr, 글꼴은 Google Fonts에서 받는다)
       게시용_본문.html     — Claude Artifact 게시용 (doctype·head 없이 본문만; 게시할 때 골격이 씌워진다)"""
import json, csv, sys, os, base64, struct, hashlib
H=os.path.dirname(os.path.abspath(__file__))
R=sys.argv[1] if len(sys.argv)>1 else os.path.join(H,"..","analysis","panel","결과")
RDIR=R                 # 결과 폴더 (아래 버스 점검에서 R을 다른 뜻으로 다시 쓴다)
VD=json.load(open(os.path.join(R,"viewer_data.json"),encoding="utf-8"))
h3=[r["h3_9"] for r in csv.DictReader(open(os.path.join(R,"매출잠재_격자.csv"),encoding="utf-8-sig"))]
assert len(h3)==VD["meta"]["cells"], "격자 CSV와 뷰어 데이터의 셀 수가 다르다 — p18을 다시 돌릴 것"
VD["h3"]=h3
bep=os.path.join(R,"breakeven_data.json")          # p19 — 없으면 손익 점검 칸을 숨긴다
if os.path.exists(bep):
    BE=json.load(open(bep,encoding="utf-8"))
    assert len(BE["c2s"])==len(BE["c2d"])==VD["meta"]["cells"], "손익 데이터와 격자의 셀 수가 다르다 — p19를 다시 돌릴 것"
    VD["be"]=BE
else:
    print("breakeven_data.json 없음 — 손익 점검 칸은 숨깁니다")
bp=os.path.join(R,"무인_브랜드.csv"); sp=os.path.join(R,"무인_브랜드_요약.csv")   # p22 — 손익 점검의 '무인 유형'. 없으면 뺀다
if "be" in VD and os.path.exists(bp) and os.path.exists(sp):
    BRD=list(csv.DictReader(open(bp,encoding="utf-8-sig"))); BSM={r["유형"]:r for r in csv.DictReader(open(sp,encoding="utf-8-sig"))}
    SV={r["cat_s"]:r for r in csv.DictReader(open(os.path.join(R,"업종별_생존.csv"),encoding="utf-8-sig"))}
    BI={d["k"]:d for d in VD["be"]["ind"]}
    UNT={  # 무인 유형 → (참고로 보여 줄 상권 코드, 생존을 읽을 코드, 원가율 — None이면 상권 코드 값을 물려받음, 원가율 설명). 층은 스터디카페만 2층(무인도 84%가 2층 이상, p21)
        "빨래방":("CS200031",["S20902","S20901"],None,"셀프 빨래방은 물·가스·전기가 매출에 따라 늘어나니 이 비율에 넣는 편이 맞습니다"),
        "스터디카페":(None,["R10202"],0.0,"파는 물건이 거의 없어 0으로 두었습니다 — 음료·소모품을 판다면 그 비율을 넣으세요"),
        "아이스크림":("CS300001",["G20404"],None,"할인 판매라 매입원가 비중이 높은 편입니다"),
        "카페":("CS100010",["I21201"],None,""),
        "사진관":(None,["M11301"],0.10,"예시값 — 인화지·소모품 비중은 가게마다 다릅니다"),
        "밀키트":("CS300010",["G20509"],None,"")}
    NM={"워시엔조이 멤버스":"워시엔조이","작심스터디카페":"작심","CHOSIM(초심)":"초심","어라운드스터디카페(A.round study cafe)":"어라운드",
        "공본스터디카페":"공본","위넌스터디카페":"위넌","픽미픽미아이스크림할인점":"픽미픽미","도깨비냉장고 아이스크림할인점":"도깨비냉장고"}
    U=[]
    for t,(cs,sc,v,vn) in UNT.items():
        s=BSM[t]
        if v is None: v=BI[cs]["v"]; vsrc=BI[cs]["vsrc"]+(" · "+vn if vn else "")
        else: vsrc=vn
        bs=[[NM.get(b["영업표지"],b["영업표지"]),int(b["월매출_만원"]),b["월매출_기준"],int(b["서울가맹점"] if b["월매출_기준"]=="서울" else b["가맹점"]),int(b["기준연도"])]
            for b in BRD if b["유형"]==t and b["기본값"]=="Y"]
        assert len(bs)==int(s["기본값브랜드"]), t
        U.append({"k":"UN-"+t,"t":t,"nm":"무인 "+t,"un":True,"cs":cs,"v":v,"vsrc":vsrc,"ref":int(s["월매출_중간_만원"]),"floor":"2" if t=="스터디카페" else "1",
                  "area":int(round(float(s["어림면적_중간_㎡"]))),"inv":int(round(int(s["초기투자_중간_만원"])/100.0))*100,
                  "close":float(s["문닫은비율"]),"brands":sorted(bs,key=lambda x:-x[1]),
                  "surv":[{"code":c,"nm":SV[c]["업종"],"S12":round(float(SV[c]["S12_추정"]),3),"S12lo":round(float(SV[c]["S12_하"]),3),
                           "S12hi":round(float(SV[c]["S12_상"]),3),"close":round(float(SV[c]["기존_연폐업률"]),3)} for c in sc]})
    VD["be"]["un"]=U
else:
    print("무인_브랜드.csv 없음 — 손익 점검의 무인 유형은 뺍니다")
enp=os.path.join(R,"entry_data.json")              # p20 — 없으면 개업 모드를 숨긴다
if os.path.exists(enp):
    EN=json.load(open(enp,encoding="utf-8"))
    assert EN["meta"]["cells"]==VD["meta"]["cells"] and len(EN["meta"]["nb"])==6*VD["meta"]["cells"], "개업 데이터와 격자의 셀 수가 다르다 — p20을 다시 돌릴 것"
    VD["en"]=EN
else:
    print("entry_data.json 없음 — 개업 모드는 숨깁니다")
kp=os.path.join(R,"무인_업종.csv"); op=os.path.join(R,"무인_검정.csv")   # p21 — 없으면 무인 가게 칸을 숨긴다. 무인 가게가 20곳 이상 실린 코드만
if os.path.exists(kp) and os.path.exists(op):
    K=list(csv.DictReader(open(kp,encoding="utf-8-sig"))); O={r["유형"]:r for r in csv.DictReader(open(op,encoding="utf-8-sig"))}
    fl=lambda x: float(x) if x not in ("",None) else None
    by={}
    for r in K: by.setdefault(r["업종코드"],[]).append(r)
    UC={}
    for c,rows in by.items():
        n=sum(int(r["무인"]) for r in rows)
        if n<20: continue
        rows=sorted(rows,key=lambda r:-int(r["무인"])); r0=rows[0]
        rest=int(r0["코드점포"])-int(r0["무인"]); fo=sum(int(r["개업무인"]) for r in rows); ft=int(r0["개업전체"])-int(r0["개업무인"])+fo
        nf=sum(int(r["층무인"]) for r in rows); f1u=sum(fl(r["일층무인"])*int(r["층무인"]) for r in rows if r["일층무인"])/nf if nf else None
        nu=sum(int(r["n무인"]) for r in rows); cu=sum(float(r["폐업무인"]) for r in rows)
        UC[c]={"nm":r0["업종명"],"n":n,"N":rest+n,
               "t":[[r["유형"],int(r["무인"]),round(int(r["무인"])/int(O[r["유형"]]["붙음"]),3)] for r in rows if int(r["무인"])>=5],
               "f1":[round(f1u,3) if f1u is not None else None,round(fl(r0["일층나머지"]),3)],
               "nb":[fl(r0["주변무인"]),fl(r0["주변나머지"])],"op":[fo,ft],
               "cl":[round(cu/nu,3) if nu else None,round(fl(r0["반년폐업_나머지"]),3)]}
    VD["un"]={"meta":{"list":sum(int(o["명단"]) for o in O.values()),"linked":sum(int(o["붙음"]) for o in O.values()),"date":"2025-12-31"},
              "rate":{t:[int(o["붙음"]),int(o["명단"])] for t,o in O.items()},"c":UC}
    assert VD["un"]["meta"]["list"]==4251, "무인점포 명단 수가 다르다 — p21을 다시 돌릴 것"
else:
    print("무인_업종.csv 없음 — 무인 가게 칸은 숨깁니다")
mvp=os.path.join(R,"이동_그래프.json"); cdp=os.path.join(R,"후보_조건.json")   # p23·p24 — 없으면 후보 찾기를 숨긴다
if os.path.exists(mvp) and os.path.exists(cdp):
    MV=json.load(open(mvp,encoding="utf-8")); CD=json.load(open(cdp,encoding="utf-8"))
    C=VD["meta"]["cells"]
    assert MV["meta"]["cells"]==C==CD["meta"]["cells"]==len(MV["nb"])//6, "이동 그래프·후보 조건과 격자의 셀 수가 다르다 — p23·p24를 다시 돌릴 것"
    gsha=hashlib.sha1("\n".join(h3).encode()).hexdigest()      # 칸 순서까지 같은지 (p18을 다시 돌려 순서가 바뀌면 이동 그래프가 엉뚱한 칸을 가리킨다)
    assert MV["meta"].get("h3sha")==gsha and CD["meta"].get("h3sha")==gsha, "이동 그래프·후보 조건의 칸 순서가 격자와 다르다 — p23·p24를 다시 돌릴 것"
    assert max(MV["nb"])<C and all(len(CD[k][t])==C for k in ("cnt","un") for t in CD[k]), "이웃 번호·칸 배열 길이가 격자와 맞지 않는다"
    def pk(a, f="H"):        # 정수 배열 → 리틀엔디언 base64 (H: 0~65534, h: −1 포함)
        assert all((-1 if f=="h" else 0)<=x<(32767 if f=="h" else 65535) for x in a), "16비트 범위를 넘는다"
        return base64.b64encode(struct.pack("<%d%s"%(len(a),f),*a)).decode()
    car=MV["car"]; pt=MV["pt"]
    VD["mv"]={"meta":MV["meta"],"nb":pk(MV["nb"],"h"),
              "car":{"t":car["t"],"acc":car["acc"],"nk":car["nk"],"kl":pk(car["kl"]),"ckf":pk(car["ckf"]),"ckr":pk(car["ckr"])},
              "walk":MV["walk"],
              "pt":{"st":pt["st"],"lines":[{"k":l["k"],"v":l["v"],"h":l["h"],"h_am":l["h_am"],"h_pm":l["h_pm"]} for l in pt["lines"]],"sl":pt["sl"],"ride":pk(pt["ride"]),"acc":pk(pt["acc"]),"tr":pk(pt["tr"])}}
    S=len(pt["sl"])//2
    assert len(pt["tr"])%4==0 and all(pt["tr"][k]<S and pt["tr"][k+1]<S and pt["tr"][k+3] in (0,1,2) for k in range(0,len(pt["tr"]),4)), "지하철 갈아타기(앞·뒤·걷기·종류) 번호가 맞지 않는다"
    assert set(MV["meta"]["car_f"])==set(MV["meta"]["periods"])=={"day","am","pm"}, "시간대가 맞지 않는다"
    if "bus" in MV:          # 버스 — p23이 이미 16비트 base64로 쌌다. 번호 범위만 확인
        bus=MV["bus"]; u2=lambda x: list(struct.unpack("<%dH"%(len(base64.b64decode(x))//2),base64.b64decode(x)))
        rs,ba=u2(bus["rs"]),u2(bus["acc"]); R=len(rs)//2; NR=len(bus["h"]["day"])
        assert len(rs)%2==0 and len(ba)%3==0 and all(len(u2(bus["rt"][p]))==R and len(bus["h"][p])==NR for p in ("day","am","pm")), "버스 배열 길이가 맞지 않는다"
        assert max(rs[0::2])<bus["n"] and max(rs[1::2])<NR and max(ba[0::3])<C and max(ba[1::3])<bus["n"], "버스 번호가 범위를 넘는다"
        assert all(u2(bus["rt"][p])[0]==65535 for p in ("day","am","pm")) and all(rs[2*s+1]==rs[2*s-1] for p in ("day",) for s,t in enumerate(u2(bus["rt"][p])) if s and t!=65535), "버스 운행 구간이 같은 노선 앞 자리에서 오지 않는다"
        VD["mv"]["bus"]={"n":bus["n"],"h":bus["h"],"rs":bus["rs"],"rt":bus["rt"],"acc":bus["acc"],"wmax":bus["meta"]["wait_max_s"],
                         "meta":{k:bus["meta"][k] for k in ("stops","info","runs","coords","routes","obs","routes_in","routes_in_gg","dropped","dropped_gg","check")}}
    if "en" in VD:           # 개업 지도의 이웃(순서만 다르고 같은 여섯 칸)을 이동 그래프의 테두리 순서 이웃으로 갈음해 한 벌만 싣는다
        en_nb=VD["en"]["meta"]["nb"]
        assert all(sorted(x for x in en_nb[i*6:i*6+6] if x>=0)==sorted(x for x in MV["nb"][i*6:i*6+6] if x>=0) for i in range(C)), "개업 데이터 이웃과 이동 그래프 이웃이 다르다"
        del VD["en"]["meta"]["nb"]
    sp=lambda a: [x for i,v in enumerate(a) if v for x in (i,v)]       # 0이 대부분인 칸 배열 → [칸, 값, …]
    VD["cand"]={"types":CD["types"],"cnt":{t:sp(a) for t,a in CD["cnt"].items()},"un":{t:sp(a) for t,a in CD["un"].items()},"meta":CD["meta"]}
else:
    print("이동_그래프.json·후보_조건.json 없음 — 후보 찾기는 숨깁니다")
rdp=os.path.join(RDIR,"임대시세_데이터.json")         # p25 — 없으면 임대료 모드는 부동산원 상권 72곳만 칠한다
if os.path.exists(rdp):
    RJ=json.load(open(rdp,encoding="utf-8"))
    miss=[k for k in VD["dongs"] if k not in RJ["dong"]]
    assert not miss, f"임대시세에 없는 p18 행정동 {len(miss)}곳 {miss[:3]} — p25를 다시 돌릴 것"
    gus={k.split("|")[1] for k in VD["dongs"]}
    assert gus<=set(RJ["gu"]), f"임대시세에 없는 자치구 {sorted(gus-set(RJ['gu']))}"
    assert all(d["v"]>0 and d["s"] and len(d["s"])<=5 for d in RJ["dong"].values()), "행정동 값·분기 값이 비었다"
    DK=("v","n","last","s","vx","vt","fr")          # vx 1층외 · vt 전체 · fr 층비율(1층외÷1층) — 새 자료에만 있다
    VD["dr"]={"meta":RJ["meta"],"gu":RJ["gu"],"d":[{k2:RJ["dong"][k][k2] for k2 in DK if k2 in RJ["dong"][k]} for k in VD["dongs"]]}
    if "gu_ex" in RJ: VD["dr"]["gu_ex"]=RJ["gu_ex"]
    nfr=sum("fr" in d for d in VD["dr"]["d"])
    print(f"임대시세_데이터.json — 행정동 {len(VD['dr']['d'])}곳" + (f" · 층비율 {nfr}곳" if nfr else " · 층 구분 없음(옛 자료)"))
else:
    print("임대시세_데이터.json 없음 — 임대료 모드는 부동산원 상권 72곳만 칠합니다")
data=json.dumps(VD,ensure_ascii=False,separators=(",",":")).replace("</","<\\/")
t=open(os.path.join(H,"template.html"),encoding="utf-8").read()
page=t.replace("/*__OLCSS__*/",open(os.path.join(H,"ol-10.10.0.css"),encoding="utf-8").read()).replace("__DATA__",data)
assert "__DATA__" not in page and "/*__OLCSS__*/" not in page
open(os.path.join(H,"게시용_본문.html"),"w",encoding="utf-8").write(page)
head,rest=page.split("<style>",1); css,body=rest.split("</style>",1)
full=('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
      +head+"<style>\nbody{margin:0}\n"+css+"</style>\n</head>\n<body>\n"+body+"\n</body>\n</html>\n")
open(os.path.join(H,"매출잠재_지도.html"),"w",encoding="utf-8").write(full)
print(f"매출잠재_지도.html {len(full.encode())/1e6:.2f}MB · 게시용_본문.html — 셀 {VD['meta']['cells']:,} · 업종 {len(VD['ind'])}"+(f" · 손익 점검 업종 {len(VD['be']['ind'])}" if "be" in VD else "")+(f" + 무인 유형 {len(VD['be']['un'])}" if "be" in VD and "un" in VD["be"] else "")+(f" · 개업 업종 {len(VD['en']['ind'])}" if "en" in VD else "")+(f" · 무인 코드 {len(VD['un']['c'])}" if "un" in VD else "")+(f" · 후보 찾기 유형 {len(VD['cand']['types'])} · 역 {len(VD['mv']['pt']['st'])}" if "cand" in VD else "")+(f" · 버스 노선 {len(VD['mv']['bus']['h']['day'])} · 정류소 {VD['mv']['bus']['n']:,}" if "cand" in VD and "bus" in VD["mv"] else "")+(f" · 행정동 임대시세 {len(VD['dr']['d'])}" if "dr" in VD else ""))
