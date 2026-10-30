# -*- coding: utf-8 -*-
"""임대료 모드·행정동 임대시세(p25) 점검 — 칸 색 = 동 값 구간, 셀 정보·표·산점도·손익 점검·후보 카드 값 = JSON"""
import asyncio, json, math, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, "/home/claude/viewer_dev/tools")
OLJS = open("/home/claude/viewer/olpkg/package/dist/ol.js", "rb").read()
PAGE = "file:///home/claude/viewer_dev/매출잠재_지도.html"
R = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/work_result"
V = json.load(open(f"{R}/viewer_data.json", encoding="utf-8")); J = json.load(open(f"{R}/임대시세_데이터.json", encoding="utf-8"))
PY = J["meta"]["py"]; N = V["meta"]["cells"]
DV = [J["dong"][k]["v"] / PY / 1000 for k in V["dongs"]]                  # 천원/㎡
E = [35, 45, 60, 80]
def rb(v): return sum(v >= e for e in E)
bad = 0
def chk(name, ok, info=""):
    global bad
    print(("OK  " if ok else "BAD ") + name + ("" if ok else f"  {info}"))
    if not ok: bad += 1
async def route(r):
    u = r.request.url
    if "cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200, body=OLJS, headers={"content-type": "application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200, body=b"", headers={"content-type": "text/css"})
    else: await r.continue_()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1360, "height": 1000}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await ctx.route("**/*", route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        # 처음 화면 — 표는 행정동 탭, 산점도는 행정동
        chk("행정동 탭이 보이고 선택됨", await pg.evaluate("()=>!document.getElementById('tab-dong').hidden&&document.getElementById('tab-dong').getAttribute('aria-selected')==='true'"))
        nrow = await pg.evaluate("()=>document.querySelectorAll('#tbl tbody tr').length"); chk("행정동 표 425행", nrow == len(V["dongs"]), nrow)
        first = await pg.inner_text("#tbl tbody tr:first-child"); kmax = max(range(len(DV)), key=lambda d: DV[d])
        chk("표 첫 행 = 가장 비싼 동", V["dongs"][kmax].split("|")[0] in first and f"{DV[kmax]:.1f}" in first, (first[:80], V["dongs"][kmax], DV[kmax]))
        st = await pg.inner_text("#cmpstat"); chk("산점도 기본 = 행정동", "행정동" in st, st)
        # 임대료 모드
        await pg.click("#m-rent"); await pg.wait_for_timeout(600)
        lg = await pg.inner_text("#legend"); ft = await pg.inner_text("#mapfoot")
        chk("범례 = 행정동 환산임대료", "행정동" in lg and "부동산원 조사 상권" in lg, lg)
        med = sorted(DV)[(len(DV) - 1) // 2]; chk("지도 아래 가운데 동 값", f"{med:.1f}" in ft and f"{J['meta']['seoul']['4분기평균']/PY/1000:.1f}" in ft, ft)
        vis = await pg.evaluate("()=>[!document.getElementById('showrent').disabled]"); chk("임대료 모드에서 부동산원 경계 켜고 끌 수 있음", vis[0])
        # 칸 색 — 가장 비싼 동으로 옮긴 뒤 지도 가운데 화소가 그 구간 색(--r4)인지 (툴팁은 치운다)
        m = await pg.query_selector("#map"); bb = await m.bounding_box()
        await pg.click("#tbl tbody tr:first-child"); await pg.wait_for_timeout(900)          # 가장 비싼 동으로 이동
        await pg.mouse.move(5, 5); await pg.evaluate("()=>{document.getElementById('tt').hidden=true}"); await pg.wait_for_timeout(200)
        import io; from PIL import Image
        img = Image.open(io.BytesIO(await pg.screenshot(clip={"x": bb["x"] + bb["width"] / 2 - 6, "y": bb["y"] + bb["height"] / 2 - 6, "width": 12, "height": 12}))).convert("RGB")
        from collections import Counter; col = Counter(list(img.getdata())).most_common(1)[0][0]
        want = await pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--r'+%d).trim()" % rb(DV[kmax]))
        wr = tuple(int(want[i:i + 2], 16) for i in (1, 3, 5))
        chk("가장 비싼 동 칸 색 = 구간 색", max(abs(a - b) for a, b in zip(col, wr)) <= 6, (col, want, rb(DV[kmax])))
        await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(400)
        tt = await pg.evaluate("()=>{const t=document.getElementById('tt'); return t.hidden?null:t.innerText}")
        chk("임대료 모드 호버 = 행정동 값", tt is not None and "천원/㎡·월 — 이 동 1층 환산임대료" in tt and "분기별" in tt, (tt or "")[:200])
        if tt:
            place = tt.split("\n")[0]; nm, gu = [x.strip() for x in place.split("·")]; d = V["dongs"].index(f"{nm}|{gu}")
            chk("호버 값 = JSON 동 값", f"{DV[d]:.1f}" in tt and f"{J['dong'][V['dongs'][d]]['v']/1e4:.1f}만 원" in tt, (place, DV[d]))
            gv = J["gu"][gu][5] / PY / 1000; chk("자치구 평균 = JSON", f"{gv:.1f}" in tt, gv)
            qs = J["dong"][V["dongs"][d]]["s"]; chk("분기 값 다섯 개 = JSON", all(f"{q[1]/PY/1000:.1f}" in tt for q in qs), qs)
        # 클릭하면 손익 점검에 그 칸
        await pg.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(500)
        cell = int(await pg.evaluate("()=>document.getElementById('be').dataset.cell")); dcell = V["dong"][cell]
        chk("임대료 모드 클릭 → 손익 점검 자리", cell >= 0 and V["dongs"][dcell].split("|")[0] in (tt or ""), cell)
        # 손익 점검 월세 수준: 월세 250 + 보증금 3000의 1% = 280, 50㎡ → 56.0천 원/㎡
        await pg.fill("#be-area", "50"); await pg.fill("#be-rent", "250"); await pg.fill("#be-dep", "3000"); await pg.select_option("#be-floor", "1"); await pg.wait_for_timeout(300)
        blk = await pg.evaluate("()=>{ var h=[...document.querySelectorAll('#beres h3')].find(x=>x.textContent==='월세 수준'); return h?h.parentElement.innerText:null; }")
        my = 280 * 10 / 50; x = my / DV[dcell]
        chk("월세 수준 — 보증금 1% 더한 ㎡당 값", blk is not None and "56.0천 원" in blk and "월 280만 원" in blk, (blk or "")[:160])
        chk("월세 수준 — 동 평균 배수", blk is not None and f"{x:.2f}배" in blk, (x, (blk or "")[:300]))
        # 2층: 동 값 × 효용비율(동 보정)
        await pg.select_option("#be-floor", "2"); await pg.wait_for_timeout(300)
        blk2 = await pg.evaluate("()=>{ var h=[...document.querySelectorAll('#beres h3')].find(x=>x.textContent==='월세 수준'); return h?h.parentElement.innerText:null; }")
        _fs = (J["meta"].get("floor_ratio") or {}).get("median")          # 동의 1층 외 수준으로 보정한 층 비율 (template.html drAdjD/drFloorR과 같은 식)
        _fr = J["dong"][V["dongs"][dcell]].get("fr")
        _adj = 1.0 if (_fs is None or _fr is None) else min(1.5, max(0.6, _fr / _fs))
        _r2 = 0.446 if _adj == 1.0 else min(0.95, 0.446 * _adj)   # 1층은 보정 없음(template.html drFloorR과 같음)
        chk("2층은 효용비율로 환산", blk2 is not None and f"{DV[dcell]*_r2:.1f}천 원" in blk2, (DV[dcell] * _r2, _adj, (blk2 or "")[:300]))
        await pg.select_option("#be-floor", "1"); await pg.fill("#be-dep", "0"); await pg.wait_for_timeout(300)
        blk3 = await pg.evaluate("()=>{ var h=[...document.querySelectorAll('#beres h3')].find(x=>x.textContent==='월세 수준'); return h?h.parentElement.innerText:null; }")
        chk("보증금 0이면 월세만", blk3 is not None and f"{250*10/50:.1f}천 원" in blk3 and "보증금을 넣으면" in blk3, (blk3 or "")[:200])
        await pg.fill("#be-dep", "3000"); await pg.wait_for_timeout(100)
        # 산점도 단위 바꾸기
        await pg.click("#m-pot"); await pg.wait_for_timeout(400)
        await pg.click(".ind[data-k='CS100010']"); await pg.wait_for_timeout(400)
        st_d = await pg.inner_text("#cmpstat"); npt_d = await pg.evaluate("()=>document.querySelectorAll('#chart circle.pt').length")
        await pg.click("#cs-rent"); await pg.wait_for_timeout(300)
        st_r = await pg.inner_text("#cmpstat"); npt_r = await pg.evaluate("()=>document.querySelectorAll('#chart circle.pt').length")
        chk("산점도 행정동 ↔ 부동산원", "행정동" in st_d and "상권" in st_r and npt_d > 300 and npt_r <= 72, (st_d, npt_d, st_r, npt_r))
        rd = await pg.inner_text("#cmpread"); chk("부동산원 쪽 읽는 법은 예전 문장", "+0.48" in rd, rd[:200])
        await pg.click("#cs-dong"); await pg.wait_for_timeout(300); rd2 = await pg.inner_text("#cmpread")
        ea = J["meta"]["elasticity"]["전체 상권"]; chk("행정동 쪽 탄력성 문장 = JSON", f"약 {round((1.1**ea[0]-1)*100)}%" in rd2 and f"{ea[3]:,}곳" in rd2, rd2[:300])
        # 매출 잠재 셀 정보에도 동 값
        await pg.evaluate("()=>document.getElementById('map').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300); bb = await m.bounding_box()
        await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(400)
        tp = await pg.evaluate("()=>{const t=document.getElementById('tt'); return t.hidden?null:t.innerText}")
        chk("매출 잠재 셀 정보에 행정동 임대료", tp is not None and "행정동 1층 임대료" in tp, (tp or "")[:200])
        # 자치구 탭 그대로
        await pg.click("#tab-gu"); await pg.wait_for_timeout(300); ng = await pg.evaluate("()=>document.querySelectorAll('#tbl tbody tr').length"); chk("자치구 탭 25행", ng == 25, ng)
        await pg.click("#tab-rent"); await pg.wait_for_timeout(300); nr = await pg.evaluate("()=>document.querySelectorAll('#tbl tbody tr').length"); chk("부동산원 탭 72행", nr == 72, nr)
        # 오래된 동 표시
        stale = [k for k, v in J["dong"].items() if v["n"] == 0]
        await pg.click("#tab-dong"); await pg.wait_for_timeout(300)
        txt = await pg.inner_text("#tbl"); chk("오래된 동은 '…년 …분기만'", all(re.search(k.split("|")[0] + r"\s+" + k.split("|")[1] + r".*?" + J["dong"][k]["last"][:4] + "년", txt) for k in stale), stale)
        chk("페이지 오류 없음", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print("BAD", bad)
