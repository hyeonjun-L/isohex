# -*- coding: utf-8 -*-
"""분기 쌍 품질 판정 — 상가정보 '개업·폐업'이 실제 창업·폐업인지, 원본 갱신 방식의 흔적인지."""
import pandas as pd, numpy as np, re, glob, os, sys
S=sys.argv[1] if len(sys.argv)>1 else "snap_v5"
FM={"2022Q4":"202212","2023Q1":"202303","2024Q1":"202403","2024Q2":"202406","2024Q3":"202409","2024Q4":"202412",
    "2025Q1":"202503","2025Q2":"202506","2025Q3":"202510","2025Q4":"202512","2026Q1":"202603","2026Q2":"202606"}
def ym(s):
    m=re.match(r"^MA\d{4}(20\d{2})(0[1-9]|1[0-2])",s or ""); return m.group(1)+m.group(2) if m else None
def mshift(m,k): y,mo=int(m[:4]),int(m[4:]); t=y*12+mo-1+k; return f"{t//12}{t%12+1:02d}"
def mdiff(a,b): return (int(b[:4])*12+int(b[4:]))-(int(a[:4])*12+int(a[4:]))
L={"G":"소매","I":"숙박·음식","S":"수리·개인","R":"예술·스포츠","M":"과학·기술","N":"시설관리·임대","L":"부동산","P":"교육","Q":"보건"}
qs=sorted(re.search(r"poi_(\d{4}Q\d)",f).group(1) for f in glob.glob(f"{S}/poi_*.parquet"))
rows=[]; bycat={}
for pa,pb in zip(qs,qs[1:]):
    a=pd.read_parquet(f"{S}/poi_{pa}.parquet",columns=["biz_no","cat_s"]); b=pd.read_parquet(f"{S}/poi_{pb}.parquet",columns=["biz_no","cat_s"])
    ch=pd.read_parquet(f"{S}/change_{pa}_{pb}.parquet",columns=["biz_no","cat_s","change"])
    op=ch[ch.change=="opened"]; cl=ch[ch.change=="closed"]
    m=op.biz_no.map(ym); pm=FM[pa]
    fresh=(m>mshift(pm,-3)).mean()            # 직전 스냅샷 3개월 전 이후 발급된 ID
    old=(m<=mshift(pm,-6)).mean()             # 직전 스냅샷보다 반년 이상 먼저 발급 → 예전 업소가 이번에 처음 실림
    gap=mdiff(FM[pa],FM[pb])
    rows.append(dict(구간=f"{pa}→{pb}",간격_월=gap,점포_전=len(a),점포_후=len(b),순증=f"{len(b)/len(a)-1:+.1%}",
                     ID유지=f"{a.biz_no.isin(set(b.biz_no)).mean():.1%}",개업=len(op),개업률=f"{len(op)/len(a):.1%}",
                     폐업=len(cl),폐업률=f"{len(cl)/len(a):.1%}",신규발급ID비중=f"{fresh:.0%}",오래된ID비중=f"{old:.0%}"))
    r=(op.cat_s.str[0].value_counts()/a.cat_s.str[0].value_counts()).rename(f"{pa[2:]}→{pb[2:]}")
    c=(cl.cat_s.str[0].value_counts()/a.cat_s.str[0].value_counts()).rename(f"{pa[2:]}→{pb[2:]}")
    bycat[("개업",pb)]=r; bycat[("폐업",pb)]=c
T=pd.DataFrame(rows); pd.set_option("display.width",250)
print(T.to_string(index=False))
O=pd.DataFrame({k[1]:v for k,v in bycat.items() if k[0]=="개업"}).rename(index=L)
C=pd.DataFrame({k[1]:v for k,v in bycat.items() if k[0]=="폐업"}).rename(index=L)
print("\n대분류별 개업률"); print((O*100).round(1).to_string())
print("\n대분류별 폐업률"); print((C*100).round(1).to_string())
T.to_csv(f"{S}/pair_quality.csv",index=False,encoding="utf-8-sig")
