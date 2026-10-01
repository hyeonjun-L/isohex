# -*- coding: utf-8 -*-
"""잠식률 재추정 — 점포수를 '일반(점포_수)'에서 '전체(유사_업종_점포_수)'로 바로잡는다.
기존 분석은 프랜차이즈를 뺀 점포수로 전체 매출을 설명하려 했다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
st=pd.read_parquet("master/store.parquet"); s=pd.read_parquet("master/sales.parquet")
for d_ in (st,s):
    d_["상권_코드"]=pd.to_numeric(d_["상권_코드"],errors="coerce").astype("Int64")
    d_["기준_년분기_코드"]=pd.to_numeric(d_["기준_년분기_코드"],errors="coerce").astype("Int64")
K=["상권_코드","기준_년분기_코드","서비스_업종_코드"]
d=st.merge(s[K+["당월_매출_금액","당월_매출_건수"]],on=K)
d=d[(d.유사_업종_점포_수>0)&(d.당월_매출_금액>0)&(d.점포_수>0)].copy()
d["cell"]=d.상권_코드.astype(str)+"_"+d.서비스_업종_코드
d["q"]=d.기준_년분기_코드.astype(str)
d["l_매출"]=np.log(d.당월_매출_금액)
d["l_일반"]=np.log(d.점포_수); d["l_전체"]=np.log(d.유사_업종_점포_수)
d.to_parquet("master/cell_panel.parquet",index=False)

def fe(y,x,data):
    z=data.dropna(subset=[y,x]).copy()
    if z.cell.nunique()<60: return None
    for c in (y,x): z[c+"_w"]=z[c]-z.groupby("cell")[c].transform("mean")
    for c in (y+"_w",x+"_w"): z[c+"_w"]=z[c]-z.groupby("q")[c].transform("mean")
    r=smf.ols(f"{y}_w_w ~ {x}_w_w - 1",data=z).fit(cov_type="cluster",cov_kwds={"groups":z.상권_코드})
    k=x+"_w_w"; return r.params[k], r.bse[k], int(r.nobs), z.cell.nunique()

b0=fe("l_매출","l_일반",d); b1=fe("l_매출","l_전체",d)
print(f"전체 업종  — 일반 점포수 기준 β={b0[0]:.3f} (잠식 {1-b0[0]:.0%})   "
      f"전체 점포수 기준 β={b1[0]:.3f} (잠식 {1-b1[0]:.0%})   n={b1[2]:,}")

rows=[]
for (code,nm),sub in d.groupby(["서비스_업종_코드","서비스_업종_코드_명"]):
    a=fe("l_매출","l_일반",sub); b=fe("l_매출","l_전체",sub)
    if a is None or b is None or b[2]<800: continue
    fr=sub[sub.기준_년분기_코드==20254]
    share=fr.프랜차이즈_점포_수.sum()/max(fr.유사_업종_점포_수.sum(),1)
    rows.append((nm,share,a[0],b[0],b[1],1-a[0],1-b[0]))
t=pd.DataFrame(rows,columns=["업종","프랜차이즈비중","β_일반","β_전체","SE_전체","잠식_기존","잠식_수정"])
t["변화p"]=((t.잠식_수정-t.잠식_기존)*100).round(0)
t["CI95"]=t.apply(lambda r:f"{(1-r.β_전체-1.96*r.SE_전체):.0%}~{(1-r.β_전체+1.96*r.SE_전체):.0%}",axis=1)
t=t.sort_values("잠식_수정")
t.to_parquet("master/cannibal_v2.parquet",index=False)
print(f"\n{'업종':<14}{'프랜차이즈':>8}{'잠식(기존)':>10}{'잠식(수정)':>10}{'변화':>7}   95% 구간")
print("-"*66)
focus={"편의점","치킨전문점","슈퍼마켓","커피-음료","제과점","세탁소","PC방","노래방","문구",
       "화장품","반찬가게","미용실","한식음식점","일반의원","가구","인테리어","일반교습학원","분식전문점"}
for _,r in t.iterrows():
    if r.업종 not in focus: continue
    print(f"{r.업종:<14}{r.프랜차이즈비중:>8.0%}{r.잠식_기존:>10.0%}{r.잠식_수정:>10.0%}{r.변화p:>+6.0f}p   {r.CI95}")
print(f"\n업종 {len(t)}개  잠식률 중앙: 기존 {t.잠식_기존.median():.0%} → 수정 {t.잠식_수정.median():.0%}")
r=np.corrcoef(t.프랜차이즈비중, t.잠식_기존-t.잠식_수정)[0,1]
print(f"프랜차이즈 비중 ↔ (기존−수정) 상관: {r:+.2f}   ← 양수면 프랜차이즈 많은 업종일수록 기존 값이 부풀려졌다는 뜻")
