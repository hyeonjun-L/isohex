# -*- coding: utf-8 -*-
"""'22분기 패널'이 진짜 시계열인지 확인한다.
상권마다 분기별로 값이 실제로 바뀌는지 — 안 바뀌면 고정효과로 계수를 못 뽑는다."""
import pandas as pd, numpy as np
m = pd.read_parquet("master/panel.parquet")

cols = ["점포수","개업수","폐업수","매출액","운영개월","폐업개월",
        "유동인구","상주인구","직장인구","지출액","집객시설","아파트단지수","아파트시가"]
rows=[]
for c in cols:
    g = m.groupby("상권_코드")[c]
    nuniq = g.nunique(dropna=True)
    # 전체 분산 중 상권내(시점간) 분산 비중
    d = m[["상권_코드",c]].dropna()
    tot = d[c].var()
    within = d.groupby("상권_코드")[c].transform(lambda s: s - s.mean()).var()
    rows.append((c, nuniq.median(), (nuniq<=1).mean()*100,
                 100*within/tot if tot and tot>0 else np.nan,
                 m.groupby("기준_년분기_코드")[c].sum().nunique()))
t = pd.DataFrame(rows, columns=["변수","상권당_고유값_중앙","값이_1개인_상권%","상권내_분산비중%","분기별_전체합_고유값"])
# 판정은 '상권내 분산 비중'이 아니라 '상권당 고유값 개수'로 한다.
# 분산 비중은 상권간 격차가 워낙 커서(강남 vs 골목) 진짜 변하는 변수도 1%로 찍힌다.
t["판정"] = np.where(t.상권당_고유값_중앙 <= 2, "완전 고정 — 한 시점 스냅샷을 분기마다 복사",
             np.where(t.상권당_고유값_중앙 <= 6, "연 1회 갱신 — 분기 변동 없음", "분기마다 변함"))
print("20분기(2021Q1~2025Q4) 기준\n")
print(t.to_string(index=False, float_format=lambda v: f"{v:,.1f}"))
