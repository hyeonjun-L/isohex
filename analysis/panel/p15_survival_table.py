# -*- coding: utf-8 -*-
"""생존 정보 층 — 247개 업종 전부의 생존표 (업종 패널에 그대로 쓰는 표).

새 점수 구조(2026-10-04)에서 생존은 지도 점수가 아니라 '업종 정보'다. 업종마다 세 숫자를 낸다.
  ① 신규점 12개월 생존 — 2025Q1·Q2 신뢰 개업 코호트. 1년 안에 닫았나(이진)로 센다
     작은 업종은 그대로 쓰면 잡음이라 경험적 베이즈로 수축한다. 사전평균은 '같은 업종 기존 점포의 연 폐업률'로 잡는다
     (기존 점포 수가 훨씬 많아 업종의 위험 수준을 안정적으로 알려준다 — 둘의 관계는 아래에서 먼저 확인)
  ② 기존 점포 연 폐업률 — 2025Q1→2026Q2 다섯 전이의 분기 폐업률(p4)을 1년으로 환산
  ③ 24개월 생존 — 2024Q2 코호트(2024-06 등록)에서 신규 80곳 이상인 업종만 직접 관측
주의: 상가정보는 폐업을 늦게 지우므로 생존율은 상한이다. 업종끼리 비교에 쓴다."""
import pandas as pd, numpy as np, sys, os, warnings
warnings.filterwarnings("ignore")
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,HERE); from p5_survival import km
S=sys.argv[1]
lg=lambda p: np.log(p/(1-p)); ex=lambda z: 1/(1+np.exp(-z))
C=pd.read_parquet(f"{S}/cohort_2025.parquet",columns=["cat_s","event","dur"])
C["y12"]=((C.event==1)&(C.dur<=12)).astype(int)
C=C[(C.y12==1)|(C.dur>=12)]                          # 12개월 결과가 정해진 가게 (코호트 거의 전부)
LS=pd.read_csv(f"{S}/label_landscape.csv")
T=LS[["cat_s","cat_s_nm","대분류","등급","점포_2026Q1","분기폐업률"]].copy()
T["기존_연폐업률"]=1-(1-T.분기폐업률)**4
g=C.groupby("cat_s").agg(신규=("y12","size"),폐업12=("y12","sum"))
T=T.merge(g,on="cat_s",how="left").fillna({"신규":0,"폐업12":0})
T["S12_관측"]=np.where(T.신규>=150,1-T.폐업12/T.신규.clip(lower=1),np.nan)

# ── 사전평균: 신규점 1년 폐업 ~ 기존 점포 연 폐업률 (로짓). 신규 150곳 이상, 원천 이상(X) 제외
ok=T[(T.신규>=150)&~T.등급.str.startswith("X")]
pc=(ok.폐업12+0.5)/(ok.신규+1); v=1/((ok.신규+1)*pc*(1-pc)); x=lg(ok.기존_연폐업률.clip(1e-3,0.999)); z=lg(pc)
tau2=0.05
for _ in range(50):                                     # 가중회귀 + 업종 간 분산(모멘트법)을 번갈아
    w=1/(v+tau2); X=np.c_[np.ones(len(x)),x]
    b=np.linalg.solve(X.T@(X*w.values[:,None]),X.T@(w*z))
    r=z-X@b; Q=(w*r**2).sum(); k=len(x)-2
    tau2_new=max(0,(Q-k)/(w.sum()-(w**2).sum()/w.sum()))
    if abs(tau2_new-tau2)<1e-7: break
    tau2=tau2_new
rho=np.corrcoef(z,x)[0,1]
print(f"신규점 1년 폐업 vs 기존 점포 연 폐업률 (업종 {len(ok)}개, 로짓): 상관 {rho:.2f} · 기울기 {b[1]:.2f} · 업종 간 남는 편차 τ {np.sqrt(tau2):.2f}")

# ── 수축: 관측(로짓, 분산 v)과 사전(회귀 예측, 분산 τ²)의 정밀도 가중
xa=lg(T.기존_연폐업률.clip(1e-3,0.999)); prior=b[0]+b[1]*xa
pa=(T.폐업12+0.5)/(T.신규+1); va=np.where(T.신규>0,1/((T.신규+1)*pa*(1-pa)),np.inf)
prec=1/max(tau2,1e-6)+1/va; post=(prior/max(tau2,1e-6)+np.where(np.isfinite(va),lg(pa)/va,0))/prec
sd=np.sqrt(1/prec)
T["S12_추정"]=1-ex(post); T["S12_하"]=1-ex(post+1.96*sd); T["S12_상"]=1-ex(post-1.96*sd)
T["자기자료_비중"]=np.where(np.isfinite(va),(1/va)/prec,0.0)
chk=T[T.신규>=150]
print(f"수축 점검 — 신규 150곳 이상 업종에서 관측과 추정의 차이: 중앙 {np.median(np.abs(chk.S12_관측-chk.S12_추정))*100:.1f}%p, 최대 {np.max(np.abs(chk.S12_관측-chk.S12_추정))*100:.1f}%p")

# ── 24개월: 2024Q2 코호트
A=pd.read_parquet(f"{S}/lineage_enriched.parquet",columns=["entry","lag","suspect","cat_s","2026Q2"])
A=A[(A.entry=="2024Q2")&(A.lag<=3)&~A.suspect]
g2=A.groupby("cat_s").agg(n24=("2026Q2","size"),살아있음=("2026Q2","sum"))
T=T.merge(g2,on="cat_s",how="left")
T["S24_관측"]=np.where(T.n24>=80,T.살아있음/T.n24,np.nan)   # 2024-06 등록 코호트 — 접수 중단 뒤 등록이라 이미 몇 달 버틴 가게가 섞여 2025 코호트보다 높게 나온다
T["비고"]=np.select([T.등급.str.startswith("X"),T.점포_2026Q1<100,T.신규>=150,T.신규>=30,T.신규>0],
                   ["원천 일괄 등록·삭제 업종 — 생존 수치 쓰지 말 것","점포 100곳 미만 — 기존 점포 폐업률부터 흔들림, 참고만","관측 충분","관측 일부 + 기존 점포로 보정","관측 적음 — 대부분 기존 점포로 추정"],"신규 관측 없음 — 기존 점포로만 추정")
out=T[["cat_s","cat_s_nm","대분류","등급","점포_2026Q1","신규","S12_관측","S12_추정","S12_하","S12_상","자기자료_비중","기존_연폐업률","n24","S24_관측","비고"]]
out=out.rename(columns={"cat_s_nm":"업종","점포_2026Q1":"점포수_2026Q1","신규":"신규점_2025","n24":"신규점_2024Q2","S24_관측":"S24_2024Q2코호트"}).sort_values(["대분류","S12_추정"])
out.to_csv(f"{S}/업종별_생존.csv",index=False,encoding="utf-8-sig")
print(f"\n업종 {len(out)}개 저장 → 업종별_생존.csv  (신규 150곳 이상 {int((out.신규점_2025>=150).sum())} · 30~149곳 {int(((out.신규점_2025>=30)&(out.신규점_2025<150)).sum())} · 1~29곳 {int(((out.신규점_2025>0)&(out.신규점_2025<30)).sum())} · 0곳 {int((out.신규점_2025==0).sum())})")
pct=lambda s: s.map(lambda v: "" if pd.isna(v) else f"{v:.0%}")
view=out[~out.등급.str.startswith("X")].copy()
for c in ["S12_관측","S12_추정","기존_연폐업률","S24_2024Q2코호트"]: view[c]=pct(view[c])
view["S12_구간"]=pct(out.S12_하)+"~"+pct(out.S12_상)
cols=["업종","대분류","점포수_2026Q1","신규점_2025","S12_관측","S12_추정","S12_구간","기존_연폐업률"]
v2=view[view.점포수_2026Q1>=100]
print("\n12개월 생존 추정 낮은 15개 (점포 100곳 이상)"); print(v2.sort_values("S12_추정").head(15)[cols].to_string(index=False))
print("\n높은 15개 (점포 100곳 이상)"); print(v2.sort_values("S12_추정").tail(15)[cols].to_string(index=False))
print("\n24개월 직접 관측 (2024Q2 코호트 80곳 이상):", out.dropna(subset=["S24_2024Q2코호트"]).set_index("업종")["S24_2024Q2코호트"].round(2).to_dict())
sel=["셀프 빨래방","독서실/스터디 카페","카페","사진촬영업","편의점","세탁소","아이스크림/빙수","아이스크림 할인점","애완동물/애완용품 소매업","반찬/식료품 소매업","복사업","생수/음료 소매업"]   # 무인 운영이 흔한 업종
print("\n관심 업종"); print(view[view.업종.isin(sel)][cols+["비고"]].to_string(index=False))
print("\n대분류 24개월 생존 (2024Q2 코호트):",
      A.assign(대=A.cat_s.str[0]).groupby("대")["2026Q2"].agg(["size","mean"]).query("size>=150")["mean"].round(3).to_dict())
