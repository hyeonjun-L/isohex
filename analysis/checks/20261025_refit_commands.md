# 다시 맞춘 판 만들기 (2026-10-25, 마스터플랜 W7.15)

매출 2025Q3~2026Q2(2026년은 서울 OpenAPI) + 상가정보 2026Q2 → 웹 자료 판 v2-20261025-5c1872b2.
Cowork 작업 VM에서 돌린 명령이다. `MASTER_DIR`·스냅샷 경로만 자기 환경에 맞게 바꾼다.

```bash
# 0. 2026 분기 받기 — 이현준님 Mac 터미널 (키는 입력창)
python3 pipeline/fetch_seoul.py                       # → 서울시 상권분석 서비스/api/

# 1. 상권 마스터 — API 파일도 읽는다 (같은 분기는 연도 파일 우선)
cd <작업>/analysis26 && python3 <isohex>/analysis/build_master.py && python3 <isohex>/analysis/make_cell_panel.py
#    master/에 sgis100_seoul.parquet · dong_demand.parquet를 같이 둔다 (앞 판과 같은 것)

# 2. 매출 수준 다시 학습 — 처음 고른 출근 배분(종사자)을 고정
cd <isohex>/analysis/panel
export MASTER_DIR=<작업>/analysis26/master TRDAR_SHP="<raw>/서울시 상권분석서비스(영역-상권)/서울시 상권분석서비스(영역-상권)"
export OUT_DIR=<작업>/out26b POI=poi_2026Q2 SALES_QS=20253,20254,20261,20262 XW_Q=20262 ALLOC=종사자
STAGE=feat python3 p26_sales_potential_v2.py <스냅샷 폴더>     # 스냅샷 폴더에 poi_2026Q2.parquet
STAGE=cv   python3 p26_sales_potential_v2.py <스냅샷 폴더>     # → 계수·업종대응·검정·수요래스터·매출잠재_판.json

# 3. 격자·뷰어 자료 — 스냅샷 폴더에 2의 결과 파일(계수·업종대응·검정·수요래스터·판)을 두면 pick()이 먼저 읽는다
OUT_DIR=<작업>/out18b POI=poi_2026Q2 python3 p18_grid_map.py <스냅샷 폴더>

# 4. 결과 폴더로 옮기고(앞 판은 결과/이전_2025판/) 웹 자료 내보내기
python3 pipeline/export_web.py --src analysis/panel/결과 --out web/public/data
```

**v3 (2026-11-16, 마스터플랜 W7.16)** — 위 명령 그대로 돌리면 p26이 기본(`MIX=B7`)으로 '주변 가게 구성' 재료를 더한 v3를 낸다(웹 자료 판 v3-20261116-507582c6).
v2를 다시 내려면 2에서 `MIX=none`을 더한다 — 계수 · 격자 · 웹 자료가 v2 판(v2-20261025-182e0f86)과 바이트까지 같게 나온다. 앞 판 결과는 `analysis/panel/결과/이전_v2판/`.

**맞힘 성적(성적표, 2026-11-16)** — p26이 계수 표에 업종별 성적(위 20% · 아래 20%로 본 상권이 업종 가운데 값을 넘은 몫 · 배수)을 적고 p18 → 내보내기가 `ind/index.json` · manifest에 싣는다.
다음 해 성적은 따로 — 2025 판 재료(`POI=poi_2025Q2`, 매출 분기 기본값, `STAGE=feat`)로 `python3 analysis/checks/20261116_next_year_v3.py <작업>/_p26_재료.parquet . analysis/panel/결과/매출잠재_다음해.json`.
새 분기로 다시 맞출 때는 이 파일도 한 해 밀어 다시 낸다(안 내면 지난 성적이 그대로 실린다 — 내보내기는 기간을 함께 적는다).

점검: `20261025_next_year.py`(다음 해에도 맞나) · 다시 돌리면 p26 계수와 p18 격자가 바이트까지 같게 나온다.
