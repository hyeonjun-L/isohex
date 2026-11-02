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
                    칠하지 않는 업종은 값을 내보내지 않는다 (검증을 못 넘은 추정을 공개 자료로 남기지 않는다)
    be/index.json   손익 점검(p19 breakeven_data.json, 있으면): 카드 수수료 구간 · 분위 위치 · 업종 60개(원가율·분위값·객단가·진입 희석 α·생존)
    be/places.json  상권 1,650 · 행정동 425의 코드·이름(상권은 구분도)
    be/cells.json   칸 → 상권 번호(c2s, 상권 밖 −1) · 행정동 번호(c2d) — 칸 순서는 격자 CSV와 같은지 행정동 이름으로 확인한다
    be/ind/<코드>.json  업종별 상권(S)·행정동(D) 행: [지역 번호, 월매출(천 원), 점포 수, 하루 결제×10, 객단가(백 원)]
    grid/nb.json    칸마다 여섯 이웃 번호(−1 = 없음) — 이동 그래프(p23)의 순서
    graph/mv.json   이동 그래프(p23, 이동_그래프.json 있으면) — 예전 뷰어 VD.mv와 같은 모양(도보·자동차·지하철·버스, 정수 배열은
                    16비트 리틀엔디언 base64). 웹 이동 시간(web/src/core/travel)이 읽는다
    graph/ODbL.txt  이동 그래프의 출처·이용 조건 — OpenStreetMap 파생(ODbL 1.0), 버스·지하철 시간은 공공누리 1유형
    entry/index.json · entry/<코드>.json  개업(p20): 업종 48개 요약 · 업종별 [칸, 새 가게, 같은 건물 이어받기]… · [칸, 2024년 말 가게]…
    reb/index.json  한국부동산원 조사 상권 72곳의 임대료 값(천 원/㎡·월, 효용비율 %)과 칸 → 상권 번호(밖 −1). 경계 그림은 아직 싣지 않는다
    cand/index.json 후보 찾기(p24 후보_조건.json, 있으면): 무인 6종의 자리 조건 범위(명단에서 찾은 무인 가게가 있는 칸의 10·50·90%) ·
                    칸마다 같은 업종 가게 수(cnt)·찾은 무인 가게 수(un) — [칸, 수]… · 칸마다 주택가 정도(tilt = 거주 − 출근·등교 접근성,
                    log ×1000 정수)와 주민 순위(rr = 거주 접근성이 이 칸보다 큰 칸 수). 접근성 값 자체는 싣지 않는다.
                    무인 6종에는 매출 수준 순서를 쓰지 않아(W7.15) p24의 pot은 뺀다

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
            dump(os.path.join(base, "ind", f"{d['k']}.json"), {"k": d["k"], "v": vals})
            e["cells"] = int(v.notna().sum())
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

    # 후보 찾기 (p24) — 칸 순서는 h3 목록의 sha1로 확인. 범위는 지금 격자에서 나와야 한다(p18을 다시 돌리면 p24도)
    cd_path = os.path.join(a.src, "후보_조건.json")
    has_cd = os.path.exists(cd_path)
    if has_cd:
        CD = json.load(open(cd_path, encoding="utf-8"))
        gsha = hashlib.sha1("\n".join(cells["h3"]).encode()).hexdigest()
        assert CD["meta"]["cells"] == n and CD["meta"].get("h3sha") == gsha, "후보 조건의 칸 순서가 격자와 다르다 — p24를 다시 돌릴 것"
        assert meta["cols"][:2] == ["a_거주", "a_출근등교"], meta["cols"]
        f = V["f"]
        assert len(f) == n * 4 and all(isinstance(x, int) for x in f)
        res = [f[i * 4] for i in range(n)]
        tilt = [f[i * 4] - f[i * 4 + 1] for i in range(n)]
        srt = sorted(res)
        rr = [n - bisect.bisect_right(srt, v) for v in res]   # 0이 가장 높다. 값이 같으면 같은 수 — 예전 뷰어의 '거주 접근성 큰 순'과 같은 순서
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
            "tilt": tilt, "rr": rr,
            "cnt": {t: sp(v) for t, v in CD["cnt"].items()}, "un": {t: sp(v) for t, v in CD["un"].items()}})

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
            *([{"what": "후보 찾기 — 무인 가게 자리 (6종)", "name": "서울시 무인점포 현황 (소방재난본부) — 상가정보에 이름으로 붙인 가게", "via": "서울 열린데이터광장 OA-23054",
                "license": "이용허락범위 제한 없음", "as_of": "2025-12-31"},
               {"what": "후보 찾기 — 같은 업종 가게 수", "name": "소상공인시장진흥공단 상가(상권)정보", "via": "공공데이터포털 15083033", "license": "이용허락범위 제한 없음",
                "as_of": CD["meta"]["poi"].replace("poi_", "")}] if has_cd else []),
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
