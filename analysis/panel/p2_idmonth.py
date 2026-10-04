# -*- coding: utf-8 -*-
"""상가업소번호 안의 발급 연월은 '등록 시점'으로 쓸 수 있나?
- 각 ID가 처음 실린 분기 vs ID 발급월
- 발급월 분포에 일괄 등록(스파이크)이 있는지"""
import pandas as pd, numpy as np, re, glob, sys
S=sys.argv[1]
FM={"2022Q4":"202212","2023Q1":"202303","2024Q1":"202403","2024Q2":"202406","2024Q3":"202409","2024Q4":"202412",
    "2025Q1":"202503","2025Q2":"202506","2025Q3":"202510","2025Q4":"202512","2026Q1":"202603","2026Q2":"202606"}
qs=sorted(re.search(r"poi_(\d{4}Q\d)",f).group(1) for f in glob.glob(f"{S}/poi_*.parquet"))
first={}
for q in qs:
    for b in pd.read_parquet(f"{S}/poi_{q}.parquet",columns=["biz_no"]).biz_no.values:
        if b not in first: first[b]=q
F=pd.Series(first).rename("first_q").reset_index().rename(columns={"index":"biz_no"})
F["idm"]=F.biz_no.str.extract(r"^MA\d{4}(20\d{2}(?:0[1-9]|1[0-2]))")[0]
print("ID 접두 분포:",F.biz_no.str[:6].value_counts().head(4).to_dict(), " 발급월 파싱 실패:",f"{F.idm.isna().mean():.2%}")
F["fm"]=F.first_q.map(FM)
F["lag"]=(F.fm.str[:4].astype(int)*12+F.fm.str[4:].astype(int))-(F.idm.str[:4].astype(float)*12+F.idm.str[4:].astype(float))
print("\n처음 실린 분기별 — ID 발급월이 그 분기보다 몇 개월 앞서는가 (중앙·90%)")
for q,g in F[F.first_q>="2024Q2"].groupby("first_q"):
    print(f"  {q}: {len(g):>7,}건  지연 중앙 {g.lag.median():>5.1f}개월  90% {g.lag.quantile(.9):>5.1f}  ≤3개월 {(g.lag<=3).mean():.0%}  >12개월 {(g.lag>12).mean():.0%}")
h=F[F.idm>="202209"].idm.value_counts().sort_index()
print("\n발급월별 ID 수 (2022-09 이후, 전 분기 합집합):")
print(" ".join(f"{k[2:4]}.{k[4:]}:{v:,}" for k,v in h.items()))
F.to_parquet(f"{S}/id_first_seen.parquet",index=False)
