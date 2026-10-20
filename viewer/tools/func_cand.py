# 후보 찾기 기능 시험 — 뷰어 JS가 낸 시간·후보를 파이썬 기준 계산(cand_ref.py)과 맞추고, 화면 동작·모바일·오류를 본다
import asyncio, math, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np
from playwright.async_api import async_playwright
sys.path.insert(0, "/home/claude/viewer_dev/tools")
import cand_ref as REF
SHOT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
OLJS = open("/home/claude/viewer/olpkg/package/dist/ol.js", "rb").read()
PAGE = "file:///home/claude/viewer_dev/매출잠재_지도.html"
async def route(r):
    u = r.request.url
    if "cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js" in u: await r.fulfill(status=200, body=OLJS, headers={"content-type": "application/javascript"})
    elif "fonts.g" in u: await r.fulfill(status=200, body=b"", headers={"content-type": "text/css"})
    else: await r.continue_()
OK, BAD = [], []
def chk(name, cond, info=""): (OK if cond else BAD).append(name + (" — " + str(info) if info != "" else ""))
STATE = "()=>window.__jeomji.candState()"

async def same_as_ref(pg, tag):
    s = await pg.evaluate(STATE)
    b = s["base"]["cell"]
    ref = REF.candidates(s["t"], b, s["mode"], s["min"], s["prof"], s["comp"], s["sort"], per=s.get("per", "day"))
    chk(f"{tag}: 후보 목록이 기준 계산과 같음", s["list"] == ref["list"], (s["list"][:6], ref["list"][:6]))
    chk(f"{tag}: 닿는 칸·조건 칸 수", (s["stat"]["reach"], s["stat"]["prof"], s["stat"]["comp"]) == (ref["reach"], ref["prof"], ref["comp"]), (s["stat"], ref["reach"], ref["prof"], ref["comp"]))
    cards = await pg.evaluate("()=>[...document.querySelectorAll('#clist .ccard')].map(c=>+c.dataset.i)")
    chk(f"{tag}: 카드 = 후보 순서", cards == s["list"], cards[:5])
    segs = await pg.evaluate("()=>+document.getElementById('cand').dataset.segs")
    chk(f"{tag}: 등시선 테두리 변 수", segs == ref["segs"], (segs, ref["segs"]))
    return s, ref

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1360, "height": 1000}); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await ctx.route("**/*", route); await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        chk("이웃 순서 = 꼭짓점 k→k+1 변 (3857 m)", REF.edge_order_check() < 3, REF.edge_order_check())
        # 갈래끼리 갈아타기는 걸어서 + 다른 갈래 배차의 절반보다 싸지 않다 (갈래 → 줄기 → 다른 갈래로 새는 길이 없나 — 2차 검토).
        # 강동 낮은 줄기 쪽 한 정거장을 갔다 오는 길이 115초 싸게 남는다(문서에 적음) — 그만큼만 허용
        import heapq as _hq
        P_ = REF.J["pt"]; L_ = [l["k"] for l in P_["lines"]]; oS = REF.C + 2 * len(P_["st"])
        SLn = {(P_["sl"][2 * n], L_[P_["sl"][2 * n + 1]]): n for n in range(len(P_["sl"]) // 2)}; ci = {x[2]: i for i, x in enumerate(P_["st"])}
        TRm = {(P_["tr"][i], P_["tr"][i + 1]): P_["tr"][i + 2] for i in range(0, len(P_["tr"]), 4) if P_["tr"][i + 3] == 0}
        def _sp(adj, a, b):
            dd = {a: 0.0}; hq = [(0.0, a)]; dn = set()
            while hq:
                x, u = _hq.heappop(hq)
                if u in dn: continue
                dn.add(u)
                if u == b: return x
                for v, w in adj[u]:
                    if x + w < dd.get(v, math.inf): dd[v] = x + w; _hq.heappush(hq, (x + w, v))
            return math.inf
        for jn, A, B in (("강동", "5하남", "5마천"), ("구로", "1경인", "1경부")):
            for per in ("day", "am", "pm"):
                a_, b_ = SLn[(ci[jn], A)], SLn[(ci[jn], B)]; hk = "h" if per == "day" else "h_" + per
                ex = TRm[(a_, b_)] + P_["lines"][L_.index(B)][hk] * 30; got = _sp(REF.G["pt"][per], oS + a_, oS + b_)
                chk(f"갈래끼리 갈아타기 {jn} {per}", got >= ex - (115 if (jn, per) == ("강동", "day") else 0) - 1e-6, (round(got), ex))
        chk("매출 잠재 모드에서 후보 패널·목록 숨김(실제 표시)", await pg.evaluate("()=>getComputedStyle(document.getElementById('candpanel')).display==='none' && getComputedStyle(document.getElementById('cand')).display==='none' && getComputedStyle(document.getElementById('indpanel')).display!=='none'"))
        # 1. 모드 들어가기 — 예시 기준점(시청역)
        await pg.click("#m-cand"); await pg.wait_for_timeout(800)
        vis = await pg.evaluate("()=>({cp:!document.getElementById('candpanel').hidden, ip:!document.getElementById('indpanel').hidden, cs:!document.getElementById('cand').hidden, cmp:[...document.querySelectorAll('section.cmp')].map(x=>x.hidden), bn:document.getElementById('banner').hidden?null:document.getElementById('banner').textContent})")
        chk("후보 패널·목록 보이고 업종 목록·비교 숨김", vis["cp"] and not vis["ip"] and vis["cs"] and all(vis["cmp"]), vis)
        chk("예시 기준점 안내", vis["bn"] and "예시(시청역)" in vis["bn"], vis["bn"])
        s = await pg.evaluate(STATE)
        chk("그래프 두 겹 이웃 맞음", s["bad"] == 0, s["bad"])
        chk("예시 기준점 이름·노선 순서", s["base"]["label"] == "시청역 (1호선·2호선)", s["base"]["label"])
        chk("후보 찾기에서는 상권 경계 끔", await pg.evaluate("()=>document.getElementById('showrent').disabled"))
        # 2. 시간: JS 다익스트라 = 파이썬 다익스트라 (세 수단 × 여러 출발 칸)
        rng = np.random.default_rng(5); origins = [int(x) for x in rng.choice(REF.C, 5, replace=False)] + [s["base"]["cell"]]
        worst = {}
        for mode in ("car", "walk", "pt"):
            for per in (("day",) if mode == "walk" else ("day", "am", "pm")):
                for o in origins:
                    js = np.array(await pg.evaluate(f"()=>window.__jeomji.candTimes('{mode}',{o},'{per}')"), dtype=float); js[js < 0] = np.inf
                    py = REF.times(mode, o, per)
                    fin = np.isfinite(js) | np.isfinite(py)
                    same_fin = bool((np.isfinite(js) == np.isfinite(py)).all())
                    d = float(np.max(np.abs(js[fin] - py[fin]))) if fin.any() and same_fin else math.inf
                    worst[mode + ("" if per == "day" else "·" + per)] = max(worst.get(mode + ("" if per == "day" else "·" + per), 0), d)
        for mode, d in worst.items(): chk(f"시간 일치 {mode} (최대 차 초)", d < 1e-6, d)
        # 대중교통: 버스·역별 환승이 그래프에 들어갔는지, 계산이 충분히 빠른지
        g = await pg.evaluate("()=>{const t0=performance.now(); const T=window.__jeomji.candTimes('pt',%d); return {ms:performance.now()-t0, n:T.length}}" % origins[0])
        chk("대중교통 시간 계산 0.5초 안 (그래프 만든 뒤)", g["ms"] < 500, round(g["ms"]))
        chk("대중교통 버튼 이름", (await pg.inner_text("#candpanel .seg button[data-m='pt']")) == "대중교통")
        # 3. 기본 상태(빨래방·자동차 30분·매출 잠재 순) = 기준 계산
        st, ref = await same_as_ref(pg, "기본")
        chk("기본 유형·순서", st["t"] == "빨래방" and st["sort"] == "pot" and st["mode"] == "car" and st["min"] == 30, (st["t"], st["sort"]))
        info = await pg.inner_text("#info")
        chk("깔때기 문구", f"자동차 30분 안에 닿는 칸\n{ref['reach']:,}칸" in info and f"그중 자리 조건에 맞는 칸\n{ref['prof']:,}칸" in info and f"매출 잠재 높은 순으로 뽑은 후보\n{len(ref['list'])}곳" in info, info[:300])
        legend = await pg.inner_text("#legend"); foot = await pg.inner_text("#mapfoot")
        chk("범례·지도 아래", "걸리는 시간(분)" in legend and "OpenStreetMap" in foot and f"{ref['reach']:,}칸" in foot, (legend[:80], foot))
        # 후보 띄우기: 땅 위 0.7km 안에 다른 후보 없음 (이웃 두 겹도 없음)
        lst = st["list"]; nb = REF.NB; X, Y = REF.V["x"], REF.V["y"]; cosl = math.cos(math.radians(37.55))
        close = [(a, c) for a in lst for c in lst if a < c and math.hypot(X[a] - X[c], Y[a] - Y[c]) * cosl < 700]
        ring = [(a, c) for a in lst for c in lst if a < c and (c in nb[a*6:a*6+6] or any(c in nb[j*6:j*6+6] for j in nb[a*6:a*6+6] if j >= 0))]
        chk("후보끼리 0.7km 넘게 떨어짐", not close and not ring, (close[:3], ring[:3]))
        tb = await pg.evaluate(f"()=>window.__jeomji.candTimes('car',{st['base']['cell']})")
        chk("기준 칸 = 0분", tb[st["base"]["cell"]] == 0, tb[st["base"]["cell"]])
        mins = await pg.evaluate("()=>[...document.querySelectorAll('#clist .ccard .tm')].map(e=>+e.textContent.replace(/[^0-9]/g,''))")
        chk("카드 분 ≤ 정한 시간(올림 표시)", mins and max(mins) <= st["min"], mins[:5])
        chk("후보 20곳", len(lst) == 20, len(lst))
        await pg.screenshot(path=SHOT + "/cand_default.png", full_page=False)
        # 4. 도보 15분 → 조건 칸이 적음
        await pg.click("#candpanel .seg button[data-m='walk']"); await pg.wait_for_timeout(300)
        await pg.evaluate("()=>{const r=document.getElementById('c-min'); r.value=15; r.dispatchEvent(new Event('input'));}"); await pg.wait_for_timeout(300)
        st, ref = await same_as_ref(pg, "도보 15분")
        warn = await pg.evaluate("()=>{const w=document.querySelector('#info .warn'); return w?w.textContent:null}")
        chk("후보가 적을 때 알림", (len(st["list"]) < 20) == (warn is not None), (len(st["list"]), warn))
        # 5. 대중교통 45분 · 스터디카페(매출 잠재 없음 → 주민 순) · 같은 업종 2곳 이하
        await pg.click("#candpanel .seg button[data-m='pt']"); await pg.wait_for_timeout(200)
        await pg.evaluate("()=>{const r=document.getElementById('c-min'); r.value=45; r.dispatchEvent(new Event('input'));}"); await pg.wait_for_timeout(200)
        await pg.select_option("#c-type", "스터디카페"); await pg.wait_for_timeout(200)
        await pg.select_option("#c-comp", "2"); await pg.wait_for_timeout(300)
        st, ref = await same_as_ref(pg, "대중교통 45분 스터디카페 2곳 이하")
        info = await pg.inner_text("#info")
        chk("대중교통 설명에 버스·환승 출처", "버스" in info and "TOPIS" in info and "서울교통공사" in info, info[-600:])
        # 5b. 시간대 — 출근·퇴근으로 바꾸면 그 시간대 시간으로 다시 뽑는다
        for per, nm in (("am", "출근"), ("pm", "퇴근")):
            await pg.click(f"#c-per button[data-p='{per}']"); await pg.wait_for_timeout(300)
            st, ref = await same_as_ref(pg, f"대중교통 45분 {nm}")
            pr = await pg.evaluate("()=>[...document.querySelectorAll('#c-per button')].map(b=>b.getAttribute('aria-pressed'))")
            chk(f"시간대 단추 {nm} 눌림", st["per"] == per and pr.count("true") == 1, (st["per"], pr))
            lg = await pg.inner_text("#legend")
            chk(f"범례에 시간대({nm})", nm in lg, lg[:80])
        await pg.click("#candpanel #c-mode button[data-m='walk']"); await pg.wait_for_timeout(300)
        chk("도보는 시간대와 상관없다는 안내", "상관없" in (await pg.inner_text("#c-pern")))
        await pg.click("#candpanel #c-mode button[data-m='pt']"); await pg.wait_for_timeout(300)
        opts = await pg.evaluate("()=>[...document.querySelectorAll('#c-sort option')].map(o=>o.value)")
        chk("매출 잠재 없는 유형은 순서에서 뺌", opts == ["res", "few", "near"] and st["sort"] == "res", (opts, st["sort"]))
        # 6. 순서 바꾸기 · 자리 조건 끄기
        await pg.select_option("#c-sort", "few"); await pg.wait_for_timeout(200); await same_as_ref(pg, "같은 업종 적은 순")
        await pg.select_option("#c-sort", "near"); await pg.wait_for_timeout(200); await same_as_ref(pg, "가까운 순")
        await pg.click("#c-prof"); await pg.wait_for_timeout(300); await same_as_ref(pg, "자리 조건 끔")
        await pg.click("#c-prof"); await pg.wait_for_timeout(200)
        # 7. 유형 되돌림: 사용자가 순서를 골랐으면 유지
        await pg.select_option("#c-type", "카페"); await pg.wait_for_timeout(300)
        st = await pg.evaluate(STATE); chk("고른 순서 유지(카페로 바꿔도 가까운 순)", st["sort"] == "near", st["sort"])
        await same_as_ref(pg, "카페 가까운 순")
        # 8. 동·역 이름으로 기준점
        await pg.fill("#c-q", "강남"); await pg.press("#c-q", "Enter"); await pg.wait_for_timeout(700)
        st = await pg.evaluate(STATE)
        chk("역 이름으로 기준점", st["base"]["label"].startswith("강남역 (") and st["base"]["src"] == "st", st["base"])
        await same_as_ref(pg, "강남역 기준")
        await pg.fill("#c-q", "역삼1동"); await pg.press("#c-q", "Enter"); await pg.wait_for_timeout(600)
        st = await pg.evaluate(STATE); chk("동 이름으로 기준점", st["base"]["label"] == "역삼1동 (강남구)" and REF.V["dongs"][REF.V["dong"][st["base"]["cell"]]] == "역삼1동|강남구", st["base"])
        key0 = await pg.evaluate("()=>document.getElementById('cand').dataset.key")
        await pg.click("#c-type"); await pg.wait_for_timeout(200)       # 칸을 떠나 change가 한 번 더 와도 그대로
        chk("Enter 뒤 칸을 떠나도 다시 계산 안 함", (await pg.evaluate(STATE))["base"]["label"] == "역삼1동 (강남구)" and key0 == await pg.evaluate("()=>document.getElementById('cand').dataset.key"))
        await pg.keyboard.press("Escape")
        await pg.fill("#c-q", "역삼동"); await pg.press("#c-q", "Enter"); await pg.wait_for_timeout(500)
        st = await pg.evaluate(STATE); bt = await pg.inner_text("#c-base")
        chk("법정동 이름(역삼동) → 역삼1동 + 비슷한 이름", st["base"]["label"] == "역삼1동 (강남구)" or st["base"]["label"] == "역삼2동 (강남구)", (st["base"]["label"], bt))
        chk("비슷한 이름 알림", "비슷한 이름: 역삼" in bt, bt)
        await pg.fill("#c-q", "삼성동"); await pg.press("#c-q", "Enter"); await pg.wait_for_timeout(500)
        bt = await pg.inner_text("#c-base")
        chk("삼성동 — 관악구 삼성동, 강남구 삼성1·2동을 알림", "삼성동 (관악구)" in bt and "삼성1동 (강남구)" in bt, bt)
        before = (await pg.evaluate(STATE))["base"]["label"]
        await pg.fill("#c-q", "constructor"); await pg.press("#c-q", "Enter"); await pg.wait_for_timeout(300)
        chk("내장 속성 이름은 못 찾음으로", (await pg.evaluate(STATE))["base"]["label"] == before and "찾지 못했습니다" in await pg.inner_text("#c-base"))
        await pg.fill("#c-q", "없는곳이름"); await pg.press("#c-q", "Enter"); await pg.wait_for_timeout(300)
        chk("못 찾으면 알림", "찾지 못했습니다" in await pg.inner_text("#c-base"))
        bn = await pg.evaluate("()=>document.getElementById('banner').hidden"); chk("예시가 아니면 안내 숨김", bn)
        # 9. 지도에서 찍기
        await pg.click("#c-pick"); await pg.wait_for_timeout(200)
        chk("찍기 켜짐", (await pg.evaluate(STATE))["pick"] and not await pg.evaluate("()=>document.getElementById('banner').hidden"))
        m = await pg.query_selector("#map"); bb = await m.bounding_box()
        await pg.mouse.click(bb["x"] + bb["width"] * 0.42, bb["y"] + bb["height"] * 0.55); await pg.wait_for_timeout(700)
        st = await pg.evaluate(STATE)
        chk("찍은 곳이 기준점", st["base"]["src"] == "click" and st["base"]["label"].startswith("지도에서 찍은 곳 — ") and not st["pick"], st["base"])
        await same_as_ref(pg, "찍은 기준점")
        # 9b. 고정한 칸 정보는 다시 계산하면 닫힘
        await pg.click("#clist .ccard:first-child"); await pg.wait_for_timeout(1200)
        op = await pg.evaluate("()=>!document.getElementById('tt').hidden")
        await pg.select_option("#c-comp", "5"); await pg.wait_for_timeout(300)
        chk("다시 계산하면 칸 정보 닫힘", op and await pg.evaluate("()=>document.getElementById('tt').hidden"), op)
        await pg.select_option("#c-comp", "2"); await pg.wait_for_timeout(300)
        # 9c. 카드를 누르고 곧바로 모드를 바꿔도 손익 점검 칸이 바뀌지 않음
        cell0 = await pg.evaluate("()=>document.getElementById('be').dataset.cell")
        await pg.evaluate("()=>{ window.scrollTo(0,0); }"); await pg.wait_for_timeout(200)
        await pg.evaluate("()=>{ document.querySelector('#clist .ccard').click(); document.getElementById('m-pot').click(); }"); await pg.wait_for_timeout(900)
        chk("카드 뒤 곧바로 모드 바꿔도 손익 점검 그대로", cell0 == await pg.evaluate("()=>document.getElementById('be').dataset.cell"), (cell0,))
        await pg.click("#m-cand"); await pg.wait_for_timeout(500)
        # 10. 칸 위 정보와 고정 정보의 단추
        lst = st["list"]
        if lst:
            c0 = lst[0]
            await pg.click("#clist .ccard:first-child"); await pg.wait_for_timeout(1200)
            tt = await pg.evaluate("()=>{const t=document.getElementById('tt'); return t.hidden?null:t.innerText}")
            chk("카드 → 지도 이동·칸 정보", tt is not None and "후보 1" in tt and "기준점에서" in tt, (tt or "")[:160])
            chk("칸 정보에 단추 둘", tt is not None and "여기를 기준점으로" in tt and "손익 점검에 넣기" in tt)
            await pg.click("#clist .ccard:first-child .acts button:nth-child(2)"); await pg.wait_for_timeout(900)
            be = await pg.evaluate("()=>({cell:+document.getElementById('be').dataset.cell, un:document.getElementById('be').dataset.un, ind:document.getElementById('be-ind').value, ex:document.getElementById('be').dataset.example})")
            chk("손익 점검에 넣기 → 그 칸·무인 유형", be["cell"] == c0 and be["ind"] == "UN-카페" and be["un"] == "카페" and be["ex"] == "0", be)
        # 11. 모드 돌아가기 → 층·구획 원래대로
        await pg.click("#m-pot"); await pg.wait_for_timeout(500)
        chk("후보 패널이 실제로 사라짐", await pg.evaluate("()=>getComputedStyle(document.getElementById('candpanel')).display==='none' && getComputedStyle(document.getElementById('cand')).display==='none'"))
        back = await pg.evaluate("()=>({cp:document.getElementById('candpanel').hidden, ip:document.getElementById('indpanel').hidden, cs:document.getElementById('cand').hidden, cmp:[...document.querySelectorAll('section.cmp')].map(x=>x.hidden), lg:document.getElementById('legend').innerText.slice(0,30)})")
        chk("매출 잠재로 돌아감", back["cp"] and not back["ip"] and back["cs"] and not any(back["cmp"]) and "점포당 매출" in back["lg"], back)
        chk("상권 경계 다시 켤 수 있음", not await pg.evaluate("()=>document.getElementById('showrent').disabled"))
        # 12. 새로 열면 모드·조건 그대로
        await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.click("#m-cand"); await pg.wait_for_timeout(600)
        st2 = await pg.evaluate(STATE)
        chk("다시 열어도 조건 유지", st2["t"] == "카페" and st2["mode"] == "pt" and st2["per"] == "pm" and st2["min"] == 45 and st2["comp"] == 2 and st2["sort"] == "near" and st2["base"]["src"] == "click", (st2["t"], st2["mode"], st2["per"], st2["min"], st2["comp"], st2["sort"], st2["base"]["src"]))
        await same_as_ref(pg, "다시 연 뒤")
        await pg.reload(); await pg.wait_for_timeout(1500)
        chk("다시 열면 후보 찾기 모드로", (await pg.evaluate("()=>document.getElementById('m-cand').getAttribute('aria-pressed')")) == "true")
        # 12b. 망가진 저장값 → 기본값으로, 오류 없음
        await pg.evaluate("""()=>localStorage.setItem('jeomji-cand',JSON.stringify({t:'constructor',mode:'toString',sort:'valueOf',min:'30',comp:'x',prof:'y',base:{cell:'5',x:'1',y:2,label:'x',src:'click'}}))""")
        await pg.reload(); await pg.wait_for_timeout(1500)
        st3 = await pg.evaluate(STATE)
        chk("망가진 저장값은 기본값", st3["t"] == "빨래방" and st3["mode"] == "car" and st3["sort"] == "pot" and st3["base"]["src"] == "example" and st3["min"] == 30, st3 and (st3["t"], st3["mode"], st3["sort"], st3["base"]))
        await pg.evaluate("()=>localStorage.setItem('jeomji-cand','{not json')"); await pg.reload(); await pg.wait_for_timeout(1500)
        chk("깨진 JSON도 열림", (await pg.evaluate(STATE))["base"]["src"] == "example")
        # 13. 개업 모드(이웃을 이동 그래프에서 빌려 씀)
        await pg.click("#m-entry"); await pg.wait_for_timeout(600)
        foot = await pg.inner_text("#mapfoot"); chk("개업 모드 정상", "새 가게가 생긴 칸" in foot, foot[:80])
        await pg.click("#m-cand"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=SHOT + "/cand_after.png")
        print("errors:", errs); chk("콘솔 오류 없음", not errs, errs[:3])
        # 14. 모바일
        mctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); mp = await mctx.new_page(); merr = []
        mp.on("pageerror", lambda e: merr.append(str(e))); mp.on("console", lambda m: merr.append(m.text) if m.type == "error" else None)
        await mctx.route("**/*", route); await mp.goto(PAGE); await mp.wait_for_timeout(1500)
        await mp.click("#m-cand"); await mp.wait_for_timeout(800)
        ov = await mp.evaluate("()=>({sw:document.documentElement.scrollWidth, iw:window.innerWidth, cards:document.querySelectorAll('#clist .ccard').length})")
        chk("모바일 가로 넘침 없음", ov["sw"] <= ov["iw"], ov)
        await mp.screenshot(path=SHOT + "/cand_mobile_top.png", full_page=False)
        await (await mp.query_selector("#candpanel")).screenshot(path=SHOT + "/cand_mobile_panel.png")
        await (await mp.query_selector("#clist .ccard")).screenshot(path=SHOT + "/cand_mobile_card.png")
        mm = await mp.query_selector("#map"); mb = await mm.bounding_box()
        await mp.tap("#map", position={"x": mb["width"] * 0.5, "y": mb["height"] * 0.5}); await mp.wait_for_timeout(700)
        ms = await mp.evaluate(STATE)
        chk("모바일: 예시 기준점에서 지도 누르면 기준점", ms["base"]["src"] == "click", ms["base"])
        await mp.tap("#map", position={"x": mb["width"] * 0.6, "y": mb["height"] * 0.4}); await mp.wait_for_timeout(500)
        mtt = await mp.evaluate("()=>{const t=document.getElementById('tt'); return t.hidden?null:t.innerText}")
        chk("모바일: 다음 누름은 칸 정보", mtt is not None and "기준점에서" in mtt, (mtt or "")[:80])
        chk("모바일 콘솔 오류 없음", not merr, merr[:3])
        # 15. 어두운 화면
        dctx = await b.new_context(viewport={"width": 1360, "height": 1000}, color_scheme="dark"); dp = await dctx.new_page()
        await dctx.route("**/*", route); await dp.goto(PAGE); await dp.wait_for_timeout(1500)
        await dp.click("#m-cand"); await dp.wait_for_timeout(800)
        await dp.screenshot(path=SHOT + "/cand_dark.png")
        await b.close()
    print(f"OK {len(OK)} · BAD {len(BAD)}")
    for x in BAD: print("  BAD:", x)
asyncio.run(main())
