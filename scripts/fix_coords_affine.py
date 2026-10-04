#!/usr/bin/env python3
"""좌표가 통째로 어긋난 분기 파일을 바로잡는다 (2026-10 발견: 서울 2025Q1 '_202503').

증상: 서교동 점포가 (128.21, 38.45)에 찍힌다. 서울 전체가 동쪽 약 1.28°, 북쪽 약 0.90° 밀려 있고
      약간 회전·확대돼 있다. 흔한 좌표계 착오(5174·5179·5181·5186 등)로는 설명되지 않는다.
처방: 같은 상가업소번호가 이웃 분기(정상)에도 있으므로, 그 짝들로 '어긋난 좌표 → 참 좌표' 아핀 변환을
      최소제곱으로 맞추고 모든 행에 적용한다. 서울 2025Q1은 51만 쌍으로 맞췄고 잔차 중앙 약 0.2m, 99% 약 1m.

사용: python fix_coords_affine.py <어긋난.csv> <기준 poi_YYYYQn.parquet> <출력.csv>
"""
import sys, numpy as np, pandas as pd
bad_csv, ref_parquet, out_csv = sys.argv[1:4]
for enc in ("utf-8-sig", "cp949"):                   # 원본은 대개 UTF-8, 옛 파일은 CP949
    try:
        d = pd.read_csv(bad_csv, dtype=str, encoding=enc, keep_default_na=False); break
    except UnicodeDecodeError:
        continue
else:
    raise SystemExit(f"[!] 인코딩을 못 읽음: {bad_csv}")
ref = pd.read_parquet(ref_parquet, columns=["biz_no", "lon", "lat"]).drop_duplicates("biz_no")
d["_x"] = pd.to_numeric(d["경도"], errors="coerce"); d["_y"] = pd.to_numeric(d["위도"], errors="coerce")
m = d.merge(ref, left_on="상가업소번호", right_on="biz_no").dropna(subset=["_x", "_y"])
X = np.c_[m._x, m._y, np.ones(len(m))]
coef = {}
for t in ("lon", "lat"):
    c, *_ = np.linalg.lstsq(X, m[t].values, rcond=None)
    r = np.abs(X @ c - m[t].values)
    keep = r < np.quantile(r, 0.99)                 # 이전·좌표수정된 1%를 빼고 다시 맞춘다
    c, *_ = np.linalg.lstsq(X[keep], m[t].values[keep], rcond=None)
    coef[t] = c
Xa = np.c_[d._x, d._y, np.ones(len(d))]
lon, lat = Xa @ coef["lon"], Xa @ coef["lat"]
err = np.hypot((X @ coef["lon"] - m.lon) * 88200, (X @ coef["lat"] - m.lat) * 111000)
print(f"맞춘 쌍 {len(m):,} | 잔차 중앙 {np.median(err):.2f} m, 90% {np.quantile(err,.9):.2f} m, 99% {np.quantile(err,.99):.2f} m")
print("lon =", np.round(coef["lon"], 6), " lat =", np.round(coef["lat"], 6))
d["경도"] = np.where(d._x.notna(), np.round(lon, 9).astype(str), d["경도"])
d["위도"] = np.where(d._y.notna(), np.round(lat, 9).astype(str), d["위도"])
d.drop(columns=["_x", "_y"]).to_csv(out_csv, index=False, encoding="utf-8-sig")
print("저장:", out_csv)
