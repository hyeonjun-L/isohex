# 점지 공간 DB (PostGIS) — 띄우고, 적재하고, 검증하기

상가정보 분기 스냅샷을 PostGIS에 올려 SQL로 보는 곳이다. 분석(`analysis/panel`)과 지도는 이 DB 없이 파일로 돈다 — DB는 질의·확인용.

## 준비
- Docker Desktop. 이미지가 `linux/amd64`라 Apple 실리콘 Mac에서는 설정 > General의 **Use Rosetta for x86_64/amd64 emulation**을 켜 두면 빠르다
- 파이썬 패키지: `pip3 install psycopg2-binary pandas pyarrow h3`
- **스냅샷 폴더** — `poi_<분기>.parquet`·`change_<앞분기>_<분기>.parquet`가 든 폴더. `scripts/ingest_sangga.py`가 상가정보 원본 CSV로 만든다(`scripts/README_스냅샷.md` — 2025Q1 파일은 좌표 보정이 먼저 필요하다).
  예: `python3 scripts/ingest_sangga.py --raw "소상공인시장진흥공간_상가" --out data/snapshots --sido 서울 --res 8,9,10`

## 순서
```bash
# 1. 띄우기 — isohex/docker 폴더에서. 처음엔 이미지를 받고 sql/01_schema.sql로 표 6개를 만든다
docker compose up -d
docker compose ps                  # STATUS가 (healthy)가 될 때까지

# 2. 적재 — isohex 폴더에서. 접속 기본값은 localhost:5434 (compose와 같다. 다르면 --dsn 또는 JEOMJI_DSN)
python3 scripts/load_to_pg.py --snapshots data/snapshots --roster "무인점포 현황_20251231.csv"

# 3. 검증 — isohex/docker 폴더에서. 표 10개(행수·분기별 점포·좌표계·격자·층·무인 판정·라벨 등)
docker compose exec -T db psql -U jeomji -d jeomji -f /sql/02_verify.sql
```
- 처음부터 다시: `docker compose down -v` (데이터 볼륨까지 지운다) → 1부터. 볼륨이 남아 있으면 01_schema.sql은 다시 돌지 않는다
- 포트는 5434(compose에 적힌 값). 바꾸려면 `docker-compose.yml`의 ports와 적재기 `--dsn`을 같이 바꾼다
- `02_verify.sql` 맨 위의 기대 행수(poi_snapshot 1,562,616 등)는 2026-09 시험 때 값이다. 넣은 분기 수에 따라 달라진다

## 2026-10-22에 고친 것
- 적재기 기본 포트 5433 → 5434 (compose와 맞춤), 검증 안내의 포트도
- 초기화 폴더에 `sql/` 전체를 걸어 처음 기동 때 `02_verify.sql`까지 돌던 것 → `01_schema.sql`만 걸고, `sql/`은 `/sql`로 따로 걸었다(안내의 `-f /sql/02_verify.sql`이 그제야 컨테이너 안에 있다)
- 점검: 같은 `01_schema.sql` → `load_to_pg.py`(기본 접속값) → `02_verify.sql`을 PostgreSQL 16 + PostGIS 3에서 가짜 스냅샷 두 분기(점포 6,100 · 변화 140 · 명단 60)로 돌려 오류 없이 끝났다.
  Docker 자체는 Claude 작업 공간에서 돌릴 수 없어 이 Mac에서 처음 띄울 때 한 번 확인해야 한다
