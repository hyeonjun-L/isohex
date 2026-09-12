# -*- coding: utf-8 -*-
"""0단계: 규모효과 함정을 먼저 드러낸다.
원시 카운트끼리는 '큰 상권이면 뭐든 많다'는 이유만으로 다 상관이 높다."""
import pandas as pd, numpy as np
from scipy.stats import spearmanr
m = pd.read_parquet("master/panel.parquet")
q = m[m.기준_년분기_코드==20254].copy()

raw = ["점포수","매출액","유동인구","상주인구","직장인구","집객시설","지출액","면적_km2"]
den = ["점포수_밀도","매출_밀도","유동인구_밀도","상주인구_밀도","직장인구_밀도","집객시설_밀도","1인당지출"]

def corrtab(df, cols, label):
    d = df[cols].dropna()
    c = d.corr(method="spearman").round(2)
    print(f"\n──── {label}  (n={len(d):,}) ────")
    print(c.to_string())
    return c

c1 = corrtab(q, raw, "원시 카운트끼리 (스피어만)")
c2 = corrtab(q, den, "밀도로 바꾼 뒤 (스피어만)")

iu = np.triu_indices_from(c1.values, 1)
print(f"\n원시 상관 절대값 평균 : {np.abs(c1.values[iu]).mean():.2f}")
iu2 = np.triu_indices_from(c2.values, 1)
print(f"밀도 상관 절대값 평균 : {np.abs(c2.values[iu2]).mean():.2f}")

print("\n[면적과의 상관 — 이게 함정의 정체]")
for c in raw[:-1]:
    r,_ = spearmanr(q.면적_km2, q[c], nan_policy="omit")
    print(f"  면적 ↔ {c:<8} {r:+.2f}")
