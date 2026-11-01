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
    entry/index.json · entry/<코드>.json  개업(p20): 업종 48개 요약 · 업종별 [칸, 새 가게, 같은 건물 이어받기]… · [칸, 2024년 말 가게]…
    reb/index.json  한국부동산원 조사 상권 72곳의 임대료 값(천 원/㎡·월, 효용비율 %)과 칸 → 상권 번호(밖 −1). 경계 그림은 아직 싣지 않는다

웹에 칠하는 규칙 (W7.13 · 2026-10-25)
    분석(p26)의 '칠함' — 업종마다 처음 보는 구 순위상관이 한쪽 5%로 0보다 큼 — 에 더해, 37개 업종을 한꺼번에 검정한 것을
    보정한다(Benjamini–Hochberg, 거짓 발견 5%). p는 p26과 같은 근사 1 − Φ(ρ·√(n−1)).
업종별 덧붙임 (OVERRIDE) — 이름과 주의 문구. 세탁소: 서울시 매출 자료가 맡기는 세탁소 위주라 셀프빨래방에는 쓰지 않는다 (W7.13)

행정동 임대시세(상권분석서비스 화면 읽기)는 공개 조건을 정하기 전이라 넣지 않는다 (마스터플랜 W7.8).
"""
import argparse, hashlib, json, math, os, shutil, sys
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
            {"what": "거주 인구·종사자 격자", "name": "SGIS 격자 통계", "via": "국가데이터처 · 공공데이터포털 15141768", "license": "이용허락범위 제한 없음"},
            {"what": "자치구 경계", "name": "서울시 상권분석서비스 영역", "via": "서울 열린데이터광장", "license": "공공누리 1유형"},
            {"what": "칸", "name": "H3 (res 9)", "via": "h3geo.org", "license": "Apache-2.0"},
            *([{"what": "손익 점검 — 상권·행정동 점포당 월매출", "name": "서울시 상권분석서비스", "via": "서울 열린데이터광장", "license": "공공누리 1유형", "as_of": str(B["meta"].get("year"))},
               {"what": "카드 수수료 우대 구간", "name": "금융위원회 우대수수료율", "via": B["meta"].get("card_src", ""), "license": "공공 발표"}] if has_be else []),
            *([{"what": "개업 (2025년 상반기 새 가게)", "name": "소상공인시장진흥공단 상가(상권)정보 (분기 스냅샷을 이어 셈)", "via": "공공데이터포털 15083033", "license": "이용허락범위 제한 없음"}] if has_en else []),
            *([{"what": "임대료 비교 (서울 72 상권)", "name": "한국부동산원 상업용부동산 임대동향조사", "via": "공공데이터포털 15069766 · 15069789 · 15069791 · 15069843", "license": "이용허락범위 제한 없음", "as_of": "2025 · 2026Q2"}] if has_reb else []),
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
