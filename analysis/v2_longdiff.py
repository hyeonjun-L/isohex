# -*- coding: utf-8 -*-
"""감쇠 편향 진단 — 차분 간격을 늘려도 계수가 같은가?
분기 점포수·유동인구에 측정잡음이 있으면, 1분기 차분에서는 잡음이 신호를 덮어 계수가 0쪽으로 줄어든다.
간격을 늘리면 진짜 변화는 쌓이고 잡음은 안 쌓이므로 계수가 커진다 (Griliches-Hausman 진단).
반대로 장기에는 '수요가 늘어서 점포가 들어온' 역인과가 섞여 계수를 키운다.
→ 짧은 차분 = 잠식률 상한, 긴 차분 = 잠식률 하한. 진실은 그 사이."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")

def qidx(code):  # 20211 → 0, 20212 → 1 ...
    code=int(code); return (code//10-2021)*4 + (code%10-1)

def longdiff(df, unit, y, x, ks, label):
    z=df[[unit,"기준_년분기_코드",y,x,"상권_코드"]].dropna().copy()
    z["t"]=z.기준_년분기_코드.map(qidx)
    out=[]
    for k in ks:
        a=z.copy(); b=z.copy(); b["t"]=b.t+k
        m=a.merge(b,on=[unit,"t"],suffixes=("","_lag"))
        m["dy"]=m[y]-m[y+"_lag"]; m["dx"]=m[x]-m[x+"_lag"]
        m=m[m.dx.abs()>0] if False else m
        r=smf.ols("dy ~ dx + C(t)",data=m).fit(cov_type="cluster",cov_kwds={"groups":m.상권_코드})
        sd_dx=m.dx.std()
        out.append((k,r.params["dx"],r.bse["dx"],len(m),sd_dx))
    print(f"\n{label}")
    print(f"  {'차분간격':>8}{'계수':>9}{'SE':>8}{'관측':>10}{'Δx 표준편차':>12}")
    for k,b,se,n,sd in out:
        print(f"  {str(k)+'분기':>8}{b:>+9.3f}{se:>8.3f}{n:>10,}{sd:>12.3f}")
    return out

# ① 잠식: 상권×업종 셀, log 매출 ~ log 전체점포수
d=pd.read_parquet("master/cell_panel.parquet")
o1=longdiff(d,"cell","l_매출","l_전체",[1,4,8,12,16,19],
            "① 업종 총매출 ~ 전체 점포수  (계수 1 = 잠식 없음, 0 = 완전 잠식)")
print("  → 잠식률 범위: {:.0%} (1분기 차분) ~ {:.0%} (19분기 차분)".format(1-o1[0][1], 1-o1[-1][1]))

# ② 유동인구: 상권, log 매출 ~ log 유동인구
m=pd.read_parquet("master/panel.parquet")
m=m[(m.기준_년분기_코드>=20211)&(m.기준_년분기_코드<=20254)].copy()
m["l_매출"]=np.log(m.매출액.where(m.매출액>0)); m["l_유동"]=np.log(m.유동인구.where(m.유동인구>0))
m["unit"]=m.상권_코드.astype(str)
o2=longdiff(m,"unit","l_매출","l_유동",[1,4,8,12,16,19],
            "② 상권 총매출 ~ 유동인구  (기존 고정효과 +0.087)")
