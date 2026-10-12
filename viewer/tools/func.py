import asyncio
from playwright.async_api import async_playwright
OLJS=open("/home/claude/viewer/olpkg/package/dist/ol.js","rb").read()
PAGE="file:///home/claude/viewer_dev/매출잠재_지도.html"
async def route(r):
    u=r.request.url
    if "cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200,body=OLJS,headers={"content-type":"application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200,body=b"",headers={"content-type":"text/css"})
    else: await r.continue_()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1360,"height":1000}); pg=await ctx.new_page(); errs=[]
        pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
        await ctx.route("**/*",route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        out={}
        await pg.click("#m-rent"); await pg.wait_for_timeout(500)
        out["legend_rent"]=await pg.inner_text("#legend")
        out["foot_rent"]=await pg.inner_text("#mapfoot")
        # 표 첫 행(가장 비싼 상권) 눌러 확대 → 지도 가운데에 그 상권 → 가운데 호버
        await pg.click("#tbl tbody tr:first-child"); await pg.wait_for_timeout(900)
        m=await pg.query_selector("#map"); bb=await m.bounding_box()
        await pg.mouse.move(bb["x"]+bb["width"]/2,bb["y"]+bb["height"]/2); await pg.wait_for_timeout(400)
        out["tt_rent"]=await pg.evaluate("()=>{const t=document.getElementById('tt'); return t.hidden?null:t.innerText.slice(0,300)}")
        await pg.click("#m-pot"); await pg.wait_for_timeout(400)
        await pg.mouse.move(bb["x"]+bb["width"]/2,bb["y"]+bb["height"]/2); await pg.wait_for_timeout(400)
        out["tt_pot"]=await pg.evaluate("()=>{const t=document.getElementById('tt'); return t.hidden?null:t.innerText.slice(0,400)}")
        await pg.click(".ind[data-k='CS200019']"); await pg.wait_for_timeout(400)
        out["banner"]=await pg.evaluate("()=>{const b=document.getElementById('banner'); return b.hidden?null:b.textContent.slice(0,80)}")
        out["chart_npaint"]=await pg.inner_text("#cmpstat")
        await pg.click(".ind[data-k='CS200031']"); await pg.wait_for_timeout(400)
        out["info_laundry"]=(await pg.inner_text("#info"))[:260]
        await pg.click("#tab-gu"); await pg.wait_for_timeout(300)
        out["gu_rows"]=await pg.evaluate("()=>document.querySelectorAll('#tbl tbody tr').length")
        out["gu_first"]=await pg.inner_text("#tbl tbody tr:first-child")
        print("errors:",errs)
        for k,v in out.items(): print(f"--- {k}\n{v}")
        await b.close()
asyncio.run(main())
