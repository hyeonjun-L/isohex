# -*- coding: utf-8 -*-
"""점포 단위 생존 — 2025년에 새로 등록된 가게가 얼마나 버티나 (Kaplan–Meier, 월 단위).
코호트: 2025Q1·Q2에 처음 실렸고 ID 발급월이 첫 등장보다 3개월 이내 앞서며 2025-05 이전에 등록된 가게
        (2025-06 이후 등록분은 2026Q2에 54~88%가 일괄 철회돼 제외)
사건: 사라져 2026Q2까지 다시 안 나타남. 관찰 끝 2026Q2 (이 등록분은 2026Q2 소멸률 4~6%로 정상)."""
import pandas as pd, numpy as np, sys
FM={"2025Q1":"202503","2025Q2":"202506","2025Q3":"202510","2025Q4":"202512","2026Q1":"202603","2026Q2":"202606"}
mi=lambda m:int(m[:4])*12+int(m[4:])-1
NEXT={"2025Q1":"2025Q2","2025Q2":"2025Q3","2025Q3":"2025Q4","2025Q4":"2026Q1","2026Q1":"2026Q2"}
def km(d,e,ts=(3,6,9,12,15)):
    d=np.asarray(d,float); e=np.asarray(e,int); out={}
    times=np.unique(d[e==1]); S=1.0; var=0.0; res=[]
    for t in times:
        n=(d>=t).sum(); k=((d==t)&(e==1)).sum()
        if n==0: break
        S*=1-k/n; var+= k/(n*(n-k)) if n>k else 0; res.append((t,S,var))
    for T in ts:
        s=[x for x in res if x[0]<=T]
        if not s: out[T]=(1.0,0.0,(d>=T).sum()); continue
        _,Sv,vv=s[-1]; se=Sv*np.sqrt(vv); out[T]=(Sv,se,(d>=T).sum())
    return out

if __name__=="__main__":
    S=sys.argv[1]
    A=pd.read_parquet(f"{S}/lineage_enriched.parquet")

    C=A[A.fresh & A.entry.isin(["2025Q1","2025Q2"])].copy()
    CENS=mi(FM["2026Q2"])
    C["t0"]=C.entry.map(lambda q:mi(FM[q]))
    C["event"]=C["last"].isin(NEXT.keys()).astype(int)
    ex=C["last"].map(lambda q:(mi(FM[q])+mi(FM[NEXT[q]]))/2 if q in NEXT else np.nan)
    C["dur"]=np.where(C.event==1, ex-C.t0, CENS-C.t0)
    C=C[C.dur>0]
    o=km(C.dur,C.event)
    print(f"코호트 {len(C):,}곳 (2025Q1 {int((C.entry=='2025Q1').sum()):,} · Q2 {int((C.entry=='2025Q2').sum()):,}), 관찰 중 폐업 {int(C.event.sum()):,}")
    print("서울 전체 신규점 생존율:", "  ".join(f"{T}개월 {v[0]:.1%}±{1.96*v[1]:.1%} (위험집단 {v[2]:,})" for T,v in o.items()))
    G={"G":"소매","I":"숙박·음식","S":"수리·개인","R":"예술·스포츠","M":"과학·기술","N":"시설관리·임대","L":"부동산","P":"교육","Q":"보건"}
    print("\n대분류별")
    for k,g in C.groupby(C.cat_s.str[0]):
        if len(g)<300: continue
        r=km(g.dur,g.event); print(f"  {G.get(k,k):<8} n={len(g):>6,}  6개월 {r[6][0]:.1%}  12개월 {r[12][0]:.1%}±{1.96*r[12][1]:.1%}")
    rows=[]
    for (c,n),g in C.groupby(["cat_s","cat_s_nm"]):
        if len(g)<150: continue
        r=km(g.dur,g.event); rows.append(dict(cat_s=c,업종=n,신규점=len(g),폐업=int(g.event.sum()),S6=r[6][0],S12=r[12][0],S12_se=r[12][1],위험집단12=r[12][2]))
    T=pd.DataFrame(rows).sort_values("S12")
    T.to_csv(f"{S}/survival_by_industry.csv",index=False,encoding="utf-8-sig")
    C.to_parquet(f"{S}/cohort_2025.parquet",index=False)
    pd.set_option("display.width",200)
    f=lambda x:f"{x:.0%}"
    print(f"\n업종별 12개월 생존율 (신규점 150곳 이상, {len(T)}개 업종) — 낮은 순 12 / 높은 순 12")
    print(T.head(12).assign(S6=T.S6.map(f),S12=T.S12.map(f)).drop(columns=["cat_s","S12_se"]).to_string(index=False))
    print(T.tail(12).assign(S6=T.S6.map(f),S12=T.S12.map(f)).drop(columns=["cat_s","S12_se"]).to_string(index=False))
