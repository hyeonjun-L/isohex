# -*- coding: utf-8 -*-
# 점검 (2026-11-16, 마스터플랜 W7.16 남은 단계 6)
# 실행: python3 20261116_v2_v3_cells.py <v2 매출잠재_격자.csv> <v3 매출잠재_격자.csv>   (v2는 analysis/panel/결과/이전_v2판/)
# 2026-11-16 결과(37업종 가운데 값): 칠한 칸 몫 52%(같음) · 칸 값 순위상관 0.64 · 값의 폭(아래 5%~위 5%) 2.3 → 3.5배 · 끝값 맞춤 1.2 → 9.6%(칠한 칸의 19%) · 뒤집힌 칸 2.3%
# — v2 ↔ v3 칸 값: 순위상관 · 칠한 칸 몫 · 값의 폭 · 끝값 맞춤 · 뒤집힌 칸 · 동 임대료와의 순위상관
import pandas as pd, numpy as np, os, sys, json
from scipy.stats import spearmanr
H=os.path.expanduser
a=pd.read_csv(sys.argv[1],encoding="utf-8-sig",low_memory=False); b=pd.read_csv(sys.argv[2],encoding="utf-8-sig",low_memory=False)
assert (a.h3_9==b.h3_9).all()
for c in ["a_거주","a_출근등교","a_기타","l_all300","점포_반경300m"]: assert (a[c]==b[c]).all(), c
cols=[c for c in a.columns if c.startswith("잠재_")]; assert cols==[c for c in b.columns if c.startswith("잠재_")] or set(cols)==set(c for c in b.columns if c.startswith("잠재_"))
rows=[]
for c in cols:
    nm=c[3:]; x,y=a[c],b[c]; m=x.notna()&y.notna(); assert (x.notna()==y.notna()).all(), nm
    lx,ly=np.log1p(x[m]/100),np.log1p(y[m]/100)
    wa=np.exp(np.percentile(lx,95)-np.percentile(lx,5)); wb=np.exp(np.percentile(ly,95)-np.percentile(ly,5))
    flip=((lx>np.log(1.2))&(ly<-np.log(1.2)))|((lx<-np.log(1.2))&(ly>np.log(1.2)))
    ca=a.끝값맞춤.fillna("").str.split(";").apply(lambda s: nm in s); cb=b.끝값맞춤.fillna("").str.split(";").apply(lambda s: nm in s)
    rows.append(dict(업종=nm,칠한칸몫=m.mean(),순위상관=spearmanr(x[m],y[m]).correlation,폭v2=wa,폭v3=wb,끝값v2=ca.mean(),끝값v3=cb.mean(),끝값v3_칠한칸중=cb[m].mean(),뒤집힘=flip.mean()))
T=pd.DataFrame(rows).set_index("업종"); pd.set_option("display.width",250)
print(T.round(3).sort_values("순위상관").to_string())
print("\n37업종 가운데 값:"); print(T.median().round(3).to_string())
