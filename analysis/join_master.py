# -*- coding: utf-8 -*-
"""상권 × 분기 마스터 패널 조립."""
import pandas as pd, numpy as np
K = ["상권_코드","기준_년분기_코드"]

# 영역-상권 SHP 좌표계는 EPSG:5181 (prj False_Northing 500000). 5186으로 읽으면 100km 남쪽으로 밀린다.
area = pd.read_parquet("master/area.parquet")[
    ["상권_코드","상권명","상권구분","자치구","행정동코드","행정동","면적_m2","x_5181","y_5181"]]

st = pd.read_parquet("master/store.parquet")
s  = pd.read_parquet("master/sales.parquet")
chg= pd.read_parquet("master/chg.parquet")

# 종속 1·3 : 상권 전체 점포·개폐업
# 점포수 = 전체(유사_업종_점포_수). 점포_수는 프랜차이즈를 뺀 '일반' 점포만이라 쓰면 안 된다.
agg_st = st.groupby(K, as_index=False).agg(
    점포수=("유사_업종_점포_수","sum"), 일반점포수=("점포_수","sum"), 개업수=("개업_점포_수","sum"),
    폐업수=("폐업_점포_수","sum"), 프랜차이즈수=("프랜차이즈_점포_수","sum"),
    업종수=("서비스_업종_코드","nunique"))
# 종속 2 : 매출
agg_s = s.groupby(K, as_index=False).agg(
    매출액=("당월_매출_금액","sum"), 매출건수=("당월_매출_건수","sum"),
    주말매출=("주말_매출_금액","sum"), 매출업종수=("서비스_업종_코드","nunique"))

def pick(path, cols, names):
    d = pd.read_parquet(path)
    d = d[K + cols].rename(columns=dict(zip(cols, names)))
    for c in names: d[c] = pd.to_numeric(d[c], errors="coerce")
    return d

foot = pick("master/foot.parquet", ["총_유동인구_수"], ["유동인구"])
resi = pick("master/resi.parquet", ["총_상주인구_수","총_가구_수","아파트_가구_수"],
                                   ["상주인구","가구수","아파트가구수"])
work = pick("master/work.parquet", ["총_직장_인구_수"], ["직장인구"])
cons = pick("master/cons.parquet", ["지출_총금액"], ["지출액"])
apt  = pick("master/apt.parquet",  ["아파트_단지_수","아파트_평균_시가"], ["아파트단지수","아파트시가"])
fac  = pick("master/fac.parquet",  ["집객시설_수","지하철_역_수","버스_정거장_수","초등학교_수","중학교_수","고등학교_수","대학교_수"],
                                   ["집객시설","지하철역","버스정거장","초등학교","중학교","고등학교","대학교"])

m = agg_st.merge(agg_s, on=K, how="left")
for d in (chg[K+["운영_영업_개월_평균","폐업_영업_개월_평균","상권_변화_지표_명"]],
          foot, resi, work, cons, apt, fac):
    m = m.merge(d, on=K, how="left")
m = m.merge(area, on="상권_코드", how="left")
m = m.rename(columns={"운영_영업_개월_평균":"운영개월","폐업_영업_개월_평균":"폐업개월",
                      "상권_변화_지표_명":"변화지표"})

# 집객시설 세부 카운트는 0일 때 공란으로 나온다 (있는 값은 전부 1 이상) → 0으로 채운다
for c in ["지하철역","버스정거장","초등학교","중학교","고등학교","대학교"]:
    m[c] = m[c].fillna(0)
m["역세권"] = (m.지하철역 > 0).astype(int)

m["면적_km2"] = m.면적_m2 / 1e6
# ── 규모효과 제거: 전부 밀도로 ──────────────────────────
for c in ["점포수","개업수","폐업수","유동인구","상주인구","직장인구","집객시설","가구수"]:
    m[c+"_밀도"] = m[c] / m.면적_km2
m["매출_밀도"]   = m.매출액 / m.면적_km2
m["점포당매출"]  = m.매출액 / m.점포수.replace(0, np.nan)
m["1인당지출"]   = m.지출액 / m.상주인구.replace(0, np.nan)
m["개업률"]      = m.개업수 / m.점포수.replace(0, np.nan)
m["폐업률"]      = m.폐업수 / m.점포수.replace(0, np.nan)
m["주말비중"]    = m.주말매출 / m.매출액.replace(0, np.nan)
m["아파트가구비"]= m.아파트가구수 / m.가구수.replace(0, np.nan)
m["주야비"]      = m.직장인구 / m.상주인구.replace(0, np.nan)

m = m[(m.기준_년분기_코드>=20211)&(m.기준_년분기_코드<=20254)]
m.to_parquet("master/panel.parquet", index=False)
print(f"패널 {len(m):,}행 × {m.shape[1]}열   상권 {m.상권_코드.nunique():,}  분기 {m.기준_년분기_코드.nunique()}")
print("\n결측률(%)")
miss = (m.isna().mean()*100).round(1)
print(miss[miss>0].sort_values(ascending=False).to_string())
