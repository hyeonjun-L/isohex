-- 점지 — 공간 DB 스키마
-- 좌표계: 저장·교환은 EPSG:4326(WGS84), 면적·거리 계산은 EPSG:5179(UTM-K)
--   상가정보 경도/위도가 4326이고 서빙도 4326이라 4326을 원본으로 둔다.
--   미터 단위 연산은 그때그때 ST_Transform(geom, 5179)으로 처리한다.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────
-- 1. 점포 스냅샷 (분기별)
-- ─────────────────────────────────────────────────────────────
-- 주의: (quarter, fp)는 유일하지 않다. 지문 중복률이 0.5~0.8% 있어서
--       같은 분기·같은 블록에 동일 상호·동일 업종 점포가 실제로 존재한다.
--       따라서 대리 키를 쓰고 (quarter, fp)에는 일반 인덱스만 건다.
DROP TABLE IF EXISTS poi_snapshot CASCADE;
CREATE TABLE poi_snapshot (
  id         bigserial PRIMARY KEY,
  quarter    text        NOT NULL,          -- '2026Q2'
  fp         text        NOT NULL,          -- 지문 (좌표3 + 정규화상호 + 업종소분류)
  name       text,
  name_norm  text,
  branch     text,
  cat_s      text        NOT NULL,          -- 상권업종 소분류코드 (R10202 등)
  cat_s_nm   text,
  sgg        text,                          -- 시군구명
  adm_cd     text,                          -- 행정동코드
  adm_nm     text,
  floor      text,                          -- 층정보. 업종별 공급 제약 판정에 쓴다
  addr_road  text,
  geom       geometry(Point, 4326) NOT NULL,
  h3_8       text,
  h3_9       text        NOT NULL,
  h3_10      text
);
CREATE INDEX poi_snapshot_q_fp_idx   ON poi_snapshot (quarter, fp);
CREATE INDEX poi_snapshot_q_cat_idx  ON poi_snapshot (quarter, cat_s);
CREATE INDEX poi_snapshot_h3_9_idx   ON poi_snapshot (h3_9);
CREATE INDEX poi_snapshot_geom_idx   ON poi_snapshot USING GIST (geom);

-- ─────────────────────────────────────────────────────────────
-- 2. 분기 간 변화 = 라벨의 원천
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS poi_change CASCADE;
CREATE TABLE poi_change (
  id            bigserial PRIMARY KEY,
  quarter       text NOT NULL,              -- 현재 분기
  prev_quarter  text NOT NULL,
  change        text NOT NULL CHECK (change IN ('opened','closed')),
  fp            text NOT NULL,
  name          text,
  cat_s         text NOT NULL,
  cat_s_nm      text,
  sgg           text,
  adm_cd        text,
  floor         text,
  geom          geometry(Point, 4326) NOT NULL,
  h3_9          text NOT NULL,
  h3_10         text
);
CREATE INDEX poi_change_key_idx  ON poi_change (quarter, cat_s, change);
CREATE INDEX poi_change_h3_idx   ON poi_change (h3_9);
CREATE INDEX poi_change_geom_idx ON poi_change USING GIST (geom);

-- ─────────────────────────────────────────────────────────────
-- 3. 격자
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS grid_cell CASCADE;
CREATE TABLE grid_cell (
  h3        text PRIMARY KEY,
  res       smallint NOT NULL,
  parent_7  text,                           -- 공간 블록 CV의 fold 그룹으로 쓴다
  parent_6  text,
  geom      geometry(Polygon, 4326) NOT NULL,
  centroid  geometry(Point, 4326)   NOT NULL,
  area_m2   double precision NOT NULL,      -- EPSG:5179 기준 실면적
  sgg       text                            -- 중심점이 속한 자치구
);
CREATE INDEX grid_cell_res_idx    ON grid_cell (res);
CREATE INDEX grid_cell_p7_idx     ON grid_cell (parent_7);
CREATE INDEX grid_cell_geom_idx   ON grid_cell USING GIST (geom);
CREATE INDEX grid_cell_cent_idx   ON grid_cell USING GIST (centroid);

-- ─────────────────────────────────────────────────────────────
-- 4. 격자 × 업종 × 분기 집계
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS grid_industry_quarter CASCADE;
CREATE TABLE grid_industry_quarter (
  h3         text NOT NULL,
  res        smallint NOT NULL,
  quarter    text NOT NULL,
  cat_s      text NOT NULL,
  store_cnt  integer NOT NULL,
  PRIMARY KEY (h3, quarter, cat_s)
);
CREATE INDEX giq_cat_q_idx ON grid_industry_quarter (cat_s, quarter);

-- ─────────────────────────────────────────────────────────────
-- 5. 무인 판정 (서울시 무인점포 명단 기준)
-- ─────────────────────────────────────────────────────────────
-- 서울 열린데이터광장 공개자료라 상호명 저장에 제약이 없다.
DROP TABLE IF EXISTS unmanned_roster CASCADE;
CREATE TABLE unmanned_roster (
  id         bigserial PRIMARY KEY,
  as_of      date NOT NULL,                 -- 명단 기준일 (2025-12-31)
  sgg        text,
  name       text NOT NULL,
  name_norm  text NOT NULL,
  category   text NOT NULL                  -- 무인빨래방 / 무인스터디카페 / ...
);
CREATE INDEX unmanned_roster_norm_idx ON unmanned_roster (name_norm);

DROP TABLE IF EXISTS poi_unmanned CASCADE;
CREATE TABLE poi_unmanned (
  fp          text NOT NULL,
  quarter     text NOT NULL,
  category    text NOT NULL,
  match_kind  text NOT NULL,                -- exact | brand_token
  PRIMARY KEY (fp, quarter)
);

-- ─────────────────────────────────────────────────────────────
-- 6. 외부 지도 서비스 장소ID 매핑
-- ─────────────────────────────────────────────────────────────
-- 카카오 로컬 API 정책상 "API가 돌려준 장소명"은 DB 저장 불가이고,
-- 장소ID와 place_url의 영구 저장은 허용된다. 그래서 ID만 남긴다.
-- 조회 → 실시간 비교 → ID만 적재 → 장소명 즉시 폐기가 정책에 맞는 흐름이다.
DROP TABLE IF EXISTS place_id_map CASCADE;
CREATE TABLE place_id_map (
  fp            text NOT NULL,
  provider      text NOT NULL CHECK (provider IN ('kakao','naver')),
  place_id      text NOT NULL,
  place_url     text,
  linked_at     timestamptz NOT NULL DEFAULT now(),
  match_conf    real,                       -- 좌표 거리·상호 유사도 기반 신뢰도
  PRIMARY KEY (fp, provider)
);
CREATE INDEX place_id_map_pid_idx ON place_id_map (provider, place_id);

-- ─────────────────────────────────────────────────────────────
-- 편의 뷰: 업종별 격자 밀도 (정규화는 여기서부터 시작)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_grid_industry_density AS
SELECT g.h3, g.res, q.quarter, q.cat_s,
       q.store_cnt,
       q.store_cnt / (g.area_m2 / 1e6)                       AS per_km2,
       q.store_cnt::double precision
         / NULLIF(SUM(q.store_cnt) OVER (PARTITION BY g.h3, q.quarter), 0) AS share_in_cell
FROM grid_industry_quarter q
JOIN grid_cell g ON g.h3 = q.h3;

COMMENT ON VIEW v_grid_industry_density IS
  '원시 카운트 상관의 대부분은 규모 효과다. 해석은 per_km2 또는 share_in_cell로만 한다.';
