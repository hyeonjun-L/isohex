# 빨래방 진단 B — 지도의 매출 수준이 실제 가게의 2년 생존·새 가게와 맞는가 (세탁소 · 셀프빨래방 · 카페 견줌)
import os, numpy as np, pandas as pd, warnings
from scipy.stats import spearmanr
import statsmodels.formula.api as smf
warnings.filterwarnings("ignore")
H=os.environ["HOME"]
g=pd.read_csv(f"{H}/mnt/isohex/analysis/panel/결과/매출잠재_격자.csv",encoding="utf-8-sig",low_memory=False)
g=g.set_index("h3_9")
pct=lambda s:s.rank(pct=True)
cell=pd.DataFrame({"res":pct(g.a_거주),"com":pct(g.a_출근등교),"n300":pct(g.l_all300),
                   "lv_l":np.log1p(g["잠재_세탁소·셀프빨래방"]/100),"lv_c":np.log1p(g["잠재_카페"]/100)})
L=pd.read_parquet(f"{H}/work/snapshots/lineage.parquet",columns=["lineage","cat_s","h3_9","is_new","entry","2024Q2","2026Q2"]+[f"20{y}Q{q}" for y in (24,25,26) for q in (1,2,3,4) if f"20{y}Q{q}" not in ("2024Q2","2026Q2","2026Q3","2026Q4")])
L=L.join(cell,on="h3_9")
def surv(code,lv,lab):
    d=L[(L.cat_s==code)&(L["2024Q2"]==1)].dropna(subset=[lv]).copy(); d["s"]=d["2026Q2"]
    d["lv_t"]=pd.qcut(d[lv],3,labels=["낮음","중간","높음"]); d["res_t"]=pd.qcut(d.res,3,labels=["적음","중간","많음"])
    a=d.groupby("lv_t",observed=True).s.agg(["size","mean"]).round(3); b=d.groupby("res_t",observed=True).s.agg(["size","mean"]).round(3)
    m=smf.logit("s~"+lv+"+res+n300",data=d).fit(disp=0)
    print(f"\n[{lab}] 2024Q2에 있던 {len(d)}곳 · 2년 뒤 남은 비율 {d.s.mean():.3f}")
    print("  매출 수준 3등분:", {k:(int(r['size']),r['mean']) for k,r in a.iterrows()})
    print("  주민(거주 접근) 3등분:", {k:(int(r['size']),r['mean']) for k,r in b.iterrows()})
    print("  로짓 계수(±SE):", {k:f"{m.params[k]:+.2f}±{m.bse[k]:.2f}" for k in [lv,"res","n300"]})
surv("S20902","lv_l","셀프빨래방 · 세탁소 매출 수준")
surv("S20901","lv_l","세탁소 · 세탁소 매출 수준")
surv("I21201","lv_c","카페 · 카페 매출 수준 (견줌)")
# 새 가게: 2024Q3~2026Q2에 처음 나온 곳의 칸 — 매출 수준·주민 분포 (기존 가게와 견줌)
for code,lv,lab in [("S20902","lv_l","셀프빨래방"),("S20901","lv_l","세탁소"),("I21201","lv_c","카페")]:
    new=L[(L.cat_s==code)&(L.is_new==True)].dropna(subset=[lv]); old=L[(L.cat_s==code)&(L["2024Q1"]==1)].dropna(subset=[lv])
    allc=cell.dropna(subset=[lv])
    print(f"[{lab}] 새 가게 {len(new)} · 평균 매출수준(로그) 새 {new[lv].mean():+.3f} / 있던 {old[lv].mean():+.3f} / 칠한 칸 전체 {allc[lv].mean():+.3f} · 주민 백분위 새 {new.res.mean():.2f} 있던 {old.res.mean():.2f} 칸 전체 {allc.res.mean():.2f}")
