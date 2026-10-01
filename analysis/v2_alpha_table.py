# -*- coding: utf-8 -*-
"""W3 입력용 업종별 '매력도 지수 α' 표.
α = 같은 셀에서 점포가 1% 늘 때 그 업종 매출이 몇 % 느나 (= 1 − 잠식률).
- 추정: 8분기 차분 (1분기 차분은 잡음 감쇠, 19분기는 역인과 섞임 — 중간을 쓴다)
- 업종별 표본이 작아 구간이 넓으므로 경험적 베이즈로 전체 평균 쪽으로 수축한다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
d=pd.read_parquet("master/cell_panel.parquet")
def qidx(c): c=int(c); return (c//10-2021)*4+(c%10-1)
d["t"]=d.기준_년분기_코드.map(qidx)
K=8
a=d[["cell","t","l_매출","l_전체","상권_코드","서비스_업종_코드","서비스_업종_코드_명"]]
b=a[["cell","t","l_매출","l_전체"]].copy(); b["t"]=b.t+K
m=a.merge(b,on=["cell","t"],suffixes=("","_lag"))
m["dy"]=m.l_매출-m.l_매출_lag; m["dx"]=m.l_전체-m.l_전체_lag
def est(z):
    r=smf.ols("dy ~ dx + C(t)",data=z).fit(cov_type="cluster",cov_kwds={"groups":z.상권_코드})
    return r.params["dx"],r.bse["dx"],len(z),z.cell.nunique()
pool=est(m)
rows=[]
for (c,nm),z in m.groupby(["서비스_업종_코드","서비스_업종_코드_명"]):
    if z.cell.nunique()<80 or (z.dx!=0).sum()<200: continue
    b_,se,n,cells=est(z); rows.append((nm,c,b_,se,n,cells))
t=pd.DataFrame(rows,columns=["업종","코드","α_raw","SE","관측","셀수"])
# 경험적 베이즈 수축: τ² = 업종간 진짜 분산 — DerSimonian-Laird 추정 (Cochran Q 기반)
w_=1/t.SE**2; mu_=(w_*t.α_raw).sum()/w_.sum()
Q=(w_*(t.α_raw-mu_)**2).sum(); df_=len(t)-1; C=w_.sum()-(w_**2).sum()/w_.sum()
tau2=max((Q-df_)/C,1e-6); pooled_reg=pool[0]; pool=(mu_,pool[1],pool[2],pool[3])
print(f"Cochran Q={Q:.1f} (df {df_}), I²={max((Q-df_)/Q,0):.0%}")
t["w"]=tau2/(tau2+t.SE**2)
t["α"]=t.w*t.α_raw+(1-t.w)*pool[0]
t["α_SE"]=np.sqrt(t.w)*t.SE
t["잠식률"]=1-t.α
t["구간"]=t.apply(lambda r:f"{1-r.α-1.96*r.α_SE:.0%}~{1-r.α+1.96*r.α_SE:.0%}",axis=1)
t=t.sort_values("잠식률")
t.to_csv("업종별_잠식률.csv",index=False,encoding="utf-8-sig")
print(f"전체 풀링 회귀(8분기 차분) α={pooled_reg:.3f} → 잠식률 {1-pooled_reg:.0%}  |  업종 가중평균 α={pool[0]:.3f} → {1-pool[0]:.0%}  |  업종간 진짜 표준편차 τ={np.sqrt(tau2):.3f}\n")
print(f"{'업종':<14}{'α_raw':>8}{'수축후 α':>9}{'잠식률':>8}   95% 구간      가중치")
for _,r in t.iterrows():
    print(f"{r.업종:<14}{r.α_raw:>+8.2f}{r.α:>9.2f}{r.잠식률:>8.0%}   {r.구간:<12} {r.w:.2f}")
print(f"\n업종 {len(t)}개 — 수축 후 잠식률 범위 {t.잠식률.min():.0%} ~ {t.잠식률.max():.0%}, 중앙 {t.잠식률.median():.0%}")
