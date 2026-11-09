# -*- coding: utf-8 -*-
"""웹 앱용 데이터 내보내기 (W7 P0~P2)

분석 결과(p18의 매출잠재_격자.csv · viewer_data.json)를 웹 앱이 읽는 작은 파일들로 나눠 쓴다.
판(버전) 폴더 하나에 다 쓰고, latest.json이 지금 판을 가리킨다.

    python pipeline/export_web.py --src analysis/panel/결과 --out web/public/data

쓰는 파일 (web/public/data/<판>/)
    manifest.json   판 · 만든 날 · 기준 스냅샷 · 파일 목록(크기·sha256) · 출처 · 뺀 것
    cells.json      칸 8,322개: h3 · 행정동 번호 · 반경 300m 가게 수
    dongs.json      행정동 이름 ('행정동|자치구')
    bounds.json     서울·자치구 경계(GeoJSON, 경위도)
    ind/index.json  업종 37개: 코드 · 이름 · 칠함 · 교차검증 순위상관 · 학습 상권 수 · 주의 문구(있으면) · 칠하지 않는 까닭(있으면)
    ind/<코드>.json  칠하는 업종만 — 칸 값 = 매출 수준(서울 그 업종 평균 상권 대비 %, 0.1% 단위 정수 ×10), 칠하지 않는 칸은 null.
                    '왜 이 값인가'(예전 뷰어 cellInfo) — m: 칠한 칸마다 재료 넷의 배수(×100 정수 — 거주 · 출근·등교 · 기타 도착 · 주변 가게),
                    clamp: 학습 범위 끝값으로 맞춘 칸 [칸, 비트]…(1<<j 낮아서 · 16<<j 높아서). 칸마다 접근성 값 자체는 싣지 않는다.
                    index.json의 min300 = 칠하는 칸의 반경 300m 가게 수 하한(그 업종 매출이 공개된 가장 한산한 상권)
                    칠하지 않는 업종은 값을 내보내지 않는다 (검증을 못 넘은 추정을 공개 자료로 남기지 않는다)
    be/index.json   손익 점검(p19 breakeven_data.json, 있으면): 카드 수수료 구간 · 분위 위치 · 업종 60개(원가율·분위값·객단가·진입 희석 α·생존)
                    + 업종마다 codes(그 서울시 업종에 대응하는 상가정보 소분류 — p26 매출잠재_업종대응_v2.csv)와
                    fit(대응이 맞는 정도 — 합계비율 · 상권별 점포 수 순위상관 · 매출 수준 모형에 썼나). 웹 손익 점검이 고른 업종(247)으로 견줄 업종을 찾는다
    be/places.json  상권 1,650 · 행정동 425의 코드·이름(상권은 구분도)
    be/cells.json   칸 → 상권 번호(c2s, 상권 밖 −1) · 행정동 번호(c2d) — 칸 순서는 격자 CSV와 같은지 행정동 이름으로 확인한다
    be/ind/<코드>.json  업종별 상권(S)·행정동(D) 행: [지역 번호, 월매출(천 원), 점포 수, 하루 결제×10, 객단가(백 원)]
    grid/nb.json    칸마다 여섯 이웃 번호(−1 = 없음) — 이동 그래프(p23)의 순서
    graph/mv.json   이동 그래프(p23, 이동_그래프.json 있으면) — 예전 뷰어 VD.mv와 같은 모양(도보·자동차·지하철·버스, 정수 배열은
                    16비트 리틀엔디언 base64). 웹 이동 시간(web/src/core/travel)이 읽는다
    graph/ODbL.txt  이동 그래프의 출처·이용 조건 — OpenStreetMap 파생(ODbL 1.0), 버스·지하철 시간은 공공누리 1유형
    grid/site.json  칸마다 주택가 정도(tilt — 거주 − 출근·등교 접근성, log ×1000) · 접근성 순위(rr 거주 · rw 출근·등교 · ro 기타 도착 —
                    그 칸보다 값이 큰 칸 수). 접근성 값 자체는 싣지 않는다. 자리 카드의 한 줄 요약·'왜 이 값인가'와 후보 찾기가 쓴다
    kinds/index.json · kinds/cnt/<코드>.json  업종 247(상가정보 소분류): 이름 · 대분류 · 서울 가게 수 · 새 가게 1년 생존(구간) · 기존 가게 연 폐업률 ·
                    등급과 비고(업종별_생존.csv) + 업종별 칸 가게 수 [칸, 수]…(격자와 같은 스냅샷 — --snap의 poi_<스냅샷>.parquet)
    places/stations.json  역 찾기 — 이동 그래프의 역(EPSG:3857 x·y·이름) · 노선 키 · [역, 노선]… · 걸어 닿는 칸이 있는 역 번호.
                    첫 화면 검색이 큰 그래프(graph/mv.json) 없이 동·역 이름을 찾는다 (web/src/core/places.ts)
    entry/index.json · entry/<코드>.json  개업(p20): 업종 48개 요약 · 업종별 [칸, 새 가게, 같은 건물 이어받기]… · [칸, 2024년 말 가게]…
    reb/index.json  한국부동산원 조사 상권 72곳의 임대료 값(천 원/㎡·월, 효용비율 %)과 칸 → 상권 번호(밖 −1). 경계 그림은 아직 싣지 않는다
    cand/index.json 후보 찾기(p24 후보_조건.json, 있으면): 무인 6종의 자리 조건 범위(명단에서 찾은 무인 가게가 있는 칸의 10·50·90%) ·
                    칸마다 같은 업종 가게 수(cnt)·찾은 무인 가게 수(un) — [칸, 수]…. 주택가 정도·주민 순위는 grid/site.json.
                    무인 6종에는 매출 수준 순서를 쓰지 않아(W7.15) p24의 pot은 뺀다
    unm/index.json  무인매장 묶음(p21 무인_검정·무인_연결 · p22 무인_브랜드*.csv, 있으면): 6종마다 명단 수(2025-12 · 4월 발표) · 상가정보에 붙인 수와
                    주로 실린 업종 · 흐름 · 자리(viewer/build_compare.py의 손으로 단 말) · 생존을 읽을 코드 · 손익의 원가율 설정(viewer/build_viewer.py UNT) ·
                    가맹 브랜드 요약(월매출 · 창업비 · 초기 투자 · 어림 면적 · 문 닫은 비율)과 기본값 브랜드 표(공정위 정보공개서)

웹에 칠하는 규칙 (W7.13 · 2026-10-25)
    분석(p26)의 '칠함' — 업종마다 처음 보는 구 순위상관이 한쪽 5%로 0보다 큼 — 에 더해, 37개 업종을 한꺼번에 검정한 것을
    보정한다(Benjamini–Hochberg, 거짓 발견 5%). p는 p26과 같은 근사 1 − Φ(ρ·√(n−1)).
업종별 덧붙임 (OVERRIDE) — 이름과 주의 문구. 세탁소: 서울시 매출 자료가 맡기는 세탁소 위주라 셀프빨래방에는 쓰지 않는다 (W7.13)

행정동 임대시세(상권분석서비스 화면 읽기)는 공개 조건을 정하기 전이라 넣지 않는다 (마스터플랜 W7.8).
"""
import argparse, base64, bisect, hashlib, json, math, os, re, shutil, struct, sys
from datetime import date

import pandas as pd

R = 6378137.0
FDR = 0.05
OVERRIDE = {
    "CS200031": {
        "nm": "세탁소",
        "note": "맡기는 세탁소 위주로 배운 값이에요. 셀프빨래방에는 맞지 않아요 — 셀프빨래방은 주민이 많은 곳에 모여 있는데, 이 값은 회사가 많은 곳에서 높게 나와요.",
    },
}


# 무인매장 묶음 — 6종 (순서 그대로 화면에) · 주소에 쓰는 이름
UN_TYPES = [("laundry", "빨래방"), ("study", "스터디카페"), ("icecream", "아이스크림"), ("cafe", "카페"), ("photo", "사진관"), ("mealkit", "밀키트")]
UN_APR = {"빨래방": 963, "스터디카페": 909, "아이스크림": 929, "카페": 476, "사진관": 404, "밀키트": 148}   # 서울시 2025-04 발표 (3~4월 조사)
# 흐름 · 자리 — viewer/build_compare.py의 TREND · PLACE와 같은 말 (명단 증감 · 보정한 새 가게 무인 몫 · 등록 연도별 추세를 함께 보고 붙임)
UN_TREND = {"빨래방": ("up", "늘어나는 중"), "스터디카페": ("flat", "줄지 않음"), "아이스크림": ("slow", "정점 지나 둔화"),
            "카페": ("flat", "작은 몫, 명단은 늘어남"), "사진관": ("down", "줄어드는 중"), "밀키트": ("down", "줄어드는 중")}
UN_PLACE = {"빨래방": "1층, 세탁소보다 가게가 많은 쪽", "스터디카페": "2층 이상, 다른 스터디카페와 같은 자리", "아이스크림": "1층, 주변 가게가 적은 주거지",
            "카페": "1층, 주변 가게가 적은 주거지", "사진관": "1층, 번화가", "밀키트": "1층, 주변 가게가 적은 주거지"}
# 손익 점검의 무인 유형 — viewer/build_viewer.py UNT와 같은 값: 참고 서울시 업종(원가율 · 이 동네 참고 매출), 생존을 읽을 코드, 원가율(None이면 참고 업종 값), 설명, 층
UN_CONF = {
    "빨래방": {"cs": "CS200031", "surv": ["S20902", "S20901"], "v": None, "vnote": "셀프 빨래방은 물·가스·전기가 매출에 따라 늘어나니 이 비율에 넣는 편이 맞아요", "floor": "1"},
    "스터디카페": {"cs": None, "surv": ["R10202"], "v": 0.0, "vnote": "파는 물건이 거의 없어 0으로 두었어요 — 음료·소모품을 판다면 그 비율을 넣으세요", "floor": "2"},
    "아이스크림": {"cs": "CS300001", "surv": ["G20404"], "v": None, "vnote": "할인 판매라 매입원가 비중이 높은 편이에요", "floor": "1"},
    "카페": {"cs": "CS100010", "surv": ["I21201"], "v": None, "vnote": "", "floor": "1"},
    "사진관": {"cs": None, "surv": ["M11301"], "v": 0.10, "vnote": "예시값 — 인화지·소모품 비중은 가게마다 달라요", "floor": "1"},
    "밀키트": {"cs": "CS300010", "surv": ["G20509"], "v": None, "vnote": "", "floor": "1"},
}
UN_SHORT = {"워시엔조이 멤버스": "워시엔조이", "작심스터디카페": "작심", "CHOSIM(초심)": "초심", "어라운드스터디카페(A.round study cafe)": "어라운드",
            "공본스터디카페": "공본", "위넌스터디카페": "위넌", "픽미픽미아이스크림할인점": "픽미픽미", "도깨비냉장고 아이스크림할인점": "도깨비냉장고"}


def p_one_sided(rho, n):
    """처음 보는 구 순위상관 ρ가 0보다 큰지 — 한쪽 p (p26의 '칠함'과 같은 근사)"""
    return 0.5 * math.erfc(rho * math.sqrt(max(n - 1, 1)) / math.sqrt(2.0))


def bh_pass(ps, q):
    """Benjamini–Hochberg — 거짓 발견 비율 q로 통과하는 것"""
    m = len(ps)
    order = sorted(range(m), key=lambda i: ps[i])
    kmax = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / m:
            kmax = r
    ok = [False] * m
    for r, i in enumerate(order, 1):
        ok[i] = r <= kmax
    return ok


def merc_to_lonlat(x, y):
    lon = x / R * 180.0 / math.pi
    lat = (2.0 * math.atan(math.exp(y / R)) - math.pi / 2.0) * 180.0 / math.pi
    return round(lon, 5), round(lat, 5)


def ring_lonlat(flat):
    pts = [merc_to_lonlat(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]
    out = []
    for p in pts:                       # 5자리로 반올림한 뒤 겹친 점은 하나로
        if not out or out[-1] != p:
            out.append(p)
    if out[0] != out[-1]:
        out.append(out[0])
    return [list(p) for p in out]


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def pk(a, f="H"):
    """정수 배열 → 리틀엔디언 base64 (H: 0~65534, h: −1 포함) — 예전 뷰어 build_viewer.py와 같은 규칙"""
    assert all((-1 if f == "h" else 0) <= x < (32767 if f == "h" else 65535) for x in a), "16비트 범위를 넘는다"
    return base64.b64encode(struct.pack("<%d%s" % (len(a), f), *a)).decode()


def mv_of(G, nb):
    """이동_그래프.json → 예전 뷰어의 VD.mv (build_viewer.py와 같은 모양 · 같은 값). 옛 코드와 새 코드가 같은 것을 읽게 한다"""
    car, pt = G["car"], G["pt"]
    mv = {"meta": G["meta"], "nb": pk(nb, "h"),
          "car": {"t": car["t"], "acc": car["acc"], "nk": car["nk"], "kl": pk(car["kl"]), "ckf": pk(car["ckf"]), "ckr": pk(car["ckr"])},
          "walk": G["walk"],
          "pt": {"st": pt["st"], "lines": [{"k": l["k"], "v": l["v"], "h": l["h"], "h_am": l["h_am"], "h_pm": l["h_pm"]} for l in pt["lines"]],
                 "sl": pt["sl"], "ride": pk(pt["ride"]), "acc": pk(pt["acc"]), "tr": pk(pt["tr"])}}
    S = len(pt["sl"]) // 2
    assert len(pt["tr"]) % 4 == 0 and all(pt["tr"][k] < S and pt["tr"][k + 1] < S and pt["tr"][k + 3] in (0, 1, 2) for k in range(0, len(pt["tr"]), 4)), "지하철 갈아타기 번호가 맞지 않는다"
    assert set(G["meta"]["car_f"]) == set(G["meta"]["periods"]) == {"day", "am", "pm"}, "시간대가 맞지 않는다"
    if "bus" in G:           # 버스 — p23이 이미 16비트 base64로 쌌다. 길이만 확인
        bus = G["bus"]
        u2 = lambda x: len(base64.b64decode(x)) // 2
        R = u2(bus["rs"]) // 2
        assert all(u2(bus["rt"][p]) == R and len(bus["h"][p]) == len(bus["h"]["day"]) for p in ("day", "am", "pm")), "버스 배열 길이가 맞지 않는다"
        mv["bus"] = {"n": bus["n"], "h": bus["h"], "rs": bus["rs"], "rt": bus["rt"], "acc": bus["acc"], "wmax": bus["meta"]["wait_max_s"],
                     "meta": {k: bus["meta"][k] for k in ("stops", "info", "runs", "coords", "routes", "obs", "routes_in", "routes_in_gg", "dropped", "dropped_gg", "check")}}
    return mv


def osm_date(osm):
    """'south-korea-261011.osm.pbf (Geofabrik, ODbL)' → ('south-korea-261011.osm.pbf', '2026-10-11')"""
    m = re.search(r"(\S*-(\d\d)(\d\d)(\d\d)\.osm\.pbf)", osm or "")
    return (m.group(1), f"20{m.group(2)}-{m.group(3)}-{m.group(4)}") if m else (osm, None)


def odbl_note(osm):
    f, d = osm_date(osm)
    return (f"점지 이동 시간 그래프 (graph/mv.json)\n\n"
            f"이 자료는 OpenStreetMap 자료로 만든 데이터베이스입니다. © OpenStreetMap contributors\n"
            f"Open Database License 1.0(ODbL)으로 제공합니다 — https://opendatacommons.org/licenses/odbl/1-0/\n"
            f"길(차도·보행로)은 Geofabrik이 나눠 준 OpenStreetMap 추출본({f}{', ' + d if d else ''})에서 왔습니다.\n"
            f"버스·지하철의 배차·운행 시간 부분은 서울시·서울시 버스 TOPIS·서울교통공사 공개 자료(공공누리 제1유형, 출처 표시)에서 왔습니다.\n"
            f"경기·인천 버스 정류장 위치는 국토교통부 전국 버스정류장 위치정보(공공데이터포털 15067528, 이용허락범위 제한 없음)에서 왔습니다.\n\n"
            f"This file is a database derived from OpenStreetMap data. © OpenStreetMap contributors\n"
            f"It is made available under the Open Database License 1.0 (ODbL): https://opendatacommons.org/licenses/odbl/1-0/\n"
            f"Roads and footpaths come from the Geofabrik OpenStreetMap extract ({f}{', ' + d if d else ''}).\n"
            f"Bus and subway headways and running times come from open data of the Seoul Metropolitan Government, Seoul TOPIS\n"
            f"and Seoul Metro, used under the Korea Open Government License (KOGL) Type 1 (attribution).\n"
            f"Gyeonggi and Incheon bus stop locations come from the MOLIT nationwide bus stop dataset (data.go.kr 15067528, no use restrictions).\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="analysis/panel/결과", help="p18 결과 폴더 (매출잠재_격자.csv · viewer_data.json)")
    ap.add_argument("--out", default="web/public/data")
    ap.add_argument("--ver", default=None, help="판 이름 (기본: <viewer 판>-<만든 날>)")
    ap.add_argument("--snap", default="data/snapshots", help="상가정보 스냅샷 폴더 — poi_<스냅샷>.parquet로 업종별 칸 가게 수를 센다")
    a = ap.parse_args()

    grid = pd.read_csv(os.path.join(a.src, "매출잠재_격자.csv"), encoding="utf-8-sig", low_memory=False)
    V = json.load(open(os.path.join(a.src, "viewer_data.json"), encoding="utf-8"))
    meta = V["meta"]
    n = len(grid)
    assert n == meta["cells"], (n, meta["cells"])
    assert grid["h3_9"].is_unique

    # 판 이름 = 모델 판-만든 날-내용 해시 8자리. 판 폴더는 오래 캐시하므로(web/public/_headers) 내용이 바뀌면 이름도 바뀌어야 한다
    stem = a.ver or f"{meta.get('version', 'v')}-{meta['made'].replace('-', '')}"
    tmp = os.path.join(a.out, f".tmp-{stem}")
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    base = tmp

    # 행정동 — 자치구·행정동 순으로 번호
    keys = (grid["행정동"].astype(str) + "|" + grid["자치구"].astype(str))
    dongs = sorted(keys.unique(), key=lambda k: (k.split("|")[1], k.split("|")[0]))
    di = {k: i for i, k in enumerate(dongs)}

    cells = {
        "h3": grid["h3_9"].tolist(),
        "dong": [di[k] for k in keys],
        "n300": grid["점포_반경300m"].astype(int).tolist(),
    }
    dump(os.path.join(base, "cells.json"), cells)
    dump(os.path.join(base, "dongs.json"), dongs)

    # 업종 — viewer_data의 업종 정보와 격자 CSV의 잠재_<이름> 열을 이름으로 잇는다
    # 왜 이 값인가 — 재료(접근성 log ×1000 정수, viewer_data f)를 업종 학습 범위로 맞춰 계수를 곱한 배수. 예전 뷰어 compute·cellInfo와 같은 셈
    Fv = V["f"]
    assert len(Fv) == n * 4 and meta["cols"] == ["a_거주", "a_출근등교", "a_기타", "l_all300"], meta["cols"]
    assert all(isinstance(x, int) for x in Fv), "접근성이 정수(log ×1000)가 아니다"

    def explain_parts(d, vals):
        b, mu, lo, hi = d["b"], d["mu"], d["lo"], d["hi"]
        m, cl, worst = [], [], 0.0
        for i in range(n):
            dom = Fv[i * 4 + 3] / 1000 >= lo[3]
            assert dom == (vals[i] is not None), f"{d['nm']} 칸 {i}: 칠하는 칸이 예전 뷰어 규칙과 다르다"
            if not dom:
                continue
            c, prod = 0, 1.0
            for j in range(4):
                x = Fv[i * 4 + j] / 1000
                if x < lo[j]:
                    x, c = lo[j], c | (1 << j)
                elif x > hi[j]:
                    x, c = hi[j], c | (16 << j)
                e = math.exp(b[j] * (x - mu[j]))
                m.append(math.floor(e * 100 + 0.5))   # JS Math.round와 같은 반올림
                prod *= e
            if c:
                cl += [i, c]
            worst = max(worst, abs(prod - (1 + vals[i] / 1000)))
        # 배수를 다 곱하면 매출 수준과 같아야 한다 — 매출 수준을 0.1%p로 반올림한 만큼(0.0005)만 다르다
        assert worst <= 5e-4 + 1e-9, f"{d['nm']}: 재료 배수의 곱이 매출 수준과 다르다 ({worst:.2e})"
        return m, cl

    ok_fdr = bh_pass([p_one_sided(d["rho"], d["n"]) for d in V["ind"]], FDR)
    index, dropped = [], []
    for d, fdr in zip(V["ind"], ok_fdr):
        col = f"잠재_{d['nm']}"
        assert col in grid.columns, col
        ov = OVERRIDE.get(d["k"], {})
        paint = bool(d["paint"]) and fdr
        e = {"k": d["k"], "nm": ov.get("nm", d["nm"]), "sn": d.get("sn"), "codes": d.get("codes", []),
             "paint": paint, "rho": d["rho"], "n": d["n"], "cells": 0}
        if paint:
            v = grid[col]
            vals = [None if pd.isna(x) else int(round(float(x) * 10)) for x in v]
            m, cl = explain_parts(d, vals)
            dump(os.path.join(base, "ind", f"{d['k']}.json"), {"k": d["k"], "v": vals, "m": m, "clamp": cl})
            e["cells"] = int(v.notna().sum())
            e["min300"] = round(math.expm1(d["lo"][3]))
        elif d["paint"]:
            e["why"] = f"{len(V['ind'])}개 업종을 함께 보면 우연과 가리기 어려움 (순위상관 {d['rho']})"
            dropped.append(e["nm"])
        else:
            e["why"] = f"처음 보는 구의 매출 순서를 맞히지 못함 (순위상관 {d['rho']})"
        if "note" in ov:
            e["note"] = ov["note"]
        index.append(e)
    dump(os.path.join(base, "ind", "index.json"), index)

    # 경계 — 서울 · 자치구 (viewer_data는 EPSG:3857 정수)
    feats = []
    for ring in V["seoul"]:
        feats.append({"type": "Feature", "properties": {"kind": "seoul", "name": "서울"},
                      "geometry": {"type": "Polygon", "coordinates": [ring_lonlat(ring)]}})
    for g in V["gu"]:
        feats.append({"type": "Feature", "properties": {"kind": "gu", "name": g["n"]},
                      "geometry": {"type": "Polygon", "coordinates": [ring_lonlat(r) for r in g["r"]]}})
    dump(os.path.join(base, "bounds.json"), {"type": "FeatureCollection", "features": feats})

    # 손익 점검 (p19 breakeven_data.json) — 업종 표 · 상권/행정동 이름 · 칸 → 상권·행정동 번호 · 업종별 행 (마스터플랜 W7.7 'P3 시작')
    be_path = os.path.join(a.src, "breakeven_data.json")
    has_be = os.path.exists(be_path)
    if has_be:
        B = json.load(open(be_path, encoding="utf-8"))
        assert len(B["c2s"]) == n and len(B["c2d"]) == n, "손익 자료 칸 수가 다르다"
        # 칸 순서 확인 — 손익 자료가 칸마다 가리키는 행정동 이름이 격자 CSV의 행정동과 같아야 한다
        gd = grid["행정동"].astype(str).tolist()
        bad = sum(1 for i in range(n) if B["c2d"][i] >= 0 and B["dong"]["nm"][B["c2d"][i]] != gd[i])
        assert bad == 0, f"손익 자료 칸 순서가 다르다 ({bad}칸)"
        keep = ("year", "unit", "qs", "alpha0", "card", "card_src", "src", "excluded")
        # 상가정보 소분류 → 서울시 업종 (p26 업종 대응표) — 웹 손익 점검이 고른 업종(247)에서 견줄 업종을 찾는다 (마스터플랜 W7.7 'P4 다섯째 조각')
        xw_path = os.path.join(a.src, "매출잠재_업종대응_v2.csv")
        if os.path.exists(xw_path):
            X = pd.read_csv(xw_path, encoding="utf-8-sig", dtype=str).fillna("")
            xw = {r["서비스_업종_코드"]: r for _, r in X.iterrows()}
            seen = {}
            for d in B["ind"]:
                r = xw.get(d["k"])
                d["codes"] = [c for c in r["상가코드"].split(";") if c] if r is not None else []
                d["fit"] = {"ratio": float(r["합계비율"]), "rho": float(r["순위상관"]), "ok": r["쓴다"] == "True"} if r is not None else None
                for c in d["codes"]:
                    assert c not in seen, f"상가 코드 {c}가 손익 업종 둘에 걸린다 ({seen[c]}, {d['k']})"
                    seen[c] = d["k"]
        dump(os.path.join(base, "be", "index.json"), {"meta": {k: B["meta"][k] for k in keep if k in B["meta"]}, "ind": B["ind"]})
        dump(os.path.join(base, "be", "places.json"), {"sang": B["sang"], "dong": B["dong"]})
        dump(os.path.join(base, "be", "cells.json"), {"c2s": B["c2s"], "c2d": B["c2d"]})
        rows = {"S": {}, "D": {}}
        for kind in ("S", "D"):
            for r in B[kind]:
                rows[kind].setdefault(r[1], []).append([r[0], r[2], r[3], r[4], r[5]])   # 지역 · 월매출(천 원) · 점포 · 하루 결제×10 · 객단가(백 원)
        for ii, d in enumerate(B["ind"]):
            dump(os.path.join(base, "be", "ind", f"{d['k']}.json"), {"k": d["k"], "S": rows["S"].get(ii, []), "D": rows["D"].get(ii, [])})

    # 이웃 칸 — 칸마다 여섯 이웃(h3 테두리 k → k+1 변 건너편, 없으면 −1). 이동 그래프(p23)와 같은 순서라 개업 창·이동 시간이 함께 쓴다
    graph_path = os.path.join(a.src, "이동_그래프.json")
    nb = None
    if os.path.exists(graph_path):
        Gm = json.load(open(graph_path, encoding="utf-8"))
        nb = Gm["nb"] if isinstance(Gm["nb"][0], int) else [x for r in Gm["nb"] for x in r]
        assert len(nb) == n * 6
        dump(os.path.join(base, "grid", "nb.json"), nb)

    # 이동 그래프 — 예전 뷰어의 VD.mv를 그대로 (도보·자동차·지하철·버스). 칸 순서가 격자 CSV와 같아야 한다(h3 목록의 sha1)
    has_mv, osm_day = nb is not None, None
    if has_mv:
        gsha = hashlib.sha1("\n".join(cells["h3"]).encode()).hexdigest()
        assert Gm["meta"]["cells"] == n and Gm["meta"].get("h3sha") == gsha, "이동 그래프의 칸 순서가 격자와 다르다 — p23을 다시 돌릴 것"
        dump(os.path.join(base, "graph", "mv.json"), mv_of(Gm, nb))
        with open(os.path.join(base, "graph", "ODbL.txt"), "w", encoding="utf-8") as f:
            f.write(odbl_note(Gm["meta"].get("osm")))
        osm_day = osm_date(Gm["meta"].get("osm"))[1]
        # 역 찾기 — 그래프의 역과 노선만 따로 (30KB 안팎). 걸어 닿는 칸이 없는 역은 찾기에서 뺀다(예전 뷰어 cSearchIndex)
        P = Gm["pt"]
        assert len(P["acc"]) % 3 == 0 and len(P["sl"]) % 2 == 0
        dump(os.path.join(base, "places", "stations.json"), {"st": P["st"], "lines": [l["k"] for l in P["lines"]], "sl": P["sl"],
                                                          "has": sorted(set(P["acc"][1::3]))})

    # 개업 (p20 entry_data.json) — 업종 48개 요약과 업종별 칸 [칸, 새 가게, 이어받기]… · [칸, 2024년 말 가게]…
    en_path = os.path.join(a.src, "entry_data.json")
    has_en = os.path.exists(en_path) and nb is not None
    if has_en:
        E = json.load(open(en_path, encoding="utf-8"))
        enb = E["meta"]["nb"]
        assert all(sorted(enb[i*6:i*6+6]) == sorted(nb[i*6:i*6+6]) for i in range(n)), "개업 자료의 이웃 칸이 이동 그래프와 다르다"
        small = {k: v for k, v in E["meta"].items() if k != "nb" and len(json.dumps(v)) < 2000}
        dump(os.path.join(base, "entry", "index.json"), {"meta": small, "ind": [{k: v for k, v in d.items() if k not in ("O", "K")} for d in E["ind"]]})
        for d in E["ind"]:
            dump(os.path.join(base, "entry", f"{d['k']}.json"), {"k": d["k"], "O": d["O"], "K": d["K"]})

    # 부동산원 조사 상권 임대료 (서울 72곳) — 값과 칸 → 상권 번호. 경계 그림은 이용 조건을 확인한 뒤 싣는다
    has_reb = bool(V.get("rents"))
    if has_reb:
        assert len(V["rent"]) == n
        dump(os.path.join(base, "reb", "index.json"), {"rents": [{"n": r["n"], "k": r["k"], "t": r["t"], "v": r["v"]} for r in V["rents"]], "cell": V["rent"]})

    # 자리 성격 (칸마다) — 주택가 정도(거주 − 출근·등교 접근성, log ×1000 정수)와 접근성 순위(그 칸보다 값이 큰 칸 수 — 0이 가장 높고 같은 값은 같은 수:
    # 거주 rr · 출근·등교 rw · 기타 도착 ro). 접근성 값 자체는 싣지 않는다(SGIS 100m 자료신청분, 마스터플랜 W7.8). 자리 카드와 후보 찾기가 쓴다
    def above(col):
        vals = [Fv[i * 4 + col] for i in range(n)]
        srt = sorted(vals)
        return [n - bisect.bisect_right(srt, v) for v in vals]
    dump(os.path.join(base, "grid", "site.json"), {"tilt": [Fv[i * 4] - Fv[i * 4 + 1] for i in range(n)], "rr": above(0), "rw": above(1), "ro": above(2)})

    # 업종 247 (상가정보 소분류) — 업종 고르기 · 자리 카드의 '같은 업종(이 칸 + 둘레)'·'새 가게 1년 생존'. 가게 수는 격자와 같은 스냅샷
    poi_path = os.path.join(a.snap, f"poi_{meta['snapshot']}.parquet")
    sv_path = os.path.join(a.src, "업종별_생존.csv")
    has_kinds = os.path.exists(poi_path) and os.path.exists(sv_path)
    if has_kinds:
        ci = {h: i for i, h in enumerate(cells["h3"])}
        Pk = pd.read_parquet(poi_path, columns=["cat_s", "h3_9"])
        Pk = Pk[Pk.h3_9.isin(ci)]
        per = {}
        for (code, cell), v in Pk.assign(cell=Pk.h3_9.map(ci)).groupby(["cat_s", "cell"]).size().items():
            per.setdefault(code, [0] * n)[cell] = int(v)
        # 격자 CSV의 점포_<코드> 열(매출 수준 업종의 코드들)과 같은 스냅샷인지
        for col in [c for c in grid.columns if c.startswith("점포_") and c != "점포_반경300m"]:
            assert per.get(col[3:], [0] * n) == grid[col].fillna(0).astype(int).tolist(), f"{col}: 업종별 칸 가게 수가 격자와 다르다 — 스냅샷이 다른가"
        S = pd.read_csv(sv_path, encoding="utf-8-sig").sort_values("cat_s").to_dict("records")
        assert {r["cat_s"] for r in S} == set(per), "생존표와 상가정보의 업종 코드가 다르다"
        r3 = lambda x: round(float(x), 3)
        kinds = []
        for r in S:
            a_, bad = per[r["cat_s"]], r["등급"].startswith("X")   # X = 원천 일괄 등록·삭제 업종 — 생존 수치를 쓰지 않는다
            kinds.append({"c": r["cat_s"], "nm": r["업종"], "g": r["대분류"], "n": sum(a_), "cells": sum(1 for v in a_ if v), "grade": r["등급"][0],
                          "s12": None if bad else [r3(r["S12_추정"]), r3(r["S12_하"]), r3(r["S12_상"])],
                          "close": None if bad else r3(r["기존_연폐업률"]), "note": r["비고"]})
            dump(os.path.join(base, "kinds", "cnt", f"{r['cat_s']}.json"), [x for i, v in enumerate(a_) if v for x in (i, v)])
        dump(os.path.join(base, "kinds", "index.json"), {
            "meta": {"poi": meta["snapshot"], "s12": "2025년 새 가게의 12개월 생존 — 관측이 적은 업종은 기존 가게 폐업률로 보정 (마스터플랜 §5.5)"},
            "kinds": kinds})

    # 후보 찾기 (p24) — 칸 순서는 h3 목록의 sha1로 확인. 범위는 지금 격자에서 나와야 한다(p18을 다시 돌리면 p24도)
    cd_path = os.path.join(a.src, "후보_조건.json")
    has_cd = os.path.exists(cd_path)
    if has_cd:
        CD = json.load(open(cd_path, encoding="utf-8"))
        gsha = hashlib.sha1("\n".join(cells["h3"]).encode()).hexdigest()
        assert CD["meta"]["cells"] == n and CD["meta"].get("h3sha") == gsha, "후보 조건의 칸 순서가 격자와 다르다 — p24를 다시 돌릴 것"
        # 범위가 지금 격자에서 나왔는지 — 격자 CSV의 거주·출근등교로 잰 조건 통과 비율이 p24가 적은 값과 같아야 한다
        gt = (grid["a_거주"] - grid["a_출근등교"]).values
        g3 = grid["점포_반경300m"].values
        for t in CD["types"]:
            b = t["band"]
            ok = ((g3 >= b["n300"][0]) & (g3 <= b["n300"][2]) & (gt >= b["tilt"][0]) & (gt <= b["tilt"][2])).mean()
            assert round(float(ok), 3) == t["pass"], f"{t['t']}: 후보 조건 범위가 지금 격자와 맞지 않는다({ok:.3f} ≠ {t['pass']}) — p24를 다시 돌릴 것"
        sp = lambda arr: [x for i, v in enumerate(arr) if v for x in (i, v)]   # 0이 대부분인 칸 배열 → [칸, 수, …]
        dump(os.path.join(base, "cand", "index.json"), {
            "meta": {"poi": CD["meta"]["poi"].replace("poi_", ""), "band": CD["meta"]["band"], "list": "서울시 무인점포 현황 2025-12-31"},
            "types": [{k: v for k, v in t.items() if k != "pot"} for t in CD["types"]],
            "cnt": {t: sp(v) for t, v in CD["cnt"].items()}, "un": {t: sp(v) for t, v in CD["un"].items()}})

    # 무인매장 묶음 (p21 · p22) — 웹 앱이 6종을 업종처럼 쓴다: 칸 가게 수 · 범위는 cand/, 여기는 묶음 카드 · 둘 견주기 · 손익의 무인 유형
    un_paths = [os.path.join(a.src, f) for f in ("무인_검정.csv", "무인_연결.csv", "무인_브랜드.csv", "무인_브랜드_요약.csv")]
    has_un = has_cd and all(os.path.exists(f) for f in un_paths)
    if has_un:
        O = pd.read_csv(un_paths[0], encoding="utf-8-sig", dtype=str).set_index("유형")
        W = pd.read_csv(un_paths[1], encoding="utf-8-sig", dtype=str).fillna("")
        BR = pd.read_csv(un_paths[2], encoding="utf-8-sig", dtype=str).fillna("")
        BS = pd.read_csv(un_paths[3], encoding="utf-8-sig", dtype=str).set_index("유형")
        link = {"정확", "정확(상호)", "상호+지점", "유사", "포함", "동명"}
        cand_t = {t["t"] for t in CD["types"]}
        kind_codes = {k["c"] for k in kinds} if has_kinds else set()
        be_k = {d["k"]: d for d in B["ind"]} if has_be else {}
        types = []
        for slug, t in UN_TYPES:
            assert t in cand_t, f"무인 {t}: 후보 조건(p24)에 없다"
            o, s_ = O.loc[t], BS.loc[t]
            u = UN_CONF[t]
            assert all(c in kind_codes for c in u["surv"]) or not kind_codes, f"무인 {t}: 생존을 읽을 코드가 업종 247에 없다"
            assert u["cs"] is None or u["cs"] in be_k, f"무인 {t}: 참고 업종 {u['cs']}가 손익 자료에 없다"
            lk = W[(W["유형"] == t) & (W["방법"].isin(link))]
            top = lk["업종명"].value_counts()
            brands = []
            for _, b in BR[(BR["유형"] == t) & (BR["기본값"] == "Y")].iterrows():
                seoul = b["월매출_기준"] == "서울"
                brands.append({"nm": UN_SHORT.get(b["영업표지"], b["영업표지"]), "sales": int(b["월매출_만원"]), "basis": b["월매출_기준"],
                               "stores": int(b["서울가맹점"] if seoul else b["가맹점"]), "year": int(b["기준연도"]), "open": int(b["창업비추정_만원"])})
            brands.sort(key=lambda x: (-x["sales"], x["nm"]))
            assert len(brands) == int(s_["기본값브랜드"]), f"무인 {t}: 기본값 브랜드 수가 요약과 다르다"
            types.append({
                "k": "UN-" + slug, "t": t, "nm": "무인 " + t,
                "list": int(o["명단"]), "apr": UN_APR[t], "linked": int(o["붙음"]),
                "codes": [[k, int(v), round(v / len(lk), 3)] for k, v in top.head(3).items()],
                "trend": list(UN_TREND[t]), "place": UN_PLACE[t],
                "surv": u["surv"], "cs": u["cs"], "v": u["v"], "vnote": u["vnote"], "floor": u["floor"],
                "money": {"sales": [int(s_["월매출_중간_만원"]), int(s_["월매출_최소_만원"]), int(s_["월매출_최대_만원"])],
                          "open": [int(s_["창업비_중간_만원"]), int(s_["창업비_최소_만원"]), int(s_["창업비_최대_만원"])],
                          "inv": int(s_["초기투자_중간_만원"]), "area": float(s_["어림면적_중간_㎡"]),
                          "stores": int(s_["가맹점_합"]), "new": int(s_["신규_합"]), "closed": int(s_["문닫음_합"]), "start": int(s_["연초_합"]),
                          "closeRate": float(s_["문닫은비율"]), "year": s_["기준연도"], "brands": int(s_["브랜드"])},
                "brands": brands,
            })
        dump(os.path.join(base, "unm", "index.json"), {
            "meta": {"list": "서울시 무인점포 현황 2025-12-31", "apr": "서울시 발표 2025-04 (3~4월 조사)",
                     "ftc": "공정거래위원회 가맹사업 정보공개서 요약 (2026-10 열람, 기준연도 2024 · 2025)",
                     "rule": "기본값 브랜드 = 매출을 낸 가맹점 30곳 이상 · 평균 매출이 0이 아님 · 유인 형식과 섞이지 않음 (§5.17)"},
            "types": types})

    files = {}
    for root, _, fs in os.walk(base):
        for f in sorted(fs):
            if f == "manifest.json":
                continue
            p = os.path.join(root, f)
            files[os.path.relpath(p, base).replace(os.sep, "/")] = {"bytes": os.path.getsize(p), "sha256": sha(p)}

    files = dict(sorted(files.items()))   # 폴더를 도는 순서는 컴퓨터마다 달라 이름순으로 — 어디서 만들어도 같은 manifest
    h8 = hashlib.sha256("".join(f"{k}:{v['sha256']}" for k, v in sorted(files.items())).encode()).hexdigest()[:8]
    ver = f"{stem}-{h8}"
    final = os.path.join(a.out, ver)
    if os.path.exists(final):
        shutil.rmtree(final)
    os.replace(tmp, final)
    base = final

    # 매출 학습 기간 — p26이 적고 p18이 viewer_data meta에 옮긴 분기들 (예: ['20253', … '20262'] → '2025Q3~2026Q2')
    qs = sorted(str(q) for q in meta.get("sales") or [])
    sales = f"{qs[0][:4]}Q{qs[0][4]}~{qs[-1][:4]}Q{qs[-1][4]}" if qs else None

    manifest = {
        "ver": ver,
        "exported": date.today().isoformat(),
        "made": meta["made"],
        "snapshot": meta["snapshot"],
        **({"sales": sales} if sales else {}),
        "model": {"version": meta.get("version"), "rule": meta.get("rule"), "paint_rule": meta.get("paint_rule"),
                  "train": meta.get("train"),
                  "web_paint_rule": f"분석의 칠함 + {len(V['ind'])}개 업종 동시 검정 보정(Benjamini–Hochberg, 거짓 발견 {FDR:.0%})",
                  "web_paint": sum(1 for d in index if d["paint"]), "dropped_by_fdr": dropped},
        "cells": n,
        "files": files,
        "sources": [
            {"what": "가게 수 (반경 300m)", "name": "소상공인시장진흥공단 상가(상권)정보", "via": "공공데이터포털 15083033", "license": "이용허락범위 제한 없음", "as_of": meta["snapshot"]},
            {"what": "매출 수준 학습 (상권별 추정매출·점포)", "name": "서울시 상권분석서비스", "via": "서울 열린데이터광장 (연도 파일 · 그해 분기는 OpenAPI)", "license": "공공누리 1유형",
             **({"as_of": sales} if sales else {})},
            {"what": "출근·등교·기타 도착 수요", "name": "수도권 생활이동", "via": "서울 열린데이터광장", "license": "공공누리 1유형"},
            {"what": "거주 인구 (100m 격자)", "name": "SGIS 격자 통계 100m", "via": "SGIS 자료신청", "license": "가공한 값(접근성·순위)만 싣는다 — 공개 전 이용 조건 확인 (마스터플랜 W7.8)"},
            {"what": "종사자 (1km 격자)", "name": "SGIS 격자 통계 1km", "via": "국가데이터처 · 공공데이터포털 15141768", "license": "이용허락범위 제한 없음"},
            {"what": "자치구 경계", "name": "서울시 상권분석서비스 영역", "via": "서울 열린데이터광장", "license": "공공누리 1유형"},
            {"what": "칸", "name": "H3 (res 9)", "via": "h3geo.org", "license": "Apache-2.0"},
            *([{"what": "손익 점검 — 상권·행정동 점포당 월매출", "name": "서울시 상권분석서비스", "via": "서울 열린데이터광장", "license": "공공누리 1유형", "as_of": str(B["meta"].get("year"))},
               {"what": "카드 수수료 우대 구간", "name": "금융위원회 우대수수료율", "via": B["meta"].get("card_src", ""), "license": "공공 발표"}] if has_be else []),
            *([{"what": "개업 (2025년 상반기 새 가게)", "name": "소상공인시장진흥공단 상가(상권)정보 (분기 스냅샷을 이어 셈)", "via": "공공데이터포털 15083033", "license": "이용허락범위 제한 없음"}] if has_en else []),
            *([{"what": "임대료 비교 (서울 72 상권)", "name": "한국부동산원 상업용부동산 임대동향조사", "via": "공공데이터포털 15069766 · 15069789 · 15069791 · 15069843", "license": "이용허락범위 제한 없음", "as_of": "2025 · 2026Q2"}] if has_reb else []),
            *([{"what": "이동 시간 그래프 (도보·자동차·대중교통)", "name": "OpenStreetMap", "via": "Geofabrik" + (f" {osm_day}" if osm_day else "") + " + 서울시 버스 TOPIS",
                "license": "ODbL 1.0 (© OpenStreetMap contributors · graph/ODbL.txt)", **({"as_of": osm_day} if osm_day else {})}] if has_mv else []),
            *([{"what": "업종별 가게 수 · 새 가게 1년 생존", "name": "소상공인시장진흥공단 상가(상권)정보 (분기 스냅샷을 이어 셈)", "via": "공공데이터포털 15083033",
                "license": "이용허락범위 제한 없음", "as_of": meta["snapshot"]}] if has_kinds else []),
            *([{"what": "후보 찾기 — 무인 가게 자리 (6종)", "name": "서울시 무인점포 현황 (소방재난본부) — 상가정보에 이름으로 붙인 가게", "via": "서울 열린데이터광장 OA-23054",
                "license": "이용허락범위 제한 없음", "as_of": "2025-12-31"},
               {"what": "후보 찾기 — 같은 업종 가게 수", "name": "소상공인시장진흥공단 상가(상권)정보", "via": "공공데이터포털 15083033", "license": "이용허락범위 제한 없음",
                "as_of": CD["meta"]["poi"].replace("poi_", "")}] if has_cd else []),
            *([{"what": "무인매장 묶음 — 가맹 브랜드 매출 · 창업비", "name": "공정거래위원회 가맹사업 정보공개서 (요약 화면)", "via": "franchise.ftc.go.kr",
                "license": "공개 정보 — 유형별 중간값 · 브랜드별 값에 출처와 기준연도를 함께 적는다 (마스터플랜 W7.8)", "as_of": "2024 · 2025"}] if has_un else []),
        ],
        "excluded": ["행정동 임대시세 — 상권분석서비스 화면에서 읽은 값, 공개 조건을 정하기 전 (마스터플랜 W7.8)",
                     "칠하지 않는 업종의 칸 값 — 검증을 넘지 못한 추정 (ind/index.json의 why)"],
    }
    dump(os.path.join(base, "manifest.json"), manifest)
    dump(os.path.join(a.out, "latest.json"), {"ver": ver})

    total = sum(f["bytes"] for f in files.values())
    painted = sum(1 for d in index if d["paint"])
    print(f"판 {ver}: 칸 {n:,} · 행정동 {len(dongs)} · 업종 {len(index)}(칠함 {painted}"
          f"{' · 동시 검정 보정으로 뺌: ' + ', '.join(dropped) if dropped else ''}) · 파일 {len(files)}개 {total/1e6:.2f}MB → {base}")


if __name__ == "__main__":
    sys.exit(main())
