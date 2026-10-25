# -*- coding: utf-8 -*-
"""상권 마스터 테이블 빌더.
서울시 상권분석 서비스 CSV를 상권코드×분기(×업종) 단위로 합친다.
열 이름이 연도마다 한글/영문으로 흔들려서 매핑표를 둔다."""
import glob, os, re, sys
import pandas as pd

# 경로: isohex/analysis/ 에서 실행한다고 가정. 다른 곳이면 환경변수 SANGGWON_DIR로 원본 폴더를 지정
UP  = os.environ.get("SANGGWON_DIR",
      os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "서울시 상권분석 서비스"))
RAW = "raw"            # zip을 풀어둘 곳
OUT = "master"; os.makedirs(OUT, exist_ok=True)

def unzip_all():
    """원본 폴더의 zip(연도별 점포·매출, 영역 SHP)을 raw/에 푼다. 한글 파일명(cp949) 깨짐 보정."""
    import zipfile
    for z in sorted(glob.glob(os.path.join(UP, "**", "*.zip"), recursive=True)):
        d = os.path.join(RAW, os.path.splitext(os.path.basename(z))[0])
        if os.path.isdir(d) and os.listdir(d): continue
        os.makedirs(d, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            for i in zf.infolist():
                nm = i.filename
                if not (i.flag_bits & 0x800):
                    try: nm = nm.encode("cp437").decode("cp949")
                    except Exception: pass
                nm = os.path.basename(nm)
                if nm:
                    with zf.open(i) as src, open(os.path.join(d, nm), "wb") as dst: dst.write(src.read())
if not os.path.isdir(UP):
    sys.exit(f"원본 폴더가 없다: {UP}  (SANGGWON_DIR 환경변수로 지정)")
unzip_all()

# 영문열 → 한글열 (2025년 파일이 영문으로 바뀌었다)
EN2KO = {
    "stdr_yyqu_cd":"기준_년분기_코드", "trdar_se_cd":"상권_구분_코드",
    "trdar_se_cd_nm":"상권_구분_코드_명", "trdar_cd":"상권_코드",
    "trdar_cd_nm":"상권_코드_명", "svc_induty_cd":"서비스_업종_코드",
    "svc_induty_cd_nm":"서비스_업종_코드_명", "stor_co":"점포_수",
    "similr_induty_stor_co":"유사_업종_점포_수", "opbiz_rt":"개업_율",
    "opbiz_stor_co":"개업_점포_수", "clsbiz_rt":"폐업_률",
    "clsbiz_stor_co":"폐업_점포_수", "frc_stor_co":"프랜차이즈_점포_수",
    # OpenAPI로 받은 추정매출 (pipeline/fetch_seoul.py — 열 이름이 API 그대로 소문자 영문)
    "thsmon_selng_amt":"당월_매출_금액", "thsmon_selng_co":"당월_매출_건수",
    "mdwk_selng_amt":"주중_매출_금액", "wkend_selng_amt":"주말_매출_금액",
}

def read_csv(path, usecols=None):
    last = None
    for enc in ("cp949","utf-8-sig","euc-kr"):
        try:
            df = pd.read_csv(path, encoding=enc, low_memory=False)
            break
        except UnicodeDecodeError as e:
            last = e; continue
    else:
        raise last
    df.columns = [str(c).strip().strip('"') for c in df.columns]
    df = df.rename(columns=EN2KO)
    if usecols:
        miss = [c for c in usecols if c not in df.columns]
        if miss: raise KeyError(f"{os.path.basename(path)}: 없는 열 {miss} / 실제 {list(df.columns)[:10]}")
        df = df[usecols]
    return df

def concat_years(patterns, usecols):
    """연도 파일(zip을 푼 것)과 OpenAPI로 받은 파일(서울시 상권분석 서비스/api/, fetch_seoul.py)을 합친다.
    같은 분기·상권·업종이 둘 다에 있으면 연도 파일을 쓴다 — 연도 파일이 나오면 API 줄은 저절로 빠진다"""
    if isinstance(patterns, str): patterns = [patterns]
    files = sorted({f for p in patterns for f in glob.glob(p, recursive=True)})
    if not files: raise FileNotFoundError(patterns)
    out = []
    for f in files:
        d = read_csv(f, usecols)
        d["_src"] = os.path.basename(f)
        out.append(d)
    d = pd.concat(out, ignore_index=True)
    k = [c for c in KEY + ["서비스_업종_코드"] if c in d.columns]
    for c in KEY: d[c] = pd.to_numeric(d[c], errors="coerce")
    d["_api"] = d["_src"].str.contains("_API_")
    n0 = len(d)
    d = d.sort_values("_api", kind="stable").drop_duplicates(subset=k, keep="first").drop(columns="_api").reset_index(drop=True)
    if len(d) < n0: print(f"  (연도 파일과 겹친 OpenAPI 줄 {n0 - len(d):,}개는 버림)")
    n_api = int(d["_src"].str.contains("_API_").sum())
    if n_api: print(f"  (OpenAPI로 받은 줄 {n_api:,}개 — {sorted(d.loc[d._src.str.contains('_API_'), KEY[0]].dropna().astype(int).unique())})")
    return d

KEY = ["기준_년분기_코드","상권_코드"]
# 패턴 끝의 ")"는 일부러 넣었다 — 없으면 같은 폴더의 '상권배후지' 파일(점포·매출·영역)까지 섞여 들어온다 (2026-10-10 수정)

# ── 1. 점포 (상권×분기×업종) ────────────────────────────────
# ⚠ 점포_수 는 '일반(비프랜차이즈)' 점포만이다.  전체 = 유사_업종_점포_수 = 점포_수 + 프랜차이즈_점포_수
#   (152만 행 전부에서 정확히 일치 확인). 개업·폐업 점포수와 서울시 발표 개업_율·폐업_률은 '전체' 기준이다.
#   → 점포 규모·잠식·폐업률 계산에는 반드시 유사_업종_점포_수를 쓴다. (v1 분석은 점포_수를 써서 틀렸다)
store = concat_years([f"{RAW}/**/*점포-상권)*.csv", f"{UP}/api/*점포-상권)_API_*.csv"],
    KEY + ["상권_구분_코드_명","상권_코드_명","서비스_업종_코드","서비스_업종_코드_명",
           "점포_수","유사_업종_점포_수","개업_점포_수","폐업_점포_수","프랜차이즈_점포_수",
           "개업_율","폐업_률"])
print(f"점포      {len(store):>9,}행  분기 {store.기준_년분기_코드.nunique():>2}  상권 {store.상권_코드.nunique():>5}  업종 {store.서비스_업종_코드.nunique():>3}")

# ── 2. 추정매출 (상권×분기×업종) ────────────────────────────
sales = concat_years([f"{RAW}/**/*추정매출-상권)*.csv", f"{UP}/api/*추정매출-상권)_API_*.csv"],
    KEY + ["서비스_업종_코드","당월_매출_금액","당월_매출_건수","주중_매출_금액","주말_매출_금액"])
print(f"추정매출  {len(sales):>9,}행  분기 {sales.기준_년분기_코드.nunique():>2}  상권 {sales.상권_코드.nunique():>5}  업종 {sales.서비스_업종_코드.nunique():>3}")

# ── 3. 상권변화지표 (상권×분기) = 생존 ──────────────────────
chg = read_csv(f"{UP}/서울시 상권분석서비스(상권변화지표-상권).csv",
    KEY + ["상권_변화_지표","상권_변화_지표_명","운영_영업_개월_평균","폐업_영업_개월_평균"])
print(f"변화지표  {len(chg):>9,}행  분기 {chg.기준_년분기_코드.nunique():>2}  상권 {chg.상권_코드.nunique():>5}")

# ── 4. 설명변수 (상권×분기) ─────────────────────────────────
foot = read_csv(f"{UP}/서울시 상권분석서비스(길단위인구-상권).csv")
resi = read_csv(f"{UP}/서울시 상권분석서비스(상주인구-상권).csv")
work = read_csv(f"{UP}/서울시 상권분석서비스(직장인구-상권).csv")
cons = read_csv(f"{UP}/서울시 상권분석서비스(소비-상권).csv")
apt  = read_csv(f"{UP}/서울시 상권분석서비스(아파트-상권).csv")
fac  = read_csv(f"{UP}/서울시 상권분석서비스(집객시설-상권).csv")
for nm, d in [("길단위인구",foot),("상주인구",resi),("직장인구",work),
              ("소비",cons),("아파트",apt),("집객시설",fac)]:
    print(f"{nm:<9} {len(d):>9,}행  분기 {d.기준_년분기_코드.nunique():>2}  상권 {d.상권_코드.nunique():>5}")

for nm, d in [("store",store),("sales",sales),("chg",chg),("foot",foot),
              ("resi",resi),("work",work),("cons",cons),("apt",apt),("fac",fac)]:
    d["상권_코드"] = pd.to_numeric(d["상권_코드"], errors="coerce").astype("Int64")
    d["기준_년분기_코드"] = pd.to_numeric(d["기준_년분기_코드"], errors="coerce").astype("Int64")

for c in ["점포_수","유사_업종_점포_수","개업_점포_수","폐업_점포_수","프랜차이즈_점포_수","개업_율","폐업_률"]:
    store[c] = pd.to_numeric(store[c], errors="coerce")
store.to_parquet(f"{OUT}/store.parquet", index=False)
sales.to_parquet(f"{OUT}/sales.parquet", index=False)
chg.to_parquet(f"{OUT}/chg.parquet", index=False)
for nm, d in [("foot",foot),("resi",resi),("work",work),("cons",cons),("apt",apt),("fac",fac)]:
    d.to_parquet(f"{OUT}/{nm}.parquet", index=False)
print("\n분기 커버리지")
for nm, d in [("점포",store),("매출",sales),("변화",chg),("유동",foot),("상주",resi),
              ("직장",work),("소비",cons),("아파트",apt),("집객",fac)]:
    qs = sorted(d.기준_년분기_코드.dropna().unique())
    print(f"  {nm:<5} {len(qs):>2}분기  {qs[0]} ~ {qs[-1]}")


# ── 5. 영역 SHP → 면적·행정동 (좌표계 EPSG:5181) ──────────────
import shapefile, warnings
warnings.filterwarnings("ignore")
shp = glob.glob(f"{RAW}/**/*영역-상권).shp", recursive=True)[0][:-4]
sf = shapefile.Reader(shp, encoding="utf-8")
area = pd.DataFrame(sf.records(), columns=[f[0] for f in sf.fields[1:]]).rename(columns={
    "TRDAR_CD":"상권_코드","TRDAR_CD_N":"상권명","TRDAR_SE_1":"상권구분","SIGNGU_CD_":"자치구",
    "ADSTRD_CD":"행정동코드","ADSTRD_CD_":"행정동","RELM_AR":"면적_m2","XCNTS_VALU":"x_5181","YDNTS_VALU":"y_5181"})
area["상권_코드"] = pd.to_numeric(area["상권_코드"], errors="coerce").astype("Int64")
for c in ["면적_m2","x_5181","y_5181"]: area[c] = pd.to_numeric(area[c], errors="coerce")
area.to_parquet(f"{OUT}/area.parquet", index=False)
print(f"영역      {len(area):>9,}행  (EPSG:5181)")
