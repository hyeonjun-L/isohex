# 손익 점검의 무인 유형 시험: 기본값 채우기·손익분기·브랜드 비교·참고 상권·생존·저장을 파이썬 독립 계산과 맞춰 본다
import asyncio, json, math, re, sys, csv
from playwright.async_api import async_playwright
R = "/home/claude/work_result"
SHOT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
OLJS = open("/home/claude/viewer/olpkg/package/dist/ol.js", "rb").read()
PAGE = "file:///home/claude/viewer_dev/매출잠재_지도.html"
B = json.load(open(R + "/breakeven_data.json", encoding="utf-8")); V = json.load(open(R + "/viewer_data.json", encoding="utf-8"))
BS = {r["유형"]: r for r in csv.DictReader(open(R + "/무인_브랜드_요약.csv", encoding="utf-8-sig"))}
BR = [r for r in csv.DictReader(open(R + "/무인_브랜드.csv", encoding="utf-8-sig")) if r["기본값"] == "Y"]
SV = {r["cat_s"]: r for r in csv.DictReader(open(R + "/업종별_생존.csv", encoding="utf-8-sig"))}
IND = {d["k"]: d for d in B["ind"]}
MAPNM = {d["k"]: d["nm"] for d in V["ind"]}
TYPES = ["빨래방", "스터디카페", "아이스크림", "카페", "사진관", "밀키트"]
CS = {"빨래방": "CS200031", "스터디카페": None, "아이스크림": "CS300001", "카페": "CS100010", "사진관": None, "밀키트": "CS300010"}
VAR = {"스터디카페": 0.0, "사진관": 0.10}
SURV = {"빨래방": ["S20902", "S20901"], "스터디카페": ["R10202"], "아이스크림": ["G20404"], "카페": ["I21201"], "사진관": ["M11301"], "밀키트": ["G20509"]}
def card(won):
    for t in B["meta"]["card"]:
        if won <= t[0]: return t[1]
    return B["meta"]["card"][-1][1]
def solve(F, v):
    r = card(0)
    for _ in range(8):
        S = F / (1 - v - r); r2 = card(S * 12e4)
        if r2 == r: break
        r = r2
    return S, r
RV = [r["v"].get("대표1층") for r in V["rents"]]
def median_rent_cell():
    c = sorted((RV[V["rent"][i]], i) for i in range(V["meta"]["cells"]) if V["rent"][i] >= 0 and RV[V["rent"][i]] is not None and B["c2s"][i] >= 0)
    return c[len(c) // 2][1]
def nums(t): return [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", t)]
async def route(r):
    u = r.request.url
    if "cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200, body=OLJS, headers={"content-type": "application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200, body=b"", headers={"content-type": "text/css"})
    else: await r.continue_()
OK = []; BAD = []
def chk(name, cond, info=""): (OK if cond else BAD).append(name + (" — " + str(info) if info else ""))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1360, "height": 1000}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await ctx.route("**/*", route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        opts = await pg.evaluate("()=>[...document.querySelectorAll('#be-ind optgroup')].map(g=>[g.label,[...g.children].map(o=>o.value)])")
        chk("무인 묶음이 맨 앞", opts[0][1] == ["UN-" + t for t in TYPES], opts[0])
        for t in TYPES:
            s = BS[t]; await pg.select_option("#be-ind", "UN-" + t); await pg.wait_for_timeout(250)
            iv = {k: await pg.input_value("#be-" + k) for k in ("area", "labor", "inv", "var", "rent", "mgmt", "other", "months", "floor")}
            chk(f"{t} 층 기본값", iv["floor"] == ("2" if t == "스터디카페" else "1"), iv["floor"])
            area = round(float(s["어림면적_중간_㎡"])); inv = int(round(int(s["초기투자_중간_만원"]) / 100.0)) * 100
            v = VAR.get(t, IND[CS[t]]["v"] if CS[t] else None)
            chk(f"{t} 기본값 채움", iv["area"] == str(area) and iv["labor"] == "0" and iv["inv"] == str(inv) and iv["var"] == f"{v*100:.1f}", (iv, area, inv, v))
            F = float(iv["rent"]) + float(iv["mgmt"]) + 0 + float(iv["other"]) + inv / float(iv["months"])
            S, r = solve(F, v); ref = int(s["월매출_중간_만원"])
            res = await pg.inner_text("#beres")
            big = nums(res.split("\n")[1])[0]
            chk(f"{t} 손익분기", abs(big - round(S)) <= 1, (big, round(S, 1)))
            m = re.search(r"브랜드 중간값\(([\d,]+)만 원\)의 (\d+)%", res)
            chk(f"{t} 브랜드 중간값·비율", m and int(m.group(1).replace(",", "")) == ref and int(m.group(2)) == round(S / ref * 100), (m.groups() if m else None, ref, round(S / ref * 100)))
            bs = [x for x in BR if x["유형"] == t]; na = sum(int(x["월매출_만원"]) >= S for x in bs)
            if len(bs) > 1:
                m = re.search(r"가맹 브랜드 (\d+)곳 중 (\d+)곳", res); chk(f"{t} 넘는 브랜드 수", m and (int(m.group(1)), int(m.group(2))) == (len(bs), na), (m.groups() if m else None, len(bs), na))
            else: chk(f"{t} 한 곳뿐 안내", "한 곳뿐이라 거친 기준" in res)
            bars = await pg.evaluate("()=>[document.querySelectorAll('#beres .becht .bb').length,document.querySelectorAll('#beres .becht .bb.ok').length]")
            chk(f"{t} 막대 수·진한 막대", bars == [len(bs), na], (bars, len(bs), na))
            ref_blk = "참고 — 이 동네" in res
            cnm = (MAPNM.get(CS[t]) or IND[CS[t]]["nm"]) if CS[t] else None   # 계산기는 지도와 같은 이름을 쓴다(커피-음료 → 카페)
            chk(f"{t} 참고 상권 블록", ref_blk == bool(CS[t]) and ((f"이 동네 {cnm} 가게" in res) if CS[t] else True), (ref_blk, cnm))
            sv_ok = all(SV[c]["업종"] in res for c in SURV[t]) and f"가맹점의 {round(float(s['문닫은비율'])*100)}%가 문을 닫았습니다" in res
            chk(f"{t} 생존·문 닫은 비율", sv_ok, [SV[c]["업종"] for c in SURV[t]])
            note = await pg.inner_text("#be-note"); chk(f"{t} 기본값 안내", f"무인 {t} 기본값" in note, note[:60])
            rows = await pg.evaluate("()=>[...document.querySelectorAll('#beres tbody tr')].map(r=>r.innerText)")
            chk(f"{t} 손익표 4줄·기준", len(rows) == 4 and "브랜드 중간값 대비" in res, rows[:1])
            if t == "스터디카페":
                cell = int(await pg.evaluate("()=>document.getElementById('be').dataset.cell")); exp = median_rent_cell()
                chk("상권 코드 없는 유형의 예시 칸 = 1층 임대료 가운데", cell == exp, (cell, exp))
                sec = await pg.query_selector("#be"); await sec.scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
                await sec.screenshot(path=SHOT + "/beu_study_desktop.png")
            if t == "빨래방":
                sec = await pg.query_selector("#beres"); await sec.screenshot(path=SHOT + "/beu_laundry_desktop.png")
        # 되돌리기 — 무인 유형이면 무인 기본값으로
        await pg.select_option("#be-ind", "UN-사진관"); await pg.fill("#be-area", "99"); await pg.fill("#be-rent", "777"); await pg.wait_for_timeout(100)
        await pg.click("#be-reset"); await pg.wait_for_timeout(200)
        chk("무인 되돌리기", await pg.input_value("#be-area") == str(round(float(BS["사진관"]["어림면적_중간_㎡"]))) and await pg.input_value("#be-rent") == "250")
        # 보통 업종으로 돌아가면 안내가 사라지고 원래 화면
        await pg.select_option("#be-ind", "CS100010"); await pg.wait_for_timeout(250)
        res = await pg.inner_text("#beres"); note = await pg.inner_text("#be-note")
        chk("보통 업종 복귀", "가맹 브랜드" not in res and "기본값" not in note and "결제 약" in res, note[:50])
        # 저장 → 새로고침
        await pg.select_option("#be-ind", "UN-밀키트"); await pg.fill("#be-rent", "310"); await pg.wait_for_timeout(100)
        await pg.reload(); await pg.wait_for_timeout(1500)
        chk("무인 유형 저장·복원", await pg.input_value("#be-ind") == "UN-밀키트" and await pg.input_value("#be-rent") == "310"
            and await pg.input_value("#be-area") == str(round(float(BS["밀키트"]["어림면적_중간_㎡"]))))
        res = await pg.inner_text("#beres"); chk("복원 뒤 무인 화면", "가맹 브랜드" in res and "무인 밀키트" in res)
        await pg.click("#be-reset"); await pg.wait_for_timeout(100)
        # 모바일·어두운 화면
        ctx2 = await b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2, color_scheme="dark"); pg2 = await ctx2.new_page()
        pg2.on("pageerror", lambda e: errs.append("m:" + str(e))); await ctx2.route("**/*", route); await pg2.goto(PAGE); await pg2.wait_for_timeout(1500)
        await pg2.select_option("#be-ind", "UN-스터디카페"); await pg2.wait_for_timeout(300)
        ov = await pg2.evaluate("()=>({sw:document.documentElement.scrollWidth,iw:innerWidth})"); chk("모바일 가로 넘침 없음", ov["sw"] <= ov["iw"], ov)
        s2 = await pg2.query_selector("#beres"); await s2.scroll_into_view_if_needed(); await s2.screenshot(path=SHOT + "/beu_mobile_dark.png")
        chk("콘솔 오류 없음", not errs, errs)
        await b.close()
    print("OK", len(OK)); [print("  ✓", x) for x in OK]
    print("BAD", len(BAD)); [print("  ✗", x) for x in BAD]
asyncio.run(main())
