# -*- coding: utf-8 -*-
"""무인 6종 비교 — p21 산출(무인_*.csv)과 업종 생존표·손익·뷰어 데이터를 한 장의 비교 페이지로 묶는다 (마스터플랜 §5.16)

사용:  python3 build_compare.py [결과 폴더]      (기본 ../analysis/panel/결과)
출력:  무인_비교.html       — 전체 문서. 브라우저로 바로 연다 (글꼴만 Google Fonts에서 받는다)
       무인_비교_본문.html  — Claude Artifact 게시용 (doctype·head 없이 본문만)
       무인_비교_data.json  — 페이지에 쓴 숫자 (점검용)
숫자는 모두 결과 폴더의 파일에서 읽는다. 바깥 자료는 2025년 4월 서울시 발표의 유형별 명단 수 하나뿐이다(APR).
매출·창업비는 p22가 공정위 정보공개서 값을 정리한 결과/무인_브랜드.csv·무인_브랜드_요약.csv에서 읽는다."""
import json, csv, sys, os, re, html, unicodedata as ud
from collections import Counter
H = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, "..", "analysis", "panel", "결과")
rd = lambda f: list(csv.DictReader(open(os.path.join(R, f), encoding="utf-8-sig")))
fl = lambda x: float(x) if x not in ("", None, "nan") else None

TYPES = ["빨래방", "스터디카페", "아이스크림", "카페", "사진관", "밀키트"]
APR = {"빨래방": 963, "스터디카페": 909, "아이스크림": 929, "카페": 476, "사진관": 404, "밀키트": 148}   # 서울시 2025-04 발표 (3~4월 조사)
SURV = {"빨래방": ["S20902", "S20901"], "스터디카페": ["R10202"], "아이스크림": ["G20404", "G20405"], "카페": ["I21201"],
        "사진관": ["M11301"], "밀키트": ["G20509"]}                         # 생존을 읽을 코드 (붙은 가게가 주로 실린 코드)
VIEW = {"빨래방": ["S20901", "S20902"], "스터디카페": ["R10202"], "아이스크림": ["G20404"], "카페": ["I21201"], "사진관": ["M11301"],
        "밀키트": ["G20509"]}                                                 # 점지에서 볼 코드 (아이스크림은 슈퍼마켓만 — 편의점 지도는 편의점 매출 잠재라서)
SALES = {"S20901": "CS200031", "S20902": "CS200031", "G20404": "CS300001", "G20405": "CS300002", "I21201": "CS100010", "G20509": "CS300010"}
TREND = {  # 흐름 — 명단 증감(4월→12월) · 보정한 새 가게 무인 몫(재고 대비) · 등록 연도별 추세를 함께 보고 붙인 말
    "빨래방": ("up", "늘어나는 중"), "스터디카페": ("flat", "줄지 않음"), "아이스크림": ("slow", "정점 지나 둔화"),
    "카페": ("flat", "작은 몫, 명단은 늘어남"), "사진관": ("down", "줄어드는 중"), "밀키트": ("down", "줄어드는 중")}
PLACE = {  # 자리 한 줄 — 아래 숫자(1층·주변 점포·거주 기울기)를 말로 옮긴 것
    "빨래방": "1층, 세탁소보다 가게가 많은 쪽", "스터디카페": "2층 이상, 다른 스터디카페와 같은 자리", "아이스크림": "1층, 주변 가게가 적은 주거지",
    "카페": "1층, 주변 가게가 적은 주거지", "사진관": "1층, 번화가", "밀키트": "1층, 주변 가게가 적은 주거지"}

O = {r["유형"]: r for r in rd("무인_검정.csv")}
K = rd("무인_업종.csv")
Y = rd("무인_등록연도.csv")
S = {r["cat_s"]: r for r in rd("업종별_생존.csv")}
B = {r["코드"]: r for r in rd("손익_업종.csv")}
W = rd("무인_연결.csv")
BR = rd("무인_브랜드.csv"); BS = {r["유형"]: r for r in rd("무인_브랜드_요약.csv")}     # p22 — 가맹 정보공개서
VD = json.load(open(os.path.join(R, "viewer_data.json"), encoding="utf-8"))
EN = json.load(open(os.path.join(R, "entry_data.json"), encoding="utf-8"))
LINK = {"정확", "정확(상호)", "상호+지점", "유사", "포함", "동명"}

# 코드 단위 무인 요약 (뷰어 build_viewer.py와 같은 계산)
by = {}
for r in K: by.setdefault(r["업종코드"], []).append(r)
def code_sum(c):
    rows = sorted(by[c], key=lambda r: -int(r["무인"])); r0 = rows[0]; n = sum(int(r["무인"]) for r in rows)
    rest = int(r0["코드점포"]) - int(r0["무인"]); nf = sum(int(r["층무인"]) for r in rows)
    f1u = sum(fl(r["일층무인"]) * int(r["층무인"]) for r in rows if r["일층무인"]) / nf if nf else None
    return {"nm": r0["업종명"], "n": n, "N": rest + n, "f1": [f1u, fl(r0["일층나머지"])], "fb": [fl(r0["지하무인"]), fl(r0["지하나머지"])],
            "nb": [fl(r0["주변무인"]), fl(r0["주변나머지"])],
            "res": [fl(r0["거주무인"]), fl(r0["거주나머지"])]}

# 이름 쏠림 — 일반 낱말을 뺀 첫 상호 낱말
nz = lambda s: re.sub(r"[^0-9a-z가-힣]", "", ud.normalize("NFC", str(s)).lower())
GEN = ["스터디카페", "셀프빨래방", "코인빨래방", "아이스크림", "무인카페", "셀프사진관", "할인점", "전문점", "빨래방", "스터디",
       "스튜디오", "사진관", "밀키트", "세계과자", "24시", "무인", "셀프", "카페", "코인", "포토", "할인", "과자", "24"]
def core(s):
    for g in GEN: s = s.replace(g, "")
    return s
def brand(n):
    t = [x for x in (nz(w) for w in re.sub(r"\(.*?\)", " ", n).split()) if x]
    if len(t) >= 2 and re.search(r"(점|센터)$", t[-1]): t = t[:-1]
    for x in t:
        if len(core(x)) >= 2: return x
    return t[0] if t else ""
SHOW = {"크린토피아": "크린토피아", "화이트365": "화이트365", "워시엔조이": "워시엔조이", "작심스터디카페": "작심", "초심스터디카페": "초심",
        "위넌스터디카페": "위넌", "얼음왕국": "얼음왕국", "더까까주까": "더까까주까", "마켓모아모아": "마켓모아모아", "만월경": "만월경",
        "데이롱카페": "데이롱카페", "카페프리헷": "카페프리헷", "포토그레이": "포토그레이", "포토이즘박스": "포토이즘박스", "인생네컷": "인생네컷",
        "담꾹": "담꾹", "올쿡24": "올쿡24", "더반": "더반"}

D = {}
for t in TYPES:
    o = O[t]; rows = [w for w in W if w["유형"] == t]; lk = [w for w in rows if w["방법"] in LINK]
    cc = Counter(w["업종명"] for w in lk); codes = [[k, v, v / len(lk)] for k, v in cc.most_common(3)]
    bc = Counter(brand(w["업소명"]) for w in rows); top8 = sum(v for _, v in bc.most_common(8)) / len(rows)
    main = SURV[t][0] if t != "빨래방" else "S20901"           # 자리·무인 몫은 주 코드(빨래방은 세탁소 — 무인과 유인을 견줄 수 있는 코드)
    cs = code_sum(main)
    yr = [r for r in Y if r["유형"] == t]
    surv = [{"code": c, "nm": S[c]["업종"], "s12": fl(S[c]["S12_추정"]), "lo": fl(S[c]["S12_하"]), "hi": fl(S[c]["S12_상"]),
             "close": fl(S[c]["기존_연폐업률"]), "obs": S[c]["비고"]} for c in SURV[t]]
    pot = [d for d in VD["ind"] if set(d["codes"]) & set(VIEW[t])]
    ent = [d for d in EN["ind"] if d["k"] in VIEW[t]]
    sal = [B[k] for k in dict.fromkeys(SALES[c] for c in VIEW[t] if c in SALES) if k in B]
    D[t] = {
        "list": int(o["명단"]), "apr": APR[t], "chg": int(o["명단"]) / APR[t] - 1, "linked": int(o["붙음"]), "rate": fl(o["연결률"]),
        "codes": codes, "survcodes": surv,
        "diff": [fl(o["반년폐업차"]), fl(o["반년폐업차_하"]), fl(o["반년폐업차_상"])], "cl_u": fl(o["반년폐업_무인"]),
        "main": main, "main_nm": cs["nm"], "share": cs["n"] / cs["N"], "f1": cs["f1"], "fb": cs["fb"], "nb": cs["nb"], "res": cs["res"],
        "open": [fl(o["주코드_개업무인몫"]), fl(o["주코드_개업무인몫_보정"]), fl(o["주코드_무인몫"]), int(o["주코드_개업수"])],
        "years": [[r["등록연도"], fl(r["무인몫"]), fl(r["보정무인몫"]), int(r["무인"]), int(r["전체"])] for r in yr],
        "top8": top8, "brands": [SHOW.get(k, k) for k, _ in bc.most_common(3)],
        "pot": [{"nm": d["nm"], "paint": bool(d.get("paint")), "rho": d.get("rho")} for d in pot],
        "entry": [d["nm"] for d in ent],
        "sales": [{"nm": s["업종"], "mean": fl(s["서울평균"]), "p50": fl(s["p50"])} for s in sal],
        "trend": TREND[t], "place": PLACE[t],
        "money": {k: (int(v) if re.fullmatch(r"\d+", v) else (float(v) if re.fullmatch(r"[\d.]+", v) else v)) for k, v in BS[t].items()},
        "brands_ftc": [{k: b[k] for k in ("영업표지", "기준연도", "가맹점", "서울가맹점", "월매출_만원", "월매출_기준", "어림면적_㎡", "창업비추정_만원",
                                           "인테리어더함_만원", "신규", "문닫음", "문닫은비율", "기본값", "빠진까닭", "비고")} for b in BR if b["유형"] == t]}
json.dump(D, open(os.path.join(H, "무인_비교_data.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ── 쓰기 도우미
e = html.escape
pc = lambda v, d=0: "—" if v is None else (f"{v*100:.{d}f}%")
def pp(v): return "—" if v is None else f"{v*100:+.1f}%p".replace("-", "−")
def cm(n): return f"{n:,.0f}"
def pct_small(v): return "—" if v is None else (f"{v*100:.1f}%" if v < 0.1 else f"{v*100:.0f}%")
def won(n):  # 만 원 정수 → '920만' · '1.6억' (표)
    return f"{n/10000:.1f}억" if n >= 10000 else f"{n:,}만"
def wonr(n):  # 글 속에서는 100만 단위로 둥글게
    return f"{n/10000:.1f}억" if n >= 10000 else f"{int(round(n / 100.0)) * 100:,}만"
def won_rng(a, b):
    if a >= 10000 and b >= 10000: return f"{a/10000:.1f}~{b/10000:.1f}억"
    if a < 10000 and b < 10000: return f"{a:,}~{b:,}만"
    return f"{won(a)}~{won(b)}"
r10 = lambda n: f"{int(round(n / 10.0)) * 10:,}만"
SHORT = {"어라운드스터디카페(A.round study cafe)": "어라운드스터디카페", "워시아워 (WASHHOUR)": "워시아워"}
sn = lambda s: SHORT.get(s, s)

def spark(t):
    ys = D[t]["years"]; vals = [y[2] for y in ys]; mx = max(vals) * 1.15
    w, h, px, py = 112, 34, 6, 5
    X = [px + i * (w - 2 * px) / (len(vals) - 1) for i in range(len(vals))]; Yp = [h - py - (v / mx) * (h - 2 * py) for v in vals]
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in zip(X, Yp))
    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{3.6 if i == len(vals) - 1 else 2.8}" class="pt{" end" if i == len(vals) - 1 else ""}">'
                   f'<title>{e(ys[i][0])} 등록: 무인 몫 {pct_small(ys[i][1])} → 보정 {pct_small(ys[i][2])} (무인 {ys[i][3]}곳 / {cm(ys[i][4])}곳)</title></circle>'
                   for i, (x, y) in enumerate(zip(X, Yp)))
    lab = " → ".join(f"{round(v*100)}" for v in vals) + "%"
    small = min(y[3] for y in ys) < 10
    return (f'<svg class="spark" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="등록 연도별 무인 몫(보정) {lab}">'
            f'<polyline points="{pts}" class="ln"/>{dots}</svg><span class="sl">{lab}</span>' + ('<span class="warn">표본 적음</span>' if small else ""))

ARROW = {"up": "↗", "flat": "→", "slow": "↘", "down": "↘"}
def chip(t):
    k, txt = D[t]["trend"]; return f'<span class="chip {k}"><span aria-hidden="true">{ARROW[k]}</span> {e(txt)}</span>'

def view_list(t):
    d = D[t]; v = []
    for p in d["pot"]: v.append("매출 잠재" + ("" if p["paint"] else "(칠하지 않음)"))
    if d["entry"]: v.append("개업 지도")
    v.append("손익 점검")                     # 무인 유형(가맹 브랜드 값)은 여섯 모두 고를 수 있다
    v.append("무인 가게 칸")
    return " · ".join(dict.fromkeys(v))

CODES_SHORT = {"빨래방": "셀프 빨래방 + 세탁소", "스터디카페": "독서실/스터디카페", "아이스크림": "슈퍼마켓 (편의점 일부)", "카페": "카페",
               "사진관": "사진촬영업", "밀키트": "반찬/식료품 (여러 코드에 흩어짐)"}
def surv_short(t):
    s = D[t]["survcodes"]
    if t == "빨래방": return f'{pc(s[0]["s12"])}~{pc(s[1]["s12"])} · 연 폐업 {pc(s[0]["close"])}'
    return f'{pc(s[0]["s12"])} · 연 폐업 {pc(s[0]["close"])}'
def floor_short(t):
    f = D[t]["f1"]
    if t == "스터디카페": return f"2층 이상 {pc(1 - f[0] - D[t]['fb'][0])}"      # 1층도 지하도 아닌 곳
    return f"1층 {pc(f[0])}"

cards = []
for t in TYPES:
    d = D[t]
    cards.append(f'''<article class="card" id="{e(t)}">
  <header><h3>{e(t)}</h3><span class="cnt">명단 {cm(d["list"])}곳</span></header>
  {chip(t)}
  <dl>
    <div><dt>볼 코드</dt><dd>{e(CODES_SHORT[t])}</dd></div>
    <div><dt>1년 생존</dt><dd class="num">{surv_short(t)}</dd></div>
    <div><dt>가맹 평균</dt><dd class="num">월 {d["money"]["월매출_중간_만원"]:,}만 · 창업 {won(d["money"]["창업비_중간_만원"])}</dd></div>
    <div><dt>자리</dt><dd>{floor_short(t)} · {e(d["place"].split(", ",1)[1])}</dd></div>
    <div><dt>점지에서</dt><dd>{e(view_list(t))}</dd></div>
  </dl>
</article>''')

# ── 표
def row(label, cells, note="", cls=""):
    tds = "".join(f'<td class="{cls}">{c}</td>' for c in cells)
    return f'<tr><th scope="row">{label}{f"<small>{note}</small>" if note else ""}</th>{tds}</tr>'
def group(title): return f'<tr class="grp"><th colspan="7" scope="colgroup">{title}</th></tr>'

T = []
T.append(group("규모와 흐름"))
T.append(row("서울 명단", [f'<b>{cm(D[t]["list"])}</b><small>4월 {cm(D[t]["apr"])} → {pp(D[t]["chg"]).replace("%p","%")}</small>' for t in TYPES],
             "2025년 12월 기준 · 4월 발표 대비", "num"))
T.append(row("흐름", [chip(t) for t in TYPES], "아래 세 줄을 함께 본 판단"))
T.append(row("등록 연도별 무인 몫<br>(보정)", [spark(t) for t in TYPES], "2022 이전 → 2023 → 2024 → 2025 · 주 코드 안", "sp"))
T.append(row("새 가게 중 무인 몫", [f'<b>{pct_small(D[t]["open"][1])}</b><small>재고&nbsp;{pct_small(D[t]["open"][2])} · 보정&nbsp;전&nbsp;{pct_small(D[t]["open"][0])}</small>' if t != "밀키트"
                                  else f'<b>—</b><small>새 가게 중 무인 1곳뿐</small>' for t in TYPES], "2025 상반기 개업 중 그해 말까지 남은 가게 · 보정", "num"))
T.append(group("버티는 힘"))
T.append(row("주로 실린 코드", ["<br>".join(f'{e(c[0])} <span class="num">{pc(c[2])}</span>' for c in D[t]["codes"][:2] if c[2] >= 0.02) +
                              ('<small>아이스크림 할인점 코드는 3곳</small>' if t == "아이스크림" else "") for t in TYPES], "이름으로 찾은 가게 중"))
T.append(row("그 코드 새 가게<br>1년 생존", ["<br>".join(f'{e(s["nm"])} <b class="num">{pc(s["s12"])}</b> <span class="num ci">{pc(s["lo"])}~{pc(s["hi"])}</span>' for s in D[t]["survcodes"]) for t in TYPES],
             "2025년 새 가게 · 추정과 95% 구간"))
T.append(row("기존 가게 연 폐업률", ["<br>".join(f'{e(s["nm"])} <b class="num">{pc(s["close"])}</b>' for s in D[t]["survcodes"]) for t in TYPES]))
T.append(row("무인 − 같은 코드 나머지", [f'<b class="num">{pp(D[t]["diff"][0])}</b><small class="num">{pp(D[t]["diff"][1])} ~ {pp(D[t]["diff"][2])}</small>' for t in TYPES],
             "반년 폐업률 차이 · 95% 구간 · 모두 0을 품음", "num"))
T.append(group("자리"))
T.append(row("1층 비율", [f'<b>{pc(D[t]["f1"][0])}</b><small>나머지 {pc(D[t]["f1"][1])}</small>' for t in TYPES], "무인 · 같은 코드 나머지", "num"))
T.append(row("반경 300m 가게 수", [f'<b>{cm(D[t]["nb"][0])}</b><small>나머지 {cm(D[t]["nb"][1])}</small>' for t in TYPES], "무인 · 나머지 · 중앙값", "num"))
T.append(row("주거 쪽 기울기", [f'<b>{D[t]["res"][0]:.2f}</b><small>나머지 {D[t]["res"][1]:.2f}</small>' for t in TYPES],
             "거주 − 출근·등교 접근성 (log) · 클수록 주거지", "num"))
T.append(row("한 줄로", [e(D[t]["place"]) for t in TYPES]))
T.append(group("경쟁 구도"))
T.append(row("코드 중 무인 몫", [f'<b>{pct_small(D[t]["share"])} 이상</b><small>{e(D[t]["main_nm"])}</small>' + ('<small>셀프 빨래방 코드 38% 이상</small>' if t == "빨래방" else "") for t in TYPES],
             "주 코드 가게 중 명단으로 확인된 무인", "num"))
T.append(row("이름 쏠림", [f'<b>{pc(D[t]["top8"])}</b><small>{e(" · ".join(D[t]["brands"]))}</small>' for t in TYPES], "같은 상호 상위 8개가 명단에서 차지하는 몫", "num"))
T.append(group("매출과 창업비 — 가맹 브랜드 정보공개서"))
def moncell(t):
    m = D[t]["money"]
    if m["기본값브랜드"] == 1: x = f'<b>{m["월매출_중간_만원"]:,}만</b><small>{e(sn(m["기본값브랜드목록"]))} 1곳뿐</small>'
    else: x = f'<b>{m["월매출_중간_만원"]:,}만</b><small>{m["기본값브랜드"]}곳 · {m["월매출_최소_만원"]:,}~{m["월매출_최대_만원"]:,}만</small>'
    if t == "빨래방":
        cl = next(b for b in D[t]["brands_ftc"] if b["영업표지"] == "크린토피아")
        x += f'<small>크린토피아 {int(cl["월매출_만원"]):,}만은 세탁편의점이 섞인 값</small>'
    return x
T.append(row("가맹점 평균 월매출", [moncell(t) for t in TYPES], "연 평균 ÷ 12 · 서울 값(없으면 전국) · 브랜드 중간값", "num"))
T.append(row("어림 면적", [f'<b>{D[t]["money"]["어림면적_중간_㎡"]:.0f}㎡</b><small>약 {D[t]["money"]["어림면적_중간_㎡"]/3.3:.0f}평</small>' for t in TYPES],
             "평균 매출 ÷ 3.3㎡당 매출 · 중간값", "num"))
def costcell(t):
    m = D[t]["money"]
    return f'<b>{won(m["창업비_중간_만원"])}</b><small>{won_rng(m["창업비_최소_만원"], m["창업비_최대_만원"]) if m["기본값브랜드"] > 1 else "1곳"}</small>'
T.append(row("창업비", [costcell(t) for t in TYPES], "가맹비·교육비·보증금·인테리어·설비 · 점포 임차 비용은 빠짐 · 중간값", "num"))
T.append(row("가맹점 문 닫은 비율", [f'<b>{pc(D[t]["money"]["문닫은비율"], 1)}</b><small>새로 {D[t]["money"]["신규_합"]:,} · 닫음 {D[t]["money"]["문닫음_합"]:,}곳</small>' for t in TYPES],
             "연초 가맹점 중 계약종료·해지 · 기준연도 한 해 · 기본값 브랜드 합", "num"))
T.append(group("점지에서 볼 수 있는 것"))
def potcell(t):
    p = D[t]["pot"]
    if not p: return '<span class="no">없음</span><small>상권 매출 자료가 없는 업종</small>' if t in ("스터디카페", "사진관") else '<span class="no">없음</span><small>20개 업종 밖</small>'
    return "<br>".join(f'{e(x["nm"])} <span class="num">ρ {x["rho"]:.2f}</span>' + ("" if x["paint"] else '<small>칠하지 않음</small>') for x in p)
T.append(row("매출 잠재 지도", [potcell(t) for t in TYPES], "처음 보는 구에서 잰 순위상관 ρ"))
T.append(row("개업 지도", ["<br>".join(e(x) for x in D[t]["entry"]) if D[t]["entry"] else '<span class="no">없음</span><small>새 가게가 적은 코드</small>' for t in TYPES]))
def salescell(t):
    s = D[t]["sales"]
    x = f'<b>월 {D[t]["money"]["월매출_중간_만원"]:,}만</b><small>무인 {e(t)} · 가맹 브랜드 중간값</small>'
    if not s: return x + '<small>상권 매출 자료는 없음</small>'
    return x + "".join(f'<span class="sb">{e(y["nm"])} <span class="num">월 {y["p50"]/1e4:,.0f}만</span></span>' for y in s) + "<small>상권 코드 전체 중앙값 · 유인 가게가 대부분</small>"
T.append(row("손익 점검", [salescell(t) for t in TYPES], "업종에서 '무인 ○○'을 고르면 브랜드 값이 기본으로 들어감"))

# ── 브랜드별 표
def bt_rows():
    out = []
    for t in TYPES:
        m = D[t]["money"]
        out.append(f'<tr class="grp"><th colspan="8" scope="colgroup">{e(t)} — 기본값 월 {m["월매출_중간_만원"]:,}만 · 창업비 {won(m["창업비_중간_만원"])} · 면적 {m["어림면적_중간_㎡"]:.0f}㎡</th></tr>')
        for b in D[t]["brands_ftc"]:
            has = lambda k: b[k] not in ("", None)
            stc = f'{int(b["가맹점"]):,}<small>서울 {int(b["서울가맹점"]):,}</small>' if has("가맹점") else '<span class="no">—</span>'
            ms = f'{int(b["월매출_만원"]):,}만<small>{b["월매출_기준"]}</small>' if has("월매출_만원") else '<span class="no">—</span>'
            ar = f'{float(b["어림면적_㎡"]):.0f}㎡' if has("어림면적_㎡") else '<span class="no">—</span>'
            cs = won(int(b["창업비추정_만원"])) + ('<small>인테리어 더함</small>' if int(b["인테리어더함_만원"]) else "")
            ch = f'{int(b["신규"]):,} · {int(b["문닫음"]):,}<small>{pc(float(b["문닫은비율"]))}</small>' if has("문닫은비율") else '<span class="no">—</span>'
            memo = e(b["비고"] or b["빠진까닭"]); cls = "" if b["기본값"] == "Y" else ' class="out"'
            out.append(f'<tr{cls}><th scope="row">{e(sn(b["영업표지"]))}</th><td class="r">{b["기준연도"]}</td>'
                       f'<td class="r">{stc}</td><td class="r">{ms}</td><td class="r">{ar}</td><td class="r">{cs}</td><td class="r">{ch}</td><td class="memo">{memo}</td></tr>')
    return "\n".join(out)

# ── 돈의 크기 (고르는 법 셋째 줄) — 숫자는 요약에서, 순서가 바뀌면 글도 고쳐야 해서 확인한다
M = {t: D[t]["money"] for t in TYPES}
SO = sorted(TYPES, key=lambda t: -M[t]["월매출_중간_만원"])
assert SO == ["사진관", "스터디카페", "아이스크림", "밀키트", "빨래방", "카페"], SO
assert min(M[t]["창업비_중간_만원"] for t in ("빨래방", "스터디카페", "사진관")) > max(M[t]["창업비_중간_만원"] for t in ("카페", "밀키트", "아이스크림"))
assert min(M[t]["문닫은비율"] for t in ("밀키트", "아이스크림", "사진관")) > max(M[t]["문닫은비율"] for t in ("빨래방", "스터디카페", "카페"))
MONEY = (f'<li><b>돈의 크기를 견줍니다.</b> 가맹 브랜드 정보공개서로 보면 가맹점 평균 월매출(브랜드 중간값)은 '
         + ", ".join(f'{t} {r10(M[t]["월매출_중간_만원"])}' + ("(브랜드 1곳)" if M[t]["기본값브랜드"] == 1 else "") for t in SO)
         + f'입니다. 창업비는 점포 임차 비용을 빼고도 빨래방 {wonr(M["빨래방"]["창업비_중간_만원"])}·스터디카페 {wonr(M["스터디카페"]["창업비_중간_만원"])}·사진관 {wonr(M["사진관"]["창업비_중간_만원"])}이 크고, '
         f'카페 {wonr(M["카페"]["창업비_중간_만원"])}·밀키트 {wonr(M["밀키트"]["창업비_중간_만원"])}·아이스크림 {wonr(M["아이스크림"]["창업비_중간_만원"])}은 작습니다. '
         '아이스크림·밀키트는 매출 대부분이 물건값이라 같은 매출에서 남는 몫이 훨씬 작습니다. '
         f'한 해에 가맹점이 문 닫은 비율은 밀키트 {pc(M["밀키트"]["문닫은비율"])}·아이스크림 {pc(M["아이스크림"]["문닫은비율"])}·사진관 {pc(M["사진관"]["문닫은비율"])}로 높고, '
         f'스터디카페 {pc(M["스터디카페"]["문닫은비율"])}·빨래방 {pc(M["빨래방"]["문닫은비율"])}로 낮습니다.</li>')

data_note = f"명단 {cm(sum(D[t]['list'] for t in TYPES))}곳 중 {cm(sum(D[t]['linked'] for t in TYPES))}곳을 상가정보에서 찾았다"
PAGE = open(os.path.join(H, "compare_template.html"), encoding="utf-8").read()
PAGE = (PAGE.replace("__CARDS__", "\n".join(cards)).replace("__TABLE__", "\n".join(T)).replace("__BRANDS__", bt_rows()).replace("__MONEY__", MONEY)
            .replace("__NBRAND__", str(len(BR))))
PAGE = (PAGE
            .replace("__TH__", "".join(f'<th scope="col"><a href="#{e(t)}">{e(t)}</a></th>' for t in TYPES))
            .replace("__NLIST__", cm(sum(D[t]['list'] for t in TYPES))).replace("__NLINK__", cm(sum(D[t]['linked'] for t in TYPES))))
assert "__" not in re.sub(r"__[a-z]", "", PAGE.replace("__proto__", "")), "빈 자리 남음"
open(os.path.join(H, "무인_비교_본문.html"), "w", encoding="utf-8").write(PAGE)
head, rest = PAGE.split("<style>", 1); css, body = rest.split("</style>", 1)
full = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + "<style>\n" + css + "</style>\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")
open(os.path.join(H, "무인_비교.html"), "w", encoding="utf-8").write(full)
print(f"무인_비교.html {len(full.encode())/1e3:.0f}KB · {data_note}")
