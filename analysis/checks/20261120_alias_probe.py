# -*- coding: utf-8 -*-
"""업종 별칭 점검 (2026-11-20) — 낱말이 이름에 든 서울 가게가 상가정보 소분류 어디에 주로 실려 있나.

web/src/core/alias.ts의 별칭 사전(일상 낱말 → 업종)을 정할 때 썼다. 뜻으로 짐작하지 않고 실제 가게 이름으로 확인한다 —
돈까스는 '경양식'(72%), 이자카야는 '일식 회/초밥'(58%), 양꼬치는 '중국집'(90%)처럼 짐작과 다른 곳이 있었다.
쓰는 법: python3 analysis/checks/20261120_alias_probe.py 커피 빵집 술집 …   (상가정보 스냅샷: POI_PARQUET, 기본 data/snap26/poi_2026Q2.parquet)
출력: 낱말마다 '가게 수 | 소분류 셋과 몫'. 가게 이름은 화면에만 찍고 저장하지 않는다."""
import os, sys
import pandas as pd

POI = os.environ.get("POI_PARQUET", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "snap26", "poi_2026Q2.parquet"))
d = pd.read_parquet(POI, columns=["name", "cat_s_nm"])
nm = d.name.fillna("").str.replace(r"\s", "", regex=True).str.lower()
for w in sys.argv[1:]:
    m = nm.str.contains(w.lower(), regex=False)
    n = int(m.sum())
    if not n:
        print(f"{w}: 0")
        continue
    vc = d.cat_s_nm[m].value_counts()
    print(f"{w}: {n} | " + " · ".join(f"{k} {v * 100 // n}%" for k, v in vc.head(3).items()))
