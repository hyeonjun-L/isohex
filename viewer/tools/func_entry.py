# 개업 모드 기능 시험: 화면 값을 entry_data.json으로 파이썬이 따로 계산한 값과 맞춘다
import asyncio, json, re, sys, csv
from playwright.async_api import async_playwright
R = "/mnt/user-data/uploads/isohex/analysis/panel/결과"
SHOT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
OLJS = open("/home/claude/viewer/olpkg/package/dist/ol.js", "rb").read()
PAGE = "file:///home/claude/viewer_dev/매출잠재_지도.html"
E = json.load(open(R + "/entry_data.json", encoding="utf-8")); BY = {d["k"]: d for d in E["ind"]}
H3 = [r["h3_9"] for r in csv.DictReader(open(R + "/매출잠재_격자.csv", encoding="utf-8-sig"))]; HI = {h: i for i, h in enumerate(H3)}
n = E["meta"]["cells"]; NB = E["meta"]["nb"]
def window(d):
    o = [0] * n; k = [0] * n
    for t in range(0, len(d["O"]), 3): o[d["O"][t]] = d["O"][t + 1]
    for t in range(0, len(d["K"]), 2): k[d["K"][t]] = d["K"][t + 1]
    ow = [o[i] + sum(o[q] for q in NB[i * 6:i * 6 + 6] if q >= 0) for i in range(n)]
    kw = [k[i] + sum(k[q] for q in NB[i * 6:i * 6 + 6] if q >= 0) for i in range(n)]
    return o, ow, kw
async def route(r):
    u = r.request.url
    if "cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200, body=OLJS, headers={"content-type": "application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200, body=b"", headers={"content-type": "text/css"})
    else: await r.continue_()
OK, BAD = [], []
def chk(name, cond, info=""): (OK if cond else BAD).append(name + (" — " + str(info) if info != "" else ""))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1360, "height": 1000}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await ctx.route("**/*", route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        await pg.click("#m-entry"); await pg.wait_for_timeout(600)
        nitem = await pg.evaluate("()=>document.querySelectorAll('#indpanel .ind').length"); chk("업종 48개", nitem == 48, nitem)
        title = await pg.evaluate("()=>document.querySelector('#info h2').firstChild.textContent"); chk("카페에서 시작(지도 업종과 맞춤)", title == "카페", title)
        hid = await pg.evaluate("()=>[...document.querySelectorAll('section.cmp')].map(s=>s.hidden)"); chk("임대료 비교·표 숨김", all(hid), hid)
        d = BY["I21201"]; o, ow, kw = window(d)
        foot = await pg.inner_text("#mapfoot"); nc = sum(1 for v in o if v > 0); tot = sum(o)
        chk("지도 아래 요약 = 파이썬", f"{nc:,}칸" in foot and f"{tot:,}곳" in foot, foot.replace("\n", " "))
        # 지도 가운데 칸 툴팁 값
        m = await pg.query_selector("#map"); bb = await m.bounding_box()
        await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(400)
        tt = await pg.inner_text("#tt"); h = re.search(r"89[0-9a-f]{13}", tt).group(0); i = HI[h]
        big = int(re.search(r"\n([\d,]+)곳", tt).group(1).replace(",", ""))
        chk("툴팁 창 합계 = 파이썬", big == ow[i], (h, big, ow[i]))
        chk("툴팁 2024년 말 이웃 포함 = 파이썬", f"· {kw[i]}곳" in tt, (kw[i], tt.replace("\n", " ")[:200]))
        # 칠한 칸 색 단계: 서울 전체에서 1곳 이상인 창 수 = 칠한 칸
        painted = await pg.evaluate("()=>document.querySelector('#legend .ttl').textContent"); chk("범례 제목", "카페" in painted, painted)
        # 다른 업종 고르기 + 키보드
        await pg.click(".ind[data-k='R10202']"); await pg.wait_for_timeout(300)
        t2 = await pg.evaluate("()=>document.querySelector('#info h2').firstChild.textContent"); chk("스터디카페 고르기", t2 == "독서실/스터디 카페", t2)
        info = await pg.inner_text("#info"); dd = BY["R10202"]
        chk("정보판 수치 = JSON", f"{dd['n']:,}곳" in info and f"{dd['stock']:,}곳" in info and f"×{dd['lD'][0]:.1f}" in info, info[:160].replace("\n", " "))
        await pg.focus(".ind[data-k='R10202']"); await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(300)
        t3 = await pg.evaluate("()=>document.querySelector('#info h2').firstChild.textContent"); chk("키보드로 다음 업종", t3 != "독서실/스터디 카페", t3)
        # 지도 클릭 → 손익 점검 자리 (목록에 초점을 주면 화면이 움직이므로 위치를 다시 잰다)
        await m.scroll_into_view_if_needed(); bb = await m.bounding_box()
        await pg.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(500)
        st = await pg.evaluate("()=>({ex:document.getElementById('be').dataset.example,tt:document.getElementById('tt').innerText.slice(-30)})")
        chk("개업 모드에서도 칸 클릭 → 손익 점검 자리", st["ex"] == "0" and "손익 점검에" in st["tt"], st)
        sec = await pg.query_selector(".main"); await sec.screenshot(path=SHOT + "/entry_desktop.png")
        # 매출 잠재로 돌아가기
        await pg.click("#m-pot"); await pg.wait_for_timeout(500)
        n2 = await pg.evaluate("()=>document.querySelectorAll('#indpanel .ind').length"); hid2 = await pg.evaluate("()=>[...document.querySelectorAll('section.cmp')].map(s=>s.hidden)")
        NIND = len(json.load(open(R + "/viewer_data.json", encoding="utf-8"))["ind"])   # p18 업종 수 (v2 37개)
        chk(f"매출 잠재로 돌아오면 {NIND}개 업종·비교 다시 보임", n2 == NIND and not any(hid2), (n2, hid2))
        # 새로고침 뒤 모드 기억
        await pg.click("#m-entry"); await pg.wait_for_timeout(300); await pg.reload(); await pg.wait_for_timeout(1500)
        pr = await pg.evaluate("()=>document.getElementById('m-entry').getAttribute('aria-pressed')"); chk("모드 기억", pr == "true", pr)
        await pg.click("#m-pot"); await pg.wait_for_timeout(200)
        # 모바일·어두운 모드
        ctx2 = await b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2, color_scheme="dark"); pg2 = await ctx2.new_page()
        pg2.on("pageerror", lambda e: errs.append("m:" + str(e))); await ctx2.route("**/*", route); await pg2.goto(PAGE); await pg2.wait_for_timeout(1500)
        await pg2.click("#m-entry"); await pg2.wait_for_timeout(500)
        ov = await pg2.evaluate("()=>({sw:document.documentElement.scrollWidth,iw:innerWidth})"); chk("모바일 가로 넘침 없음", ov["sw"] <= ov["iw"], ov)
        mm = await pg2.query_selector(".mapcard"); await mm.screenshot(path=SHOT + "/entry_mobile_dark.png")
        chk("콘솔 오류 없음", not errs, errs)
        await b.close()
    print("OK", len(OK)); [print("  ✓", x) for x in OK]
    print("BAD", len(BAD)); [print("  ✗", x) for x in BAD]
asyncio.run(main())
