# 손익 점검 기능 시험: 페이지 계산값을 파이썬 독립 계산과 맞춰 본다
import asyncio, json, math, re, sys
from playwright.async_api import async_playwright
R="/mnt/user-data/uploads/isohex/analysis/panel/결과"
SHOT=sys.argv[1] if len(sys.argv)>1 else "/tmp"
OLJS=open("/home/claude/viewer/olpkg/package/dist/ol.js","rb").read()
PAGE="file:///home/claude/viewer_dev/매출잠재_지도.html"
B=json.load(open(R+"/breakeven_data.json",encoding="utf-8")); V=json.load(open(R+"/viewer_data.json",encoding="utf-8"))
IND={d["k"]:(i,d) for i,d in enumerate(B["ind"])}
SI={(r[0],r[1]):r for r in B["S"]}; DI={(r[0],r[1]):r for r in B["D"]}
def card(won):
    for t in B["meta"]["card"]:
        if won<=t[0]: return t[1]
    return B["meta"]["card"][-1][1]
def solve(F,v):
    r=card(0)
    for _ in range(8):
        S=F/(1-v-r); r2=card(S*12e4)
        if r2==r: break
        r=r2
    return S,r
def example(k):
    ii,d=IND[k]; med=d["q"][3]; best=-1; bd=1e18
    for i in range(V["meta"]["cells"]):
        si=B["c2s"][i]
        if si<0 or V["rent"][i]<0: continue
        r=SI.get((si,ii))
        if not r: continue
        dd=abs(math.log(r[2]/med))
        if dd<bd: bd=dd; best=i
    return best
def expect(k,cell,F,vr,v2=0):
    ii,d=IND[k]; S,r=solve(F,vr+v2)
    si=B["c2s"][cell]; di=B["c2d"][cell]
    row=SI.get((si,ii)) if si>=0 else None
    row=row or DI.get((di,ii))
    if row:
        n=row[3]; E=row[2]/10*((n+1)/n)**(d["alpha"]-1)
    else: E=d["q"][3]/10
    return dict(S=S,r=r,E=E,R=S/E,need=S*1e4/30/((row[5]*100) if row else d["ticket"]*100))
def nums(t): return [float(x.replace(",","")) for x in re.findall(r"[\d,]+(?:\.\d+)?",t)]
async def route(r):
    u=r.request.url
    if "cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200,body=OLJS,headers={"content-type":"application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200,body=b"",headers={"content-type":"text/css"})
    else: await r.continue_()
OK=[]; BAD=[]
def chk(name,cond,info=""):
    (OK if cond else BAD).append(name+(" — "+str(info) if info else ""))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1360,"height":1000}); pg=await ctx.new_page(); errs=[]
        pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
        await ctx.route("**/*",route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        st=await pg.evaluate("()=>({cell:+document.getElementById('be').dataset.cell,ind:document.getElementById('be-ind').value,ex:document.getElementById('be').dataset.example==='1',where:document.getElementById('be-where').innerText,res:document.getElementById('beres').innerText,card:document.getElementById('be-card').textContent})")
        F=250+30+0+50+6000/36
        k=st["ind"]; ii,d=IND[k]; vr=round(d["v"]*100,1)/100
        cell=example(k); chk("예시 칸 = 파이썬 선택",st["cell"]==cell,(st["cell"],cell))
        e=expect(k,cell,F,vr)
        big=nums(st["res"].split("\n")[1])[0]  # "843" + "만 원 / 월"
        chk("손익분기 금액",abs(big-round(e["S"]))<=1,(big,round(e["S"],1)))
        chk("카드 수수료",st["card"]==f"{e['r']*100:.2f}%",(st["card"],e["r"]))
        m=re.search(r"평균 월매출\(([\d,]+)만 원\)의 (\d+)%",st["res"]); 
        chk("진입 뒤 평균·비율",m and abs(float(m.group(1).replace(",",""))-round(e["E"]))<=1 and int(m.group(2))==round(e["R"]*100),(m.groups() if m else None,round(e["E"]),round(e["R"]*100)))
        m=re.search(r"결제 약 ([\d,]+)건",st["res"]); chk("하루 결제 건수",m and int(m.group(1).replace(",",""))==round(e["need"]),(m.group(1) if m else None,round(e["need"])))
        print("초기:",st["where"]); print(st["res"][:1500]); print("…")
        # 생존·월세 블록 존재
        chk("월세 비교 문장 (월세 250 + 보증금 3,000의 1% → 50㎡)",("월 280만 원으로, ㎡당 56.0천 원" in st["res"]),"")
        # 층 2층 → 효용비율 문장
        await pg.select_option("#be-floor","2"); await pg.wait_for_timeout(200)
        r4=await pg.inner_text("#beres"); chk("2층 효용비율 환산","효용비율" in r4 and "· 2층" in r4 and "이 동 2층 평균의" in r4, re.findall(r"[^.]*효용비율[^.]*",r4)[:1])
        await pg.select_option("#be-floor","1")
        # 지도 칸 누르기 → 선택한 자리
        m_=await pg.query_selector("#map"); bb=await m_.bounding_box()
        await pg.mouse.click(bb["x"]+bb["width"]/2,bb["y"]+bb["height"]/2); await pg.wait_for_timeout(500)
        st2=await pg.evaluate("()=>({cell:+document.getElementById('be').dataset.cell,ex:document.getElementById('be').dataset.example==='1',where:document.getElementById('be-where').innerText,tt:document.getElementById('tt').innerText.slice(-30)})")
        chk("지도 클릭 → 선택한 자리",(not st2["ex"]) and st2["where"].startswith("선택한 자리") and "손익 점검에" in st2["tt"],st2)
        e2=expect(k,st2["cell"],F,vr); res2=await pg.inner_text("#beres")
        m=re.search(r"\(([\d,]+)만 원\)의 (\d+)%",res2); chk("클릭 칸 비율",m and int(m.group(2))==round(e2["R"]*100),(m.groups() if m else None,round(e2["R"]*100)))
        # 계산기 업종을 편의점으로 → 지도 업종을 바꿔도 유지
        await pg.select_option("#be-ind","CS300002"); await pg.wait_for_timeout(300)
        r3=await pg.inner_text("#beres"); chk("편의점 배지 ok","카드 매출이 외부 자료와 비슷한 업종" in r3)
        varv=await pg.input_value("#be-var"); chk("편의점 원가율 기본값",varv==f"{IND['CS300002'][1]['v']*100:.1f}",varv)
        await pg.click(".ind[data-k='CS200031']"); await pg.wait_for_timeout(300)
        chk("지도 업종 바꿔도 계산기 유지",(await pg.input_value("#be-ind"))=="CS300002")
        # 손익분기 없음
        await pg.fill("#be-var","99"); await pg.wait_for_timeout(200)
        chk("변동비 100% 이상 경고","손익분기가 없습니다" in (await pg.inner_text("#beres")))
        await pg.click("#be-reset"); await pg.wait_for_timeout(200)
        chk("되돌리기",(await pg.input_value("#be-rent"))=="250" and (await pg.input_value("#be-var"))==f"{IND['CS300002'][1]['v']*100:.1f}")
        # 손익표: 100% 줄 손익 = ref*(1-v-card)-F 부호 일치
        rows=await pg.evaluate("()=>[...document.querySelectorAll('#beres tbody tr')].map(r=>r.innerText)")
        chk("손익표 4줄",len(rows)==4,rows)
        # 저장 → 새로고침 뒤 유지
        await pg.fill("#be-rent","400"); await pg.wait_for_timeout(100); await pg.reload(); await pg.wait_for_timeout(1500)
        chk("입력값 저장·복원",(await pg.input_value("#be-rent"))=="400" and (await pg.input_value("#be-ind"))=="CS300002")
        await pg.click("#be-reset"); await pg.wait_for_timeout(200)
        sec=await pg.query_selector("#be"); await sec.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
        await sec.screenshot(path=SHOT+"/be_desktop.png")
        # 모바일 폭
        ctx2=await b.new_context(viewport={"width":390,"height":860},device_scale_factor=2,color_scheme="dark"); pg2=await ctx2.new_page()
        pg2.on("pageerror",lambda e: errs.append("m:"+str(e))); await ctx2.route("**/*",route); await pg2.goto(PAGE); await pg2.wait_for_timeout(1500)
        ov=await pg2.evaluate("()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,svg:(document.querySelector('.becht svg')||{}).getAttribute?document.querySelector('.becht svg').getAttribute('width'):null})")
        chk("모바일 가로 넘침 없음",ov["sw"]<=ov["iw"],ov)
        s2=await pg2.query_selector("#beres"); await s2.scroll_into_view_if_needed(); await s2.screenshot(path=SHOT+"/be_mobile_dark.png")
        chk("콘솔 오류 없음",not errs,errs)
        await b.close()
    print("\nOK",len(OK)); [print("  ✓",x) for x in OK]
    print("BAD",len(BAD)); [print("  ✗",x) for x in BAD]
asyncio.run(main())
