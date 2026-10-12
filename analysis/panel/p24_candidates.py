# -*- coding: utf-8 -*-
"""p24 — 후보 찾기 조건: 무인 6종이 실제로 있는 자리의 조건과 칸마다 같은 업종 가게 수 (마스터플랜 §5.18)

입력:  <S>/poi_2025Q4.parquet (명단 기준일과 같은 분기) · 결과/무인_연결.csv (p21) · 결과/매출잠재_격자.csv (p18)
출력:  결과/후보_조건.json  — 유형마다 자리 조건(명단에서 찾은 무인 가게가 있는 칸의 가운데 80%)과 칸마다 같은 업종 가게 수·찾은 무인 가게 수
       결과/후보_조건.csv   — 유형별 요약 (점검용)
사용:  python3 p24_candidates.py <S>       (몇 초)

자리 조건 — 무인 가게가 실제로 있는 칸의 두 값
- 반경 300m 가게 수 (p18, 2025Q2): 번화가인지 한산한 곳인지
- 주거 쪽 기울기 = 거주 접근성 − 출근·등교 접근성 (log, p18): 클수록 주거지
가운데 80%(10~90%)를 기본 조건으로 쓴다. 명단은 구마다 덮은 정도가 달라 '어느 구'에는 쓸 수 없지만, 찾은 가게가 '어떤 자리'에 있는지는 구 안에서 같은 기준이다.
같은 업종 가게 — 유형마다 볼 코드(마스터플랜 §5.16)와 이름: 아이스크림은 슈퍼마켓 코드에 일반 슈퍼가 많아 이름에 '아이스·빙과'가 든 가게를 센다.
빨래방은 셀프 빨래방 코드(S20902)에, 세탁소 코드(S20901) 3,759곳 중 이름에 빨래·코인·셀프·런드리·워시가 든 곳(약 370곳)만 더한다 — 맡기는 세탁소는 경쟁 상대로 세지 않는다"""
import csv, hashlib, json, os, re, sys
import numpy as np, pandas as pd

H = os.path.dirname(os.path.abspath(__file__))
S = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, "..", "..", "data", "snapshots")
R = os.path.join(H, "결과")
TYPES = {  # 유형: (같은 업종 코드, 이름 규칙, 이름 규칙을 볼 코드(None이면 모든 코드), 표시 이름, 매출 잠재 업종(지도 이름), 개업 지도 코드)
    "빨래방": (["S20902"], r"빨래|코인|셀프|런드리|워시", ["S20901"], "셀프 빨래방 (세탁소 중 이름에 빨래·코인·셀프·런드리·워시가 든 곳 포함)", "세탁소·셀프빨래방", None),
    "스터디카페": (["R10202"], None, None, "독서실/스터디카페", None, "R10202"),
    "아이스크림": ([], r"아이스|빙과", None, "이름에 '아이스·빙과'가 든 가게", None, "G20404"),
    "카페": (["I21201"], None, None, "카페", "카페", "I21201"),
    "사진관": (["M11301"], None, None, "사진촬영업", None, "M11301"),
    "밀키트": (["G20509"], r"밀키트", None, "반찬/식료품 + 이름에 '밀키트'", None, None)}
LINK = {"정확", "정확(상호)", "상호+지점", "유사", "포함", "동명"}

G = pd.read_csv(os.path.join(R, "매출잠재_격자.csv"), encoding="utf-8-sig", usecols=["h3_9", "a_거주", "a_출근등교", "점포_반경300m"])
cell = {h: i for i, h in enumerate(G.h3_9)}
G["tilt"] = G["a_거주"] - G["a_출근등교"]
P = pd.read_parquet(os.path.join(S, "poi_2025Q4.parquet"), columns=["name", "cat_s", "h3_9"])
P = P[P.h3_9.isin(cell)]
U = pd.read_csv(os.path.join(R, "무인_연결.csv"), encoding="utf-8-sig", usecols=["유형", "방법", "h3_9"], dtype=str)
U = U[U["방법"].isin(LINK) & U.h3_9.isin(cell)]
out = {"types": [], "cnt": {}, "un": {}, "meta": {"poi": "poi_2025Q4", "cells": len(G), "band": [10, 90], "h3sha": hashlib.sha1("\n".join(G.h3_9).encode()).hexdigest()}}
rows = []
for t, (codes, rx, rxc, label, pot, ent) in TYPES.items():
    m = P.cat_s.isin(codes)
    if rx: m |= P.name.fillna("").str.contains(rx, regex=True) & (P.cat_s.isin(rxc) if rxc else True)
    cnt = np.bincount(P[m].h3_9.map(cell).values, minlength=len(G)).astype(int)
    un = np.bincount(U[U["유형"] == t].h3_9.map(cell).values, minlength=len(G)).astype(int)
    feat = G.iloc[np.repeat(np.arange(len(G)), un)]
    q = lambda s: [round(float(np.percentile(s, p)), 3) for p in (10, 50, 90)]
    band = {"n300": q(feat["점포_반경300m"]), "tilt": q(feat["tilt"])}
    ok = G["점포_반경300m"].between(band["n300"][0], band["n300"][2]) & G["tilt"].between(band["tilt"][0], band["tilt"][2])
    out["types"].append({"t": t, "codes": codes, "rx": rx or "", "rxc": rxc or [], "label": label, "pot": pot, "entry": ent, "found": int(un.sum()),
                         "band": band, "pass": round(float(ok.mean()), 3), "cnt_total": int(cnt.sum())})
    out["cnt"][t] = cnt.tolist(); out["un"][t] = un.tolist()
    rows.append([t, label, int(un.sum()), *band["n300"], *band["tilt"], round(float(ok.mean()), 3), int(cnt.sum()), int((cnt > 0).sum())])
    print(f"{t:<6} 찾은 무인 {int(un.sum()):>4} · 300m 가게 {band['n300'][0]:.0f}~{band['n300'][2]:.0f} (중앙 {band['n300'][1]:.0f}) · "
          f"주거 기울기 {band['tilt'][0]:.2f}~{band['tilt'][2]:.2f} · 두 조건을 다 맞는 칸 {ok.mean()*100:.0f}% · 같은 업종 {int(cnt.sum()):,}곳 ({int((cnt>0).sum()):,}칸)")
json.dump(out, open(os.path.join(R, "후보_조건.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(R, "후보_조건.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f); w.writerow(["유형", "같은업종", "찾은무인", "300m가게_10", "300m가게_50", "300m가게_90", "주거기울기_10", "주거기울기_50", "주거기울기_90", "조건통과칸비율", "같은업종가게", "같은업종칸"])
    w.writerows(rows)
