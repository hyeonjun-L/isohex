#!/usr/bin/env python3
"""
점지 — 스냅샷 Parquet → PostGIS 적재기

ingest_sangga.py가 만든 Parquet을 읽어 공간 DB에 올린다.
격자(grid_cell)는 스냅샷에 등장한 H3 셀에서 폴리곤·면적·부모셀을 계산해 만든다.

사용법:
    python load_to_pg.py --snapshots data/snapshots --roster "무인점포 현황_20251231.csv"
    python load_to_pg.py --snapshots data/snapshots --dsn postgresql://jeomji:jeomji@localhost:5434/jeomji

환경변수 JEOMJI_DSN으로도 접속 문자열을 줄 수 있다.
"""
import argparse, csv, glob, io, os, re, sys
from collections import Counter, defaultdict

RES_DEFAULT = [8, 9, 10]
_punct = re.compile(r"[^0-9a-z가-힣]")
norm_name = lambda s: _punct.sub("", (s or "").lower())

# 무인 업종명 → 상가정보 소분류코드 후보. 명단 조인 시 업종이 엉뚱하면 버린다.
ROSTER_CAT = {
    "무인스터디카페": {"R10202"},
    "무인빨래방": {"S20902", "S20901"},
    "무인판매점(카페)": {"I21201"},
    "무인사진관": {"M11301"},
    "무인판매점(아이스크림)": {"G20507", "G20509", "G20404", "G22199"},
    "무인판매점(밀키트)": {"G20509", "G20404", "I21099", "G22199"},
}
# 브랜드가 아니라 업종 일반명사인 토큰 — 사전에서 제외한다
GENERIC_TOKENS = {
    "카페", "무인카페", "무인", "24시", "24시무인", "셀프", "스터디카페", "무인스터디",
    "빨래방", "셀프빨래방", "코인빨래방", "무인사진관", "사진관", "아이스크림",
    "무인판매", "밀키트", "무인점포", "무인매장", "24시간", "스터디",
}


def build_brand_dict(roster_df, min_count=3, min_len=3):
    """명단에서 (브랜드, 무인업종) 사전을 뽑는다.

    무인 판정의 목적은 '그 점포가 무인인가'이지 '명단의 그 점포인가'가 아니다.
    프랜차이즈 브랜드는 지점이 전부 무인이므로, 명단에서 브랜드를 추출해
    업종 안에서 접두 매칭하는 쪽이 점포 단위 매칭보다 정확하고 커버리지도 넓다.
    (업소명 앞 토큰이 3회 이상 등장 + 3자 이상 + 일반명사 아님)
    """
    c = Counter(zip(roster_df.brand, roster_df.category))
    return {(b, j) for (b, j), n in c.items()
            if n >= min_count and len(b) >= min_len and b not in GENERIC_TOKENS}


def norm_sgg(s):
    """명단은 '관악', 상가정보는 '관악구'로 적는다. 뒤의 '구'를 떼어 맞춘다."""
    return re.sub(r"구$", "", (s or "").strip())


def copy_df(cur, df, table, cols):
    """DataFrame을 COPY FROM STDIN으로 밀어넣는다 (건별 INSERT보다 훨씬 빠르다)."""
    buf = io.StringIO()
    df[cols].to_csv(buf, index=False, header=False, na_rep="\\N")
    buf.seek(0)
    cur.copy_expert(
        f"COPY {table} ({', '.join(cols)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')", buf)


def build_grid(cells_by_res, cur):
    """스냅샷에 등장한 H3 셀로 grid_cell을 채운다. 면적은 EPSG:5179 기준."""
    import h3, pandas as pd
    rows = []
    for res, cells in cells_by_res.items():
        for c in cells:
            b = h3.cell_to_boundary(c)  # [(lat, lng), ...]
            ring = ", ".join(f"{lng} {lat}" for lat, lng in b)
            first_lat, first_lng = b[0]
            wkt = f"POLYGON(({ring}, {b[0][1]} {b[0][0]}))"
            lat, lng = h3.cell_to_latlng(c)
            rows.append({
                "h3": c, "res": res,
                "parent_7": h3.cell_to_parent(c, 7) if res > 7 else None,
                "parent_6": h3.cell_to_parent(c, 6) if res > 6 else None,
                "wkt": wkt, "clng": lng, "clat": lat,
            })
    df = pd.DataFrame(rows)
    cur.execute("""CREATE TEMP TABLE _g (h3 text, res smallint, parent_7 text,
                   parent_6 text, wkt text, clng double precision, clat double precision)
                   ON COMMIT DROP""")
    copy_df(cur, df, "_g", ["h3", "res", "parent_7", "parent_6", "wkt", "clng", "clat"])
    cur.execute("""
        INSERT INTO grid_cell (h3, res, parent_7, parent_6, geom, centroid, area_m2)
        SELECT h3, res, parent_7, parent_6,
               ST_GeomFromText(wkt, 4326),
               ST_SetSRID(ST_MakePoint(clng, clat), 4326),
               ST_Area(ST_Transform(ST_GeomFromText(wkt, 4326), 5179))
        FROM _g
        ON CONFLICT (h3) DO NOTHING""")
    return len(df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshots", required=True)
    ap.add_argument("--roster", help="서울시 무인점포 현황 CSV (선택)")
    ap.add_argument("--roster-asof", default="2025-12-31")
    ap.add_argument("--dsn", default=os.environ.get(
        "JEOMJI_DSN", "postgresql://jeomji:jeomji@localhost:5434/jeomji"))   # docker/docker-compose.yml의 5434
    ap.add_argument("--res", default="8,9,10")
    args = ap.parse_args()

    import pandas as pd, psycopg2
    resolutions = [int(x) for x in args.res.split(",")]
    conn = psycopg2.connect(args.dsn)
    conn.autocommit = False
    cur = conn.cursor()

    snaps = sorted(glob.glob(os.path.join(args.snapshots, "poi_*.parquet")))
    if not snaps:
        raise SystemExit(f"[!] 스냅샷 없음: {args.snapshots}/poi_*.parquet")

    cells_by_res = defaultdict(set)
    print(f"스냅샷 {len(snaps)}개\n")

    # ── 1. poi_snapshot ──────────────────────────────────────
    for p in snaps:
        q = re.search(r"poi_(\d{4}Q\d)\.parquet$", p).group(1)
        df = pd.read_parquet(p)
        cur.execute("DELETE FROM poi_snapshot WHERE quarter = %s", (q,))
        df["quarter"] = q
        df["wkt"] = "POINT(" + df.lon.astype(str) + " " + df.lat.astype(str) + ")"
        cur.execute("""CREATE TEMP TABLE _p (quarter text, fp text, name text, name_norm text,
                       branch text, cat_s text, cat_s_nm text, sgg text, adm_cd text, adm_nm text,
                       floor text, addr_road text, wkt text, h3_8 text, h3_9 text, h3_10 text)
                       ON COMMIT DROP""")
        copy_df(cur, df, "_p", ["quarter", "fp", "name", "name_norm", "branch", "cat_s",
                                "cat_s_nm", "sgg", "adm_cd", "adm_nm", "floor", "addr_road",
                                "wkt", "h3_8", "h3_9", "h3_10"])
        cur.execute("""INSERT INTO poi_snapshot
              (quarter, fp, name, name_norm, branch, cat_s, cat_s_nm, sgg, adm_cd, adm_nm,
               floor, addr_road, geom, h3_8, h3_9, h3_10)
            SELECT quarter, fp, name, name_norm, branch, cat_s, cat_s_nm, sgg, adm_cd, adm_nm,
                   floor, addr_road, ST_GeomFromText(wkt, 4326), h3_8, h3_9, h3_10 FROM _p""")
        cur.execute("DROP TABLE _p")
        for r in resolutions:
            cells_by_res[r].update(df[f"h3_{r}"].dropna().unique())
        print(f"  poi_snapshot  {q}  {len(df):>7,}건")

    # ── 2. poi_change ────────────────────────────────────────
    for p in sorted(glob.glob(os.path.join(args.snapshots, "change_*.parquet"))):
        m = re.search(r"change_(\d{4}Q\d)_(\d{4}Q\d)\.parquet$", p)
        pq, q = m.group(1), m.group(2)
        df = pd.read_parquet(p)
        cur.execute("DELETE FROM poi_change WHERE quarter = %s AND prev_quarter = %s", (q, pq))
        df["quarter"], df["prev_quarter"] = q, pq
        df["wkt"] = "POINT(" + df.lon.astype(str) + " " + df.lat.astype(str) + ")"
        cur.execute("""CREATE TEMP TABLE _c (quarter text, prev_quarter text, change text, fp text,
                       name text, cat_s text, cat_s_nm text, sgg text, adm_cd text, floor text,
                       wkt text, h3_9 text, h3_10 text) ON COMMIT DROP""")
        copy_df(cur, df, "_c", ["quarter", "prev_quarter", "change", "fp", "name", "cat_s",
                                "cat_s_nm", "sgg", "adm_cd", "floor", "wkt", "h3_9", "h3_10"])
        cur.execute("""INSERT INTO poi_change
              (quarter, prev_quarter, change, fp, name, cat_s, cat_s_nm, sgg, adm_cd, floor, geom, h3_9, h3_10)
            SELECT quarter, prev_quarter, change, fp, name, cat_s, cat_s_nm, sgg, adm_cd, floor,
                   ST_GeomFromText(wkt, 4326), h3_9, h3_10 FROM _c""")
        cur.execute("DROP TABLE _c")
        print(f"  poi_change    {pq}→{q}  {len(df):>7,}건")

    # ── 3. grid_cell ─────────────────────────────────────────
    n = build_grid(cells_by_res, cur)
    cur.execute("""UPDATE grid_cell g SET sgg = s.sgg FROM (
                     SELECT DISTINCT ON (h3_9) h3_9, sgg FROM poi_snapshot
                     ORDER BY h3_9, quarter DESC) s
                   WHERE g.h3 = s.h3_9 AND g.sgg IS NULL""")
    print(f"  grid_cell     {n:>7,}셀 " +
          " · ".join(f"res{r} {len(c):,}" for r, c in sorted(cells_by_res.items())))

    # ── 4. grid_industry_quarter ─────────────────────────────
    cur.execute("TRUNCATE grid_industry_quarter")
    cur.execute("""INSERT INTO grid_industry_quarter (h3, res, quarter, cat_s, store_cnt)
                   SELECT h3_9, 9, quarter, cat_s, count(*) FROM poi_snapshot
                   GROUP BY h3_9, quarter, cat_s""")
    cur.execute("SELECT count(*) FROM grid_industry_quarter")
    print(f"  격자×업종×분기 {cur.fetchone()[0]:>7,}행")

    # ── 5. 무인 명단 ─────────────────────────────────────────
    if args.roster and os.path.exists(args.roster):
        rows = list(csv.DictReader(open(args.roster, encoding="cp949")))
        cur.execute("TRUNCATE unmanned_roster")
        rdf = pd.DataFrame([{
            "as_of": args.roster_asof, "sgg": r["자치구"], "name": r["업소명"],
            "name_norm": norm_name(r["업소명"]), "category": r["업종"],
            "brand": norm_name((r["업소명"] or "").strip().split()[0] if r["업소명"].strip() else "")}
            for r in rows])
        copy_df(cur, rdf, "unmanned_roster", ["as_of", "sgg", "name", "name_norm", "category"])

        latest = sorted(re.search(r"poi_(\d{4}Q\d)", p).group(1) for p in snaps)[-1]
        cur.execute("SELECT fp, name_norm, cat_s FROM poi_snapshot WHERE quarter = %s", (latest,))
        poi = cur.fetchall()

        exact = defaultdict(list)
        by_cat = defaultdict(list)
        for fp, nm, cat in poi:
            exact[nm].append((fp, cat))
            by_cat[cat].append((fp, nm))

        matched, kinds, roster_hit = {}, Counter(), set()
        for i, r in rdf.iterrows():
            ok = ROSTER_CAT.get(r.category)
            for fp, c in exact.get(r.name_norm, []):
                if not ok or c in ok:
                    roster_hit.add(i)
                    if fp not in matched:
                        matched[fp] = (r.category, "exact"); kinds["exact"] += 1

        brands = build_brand_dict(rdf)
        for b, j in brands:
            for c in ROSTER_CAT.get(j, ()):
                for fp, nm in by_cat.get(c, ()):
                    if nm.startswith(b) and fp not in matched:
                        matched[fp] = (j, "brand"); kinds["brand"] += 1

        cur.execute("TRUNCATE poi_unmanned")
        if matched:
            mdf = pd.DataFrame([{"fp": fp, "quarter": latest, "category": c, "match_kind": k}
                                for fp, (c, k) in matched.items()])
            copy_df(cur, mdf, "poi_unmanned", ["fp", "quarter", "category", "match_kind"])
        print(f"  무인 명단     {len(rdf):>7,}건 · 브랜드사전 {len(brands)}개 → "
              f"점포 {len(matched):,}건 판정 ({', '.join(f'{k} {v:,}' for k, v in kinds.most_common())})")
        print(f"                명단 항목 중 상가정보에서 찾은 비율 "
              f"{len(roster_hit)/len(rdf)*100:.1f}% (브랜드 판정은 명단 밖 점포도 잡는다)")

    conn.commit()

    # ── 검증 리포트 ──────────────────────────────────────────
    print("\n── 적재 검증 ──")
    for q, sql in [
        ("분기별 점포수", "SELECT quarter, count(*) FROM poi_snapshot GROUP BY 1 ORDER BY 1"),
        ("res9 셀 수", "SELECT count(*) FROM grid_cell WHERE res=9"),
        ("셀 평균 면적(㎢)", "SELECT round((avg(area_m2)/1e6)::numeric, 4) FROM grid_cell WHERE res=9"),
        ("좌표계 확인", "SELECT DISTINCT ST_SRID(geom) FROM poi_snapshot"),
        ("업종별 무인 비율", """SELECT p.cat_s_nm,
               count(*) AS 전체, count(u.fp) AS 무인,
               round(100.0*count(u.fp)/count(*), 1) AS pct
             FROM poi_snapshot p LEFT JOIN poi_unmanned u ON u.fp = p.fp AND u.quarter = p.quarter
             WHERE p.quarter = (SELECT max(quarter) FROM poi_snapshot)
               AND p.cat_s IN ('R10202','S20902','I21201','M11301')
             GROUP BY 1 ORDER BY 2 DESC"""),
    ]:
        cur.execute(sql)
        print(f"  {q}: {cur.fetchall()}")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
