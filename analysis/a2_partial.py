# -*- coding: utf-8 -*-
"""밀도 변환은 분모를 공유해서 상관을 '만들어낼' 수도 있다.
그래서 면적을 통제한 편상관으로 한 번 더 확인한다."""
import pandas as pd, numpy as np
from scipy import stats
m = pd.read_parquet("master/panel.parquet")
q = m[m.기준_년분기_코드==20254].copy()

def L(x): return np.log(pd.to_numeric(x, errors="coerce").clip(lower=0)+1)

V = {"매출":L(q.매출액),"점포":L(q.점포수),"유동인구":L(q.유동인구),"상주인구":L(q.상주인구),
     "직장인구":L(q.직장인구),"집객시설":L(q.집객시설),"지출":L(q.지출액),
     "아파트가구":L(q.아파트가구수),"면적":L(q.면적_m2)}
D = pd.DataFrame(V).dropna()
print(f"n = {len(D):,}  (모두 log1p)")

def partial(y, x, z):
    ry = y - np.polyval(np.polyfit(z, y, 1), z)
    rx = x - np.polyval(np.polyfit(z, x, 1), z)
    return stats.pearsonr(rx, ry)

print(f"\n{'변수':<10}{'매출과 단순상관':>14}{'면적통제 편상관':>16}{'차이':>9}")
for k in ["유동인구","상주인구","직장인구","집객시설","지출","아파트가구","점포"]:
    r0,_ = stats.pearsonr(D[k], D["매출"])
    r1,p1 = partial(D["매출"].values, D[k].values, D["면적"].values)
    flag = " ←뒤집힘" if r0*r1 < 0 else ("  ←거의 소멸" if abs(r1) < 0.15 <= abs(r0) else "")
    print(f"{k:<10}{r0:>+14.2f}{r1:>+16.2f}{r1-r0:>+9.2f}{flag}")

print(f"\n{'변수':<10}{'생존(운영개월) 단순':>18}{'면적통제 편상관':>16}")
D2 = D.copy(); D2["운영개월"] = q.loc[D.index, "운영개월"].values
D2 = D2.dropna()
for k in ["유동인구","상주인구","직장인구","집객시설","지출","아파트가구","점포","매출"]:
    r0,_ = stats.pearsonr(D2[k], D2["운영개월"])
    r1,_ = partial(D2["운영개월"].values, D2[k].values, D2["면적"].values)
    print(f"{k:<10}{r0:>+18.2f}{r1:>+16.2f}")
