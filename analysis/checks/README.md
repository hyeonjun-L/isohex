# 점검 스크립트 (2026-10-25, 마스터플랜 W7.15)

빨래방 결정과 가공 결과 점검에 쓴 스크립트. Cowork 작업 VM에서 돌렸다 — 경로는 그 VM 기준(`$HOME/work/...`)이라 다시 돌릴 때는 아래 입력 경로만 바꾼다.

| 파일 | 하는 일 | 입력 |
|---|---|---|
| `20261025_laundry_a.py` | 서울시 '세탁소' 점포 수에 셀프빨래방이 어떻게 걸리나, 학습 상권(403곳)에서 셀프빨래방 비중별 기울기 | 상권 영역 SHP · `poi_2025Q2.parquet` · `master/cell_panel.parquet` · `sales_potential_cells_v2.parquet` |
| `20261025_laundry_b.py` | 지도 매출 수준이 실제 가게의 2년 생존·새 가게와 맞나 (세탁소·셀프빨래방·카페) | `결과/매출잠재_격자.csv` · `lineage.parquet` |
| `20261025_laundry_c.py` | 처음 보는 구 교차검증 예측이 셀프빨래방 많은 상권에서도 맞나 | `sales_potential_cells_v2.parquet` · laundry_a의 출력 |
| `20261025_model_check.py` | 37개 업종 계수·순위상관 다시 학습해 파일과 대조, 구 단위 부트스트랩, 여러 업종 동시 검정(BH) | `sales_potential_cells_v2.parquet` · `out26/매출잠재_계수_수요만_v2.csv` |

| `20261025_next_year.py` | 2025로 배운 모형이 2026 상반기 상권 순서를 맞히나 · 2025Q4를 API와 연도 파일로 대조 | `master/` · `sales_potential_cells_v2.parquet` · `서울시 상권분석 서비스/api/` |
| `20261116_next_year_v3.py` | 모형 v3(재료에 주변 가게 구성)도 다음 해에 맞나 — 2025로 배운 v2 · v3의 처음 보는 구 예측을 2026 상반기와 견준다. 셋째 인자를 주면 업종별 다음 해 맞힘 성적 JSON(`결과/매출잠재_다음해.json` — 웹 성적표가 쓴다) | 2025 판 `_p26_재료.parquet`(p26 `STAGE=feat`) · `master/cell_panel.parquet` |
| `20261116_v2_v3_cells.py` | v2 ↔ v3 칸 값 — 순위상관 · 값의 폭 · 끝값 맞춤 · 뒤집힌 칸 | 두 판의 `매출잠재_격자.csv` |
| `20261025_refit_commands.md` | 최근 네 분기(2025Q3~2026Q2) + 상가정보 2026Q2로 다시 맞춘 명령 순서 | — |

웹 자료 값의 재계산(공식 · 칠할 칸)은 `pipeline/export_web.py`로 다시 내보내 같은 판 이름이 나오는지로 본다.
