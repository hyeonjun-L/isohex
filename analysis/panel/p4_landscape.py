# -*- coding: utf-8 -*-
"""전 업종 라벨 지형도 — 믿을 수 있는 구간에서 업종마다 개업·폐업이 얼마나 쌓이는가.
개업 = 2025Q1·Q2에 처음 실린 새 계보 중 ID 발급월이 첫 등장보다 3개월 이내 앞서고 2025-05 이전인 것
       (예전 업소의 늦은 수록 제외 + 2025-06 이후 등록분 제외: 2026Q2에 54~88%가 일괄 삭제된 묶음)
폐업 = 2025Q1→Q2 … 2026Q1→Q2 전이에서 사라지고 다시 안 나타난 계보 (2025-06 이후 등록분은 모집단에서 제외)
기록이 불안정한 체인 (2026-10-10) = p3 4단계가 잡은 일괄 재등록 묶음(relabel_batches.csv)의 상호를 2024Q4~2025Q2에 한 번이라도 단 계보,
       그리고 1:1이 안 돼 못 이은 같은 묶음의 새 기록(그 분기에만 있었고, 직전 분기 묶음 상호 기록과 같은 건물 1m). 개업·폐업 계산에서 뺀다.
       스타벅스가 해당 — 2024Q4에 처음 실렸고, 2025Q1엔 상호 칸에 지점명만 적힌 새 번호로 바뀌었다가, 2025Q2엔 통째로 빠지고, 2025Q3에 다시 실렸다
임시 대체 기록 = 원래 가게가 한 분기만 빠졌다 돌아왔는데 바로 그 분기에만 같은 건물(1m)·같은 업종의 새 기록이 실렸다 사라진 것. 마찬가지로 뺀다"""
import pandas as pd, numpy as np, sys, os
from scipy.spatial import cKDTree
S=sys.argv[1]
FM={"2024Q1":"202403","2024Q2":"202406","2024Q3":"202409","2024Q4":"202412","2025Q1":"202503","2025Q2":"202506",
    "2025Q3":"202510","2025Q4":"202512","2026Q1":"202603","2026Q2":"202606"}
mi=lambda m:int(m[:4])*12+int(m[4:])-1
A=pd.read_parquet(f"{S}/lineage.parquet")
Q=[q for q in FM if q in A.columns]
A["idm"]=A.lineage.str.extract(r"^MA\d{4}(20\d{2}(?:0[1-9]|1[0-2]))")[0]
A["lag"]=A.entry.map(lambda q:mi(FM[q]))-A.idm.map(lambda m:mi(m) if isinstance(m,str) else np.nan)
ENTRY=["2025Q1","2025Q2"]
A["fresh"]=A.entry.isin(ENTRY)&(A.lag<=3)&(A.idm<="202505")
A["suspect"]=A.idm.fillna("000000")>="202506"   # 2026Q2에 대부분 철회된 등록분
# 마지막 등장 분기
pres=A[Q].values; last_idx=np.where(pres.any(1), pres.shape[1]-1-np.argmax(pres[:,::-1],axis=1), -1)
A["last"]=np.array(Q)[last_idx]
# 임시 대체 기록 거르기 — 좌표는 분기마다 다시 계산되므로 같은 분기 쌍의 좌표로 맞춘다
xy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
LLc=pd.read_parquet(f"{S}/lineage_long.parquet",columns=["lineage","quarter","cat_s","lon","lat"],filters=[("quarter","in",["2024Q4","2025Q1","2025Q2"])])
filler=set()
for qa,qb,qc in (("2024Q4","2025Q1","2025Q2"),("2025Q1","2025Q2","2025Q3")):
    nw=A[A.fresh&(A.entry==qb)&(A["last"]==qb)]                        # 그 분기에만 있었던 신뢰 개업
    gp=A[(A[qa]==1)&(A[qb]==0)&(A[qc]==1)]                              # 바로 그 분기에만 빠졌던 계보
    cn=LLc[(LLc.quarter==qb)&LLc.lineage.isin(set(nw.lineage))].drop_duplicates("lineage")
    cg=LLc[(LLc.quarter==qa)&LLc.lineage.isin(set(gp.lineage))].drop_duplicates("lineage")
    for c,f in cn.groupby("cat_s"):
        g=cg[cg.cat_s==c]
        if len(g): filler|=set(f.lineage.values[np.isfinite(cKDTree(xy(g)).query(xy(f),distance_upper_bound=1)[0])])
del LLc
A["filler"]=A.lineage.isin(filler)
print(f"임시 대체 기록 {int(A.filler.sum()):,}건을 개업·폐업 모집단에서 뺀다 — 업종 상위:",A[A.filler].cat_s_nm.value_counts().head(3).to_dict())
A.loc[A.filler,"fresh"]=False; A["suspect"]=A.suspect|A.filler
RB=f"{S}/relabel_batches.csv"; batch=set()
if os.path.exists(RB) and len(pd.read_csv(RB)):
    keys=set(zip(*pd.read_csv(RB)[["cat_s","name_norm"]].values.T))
    LLn=pd.read_parquet(f"{S}/lineage_long.parquet",columns=["lineage","quarter","cat_s","name_norm","lon","lat"],filters=[("quarter","in",["2024Q4","2025Q1","2025Q2"])])
    hit=LLn[[k in keys for k in zip(LLn.cat_s,LLn.name_norm)]]; batch|=set(hit.lineage)
    for qa,qb in (("2024Q4","2025Q1"),("2025Q1","2025Q2")):
        h=hit[hit.quarter==qa]; nw=A[A.fresh&(A.entry==qb)&(A["last"]==qb)]
        cn=LLn[(LLn.quarter==qb)&LLn.lineage.isin(set(nw.lineage))]
        for c,f in cn.groupby("cat_s"):
            g=h[h.cat_s==c]
            if len(g): batch|=set(f.lineage.values[np.isfinite(cKDTree(xy(g)).query(xy(f),distance_upper_bound=1)[0])])
    del LLn
A["batch"]=A.lineage.isin(batch)
print(f"기록이 불안정한 체인 계보 {int(A.batch.sum()):,}개를 개업·폐업 모집단에서 뺀다 (그중 신뢰 개업이던 것 {int((A.batch&A.fresh).sum()):,})")
A.loc[A.batch,"fresh"]=False; A["suspect"]=A.suspect|A.batch
CLEAN=[("2025Q1","2025Q2"),("2025Q2","2025Q3"),("2025Q3","2025Q4"),("2025Q4","2026Q1"),("2026Q1","2026Q2")]
cl=pd.Series(0,index=A.index)
expo=pd.Series(0,index=A.index)
for a,b in CLEAN:
    alive=(A[a]==1)&~A.suspect; expo+=alive
    cl+= (alive & (A["last"]==a)).astype(int)           # a 이후 다시 안 나타남 = a→b 사이 폐업
A["closed_clean"]=cl; A["expo"]=expo
g=A.groupby(["cat_s","cat_s_nm"])
T=pd.DataFrame({
    "점포_2026Q1": A[~A.suspect].groupby(["cat_s","cat_s_nm"])["2026Q1"].sum(),
    "개업_2분기": g.fresh.sum(),
    "폐업_5전이": g.closed_clean.sum(),
    "점포분기_노출": g.expo.sum(),
    "개업셀_res9": A[A.fresh].groupby(["cat_s","cat_s_nm"]).h3_9.nunique(),
    "개업셀_res8": A[A.fresh].groupby(["cat_s","cat_s_nm"]).h3_8.nunique(),
}).fillna(0)
T["분기개업률"]=T.개업_2분기/2/T.점포_2026Q1.replace(0,np.nan)
T["분기폐업률"]=T.폐업_5전이/T.점포분기_노출.replace(0,np.nan)
# 등급 기준은 1년치(4분기) 환산: 2분기 개업 × 2
T["개업_연환산"]=T.개업_2분기*2
T["등급"]=np.select([(T.개업_연환산>=300)&(T.개업셀_res9*2>=200),(T.개업_연환산>=100)],["A 격자 학습 가능","B 상권·행정동 집계"],"C 부족")
T["이상"]=np.where((T.분기개업률>0.10)|(T.분기폐업률>0.10),"원본 일괄 등록·삭제 의심","")
T.loc[T.이상!="","등급"]="X 제외(이상)"
T=T.sort_values("개업_2분기",ascending=False)
A.to_parquet(f"{S}/lineage_enriched.parquet",index=False)
print(f"업종 {len(T)}개 — 등급별:", T.등급.value_counts().to_dict())
print(f"전체: 개업(2분기) {int(T.개업_2분기.sum()):,} · 폐업(5전이) {int(T.폐업_5전이.sum()):,} · 서울 분기 개업률 {T.개업_2분기.sum()/2/T.점포_2026Q1.sum():.2%} · 분기 폐업률 {T.폐업_5전이.sum()/T.점포분기_노출.sum():.2%}")
pd.set_option("display.width",220); pd.set_option("display.max_colwidth",18)
show=T.reset_index()[["cat_s_nm","점포_2026Q1","개업_2분기","폐업_5전이","분기개업률","분기폐업률","개업셀_res9","등급"]]
show["분기개업률"]=(show.분기개업률*100).round(1); show["분기폐업률"]=(show.분기폐업률*100).round(1)
print("\n개업이 많은 30개"); print(show.head(30).to_string(index=False))
print("\nA등급 업종 목록:", ", ".join(T[T.등급.str.startswith("A")].reset_index().cat_s_nm))
print("제외(이상):", ", ".join(f"{r.cat_s_nm}(개업 {r.분기개업률:.0%}/폐업 {r.분기폐업률:.0%})" for _,r in T[T.이상!=""].reset_index().iterrows()))
T["대분류"]=pd.Series(T.index.get_level_values(0),index=T.index).str[0].map({"G":"소매","I":"숙박·음식","S":"수리·개인","R":"예술·스포츠","M":"과학·기술","N":"시설관리·임대","L":"부동산","P":"교육","Q":"보건"})
print(pd.crosstab(T.대분류,T.등급,margins=True).to_string())

T.reset_index().to_csv(f"{S}/label_landscape.csv",index=False,encoding="utf-8-sig")
