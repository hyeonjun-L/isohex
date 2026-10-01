#!/usr/bin/env bash
# 상권 실험실 v2 전체 재현. isohex/analysis/ 에서 실행.
# 필요: pip install pandas pyarrow pyshp statsmodels scipy shapely pyproj
set -e
python build_master.py          # 원본 zip 풀기 + master/*.parquet
python join_master.py           # 상권 × 분기 패널 (점포수 = 전체)
python v2_cannibal.py           # → master/cell_panel.parquet, 잠식률 재추정
python v2_longdiff.py           # 차분 간격별 감쇠 진단
python v2_selection.py          # 매출 비공개·코로나 견고성
python v2_alpha_table.py        # → 업종별_잠식률.csv (W3 입력)
python v2_survival.py           # → master/agg_v2.parquet, 생존·매출vs생존
python v2_q4.py                 # 업종별 입지 계수 (FDR 보정)
# 크로스워크는 상가정보 스냅샷이 필요하다 (ingest_sangga.py 산출물)
POI_PARQUET=${POI_PARQUET:-../data/snapshots/poi_2026Q2.parquet} python v2_crosswalk.py
# 100m 격자 검토 (SGIS 포털 신청 자료) · 수요 지표 비교 (생활이동 2주 표본)
SGIS100_DIR=${SGIS100_DIR:-../격자통계} python v2_sgis100.py
MOVE_DIR=${MOVE_DIR:-"../수도권 생활이동"} python v2_demand_compare.py
