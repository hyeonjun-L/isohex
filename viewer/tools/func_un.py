# 무인 가게 칸 기능 시험: 정보판 문구를 무인_업종.csv·무인_검정.csv로 파이썬이 따로 계산한 값과 맞춘다
import asyncio, csv, sys
from playwright.async_api import async_playwright
R = "/mnt/user-data/uploads/isohex/analysis/panel/결과"
SHOT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
OLJS = open("/home/claude/viewer/olpkg/package/dist/ol.js", "rb").read()
PAGE = "file:///home/claude/viewer_dev/매출잠재_지도.html"
K = list(csv.DictReader(open(R + "/무인_업종.csv", encoding="utf-8-sig")))
O = {r["유형"]: r for r in csv.DictReader(open(R + "/무인_검정.csv", encoding="utf-8-sig"))}
def expect(code):
    rows = [r for r in K if r["업종코드"] == code]; n = sum(int(r["무인"]) for r in rows)
    r0 = max(rows, key=lambda r: int(r["무인"])); N = int(r0["코드점포"]) - int(r0["무인"]) + n; v = n / N
    share = f"{v*100:.1f}%" if v < 0.1 else f"{round(v*100)}%"
    fo = sum(int(r["개업무인"]) for r in rows); ft = int(r0["개업전체"]) - int(r0["개업무인"]) + fo
    top = [(r["유형"], int(r["무인"]), round(int(r["무인"]) / int(O[r["유형"]]["붙음"]) * 100)) for r in sorted(rows, key=lambda r: -int(r["무인"])) if int(r["무인"]) >= 5]
    return n, share, fo, ft, top
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
        await pg.click("#m-pot"); await pg.wait_for_timeout(300)
        # 슈퍼마켓 — 무인 아이스크림
        await pg.click(".ind[data-k='CS300001']"); await pg.wait_for_timeout(300)
        t = await pg.inner_text("#info"); n, share, fo, ft, top = expect("G20404")
        chk("슈퍼마켓 무인 칸 있음", "무인 가게 — 서울시 무인점포 명단과 대조" in t)
        chk("슈퍼마켓 무인 아이스크림 수", f"무인 아이스크림 {top[0][1]:,}곳" in t, top[0])
        chk("슈퍼마켓 찾은 가게 중 몫", f"이름으로 찾은 무인 아이스크림 {int(O['아이스크림']['붙음']):,}곳의 {top[0][2]}%" in t, top[0][2])
        chk("슈퍼마켓 무인 몫(하한)", f"무인으로 확인된 가게 {n:,}곳 — 이 코드 가게의 {share} 이상" in t, (n, share))
        chk("슈퍼마켓 새 가게 중 무인", f"2025 상반기에 열어 그해 말까지 남은 가게 {ft:,}곳 중 {fo:,}곳" in t, (fo, ft))
        await (await pg.query_selector("#info")).screenshot(path=SHOT + "/un_super.png")
        # 세탁소·셀프빨래방 — 두 코드
        ks = await pg.evaluate("()=>[...document.querySelectorAll('#indpanel .ind')].map(e=>[e.dataset.k,e.textContent])")
        kl = [k for k, tx in ks if "세탁" in tx]
        chk("세탁소·셀프빨래방 업종 찾음", len(kl) == 1, ks[:3])
        if kl:
            await pg.click(f".ind[data-k='{kl[0]}']"); await pg.wait_for_timeout(300); t = await pg.inner_text("#info")
            e1, e2 = expect("S20901"), expect("S20902")
            chk("세탁소 소제목", "세탁소 (S20901)" in t and "셀프 빨래방 (S20902)" in t)
            chk("빨래방 절반이 세탁소 코드", f"이름으로 찾은 무인 빨래방 {int(O['빨래방']['붙음']):,}곳의 {e1[4][0][2]}%" in t and f"곳의 {e2[4][0][2]}%" in t, (e1[4][0], e2[4][0]))
            chk("세탁소 무인 몫", f"가게 {e1[0]:,}곳 — 이 코드 가게의 {e1[1]} 이상" in t and f"가게 {e2[0]:,}곳 — 이 코드 가게의 {e2[1]} 이상" in t, (e1[:2], e2[:2]))
        # 무인 없는 업종 → 칸 없음
        await pg.click(".ind[data-k='CS100007']"); await pg.wait_for_timeout(300)
        chk("치킨엔 무인 칸 없음", "무인 가게 —" not in await pg.inner_text("#info"))
        # 개업 모드 — 스터디카페
        await pg.click("#m-entry"); await pg.wait_for_timeout(500)
        await pg.click(".ind[data-k='R10202']"); await pg.wait_for_timeout(300); t = await pg.inner_text("#info")
        n, share, fo, ft, top = expect("R10202")
        chk("개업 모드 스터디카페 무인 칸", f"무인 스터디카페 {top[0][1]:,}곳" in t and f"무인으로 확인된 가게 {n:,}곳 — 이 코드 가게의 {share} 이상" in t, (n, share))
        chk("개업 모드 새 가게 중 무인", f"2025 상반기에 열어 그해 말까지 남은 가게 {ft:,}곳 중 {fo:,}곳" in t, (fo, ft))
        await pg.click(".ind[data-k='I20101']"); await pg.wait_for_timeout(300)
        chk("백반엔 무인 칸 없음", "무인 가게 —" not in await pg.inner_text("#info"))
        await pg.click("#m-pot"); await pg.wait_for_timeout(200)
        # 모바일·어두운 모드
        ctx2 = await b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2, color_scheme="dark"); pg2 = await ctx2.new_page()
        pg2.on("pageerror", lambda e: errs.append("m:" + str(e))); await ctx2.route("**/*", route); await pg2.goto(PAGE); await pg2.wait_for_timeout(1500)
        await pg2.click("#m-pot"); await pg2.wait_for_timeout(300); await pg2.click(".ind[data-k='CS300001']"); await pg2.wait_for_timeout(300)
        ov = await pg2.evaluate("()=>({sw:document.documentElement.scrollWidth,iw:innerWidth})"); chk("모바일 가로 넘침 없음", ov["sw"] <= ov["iw"], ov)
        u = await pg2.query_selector(".block.unm"); await u.scroll_into_view_if_needed(); await u.screenshot(path=SHOT + "/un_mobile_dark.png")
        chk("콘솔 오류 없음", not errs, errs)
        await b.close()
    print("OK", len(OK)); [print("  ✓", x) for x in OK]
    print("BAD", len(BAD)); [print("  ✗", x) for x in BAD]
asyncio.run(main())
