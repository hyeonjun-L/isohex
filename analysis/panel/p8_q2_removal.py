# -*- coding: utf-8 -*-
"""2026Q2에 2025년 신규점이 25% 사라졌다 — 늦게 반영된 진짜 폐업인가, 갱신 방식의 흔적인가"""
import pandas as pd, numpy as np, sys
from scipy.spatial import cKDTree
from scipy.stats import spearmanr
S=sys.argv[1]
C=pd.read_parquet(f"{S}/cohort_features.parquet")
al=C[C["2026Q1"]==1].copy(); al["gone"]=1-al["2026Q2"]
print(f"2026Q1에 살아 있던 2025 신규점 {len(al):,} 중 2026Q2에 사라짐 {al.gone.mean():.1%}")
ch=pd.read_parquet(f"{S}/change_2026Q1_2026Q2.parquet",columns=["change","cat_s","lon","lat"])
op=ch[ch.change=="opened"]; g=al[al.gone==1]
xy=lambda d: np.c_[d.lon.values*88200,d.lat.values*111000]
hit=0
for cat,gg in g.groupby("cat_s"):
    o=op[op.cat_s==cat]
    if len(o): d,_=cKDTree(xy(o)).query(xy(gg)); hit+=(d<=15).sum()
print(f" (i) 사라진 곳 중 15m 안에 같은 업종 '2026Q2 개업'이 있는 비율 {hit/len(g):.1%}  ← 높으면 ID만 바뀐 재등록")
k=al.groupby("cat_s").agg(n=("gone","size"),소멸=("gone","mean"))
h=C.groupby("cat_s").agg(m=("event","size"),위험=("event","mean"))
j=k.join(h); j=j[(j.n>=80)&(j.m>=80)]
r,p=spearmanr(j.소멸,j.위험)
print(f" (ii) 업종 {len(j)}개 — 2026Q2 소멸률 vs 2025 관찰기간 폐업률  스피어만 ρ={r:.2f} (p={p:.2g})")
print("      소멸률 높은 업종:", ", ".join(f"{i}" for i in j.sort_values('소멸',ascending=False).head(0).index))
al["idm"]=al.lineage.str.extract(r"^MA\d{4}(20\d{4})")[0]
t=al.groupby("idm").gone.agg(["size","mean"]); t=t[t["size"]>=300]
print(" (iii) 등록월별 2026Q2 소멸률:", "  ".join(f"{i[2:4]}.{i[4:]}:{v:.0%}" for i,v in t["mean"].items()))
print(" (iv) 진입 분기별:", al.groupby("entry").gone.mean().map(lambda v:f"{v:.0%}").to_dict())
nm=pd.read_parquet(f"{S}/lineage_enriched.parquet",columns=["cat_s","cat_s_nm"]).drop_duplicates("cat_s").set_index("cat_s").cat_s_nm
jj=j.join(nm).sort_values("소멸",ascending=False)
print(" 소멸률 상위 8:", ", ".join(f"{r.cat_s_nm} {r.소멸:.0%}" for _,r in jj.head(8).iterrows()))
print(" 소멸률 하위 8:", ", ".join(f"{r.cat_s_nm} {r.소멸:.0%}" for _,r in jj.tail(8).iterrows()))
