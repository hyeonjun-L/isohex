# -*- coding: utf-8 -*-
# ⚠ v1 기록용 — 점포수로 `점포_수`(프랜차이즈 제외 일반 점포)를 써서 결과가 틀렸다.
#   대체: v2_q4.py  (2026-10-01 재검증)
"""Q4. 업종마다 답이 다른가 — 업종별로 입지 계수를 따로 뽑는다."""
import pandas as pd, numpy as np, statsmodels.formula.api as smf, warnings
warnings.filterwarnings("ignore")
st = pd.read_parquet("master/store.parquet")
s  = pd.read_parquet("master/sales.parquet")
a  = pd.read_parquet("master/agg16.parquet")   # 상권 단위 입지 변수 (20분기 평균)

st = st[(st.기준_년분기_코드>=20211)&(st.기준_년분기_코드<=20254)]
s  = s [(s .기준_년분기_코드>=20211)&(s .기준_년분기_코드<=20254)]

WANT = {"CS100010":"커피-음료","CS200031":"세탁소","CS300002":"편의점","CS100005":"제과점",
        "CS200019":"PC방","CS200038":"독서실","CS300022":"화장품","CS300010":"반찬가게",
        "CS200041":"사진관","CS300021":"문구","CS200037":"노래방","CS200028":"미용실"}

ind = (st[st.서비스_업종_코드.isin(WANT)]
       .groupby(["상권_코드","서비스_업종_코드"], as_index=False)
       .agg(점포합=("점포_수","sum"), 개업합=("개업_점포_수","sum"),
            폐업합=("폐업_점포_수","sum"), 프랜차이즈합=("프랜차이즈_점포_수","sum"),
            점포평균=("점포_수","mean"), 분기수=("점포_수","size")))
sal = (s[s.서비스_업종_코드.isin(WANT)]
       .groupby(["상권_코드","서비스_업종_코드"], as_index=False)
       .agg(매출합=("당월_매출_금액","sum"), 매출분기수=("당월_매출_금액","size")))
ind = ind.merge(sal, on=["상권_코드","서비스_업종_코드"], how="left")
ind = ind.merge(a[["상권_코드","상권명","상권구분","자치구","면적_m2","유동인구","상주인구",
                   "직장인구","집객시설","지하철역"]], on="상권_코드", how="inner")
ind["업종"] = ind.서비스_업종_코드.map(WANT)
ind["폐업률"] = ind.폐업합/ind.점포합.replace(0,np.nan)*100
ind["점포당매출"] = ind.매출합/ind.점포합.replace(0,np.nan)
ind["프랜차이즈비"] = ind.프랜차이즈합/ind.점포합.replace(0,np.nan)
ind["역세권"] = (ind.지하철역>0).astype(int)
for c in ["점포평균","유동인구","상주인구","직장인구","집객시설","면적_m2"]:
    ind["l_"+c] = np.log(pd.to_numeric(ind[c],errors="coerce").clip(lower=0)+1)

print("업종별 모집단 (골목상권 포함 전체, 20분기)")
p = ind.groupby("업종").agg(상권수=("상권_코드","nunique"), 점포합=("점포합","sum"),
      점포있는상권=("점포합", lambda x:(x>0).sum()), 폐업률중앙=("폐업률","median"),
      프랜차이즈비중앙=("프랜차이즈비","median"))
print(p.round(2).sort_values("점포합",ascending=False).to_string())

RHS = "l_면적_m2 + l_유동인구 + l_상주인구 + l_직장인구 + l_집객시설 + 역세권 + C(상권구분) + C(자치구)"
print("\n"+"="*92)
print("업종별 — 종속: log(평균 점포수).  계수 = 탄력성.  * p<0.05")
print("="*92)
print(f"{'업종':<10}{'n':>6}{'R²':>7}{'면적':>9}{'유동인구':>10}{'상주인구':>10}{'직장인구':>10}{'집객시설':>10}{'역세권':>9}")
rows={}
for code,nm in WANT.items():
    d = ind[(ind.서비스_업종_코드==code)&(ind.점포합>0)].dropna(
        subset=["l_점포평균","l_유동인구","l_상주인구","l_직장인구","l_집객시설"])
    if len(d)<150: continue
    r = smf.ols(f"l_점포평균 ~ {RHS}", data=d).fit(cov_type="HC3")
    def f(k):
        v,p=r.params.get(k,np.nan), r.pvalues.get(k,1)
        return f"{v:+.2f}{'*' if p<0.05 else ' '}"
    print(f"{nm:<10}{int(r.nobs):>6,}{r.rsquared:>7.2f}"
          f"{f('l_면적_m2'):>10}{f('l_유동인구'):>11}{f('l_상주인구'):>11}"
          f"{f('l_직장인구'):>11}{f('l_집객시설'):>11}{f('역세권'):>10}")
    rows[nm]={k:(r.params.get(k,np.nan), r.pvalues.get(k,1)) for k in
              ["l_유동인구","l_상주인구","l_직장인구","l_집객시설","역세권"]}

print("\n"+"="*92)
print("업종별 — 종속: 20분기 누적 폐업률(%).  낮을수록 생존 좋음")
print("="*92)
print(f"{'업종':<10}{'n':>6}{'R²':>7}{'면적':>9}{'유동인구':>10}{'상주인구':>10}{'직장인구':>10}{'집객시설':>10}{'역세권':>9}")
for code,nm in WANT.items():
    d = ind[(ind.서비스_업종_코드==code)&(ind.점포합>=10)].dropna(
        subset=["폐업률","l_유동인구","l_상주인구","l_직장인구","l_집객시설"])
    if len(d)<150: continue
    r = smf.ols(f"폐업률 ~ {RHS}", data=d).fit(cov_type="HC3")
    def f(k):
        v,p=r.params.get(k,np.nan), r.pvalues.get(k,1)
        return f"{v:+.2f}{'*' if p<0.05 else ' '}"
    print(f"{nm:<10}{int(r.nobs):>6,}{r.rsquared:>7.2f}"
          f"{f('l_면적_m2'):>10}{f('l_유동인구'):>11}{f('l_상주인구'):>11}"
          f"{f('l_직장인구'):>11}{f('l_집객시설'):>11}{f('역세권'):>10}")
ind.to_parquet("master/industry.parquet", index=False)
