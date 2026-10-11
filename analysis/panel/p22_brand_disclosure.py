# -*- coding: utf-8 -*-
"""p22 — 무인 6종 가맹 브랜드의 정보공개서 값 정리 (마스터플랜 다음 할 일 5 · §5.17)

공정거래위원회 가맹사업거래 '정보공개서 열람'(로그인 없이 보는 요약)에서 옮겨 적은 브랜드 값을
비교표와 손익 점검이 쓸 수 있게 다듬는다. 새로 재는 것은 없고, 나누고 고르는 규칙만 있다.

사용:  python3 p22_brand_disclosure.py [원자료 CSV] [결과 폴더]
       기본  ../../공정위_정보공개서/무인_6종_정보공개서_20261011.csv  →  결과/
출력:  결과/무인_브랜드.csv       브랜드마다 파생값 (월매출·어림 면적·창업비 추정·문 닫은 비율·기본값에 쓰는지)
       결과/무인_브랜드_요약.csv  유형마다 기본값 (손익 점검의 '무인 유형'이 쓰는 값)

규칙
- 기본값에 쓰는 브랜드: 매출을 낸 가맹점 30곳 이상 · 평균 매출이 0이 아님 · 유인 형식과 섞이지 않음(크린토피아 제외)
- 월매출(서울 기준): 서울 평균이 있으면 서울, 없으면 전국 — 연 평균 ÷ 12. 서울 가맹점이 적은 브랜드는 서울 평균을 0으로 적는 경우가 많다
  (서울 3~4곳인 4개 브랜드가 0, 9곳인 오밀당은 적음)
- 창업비 추정 = 부담금 합계 + max(0, 인테리어 − 기타비용). 정보공개서 본문 양식에서 기타비용에는 인테리어·간판·집기가 들어가고
  점포 임대 비용은 빠진다(본문을 연 한 브랜드 기준 — 요약 화면에는 설명이 없다). 33곳 중 31곳은 기타비용이 인테리어보다 커서 그대로 쓰고,
  작게 적힌 2곳(데이롱카페·돈룩업)만 인테리어를 더한다. 점포 임차 보증금·권리금·월세는 어디에도 없다
- 평균 매출은 본문 주석대로라면 부가세를 뺀 값이고 직영점 매출은 빠지며, 6개월 이상 영업한 가맹점은 1년치로 환산해 넣는다(같은 브랜드 기준)
- 초기 투자 = 창업비 추정 − 가맹 보증금 (계약이 끝나면 돌려받는 돈이라 손익 점검의 '초기 투자'에서 뺀다)
- 어림 면적 = 전국 평균 매출 ÷ 3.3㎡당 평균 매출 × 3.3. 평균끼리 나눈 값이라 실제 평균 면적과 조금 다를 수 있다
- 문 닫은 비율 = (계약종료 + 계약해지) ÷ 연초 가맹점. 연초 = 연말 가맹점 − 신규 + 종료 + 해지. 명의변경(양도)은 넣지 않는다"""
import csv, os, sys, statistics as st

H = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, "..", "..", "공정위_정보공개서", "무인_6종_정보공개서_20261011.csv")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(H, "결과")
TYPES = ["빨래방", "스터디카페", "아이스크림", "카페", "사진관", "밀키트"]
MIN_STORES = 30
MIXED = {"크린토피아": "세탁편의점과 섞임"}

iv = lambda x: int(x) if x not in ("", None) else None
rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
assert len(rows) == 33 and {r["유형"] for r in rows} == set(TYPES), "원자료 행 수·유형이 다르다"

B = []
for r in rows:
    g = {k: iv(r[k]) for k in r if k.endswith(("_천원", "_㎡", "_년")) or k.startswith(("점포_", "서울_", "변동_", "전년_", "매출_", "서울매출_"))}
    # 원자료 점검 — 표 안의 합이 맞는지
    assert g["부담_가입비_천원"] + g["부담_교육비_천원"] + g["부담_보증금_천원"] + g["부담_기타_천원"] == g["부담_합계_천원"], r["영업표지"]
    if g["점포_전체"] is not None:
        assert g["점포_가맹"] + g["점포_직영"] == g["점포_전체"] and g["서울_가맹"] + g["서울_직영"] == g["서울_전체"], r["영업표지"]
        assert g["매출_가맹점수"] == g["점포_가맹"], r["영업표지"]
    if g["인테리어_합계_천원"]:     # 평당 × 면적 ÷ 3.3 ≈ 합계 (반올림 차이만)
        est = g["인테리어_평당_천원"] * g["인테리어_기준면적_㎡"] / 3.3
        assert abs(est / g["인테리어_합계_천원"] - 1) < 0.05, (r["영업표지"], est)

    sales = g["매출_평균_천원"] or None
    seoul = g["서울매출_평균_천원"] or None
    m_base, basis = (seoul, "서울") if seoul else ((sales, "전국") if sales else (None, ""))
    area = round(sales / g["매출_평당_천원"] * 3.3, 1) if sales and g["매출_평당_천원"] else None
    add_int = max(0, (g["인테리어_합계_천원"] or 0) - g["부담_기타_천원"])
    cost = g["부담_합계_천원"] + add_int
    inv = cost - g["부담_보증금_천원"]
    start = (g["점포_가맹"] - g["변동_신규"] + g["변동_계약종료"] + g["변동_계약해지"]) if g["점포_가맹"] is not None else None
    closed = (g["변동_계약종료"] + g["변동_계약해지"]) if g["점포_가맹"] is not None else None
    why = ""
    if r["영업표지"] in MIXED: why = MIXED[r["영업표지"]]
    elif not sales: why = "평균 매출 없음"
    elif (g["매출_가맹점수"] or 0) < MIN_STORES: why = f"매출 가맹점 {g['매출_가맹점수']}곳 (<{MIN_STORES})"
    B.append({
        "유형": r["유형"], "영업표지": r["영업표지"], "가맹본부": r["가맹본부"], "공개서등록일": r["공개서등록일"], "기준연도": r["기준연도"],
        "가맹점": g["점포_가맹"], "직영점": g["점포_직영"], "서울가맹점": g["서울_가맹"],
        "연매출_전국_만원": round(sales / 10) if sales else None, "연매출_서울_만원": round(seoul / 10) if seoul else None,
        "월매출_만원": round(m_base / 120) if m_base else None, "월매출_기준": basis,
        "평당연매출_전국_만원": round(g["매출_평당_천원"] / 10) if sales else None, "어림면적_㎡": area,
        "부담합계_만원": round(g["부담_합계_천원"] / 10), "인테리어_만원": round((g["인테리어_합계_천원"] or 0) / 10),
        "인테리어더함_만원": round(add_int / 10), "창업비추정_만원": round(cost / 10), "가맹보증금_만원": round(g["부담_보증금_천원"] / 10),
        "초기투자_만원": round(inv / 10), "신규": g["변동_신규"], "문닫음": closed, "연초가맹점": start,
        "문닫은비율": round(closed / start, 3) if start else None,
        "전년신규": g["전년_신규"], "전년문닫음": (g["전년_계약종료"] or 0) + (g["전년_계약해지"] or 0),
        "계약": f"{g['계약_최초_년']}+{g['계약_연장_년']}", "기본값": "" if why else "Y", "빠진까닭": why, "비고": r["비고"]})

S = []
for t in TYPES:
    bs = [b for b in B if b["유형"] == t]; u = [b for b in bs if b["기본값"] == "Y"]
    assert u, t
    mm = [b["월매출_만원"] for b in u]; cc = [b["창업비추정_만원"] for b in u]
    start = sum(b["연초가맹점"] for b in u); closed = sum(b["문닫음"] for b in u)
    S.append({
        "유형": t, "브랜드": len(bs), "기본값브랜드": len(u), "기본값브랜드목록": " · ".join(b["영업표지"] for b in u),
        "월매출_중간_만원": round(st.median(mm)), "월매출_최소_만원": min(mm), "월매출_최대_만원": max(mm),
        "서울값브랜드": sum(b["월매출_기준"] == "서울" for b in u),
        "창업비_중간_만원": round(st.median(cc)), "창업비_최소_만원": min(cc), "창업비_최대_만원": max(cc),
        "초기투자_중간_만원": round(st.median([b["초기투자_만원"] for b in u])),
        "어림면적_중간_㎡": round(st.median([b["어림면적_㎡"] for b in u]), 1),
        "가맹점_합": sum(b["가맹점"] for b in u), "신규_합": sum(b["신규"] for b in u), "문닫음_합": closed, "연초_합": start,
        "문닫은비율": round(closed / start, 3), "기준연도": "·".join(sorted({b["기준연도"] for b in u}))})

os.makedirs(OUT, exist_ok=True)
for name, data in (("무인_브랜드.csv", B), ("무인_브랜드_요약.csv", S)):
    with open(os.path.join(OUT, name), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(data[0].keys())); w.writeheader(); w.writerows(data)
for s in S:
    print(f"{s['유형']:<6} 브랜드 {s['기본값브랜드']}/{s['브랜드']} · 월매출 중간 {s['월매출_중간_만원']:,}만 ({s['월매출_최소_만원']:,}~{s['월매출_최대_만원']:,}) · "
          f"창업비 중간 {s['창업비_중간_만원']:,}만 · 초기투자 {s['초기투자_중간_만원']:,}만 · 면적 {s['어림면적_중간_㎡']}㎡ · 문 닫은 비율 {s['문닫은비율']*100:.1f}%")
