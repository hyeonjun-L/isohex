# -*- coding: utf-8 -*-
"""p6 결과 흔들어보기 — 층 변수의 정체, 폐업 반영 지연, 예측 가능성 분해, 포화도 정의 바꾸기"""
import pandas as pd, numpy as np, sys, warnings
from statsmodels.duration.hazard_regression import PHReg
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score
warnings.filterwarnings("ignore")
S=sys.argv[1]
C=pd.read_parquet(f"{S}/cohort_features.parquet")
A=pd.read_parquet(f"{S}/lineage_enriched.parquet",columns=["lineage","cat_s","2026Q1","2026Q2","entry","floor"])
# 층은 진입 분기에 비어 있는 경우가 많다(2025Q3·Q4 신규 등록분은 100% 공란). 계보의 다른 분기에서 채운다.
LL=pd.read_parquet(f"{S}/lineage_long.parquet",columns=["lineage","floor"],filters=[("lineage","in",list(C.lineage))])
LL=LL[LL.floor.astype(str).str.strip()!=""]
fill=LL.groupby("lineage").floor.agg(lambda s:s.astype(str).str.strip().mode().iat[0])
C["floor"]=np.where(C.floor.astype(str).str.strip()=="",C.lineage.map(fill).fillna(""),C.floor)
fl=C.floor.astype(str).str.strip()
print("층 정보 채움률(계보로 보충 후):", pd.crosstab(C.entry, fl!="", normalize="index")[True].round(2).to_dict())
C["floor_cat"]=np.select([fl=="1",fl.str.fullmatch(r"[2-9]|\d\d"),fl.str.contains("지|B",regex=True)],["1층","2층+","지하"],"미상")
print("① 층 정보 유무별 12개월 내 폐업 비율(관찰 기간 동안)")
print(C.groupby("floor_cat").agg(n=("event","size"),폐업률=("event","mean")).round(3).to_string())
def cox(df,f):
    m=PHReg.from_formula(f"dur ~ {f}",data=df,status=df.event.values,strata=df.cat_s.values,ties="efron").fit()
    return pd.Series(np.exp(np.asarray(m.params)),index=m.model.exog_names).round(3), pd.Series(np.asarray(m.pvalues),index=m.model.exog_names).round(4)
for v in ["1층","2층+","지하"]: C["f_"+v]=(C.floor_cat==v).astype(int)
hr,p=cox(C,"l_comp300 + l_all300 + l_res500 + l_arr + Q('f_1층') + Q('f_2층+') + Q('f_지하') + chain + e_Q2")
print("   위험비(기준=층 미상):", {k:(hr[k],p[k]) for k in hr.index if k.startswith("Q(")})
k=C[(C.floor_cat!="미상")]
hr,p=cox(k,"l_comp300 + l_all300 + l_res500 + l_arr + Q('f_1층') + Q('f_지하') + chain + e_Q2")
print("   2025Q1·Q2 진입 + 층 정보 있는 곳만(기준=2층+):", {kk:(hr[kk],p[kk]) for kk in hr.index if kk.startswith("Q(") or kk=="l_comp300"})


print("\n③ 12개월 안에 닫을지 — 무엇이 얼마나 맞히나 (2025Q1·Q2 진입 신규점, 자치구 단위 교차검증 AUC)")
d=C.copy()
d["y"]=((d.event==1)&(d.dur<=12)).astype(int); d=d[(d.y==1)|(d.dur>=12)]
d["gu"]=d.adm_cd.astype(str).str[:5]
# 업종 기저 위험 = 훈련 폴드 안에서만 계산한 업종별 폐업률 (누수 방지)
def run(cols,use_cat):
    gkf=GroupKFold(5); pred=np.zeros(len(d))
    for tr,te in gkf.split(d,groups=d.gu):
        a=d.iloc[tr]; b=d.iloc[te]
        Xa=a[cols].values if cols else np.zeros((len(a),0)); Xb=b[cols].values if cols else np.zeros((len(b),0))
        if use_cat:
            rate=a.groupby("cat_s").y.mean(); glob=a.y.mean(); n=a.groupby("cat_s").y.size()
            sm=(rate*n+glob*20)/(n+20)       # 작은 업종은 전체 평균 쪽으로
            Xa=np.c_[Xa,a.cat_s.map(sm).fillna(glob)]; Xb=np.c_[Xb,b.cat_s.map(sm).fillna(glob)]
        m=LogisticRegression(max_iter=1000).fit(Xa,a.y); pred[te]=m.predict_proba(Xb)[:,1]
    return roc_auc_score(d.y,pred)
loc=["l_comp300","l_all300","l_res500","l_arr","sat"]; fl_=["f_1층","f_지하","f_2층+"]
print(f"   n={len(d):,}, 12개월 내 폐업 {d.y.mean():.1%}")
print(f"   업종만            AUC {run([],True):.3f}")
print(f"   입지 변수만        AUC {run(loc,False):.3f}")
print(f"   층만              AUC {run(fl_,False):.3f}")
print(f"   업종+입지          AUC {run(loc,True):.3f}")
print(f"   업종+입지+층       AUC {run(loc+fl_,True):.3f}")
print("   (0.5 = 동전 던지기, 1.0 = 완벽)")

print("\n④ 포화도 정의를 바꿔도 같은가 (위험비, 1단위 = log)")
C["sat300"]=np.log1p(C.comp300)-np.log(C.res500+C.arr500+1)
C["comp_rel"]=np.log1p(C.comp500)-C.groupby("cat_s").comp500.transform(lambda s:np.log1p(s).mean())
C["sat_res"]=np.log1p(C.comp500)-np.log(C.res500+1)
C["sat_arr"]=np.log1p(C.comp500)-np.log(C.arr500+1)
for v in ["sat","sat300","comp_rel","sat_res","sat_arr"]:
    hr,p=cox(C,f"{v} + l_all300 + Q('f_1층') + Q('f_지하') + Q('f_2층+') + chain + e_Q2")
    print(f"   {v:<9} 위험비 {hr[v]:.3f}  p={p[v]:.3f}")
C.to_parquet(f"{S}/cohort_features.parquet",index=False)
