# -*- coding: utf-8 -*-
"""매출 잠재 v2 점검 — 업종 37개·칠함 25개가 p18 산출과 같고, 묶음 업종(한식 등)의 칠한 칸 수·중앙값·상위 10%가 CSV로 따로 계산한 값과 같은지,
업종 목록의 무리(칠함 기준)와 바닥글 문구가 viewer_data meta와 맞는지 본다"""
import asyncio, json, sys, math
import pandas as pd, numpy as np
from playwright.async_api import async_playwright
OLJS = open("/home/claude/viewer/olpkg/package/dist/ol.js", "rb").read()
PAGE = "file:///home/claude/viewer_dev/매출잠재_지도.html"
R = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/work_result"
V = json.load(open(f"{R}/viewer_data.json", encoding="utf-8")); C = pd.read_csv(f"{R}/매출잠재_격자.csv", encoding="utf-8-sig", low_memory=False)
IND = {d["k"]: d for d in V["ind"]}; TR = V["meta"]["train"]
bad = 0
def chk(name, ok, info=""):
    global bad
    print(("OK  " if ok else "BAD ") + name + ("" if ok else f"  {info}"))
    if not ok: bad += 1
def fx(v): return "×" + (f"{v:.2f}" if (v < 0.995 or v >= 1.005) else "1.00")
async def route(r):
    u = r.request.url
    if "ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200, body=OLJS, headers={"content-type": "application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200, body=b"", headers={"content-type": "text/css"})
    else: await r.continue_()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1360, "height": 1000}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await ctx.route("**/*", route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        n = await pg.evaluate("()=>document.querySelectorAll('#indpanel .ind').length"); off = await pg.evaluate("()=>document.querySelectorAll('#indpanel .ind.off').length")
        chk(f"업종 {len(IND)}개 · 칠함 {TR['paint']}개", n == len(IND) == TR["ind"] and n - off == TR["paint"] == sum(d["paint"] for d in IND.values()), (n, off, TR))
        grp = await pg.evaluate("()=>[...document.querySelectorAll('#indpanel .tier')].map(t=>[...t.querySelectorAll('.ind')].map(b=>[b.dataset.k,b.classList.contains('off')]))")
        ok = all(not o for k, o in grp[0] + grp[1]) and all(o for k, o in grp[2]) and all(IND[k]["rho"] >= 0.25 for k, o in grp[0]) and all(IND[k]["rho"] < 0.25 for k, o in grp[1])
        chk("업종 목록 무리 = 칠함 기준(칠하는 업종만 위 두 무리, 0.25로 나눔)", ok, [[k for k, o in g] for g in grp])
        ft = await pg.inner_text("footer")
        chk("바닥글 = meta (업종 수·학습 칸·R²·안 칠하는 업종 수)", f"{TR['ind']}개 업종 × 상권 {TR['cells']:,}칸" in ft and f"R² {TR['r2']:.3f}" in ft and f"{TR['ind'] - TR['paint']}개 업종(한쪽 5%)" in ft and "매출 잠재 v2" in ft, ft[:300])
        for k, nm in [("CS100001", "한식"), ("CS100009", "호프·주점"), ("CS300007", "정육점"), ("CS200025", "자동차 정비")]:
            await pg.click(f".ind[data-k='{k}']"); await pg.wait_for_timeout(400)
            foot = await pg.inner_text("#mapfoot"); col = C[f"잠재_{IND[k]['nm']}"]
            v = np.sort(np.log1p(col.dropna().values / 100)); q = lambda pp: v[min(len(v) - 1, max(0, round(pp * (len(v) - 1))))]
            want = [f"칠한 칸 {len(v):,}칸 ({round(len(v) / len(C) * 100)}%)", f"중앙값 {fx(math.exp(q(0.5)))}", f"상위 10% {fx(math.exp(q(0.9)))} 이상"]
            chk(f"{nm} — 칠한 칸·중앙값·상위 10% = CSV", all(w in foot for w in want), (want, foot[:200]))
        await pg.click(".ind[data-k='CS100001']"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("()=>document.querySelectorAll('#info table.mini tr').length")
        chk("묶음 업종 정보판 — 코드별 작은 표(머리 + 코드 14줄)", rows == 1 + len(IND["CS100001"]["codes"]), rows)
        await pg.click(".ind[data-k='CS100010']"); await pg.wait_for_timeout(300)
        rows1 = await pg.evaluate("()=>document.querySelectorAll('#info table.mini').length")
        chk("코드 하나인 업종은 예전 모양(작은 표 없음)", rows1 == 0, rows1)
        chk("페이지 오류 없음", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print("BAD", bad)
