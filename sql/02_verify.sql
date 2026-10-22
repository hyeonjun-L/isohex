-- 점지 — 적재 검증 쿼리 모음
-- 사용 (isohex/docker 폴더에서): docker compose exec -T db psql -U jeomji -d jeomji -f /sql/02_verify.sql
--   또는 psql "postgresql://jeomji:jeomji@localhost:5434/jeomji" -f sql/02_verify.sql   (isohex 폴더에서)

\echo '════════ 1. 테이블별 행수 ════════'
SELECT 'poi_snapshot'          AS 테이블, count(*) FROM poi_snapshot
UNION ALL SELECT 'poi_change',            count(*) FROM poi_change
UNION ALL SELECT 'grid_cell',             count(*) FROM grid_cell
UNION ALL SELECT 'grid_industry_quarter', count(*) FROM grid_industry_quarter
UNION ALL SELECT 'unmanned_roster',       count(*) FROM unmanned_roster
UNION ALL SELECT 'poi_unmanned',          count(*) FROM poi_unmanned
ORDER BY 1;
-- 기대값: poi_snapshot 1,562,616 / poi_change 772,241 / grid_cell 33,842
--         grid_industry_quarter 624,290 / unmanned_roster 4,251

\echo ''
\echo '════════ 2. 분기별 점포수 — 원본 CSV 행수와 맞는지 ════════'
SELECT quarter AS 분기, count(*) AS 점포수,
       count(DISTINCT fp) AS 고유지문,
       count(*) - count(DISTINCT fp) AS 지문중복,
       round(100.0*(count(*)-count(DISTINCT fp))/count(*), 2) AS "중복%"
FROM poi_snapshot GROUP BY 1 ORDER BY 1;
-- 중복률이 2%를 넘으면 지문 설계를 다시 본다

\echo ''
\echo '════════ 3. 좌표계·격자 무결성 ════════'
SELECT DISTINCT ST_SRID(geom) AS srid FROM poi_snapshot;            -- 4326이어야 함
SELECT res, count(*) AS 셀수,
       round((avg(area_m2)/1e6)::numeric, 4) AS "평균면적_km2"
FROM grid_cell GROUP BY 1 ORDER BY 1;
-- res9 평균 0.0725㎢ (전세계 평균 0.105㎢보다 작다 — 서울 위도 때문)

\echo ''
\echo '════════ 4. 모든 점포가 격자에 들어갔는가 ════════'
SELECT count(*) AS "격자에_못_붙은_점포"
FROM poi_snapshot p LEFT JOIN grid_cell g ON g.h3 = p.h3_9
WHERE g.h3 IS NULL;
-- 0이어야 함

\echo ''
\echo '════════ 5. 빈 격자 — 점포가 없어서 아예 없는 셀 ════════'
SELECT count(*) AS "점포있는_res9_셀",
       round(605.0 / 0.0725)::int AS "서울전역_추정_셀수",
       round(605.0 / 0.0725)::int - count(*) AS "점포없는_셀_추정"
FROM grid_cell WHERE res = 9;
-- 현재 구조는 점포가 있는 셀만 담는다. 빈 격자도 후보가 될 수 있으므로
-- W2에서 서울 경계 polyfill로 전체 격자를 따로 만들어야 한다.

\echo ''
\echo '════════ 6. 관심 업종 모집단 (최신 분기) ════════'
SELECT cat_s AS 코드, cat_s_nm AS 업종, count(*) AS 점포수,
       count(*) FILTER (WHERE floor = '1')                    AS "1층",
       round(100.0*count(*) FILTER (WHERE floor='1')/count(*), 1) AS "1층%"
FROM poi_snapshot
WHERE quarter = (SELECT max(quarter) FROM poi_snapshot)
  AND cat_s IN ('R10202','S20902','S20901','I21201','M11301','N10703')
GROUP BY 1,2 ORDER BY 3 DESC;
-- 셀프빨래방은 1층이 대부분, 스터디카페는 2~5층이 주력 → 공급 제약이 업종마다 다르다

\echo ''
\echo '════════ 7. 무인 판정 — 매칭 방식 분해 ════════'
SELECT p.cat_s_nm AS 업종, count(*) AS 전체,
       count(u.fp) AS 무인판정,
       count(*) FILTER (WHERE u.match_kind = 'exact') AS 명단일치,
       count(*) FILTER (WHERE u.match_kind = 'brand') AS 브랜드판정,
       round(100.0*count(u.fp)/count(*), 1) AS "무인%"
FROM poi_snapshot p
LEFT JOIN poi_unmanned u ON u.fp = p.fp AND u.quarter = p.quarter
WHERE p.quarter = (SELECT max(quarter) FROM poi_snapshot)
  AND p.cat_s IN ('R10202','S20902','S20901','M11301','I21201')
GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '════════ 8. 명단 업종 vs 판정 점포 — 배수가 크면 과잉 판정 의심 ════════'
SELECT r.category AS 명단업종,
       count(DISTINCT r.id) AS 명단건수,
       (SELECT count(*) FROM poi_unmanned u WHERE u.category = r.category) AS 판정점포,
       round((SELECT count(*) FROM poi_unmanned u WHERE u.category = r.category)::numeric
             / count(DISTINCT r.id), 2) AS 배수
FROM unmanned_roster r GROUP BY 1 ORDER BY 4 DESC;
-- 배수가 2를 크게 넘으면 브랜드 사전에 일반명사가 섞였을 가능성이 높다.
-- 다만 명단 자체가 불완전해서 진짜 브랜드가 더 많이 잡히는 경우도 있어
-- 숫자만으로는 못 가른다 — scripts/brand_review.csv를 눈으로 확인할 것.

\echo ''
\echo '════════ 9. 라벨 — 격자별 개업 (13분기) ════════'
SELECT cat_s_nm AS 업종,
       count(*) FILTER (WHERE change = 'opened') AS 개업,
       count(*) FILTER (WHERE change = 'closed') AS 폐업,
       count(DISTINCT h3_9) FILTER (WHERE change = 'opened') AS "개업발생_셀",
       round(100.0 * count(DISTINCT h3_9) FILTER (WHERE change='opened')
             / (SELECT count(*) FROM grid_cell WHERE res=9), 1) AS "양성셀%"
FROM poi_change
WHERE quarter = '2026Q2' AND cat_s IN ('R10202','S20902','I21201','N10703')
GROUP BY 1 ORDER BY 2 DESC;
-- 양성 셀 비율이 5~30%면 PU learning에 적절한 범위다

\echo ''
\echo '════════ 10. 정규화 뷰 동작 확인 ════════'
SELECT h3, cat_s, store_cnt,
       round(per_km2::numeric, 1)        AS 제곱킬로당,
       round((share_in_cell*100)::numeric, 1) AS "셀내_비중%"
FROM v_grid_industry_density
WHERE quarter = (SELECT max(quarter) FROM poi_snapshot) AND cat_s = 'R10202'
ORDER BY store_cnt DESC LIMIT 5;
-- 원시 카운트로 해석하지 말 것. 이 뷰의 per_km2 / share_in_cell로만 본다.
