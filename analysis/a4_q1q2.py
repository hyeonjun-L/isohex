# -*- coding: utf-8 -*-
"""Q1 매출은 무엇이 끌어올리나 / Q2 생존은 무엇이 늘리나
- 단면(2025Q4): 모든 변수 쓸 수 있지만 교란 있음
- 고정효과(20분기): 유동인구만 식별 가능 (나머지는 상권내 변동이 없음)
전부 log-log이라 계수 = 탄력성(1% 늘면 y가 몇 % 늘어나는가)."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
m = pd.read_parquet("master/panel.parquet")

def prep(d):
    d = d.copy()
    for c in ["매출액","점포수","유동인구","상주인구","직장인구","집객시설","면적_m2","지출액"]:
        d["l_"+c] = np.log(pd.to_numeric(d[c], errors="coerce").clip(lower=0)+1)
    d["역세권"] = (d.지하철역>0).astype(int)
    return d

q = prep(m[m.기준_년분기_코드==20254])

RHS = ("l_면적_m2 + l_유동인구 + l_상주인구 + l_직장인구 + l_집객시설 "
       "+ 역세권 + C(상권구분) + C(자치구)")

def run(y, data, rhs=RHS, label=""):
    d = data.dropna(subset=[y]+[c for c in
        ["l_면적_m2","l_유동인구","l_상주인구","l_직장인구","l_집객시설","역세권","상권구분","자치구"]])
    r = smf.ols(f"{y} ~ {rhs}", data=d).fit(cov_type="HC3")
    keep = [p for p in r.params.index if not p.startswith("C(") and p!="Intercept"]
    out = pd.DataFrame({"계수":r.params[keep], "표준오차":r.bse[keep], "p":r.pvalues[keep]})
    out["유의"] = np.where(out.p<0.001,"***", np.where(out.p<0.01,"**", np.where(out.p<0.05,"*","")))
    print(f"\n━━━ {label}   n={int(r.nobs):,}  R²={r.rsquared:.3f} (자치구·상권구분 통제) ━━━")
    print(out.assign(계수=out.계수.round(3), 표준오차=out.표준오차.round(3))
            .drop(columns="p").to_string())
    return r

print("="*78)
print("Q1. 매출 — 2025Q4 단면, log-log (계수 = 탄력성)")
print("="*78)
run("l_매출액", q, label="종속: log 분기매출액")
run("l_점포수", q, label="종속: log 점포수")

print("\n"+"="*78)
print("Q2. 생존 — 2025Q4 단면")
print("="*78)
q2 = q.copy(); q2["폐업률_pct"] = q2.폐업률*100
run("폐업률_pct", q2, label="종속: 분기 폐업률(%)  ← 낮을수록 생존 좋음")
run("운영개월", q2, label="종속: 운영 점포 평균 영업개월  ← 높을수록 오래 버팀")
run("폐업개월", q2, label="종속: 폐업 점포 평균 영업개월  ← 높을수록 오래 버티다 닫음")
