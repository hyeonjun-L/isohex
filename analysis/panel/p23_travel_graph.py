# -*- coding: utf-8 -*-
"""p23 (2/2) — 이동 그래프: 서울 격자 칸 사이 자동차·도보·대중교통 이동 시간, 평일 낮·출근·퇴근 (후보 찾기·등시선, 마스터플랜 §5.18)

입력:  ../../OSM/서울_길.npz·서울_길.csv·서울_철도.json  (p23_osm_extract.py)
       결과/매출잠재_격자.csv  (칸 8,322개의 h3·중심)
       ../../버스/  서울시버스노선별정류소정보(YYYYMMDD).xlsx · *서울시노선기본정보.xlsx(노선 유형·길이) · 서울교통공사_환승역거리*.csv ·
                    tpss_route_section_speedh_*.zip(TOPIS 정류장 구간 운행시간 — 구간 실측, 경기·인천 노선 순서) ·
                    tpss_sta_route_hturn_*.zip(TOPIS 정류장별 운행횟수 — 시간대 배차) · 국토교통부_전국 버스정류장 위치정보*.csv(경기·인천 정류장 좌표)
                    버스 폴더가 없으면 버스·역별 환승을 뺀다. 운행횟수가 없으면 2024 기본정보 배차, 구간 실측이 없으면 어림만, 국토부 파일이 없으면 경기·인천 정류장 좌표를 못 찾는다
출력:  결과/이동_그래프.json   뷰어용 — 칸마다 여섯 이웃(테두리 순서)과 이웃까지 자동차·도보 시간, 도시고속도로 덧그래프,
                              지하철 역·노선·탑승/환승/하차 연결, 버스 정류소·노선 자리·시간대별 배차와 구간 시간.
                              뷰어가 기준 위치에서 시간대마다 다익스트라로 칸마다 도착 시간을 낸다
       결과/이동_점검.csv     무작위 칸 쌍의 '도로망 그대로 잰 시간' vs '칸 그래프 시간'
사용:  python3 p23_travel_graph.py [OSM 폴더] [결과 폴더] [버스 폴더]      (Mac 작업 공간 약 30초 — numba. 앞에서 돌린다: 뒤에 띄우면 명령이 끝날 때 같이 죽는다)

왜 칸 그래프인가: 지도 페이지는 서버 없이 열리는 한 장이라 도로망 전체(꼭짓점 수십만 개)를 넣을 수 없다. 대신 칸 중심에서 가장 가까운
도로 꼭짓점끼리 실제 도로로 잰 이웃 칸 시간을 넣고, 칸을 이어 가며 시간을 더한다. 이웃끼리만 이으면 도시고속도로의 이득이 사라지므로
고속도로 진출입 지점과 그 사이 고속도로 구간을 덧그래프로 넣는다. 얼마나 맞는지는 이동_점검.csv로 잰다.

시간대 — 평일 낮(10~16시) · 출근(7~9시) · 퇴근(18~20시)
- 자동차: 길 시간에 서울시 2025 통행속도(평일 평균 21.7km/h ÷ 출근 22.5 · 퇴근 19.8)의 비율을 뷰어가 곱한다 — 출근 ×0.964 · 퇴근 ×1.096, 모든 길에 같게
- 지하철: 출근 배차 = 서울시 교통 누리집 노선별 운행 현황(2025-01), 퇴근도 같다고 가정. 표에 없는 노선은 낮 배차 그대로
- 버스: 배차·정류장 사이 시간 모두 그 시간대의 TOPIS 실측

속도 (km/h)
- 자동차: 서울연구원 '서울 모니터링 리포트 — 교통'(2023년, 6~22시 평균) 도시고속도로 49.9 · 주간선 23.7 · 보조간선 21.0.
  OSM 등급에 붙인 것: 도시고속도로 = motorway 또는 trunk 중 motorroad=yes·제한속도 70 이상 / 주간선 = 그 밖 trunk·primary / 보조간선 = secondary.
  집산(tertiary) 18 · 국지(residential·unclassified) 15 · 생활도로·서비스 10 · 진출입로 30·20·18·16은 가정값
- 도보 4.5 km/h(가정), 계단은 0.6배
- 지하철: 서울시 교통 누리집 노선별 영업거리 ÷ 소요시간(2025-01 기준 표정속도)과 비혼잡 시간 배차 — 서울교통공사·9호선·우이신설·신림선.
  그 밖 노선(코레일 1호선 구간·경의중앙·수인분당·경춘·공항철도·서해·신분당·GTX-A 등)은 가정값. 기다림 = 배차의 절반,
  역 들어가고 나오기 각 2분, 갈아타기 = 서울교통공사 환승역 거리 ÷ 1.2m/s + 1분(적어도 2분, 표에 없는 쌍은 4분 — 승강장이 300m 넘게 떨어지면 잇지 않음) + 갈아탈 노선 배차의 절반.
  역 사이 시간 = 직선거리 × 1.05 ÷ 표정속도 (2호선 한 바퀴 90.9분 — 서울시 90분)
  갈래는 따로 노선이다 — 5호선 강동 → 하남·마천, 1호선 구로 → 경인·경부, 광운대 → 경원(급행도). 갈래 배차는 줄기의 두 배(번갈아 다닌다고 가정).
  줄기 → 갈래는 (갈래 배차 − 줄기 배차) ÷ 2를 더 기다리고, 갈래 → 줄기는 그 열차가 그대로 간다. 2호선 성수지선·신정지선은 따로 다니는 노선
- 버스: 서울시 노선별 정류소(순서·좌표, 2026-09) + 경기·인천 노선(TOPIS 구간 자료의 순서, 국토부 전국 정류장 좌표).
  정류소 사이 = TOPIS 노선별 정류장 구간 평균 운행시간(시간대마다 평일 실측, 정차 포함).
  실측은 10초 이상·직선 속도 70km/h 이하일 때만 믿고, 어림의 2배와 어림 + 3분 중 큰 값에서 자른다(종점·회차 대기).
  그 시간대 실측이 없는 구간은 그 구간 낮 실측 × 시간대 비율 → 같은 두 정류장 사이 다른 노선의 실측 → 반대 방향 → 어림 순.
  어림 = (자동차 길 시간 + 정차 25초) × 실측/어림 중앙값, 단 직선 × 1.5 ÷ 8km/h + 1분을 넘지 않게.
  '(가상)'·'(미정차)'·'(경유)' 정류소(길 모양만 잡는 점)는 타고 내리지 못하게 빼고 앞뒤 구간 시간을 더해 잇는다. 원자료 순번이 건너뛴 앞뒤 줄도 이어진 정류소로 본다.
  기다림 = 배차의 절반(최대 15분), 배차 = 60 ÷ 시간당 운행 횟수(TOPIS 운행횟수, 정류장마다 평일 평균 → 노선의 정류장 가운데 값, 0이면 그 시간대에 안 다님).
  정류소에서 6분 안에 걸어 닿는 칸(없으면 15분 안 가장 가까운 칸 하나).
  공항·관광·출퇴근 전용·새벽·심야·자율주행 시범·한강버스 노선, 그 주 운행 기록이 없거나 낮에 안 다니는 노선, 낮 배차 60분 넘는 노선은 뺀다"""
import base64, csv, fnmatch, hashlib, json, math, os, re, sys, time, unicodedata
import numpy as np, h3, numba as nb
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

H = os.path.dirname(os.path.abspath(__file__))
OSM = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, "..", "..", "OSM")
R = sys.argv[2] if len(sys.argv) > 2 else os.path.join(H, "결과")
BUS = sys.argv[3] if len(sys.argv) > 3 else os.path.join(H, "..", "..", "버스")
t0 = time.time()
log = lambda *a: print(f"[{time.time()-t0:5.1f}s]", *a, flush=True)
def files(d, pat):          # 폴더에서 이름 찾기 — macOS가 한글 이름을 NFD로 둘 수 있어 NFC로 맞춰 견준다
    try: names = os.listdir(d)
    except FileNotFoundError: return []
    P = unicodedata.normalize("NFC", pat)
    return sorted(os.path.join(d, n) for n in names if fnmatch.fnmatch(unicodedata.normalize("NFC", n), P))

LAT0 = 37.55; KX = 111320.0 * math.cos(math.radians(LAT0)); KY = 110574.0
CAR = {"expressway": 49.9, "exlink": 30.0, "trunk": 23.7, "primary": 23.7, "trunk_link": 20.0, "primary_link": 20.0,
       "secondary": 21.0, "secondary_link": 18.0, "tertiary": 18.0, "tertiary_link": 16.0,
       "unclassified": 15.0, "residential": 15.0, "road": 15.0, "living_street": 10.0, "service": 10.0}
SERVICE_SKIP = {"parking_aisle", "driveway", "drive-through", "emergency_access", "driving_learning", "parking"}
WALK_KMH = 4.5; STEPS_F = 0.6
MAJOR = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"}     # + 고속·진출입 = 주요 도로망
WALK_HW = {"footway", "path", "pedestrian", "steps", "living_street", "residential", "unclassified", "service", "tertiary", "tertiary_link",
           "secondary", "secondary_link", "primary", "primary_link", "trunk", "trunk_link", "track", "cycleway", "corridor", "elevator", "platform", "road"}
LIM_CAR, LIM_WALK, LIM_ST = 600.0, 1500.0, 900.0         # 이웃 칸 찾을 때 자동차 10분 · 도보 25분, 역까지 걷기 15분
ENTRY, TRANSFER = 120.0, 240.0
CURVE = 1.05      # 역 사이 직선거리 → 선로 길이. 2·3·7·9호선에서 역간 직선거리 합이 영업거리의 0.91~0.98배
# 지하철 노선 — (표정속도 km/h, 낮(비혼잡) 배차 분, 출처) · 키 = OSM ref (+급행 · 갈래 · 지선)
LINES = {"1": (32.0, 5.0, "속도 가정(코레일 구간이 서울교통공사 구간 26.0보다 빠름) · 배차 서울시(서울역~청량리 5분)"),
         "1경인": (32.0, 10.0, "구로~인천 갈래 — 배차는 줄기의 두 배(번갈아 다닌다고 가정)"), "1경부": (32.0, 10.0, "구로~수원 쪽 갈래 — 배차는 줄기의 두 배(가정)"),
         "1경원": (32.0, 10.0, "광운대~연천 갈래 — 경부 쪽 열차가 광운대·청량리에서 돌아가 배차는 줄기의 두 배(가정)"),
         "1급행": (45.0, 20.0, "가정"), "1급행경인": (45.0, 40.0, "1급행 갈래 — 배차는 1급행의 두 배(가정)"), "1급행경부": (45.0, 40.0, "1급행 갈래 — 배차는 1급행의 두 배(가정)"),
         "1급행경원": (45.0, 40.0, "1급행 갈래 — 배차는 1급행의 두 배(가정)"),
         "2": (32.5, 5.5, "서울시"), "2성수": (36.0, 10.0, "서울시 — 신설동~성수 5.4km·9분"), "2신정": (32.7, 10.0, "서울시 — 신도림~까치산 6km·11분"),
         "3": (34.0, 6.5, "서울시"), "4": (35.9, 5.5, "서울시"), "4급행": (45.0, 30.0, "가정"), "5": (32.8, 6.5, "서울시"),
         "5하남": (32.8, 13.0, "강동~하남검단산 갈래 — 배차는 줄기의 두 배(가정)"), "5마천": (32.8, 13.0, "강동~마천 갈래 — 배차는 줄기의 두 배(가정)"),
         "6": (29.5, 8.0, "서울시"), "7": (32.3, 6.0, "서울시"), "8": (22.4, 8.0, "서울시"), "9": (30.5, 5.5, "서울시"), "9급행": (46.4, 10.0, "서울시 속도 · 배차 가정"),
         "W": (29.7, 6.0, "서울시(배차 4~12분)"), "Silim": (25.7, 6.0, "서울시(배차 4~10분)"), "신분당": (45.0, 7.0, "가정"), "경강": (45.0, 10.0, "가정"),
         "경의·중앙": (40.0, 15.0, "가정"), "경춘": (45.0, 20.0, "가정"), "공항철도": (45.0, 10.0, "가정"), "서해": (45.0, 15.0, "가정"),
         "수인·분당": (35.0, 8.0, "가정"), "수인·분당급행": (45.0, 30.0, "가정"), "GTX-A": (90.0, 15.0, "가정"),
         "U": (30.0, 6.0, "가정"), "김포 골드라인": (30.0, 4.0, "가정"), "인천1": (30.0, 8.0, "가정"), "I2": (30.0, 6.0, "가정")}
TRAIN_OK = {"경의·중앙", "경춘", "공항철도", "서해", "수인·분당", "GTX-A"}
# 출근 7~9시 배차(분) — 서울시 교통 누리집 '노선별 운행 현황'(2025-01-31). 퇴근 18~20시도 같다고 본다(가정). 표에 없는 노선은 낮 배차 그대로
LINES_RH = {"1": 3.0, "1경인": 6.0, "1경부": 6.0, "1경원": 6.0, "2": 2.5, "2성수": 7.0, "2신정": 10.0, "3": 3.0, "4": 2.5, "5": 2.5, "5하남": 5.0, "5마천": 5.0,
            "6": 4.0, "7": 2.5, "8": 4.5, "9": 3.1, "W": 2.9, "Silim": 4.0}
# 줄기와 갈래가 이어 달리는 노선 — (노선, 갈림역, 갈림역 다음 첫 역 → 갈래 이름). 갈래 쪽 구간은 '노선 키 + 갈래 이름'(급행도: 1급행경인)으로 탄다
BRANCH = [("5", "강동", {"길동": "하남", "둔촌동": "마천"}), ("1", "구로", {"구일": "경인", "가산디지털단지": "경부"}), ("1", "광운대", {"월계": "경원"})]
TRUNK_OF = {k + suf: k for L, J, f_ in BRANCH for suf in f_.values() for k in (L, L + "급행") if k + suf in LINES}   # 갈래 키 → 줄기 키
BASE = {**{"2성수": "2", "2신정": "2"}, **{bk: tk.replace("급행", "") for bk, tk in TRUNK_OF.items()}}
base = lambda k: BASE.get(k, k.replace("급행", ""))
SHUTTLE = {"성수지선": "2성수", "신정지선": "2신정"}       # 줄기와 따로 다니는 2호선 지선 — OSM 노선 이름으로
SKIP_ROUTE = ("광명셔틀",)                                  # 금천구청~광명 셔틀(드묾, 서울 밖) — 뺀다
PERIODS = {"day": tuple(range(10, 16)), "am": (7, 8), "pm": (18, 19)}   # 평일 낮 10~16시 · 출근 7~9시 · 퇴근 18~20시
CAR_F = {"day": 1.0, "am": round(21.7 / 22.5, 3), "pm": round(21.7 / 19.8, 3)}  # 자동차 시간 배율 — 서울시 2025 평일 평균 21.7 · 출근 22.5 · 퇴근 19.8km/h

# ── 1. 길 읽기
Z = np.load(os.path.join(OSM, "서울_길.npz"))
node, lon, lat, ptr = Z["node"], Z["lon"], Z["lat"], Z["ptr"]
W = list(csv.DictReader(open(os.path.join(OSM, "서울_길.csv"), encoding="utf-8-sig")))
assert len(W) == len(ptr) - 1
uid, inv = np.unique(node, return_inverse=True)
N = len(uid)
X = np.zeros(N); Y = np.zeros(N); X[inv] = (lon - 126.98) * KX; Y[inv] = (lat - LAT0) * KY
LON = np.zeros(N); LAT = np.zeros(N); LON[inv] = lon; LAT[inv] = lat
log(f"길 {len(W):,}개 · 꼭짓점 {N:,}개")

def ms(v):
    m = re.match(r"\d+", v or ""); return int(m.group()) if m else 0
cu, cv, cw, ck = [], [], [], []          # 자동차 (방향) — 꼭짓점, 꼭짓점, 초, 등급(0 지면 1 고속 2 진출입)
wu, wv, ww = [], [], []                  # 도보 (양방향)
for k, a in enumerate(W):
    hw = a["highway"]; s, e = ptr[k], ptr[k + 1]
    ii = inv[s:e]
    if len(ii) < 2: continue
    seg = np.hypot(np.diff(X[ii]), np.diff(Y[ii]))
    fast = a["motorroad"] == "yes" or ms(a["maxspeed"]) >= 70
    cls = "expressway" if hw == "motorway" or (hw == "trunk" and fast) else ("exlink" if hw == "motorway_link" or (hw == "trunk_link" and fast) else hw)
    acc_no = a["access"] in ("no", "private")
    # 자동차
    if cls in CAR and not (hw == "service" and a["service"] in SERVICE_SKIP) and not (acc_no and a["motor_vehicle"] not in ("yes", "destination", "permissive")) \
            and a["motor_vehicle"] not in ("no", "private"):
        sec = seg / (CAR[cls] / 3.6)
        ow = a["oneway"]; d = 1 if ow in ("yes", "1", "true") else (-1 if ow == "-1" else 0)
        if d == 0 and (a["junction"] in ("roundabout", "circular") or cls in ("expressway", "exlink")) and ow != "no": d = 1
        g = 1 if cls == "expressway" else (2 if cls == "exlink" else (3 if cls in MAJOR else 0))
        if d >= 0:
            cu.append(ii[:-1]); cv.append(ii[1:]); cw.append(sec); ck.append(np.full(len(seg), g, np.int8))
        if d <= 0:
            cu.append(ii[1:]); cv.append(ii[:-1]); cw.append(sec); ck.append(np.full(len(seg), g, np.int8))
    # 도보
    if hw in WALK_HW and cls not in ("expressway", "exlink") and a["foot"] not in ("no", "private", "use_sidepath") \
            and not (acc_no and a["foot"] not in ("yes", "designated", "permissive")):
        sec = seg / (WALK_KMH / 3.6) / (STEPS_F if hw == "steps" else 1.0)
        wu.append(ii[:-1]); wv.append(ii[1:]); ww.append(sec)
cu, cv, cw, ck = (np.concatenate(x) for x in (cu, cv, cw, ck))
wu, wv, ww = (np.concatenate(x) for x in (wu, wv, ww))
wu, wv, ww = np.concatenate([wu, wv]), np.concatenate([wv, wu]), np.concatenate([ww, ww])
log(f"자동차 구간 {len(cu):,} (고속 {int((ck==1).sum()):,} · 진출입 {int((ck==2).sum()):,} · 간선·보조간선 {int((ck==3).sum()):,}) · 도보 구간 {len(wu)//2:,}")

def build(u, v, w, n):
    o = np.lexsort((v, u)); u, v, w = u[o], v[o], w[o]
    indptr = np.zeros(n + 1, np.int64); np.add.at(indptr, u + 1, 1); indptr = np.cumsum(indptr)
    return indptr, v.astype(np.int64), w.astype(np.float64), o

# 가장 큰 연결 덩어리만 (자동차는 강하게 연결 — 들어가면 못 나오는 길 빼기)
Mc = csr_matrix((np.ones(len(cu)), (cu, cv)), shape=(N, N))
_, lab = connected_components(Mc, directed=True, connection="strong"); big = np.bincount(lab).argmax(); okc = lab == big
keep = okc[cu] & okc[cv]; cu, cv, cw, ck = cu[keep], cv[keep], cw[keep], ck[keep]
Mw = csr_matrix((np.ones(len(wu)), (wu, wv)), shape=(N, N))
_, labw = connected_components(Mw, directed=False); bigw = np.bincount(labw).argmax(); okw = labw == bigw
keep = okw[wu] & okw[wv]; wu, wv, ww = wu[keep], wv[keep], ww[keep]
CI, CJ, CW, oc = build(cu, cv, cw, N); CK = ck[oc]
RI, RJ, RW, _ = build(cv, cu, cw, N)            # 거꾸로 (칸 → 진출입 지점 시간)
WI, WJ, WWt, _ = build(wu, wv, ww, N)
log(f"자동차 강연결 꼭짓점 {int(okc.sum()):,} · 도보 연결 꼭짓점 {int(okw.sum()):,}")

# ── 2. 다익스트라 (numba) — 출발점마다 정해진 목표 꼭짓점들까지, 한계 시간 안에서
@nb.njit(cache=True)
def sp_many(indptr, indices, w, n, sources, tptr, targets, limit, stop_flag):
    INF = 1e18
    dist = np.full(n, INF); stamp = np.zeros(n, np.int32); done = np.zeros(n, np.int32); tf = np.zeros(n, np.int32)
    out = np.full(targets.size, INF)
    cap = w.size + 16; hd = np.empty(cap); hv = np.empty(cap, np.int64)
    for i in range(sources.size):
        run = i + 1; s = sources[i]
        need = 0
        for j in range(tptr[i], tptr[i + 1]):
            t = targets[j]
            if tf[t] != run: tf[t] = run; need += 1
        dist[s] = 0.0; stamp[s] = run; hn = 0
        hd[0] = 0.0; hv[0] = s; hn = 1; found = 0
        while hn > 0:
            d = hd[0]; u = hv[0]
            hn -= 1
            if hn > 0:                                   # 맨 끝을 위로 올려 내려보내기
                ld = hd[hn]; lv = hv[hn]; p = 0
                while True:
                    c = 2 * p + 1
                    if c >= hn: break
                    if c + 1 < hn and hd[c + 1] < hd[c]: c += 1
                    if hd[c] < ld: hd[p] = hd[c]; hv[p] = hv[c]; p = c
                    else: break
                hd[p] = ld; hv[p] = lv
            if done[u] == run or d > dist[u]: continue
            if d > limit: break
            done[u] = run
            if tf[u] == run:
                found += 1
                if found == need: break
            if stop_flag[u] and u != s: continue         # 덧그래프용: 다른 진출입 지점에서 멈춤
            for e in range(indptr[u], indptr[u + 1]):
                v = indices[e]; nd = d + w[e]
                if stamp[v] != run or nd < dist[v]:
                    dist[v] = nd; stamp[v] = run
                    q = hn; hn += 1                      # 위로 올리기
                    while q > 0:
                        p = (q - 1) // 2
                        if hd[p] > nd: hd[q] = hd[p]; hv[q] = hv[p]; q = p
                        else: break
                    hd[q] = nd; hv[q] = v
        for j in range(tptr[i], tptr[i + 1]):
            t = targets[j]
            if stamp[t] == run and done[t] == run: out[j] = dist[t]
    return out

NOSTOP = np.zeros(N, np.bool_)
def many(indptr, indices, w, sources, tlists, limit, stop=NOSTOP):
    tptr = np.zeros(len(sources) + 1, np.int64); tptr[1:] = np.cumsum([len(t) for t in tlists])
    tg = np.array([x for t in tlists for x in t], dtype=np.int64) if tptr[-1] else np.zeros(0, np.int64)
    out = sp_many(indptr, indices, w, N, np.asarray(sources, np.int64), tptr, tg, float(limit), stop)
    out[out >= 1e17] = np.inf                            # 한계 시간 안에 못 닿은 목표 — 1e18 그대로 두면 isfinite를 통과해 버린다
    return out, tptr

# ── 3. 칸 — 테두리 순서의 이웃, 도로 꼭짓점에 붙이기
G = list(csv.DictReader(open(os.path.join(R, "매출잠재_격자.csv"), encoding="utf-8-sig")))
C = len(G); hid = [g["h3_9"] for g in G]; idx = {h: i for i, h in enumerate(hid)}
NB = np.full(C * 6, -1, np.int64)
for i, h in enumerate(hid):
    b = h3.cell_to_boundary(h); cla, clo = h3.cell_to_latlng(h)
    for k in range(6):
        mla = (b[k][0] + b[(k + 1) % 6][0]) / 2; mlo = (b[k][1] + b[(k + 1) % 6][1]) / 2
        nbh = h3.latlng_to_cell(2 * mla - cla, 2 * mlo - clo, 9)
        assert nbh in h3.grid_ring(h, 1), (h, k)
        NB[i * 6 + k] = idx.get(nbh, -1)
cx = np.array([(float(g["lon"]) - 126.98) * KX for g in G]); cy = np.array([(float(g["lat"]) - LAT0) * KY for g in G])
# 자동차는 지면 도로에서 나가는 구간이 있는 꼭짓점에만 붙인다 (고속도로 위에 붙으면 못 빠져나온다)
surf = np.bincount(np.repeat(np.arange(N), np.diff(CI))[CK == 0], minlength=N) > 0
cand_c = np.flatnonzero(surf); cand_w = np.flatnonzero(np.diff(WI) > 0)
dc, jc = cKDTree(np.c_[X[cand_c], Y[cand_c]]).query(np.c_[cx, cy]); SNC = cand_c[jc]
dw, jw = cKDTree(np.c_[X[cand_w], Y[cand_w]]).query(np.c_[cx, cy]); SNW = cand_w[jw]
ACC_C = dc / (WALK_KMH / 3.6); ACC_W = dw / (WALK_KMH / 3.6)
log(f"칸 {C:,} · 붙인 거리 중앙 자동차 {np.median(dc):.0f}m (95% {np.percentile(dc,95):.0f}) · 도보 {np.median(dw):.0f}m (95% {np.percentile(dw,95):.0f})")

def neighbor_times(I, J, Wt, snap, limit):
    tl = [[snap[j] for j in NB[i * 6:(i + 1) * 6] if j >= 0] for i in range(C)]
    out, tp = many(I, J, Wt, snap, tl, limit)
    T = np.full(C * 6, np.inf);
    for i in range(C):
        q = tp[i]
        for k in range(6):
            j = NB[i * 6 + k]
            if j >= 0: T[i * 6 + k] = out[q]; q += 1
    return T

T_CAR = neighbor_times(CI, CJ, CW, SNC, LIM_CAR); log(f"자동차 이웃 시간 — 중앙 {np.nanmedian(T_CAR[np.isfinite(T_CAR)]):.0f}초, 못 닿음 {int((~np.isfinite(T_CAR) & (NB>=0)).sum())}")
T_WALK = neighbor_times(WI, WJ, WWt, SNW, LIM_WALK); log(f"도보 이웃 시간 — 중앙 {np.nanmedian(T_WALK[np.isfinite(T_WALK)]):.0f}초, 못 닿음 {int((~np.isfinite(T_WALK) & (NB>=0)).sum())}")
RING2 = []
for i in range(C):
    r1 = set(int(j) for j in NB[i * 6:(i + 1) * 6] if j >= 0)
    r2 = sorted({int(k) for j in r1 for k in NB[j * 6:(j + 1) * 6] if k >= 0} - r1 - {i})
    RING2.append(r2)
o2, tp2 = many(WI, WJ, WWt, SNW, [[SNW[j] for j in r] for r in RING2], LIM_WALK)
T_WALK2 = o2; N2 = np.array([len(r) for r in RING2], np.uint8)
log(f"도보 둘째 고리 {int(N2.sum()):,}개 — 중앙 {np.median(o2[np.isfinite(o2)]):.0f}초")

# ── 4. 주요 도로망 덧그래프 — 도시고속도로·간선·보조간선을 교차점만 남기고 줄인 그래프
# 칸끼리만 이으면 칸마다 골목으로 들어갔다 나오는 셈이라 먼 길이 실제보다 길게 나온다(이웃 칸만 쓴 첫 판은 도로망 시간의 1.6배).
# 주요 도로의 교차·분기점(이웃이 둘이 아닌 꼭짓점)만 남겨 구간을 합치고, 칸은 가까운 교차점 넷과 실제 도로 시간으로 잇는다.
ue = np.repeat(np.arange(N), np.diff(CI))
majE = CK > 0
MI, MJ, MW, _ = build(ue[majE], CJ[majE], CW[majE], N)
mu, mv = ue[majE], CJ[majE]
und = np.unique(np.c_[np.minimum(mu, mv), np.maximum(mu, mv)], axis=0)
ndeg = np.bincount(und.ravel(), minlength=N)
inmaj = ndeg > 0
iskey = inmaj & (ndeg != 2)
# 줄이기: 교차점에서 나가는 주요 도로 구간을 따라 다음 교차점까지
KEY = np.flatnonzero(iskey); kid = np.full(N, -1, np.int64); kid[KEY] = np.arange(len(KEY))
KL = {}
for k in KEY:
    for e in range(MI[k], MI[k + 1]):
        prev, cur, t, steps = k, MJ[e], MW[e], 0
        while not iskey[cur] and steps < 100000:
            nxt = -1
            for e2 in range(MI[cur], MI[cur + 1]):
                if MJ[e2] != prev: nxt = e2; break
            if nxt < 0: break                          # 막다른 곳 (일방통행 끝)
            prev, cur, t, steps = cur, MJ[nxt], t + MW[nxt], steps + 1
        if iskey[cur] and cur != k:
            key = (kid[k], kid[cur]); KL[key] = min(KL.get(key, 1e18), t)
log(f"주요 도로망 꼭짓점 {int(inmaj.sum()):,} → 교차점 {len(KEY):,} · 줄인 구간 {len(KL):,}")
# 칸 ↔ 교차점: 칸 중심 도로 꼭짓점에서 1.2km 안 교차점들까지 실제 도로 시간, 가장 가까운 넷씩 (가는 쪽·오는 쪽 따로)
ktree = cKDTree(np.c_[X[KEY], Y[KEY]])
cand = [ktree.query_ball_point([X[SNC[i]], Y[SNC[i]]], 1200) or list(np.atleast_1d(ktree.query([X[SNC[i]], Y[SNC[i]]], 4)[1])) for i in range(C)]
of, tpf = many(CI, CJ, CW, SNC, [[KEY[j] for j in c] for c in cand], LIM_CAR)
orr, tpr = many(RI, RJ, RW, SNC, [[KEY[j] for j in c] for c in cand], LIM_CAR)
CKF, CKR = [], []                                     # (칸, 교차점, 초)
for i in range(C):
    f_ = sorted((of[q], cand[i][q - tpf[i]]) for q in range(tpf[i], tpf[i + 1]) if np.isfinite(of[q]))[:4]
    r_ = sorted((orr[q], cand[i][q - tpr[i]]) for q in range(tpr[i], tpr[i + 1]) if np.isfinite(orr[q]))[:4]
    CKF += [(i, j, t) for t, j in f_]; CKR += [(i, j, t) for t, j in r_]
log(f"칸 → 교차점 {len(CKF):,} · 교차점 → 칸 {len(CKR):,}")

# ── 5. 지하철 — 역(같은 이름·700m 안 정차 지점 묶음) × 노선
RJS = json.load(open(os.path.join(OSM, "서울_철도.json"), encoding="utf-8"))
nodes = RJS["nodes"]
def line_key(r):
    ref = r["ref"].strip(); nm = r["name"]
    if any(w in nm for w in SKIP_ROUTE): return None
    if r["route"] == "train" and ref not in TRAIN_OK: return None
    if ref == "" or ref == "AREX": return None
    for w, k in SHUTTLE.items():
        if ref == "2" and w in nm: return k
    key = ref + ("급행" if ("급행" in nm or "특급" in nm) and ref + "급행" in LINES else "")
    return key if key in LINES else None
routes = [(line_key(r), r) for r in RJS["routes"]]; routes = [(k, r) for k, r in routes if k]
norm = lambda s: re.sub(r"역$", "", re.sub(r"\s|\(.*?\)", "", s or "")) if len(re.sub(r"\s|\(.*?\)", "", s or "")) > 2 else re.sub(r"\s|\(.*?\)", "", s or "")
stops = sorted({s for _, r in routes for s in r["stops"] if str(s) in nodes})
sx = {s: ((nodes[str(s)]["lon"] - 126.98) * KX, (nodes[str(s)]["lat"] - LAT0) * KY) for s in stops}
cid = {}; csum = []; cname = []
def nm_of(s): return norm(nodes[str(s)]["name_ko"] or nodes[str(s)]["name"])
for s in [s for s in stops if nm_of(s)]:            # 이름이 같고 700m 안이면 한 역
    nm = nm_of(s); best = -1
    for c in range(len(csum)):
        if cname[c] == nm and math.hypot(csum[c][0] / csum[c][2] - sx[s][0], csum[c][1] / csum[c][2] - sx[s][1]) < 700: best = c; break
    if best < 0:
        csum.append([sx[s][0], sx[s][1], 1]); cname.append(nm); best = len(csum) - 1
    else:
        csum[best][0] += sx[s][0]; csum[best][1] += sx[s][1]; csum[best][2] += 1
    cid[s] = best
nofix = 0
for s in [s for s in stops if not nm_of(s)]:        # 이름 없는 정차 지점(공항철도 홍대입구·디지털미디어시티 승강장 등)은 300m 안 가장 가까운 역에 붙인다
    dd = [math.hypot(csum[c][0] / csum[c][2] - sx[s][0], csum[c][1] / csum[c][2] - sx[s][1]) for c in range(len(csum))]
    c = int(np.argmin(dd)) if dd else -1
    if c >= 0 and dd[c] < 300: cid[s] = c
    else: csum.append([sx[s][0], sx[s][1], 1]); cname.append(f"역{s}"); cid[s] = len(csum) - 1; nofix += 1
cpos = [([a_, b_], n_) for a_, b_, n_ in csum]
CX = np.array([p[0] / q for p, q in cpos]); CY = np.array([p[1] / q for p, q in cpos])
# 갈래 — 갈림역을 빼고 첫 갈래 역에서 이어지는 역들
adjL = {}
for k, r in routes:
    seq = [cid[s_] for s_ in r["stops"] if s_ in cid]
    for a_, b_ in zip(seq, seq[1:]):
        if a_ != b_: adjL.setdefault(k, {}).setdefault(a_, set()).add(b_); adjL[k].setdefault(b_, set()).add(a_)
BR_OF = {}; JUNC = {}; brlog = []                     # (노선, 역) → 갈래 이름 · 갈래 이름 → 갈림역
for L, J, firsts in BRANCH:
    cj = [c for c in adjL.get(L, {}) if cname[c] == norm(J)]
    if not cj: brlog.append(f"{L} 갈림역 {J} 없음"); continue
    for first, suf in firsts.items():
        f_ = [c for c in adjL[L][cj[0]] if cname[c] == norm(first)]
        if not f_: brlog.append(f"{L}{suf} 첫 역 {first} 없음"); continue
        stack, seen = [f_[0]], {f_[0]}
        while stack:
            u = stack.pop()
            for v in adjL[L].get(u, ()):
                if v != cj[0] and v not in seen: seen.add(v); stack.append(v)
        assert not any((L, c) in BR_OF for c in seen), f"{L}{suf} 갈래가 다른 갈래와 겹친다"
        for c in seen: BR_OF[(L, c)] = suf
        JUNC[suf] = cj[0]; brlog.append(f"{L}{suf} {len(seen)}역")
def brkey(k, c):                                       # 그 역이 갈래 쪽이면 '노선 키 + 갈래 이름'
    suf = BR_OF.get((base(k), c))
    return k + suf if suf and k + suf in LINES else None
used_k = set()
for k, r in routes:
    seq = [cid[s_] for s_ in r["stops"] if s_ in cid]
    for ca_, cb_ in zip(seq, seq[1:]):
        if ca_ != cb_: used_k.add(brkey(k, ca_) or brkey(k, cb_) or k)
lk = sorted(used_k, key=lambda k: list(LINES).index(k)); li = {k: i for i, k in enumerate(lk)}
SL = {}; ride = {}
def sl(c, l):
    if (c, l) not in SL: SL[(c, l)] = len(SL)
    return SL[(c, l)]
for k, r in routes:
    seq = [s for s in r["stops"] if s in cid]
    for a, b in zip(seq, seq[1:]):
        ca, cb = cid[a], cid[b]
        if ca == cb: continue
        kk = brkey(k, ca) or brkey(k, cb) or k                    # 갈래 쪽 구간이면 갈래 노선
        dsec = math.hypot(sx[a][0] - sx[b][0], sx[a][1] - sx[b][1]) * CURVE / (LINES[kk][0] / 3.6)
        key = (sl(ca, li[kk]), sl(cb, li[kk])); ride[key] = min(ride.get(key, 1e18), dsec)
# 갈래에서 온 열차는 갈림역을 지나 줄기로 그대로 간다 — 갈림역의 갈래 노드에서 줄기 다음 역으로 같은 운행 구간을 하나 더 둔다
# (갈래 → 줄기 갈아타기를 0으로 두면 갈래 → 줄기 → 다른 갈래가 줄기 배차의 절반에 끝나 버린다 — 2차 검토에서 찾음)
ndup = 0
for bk, tk in TRUNK_OF.items():
    suf = bk[len(tk):]
    if bk not in li or tk not in li or suf not in JUNC or (JUNC[suf], li[bk]) not in SL or (JUNC[suf], li[tk]) not in SL: continue
    a_, b_ = SL[(JUNC[suf], li[tk])], SL[(JUNC[suf], li[bk])]
    for (u, v), t in list(ride.items()):
        if u == a_: ride[(b_, v)] = min(ride.get((b_, v), 1e18), t); ndup += 1
# 역에서 걸어서 닿는 칸 (15분 안)
ctree = cKDTree(np.c_[cx, cy])
used_c = sorted({c for (c, l) in SL})
csnap = cand_w[cKDTree(np.c_[X[cand_w], Y[cand_w]]).query(np.c_[CX[used_c], CY[used_c]])[1]]
tl = [ctree.query_ball_point([CX[c], CY[c]], 1400) for c in used_c]
ow_, tpw = many(WI, WJ, WWt, csnap, [[SNW[j] for j in t] for t in tl], LIM_ST)
PACC = []
for n_, c in enumerate(used_c):
    for q, j in zip(range(tpw[n_], tpw[n_ + 1]), tl[n_]):
        if np.isfinite(ow_[q]): PACC.append((j, c, ow_[q] + ACC_W[j]))
log(f"지하철 노선 {len(lk)}개(갈래·지선 포함 — {', '.join(brlog)} · 갈래에서 줄기로 이어 가는 구간 {ndup}) · 역 {len(used_c):,} · 역×노선 {len(SL):,} · 운행 구간 {len(ride):,} · 걸어서 닿는 칸 연결 {len(PACC):,} · 이름 없는 정차 지점 중 역에 못 붙인 것 {nofix}")

# ── 5b. 지하철 갈아타기 — 쌍마다 걷는 시간과 종류만 낸다(기다림은 시간대마다 뷰어가 더한다)
#   종류 0 = 걸어서 갈아탐: 걷기 + 갈아탈 노선 배차의 절반. 걷기 = 서울교통공사 표 거리 ÷ 1.2m/s + 1분(적어도 2분), 표에 없으면 4분, 같은 노선 급행 ↔ 일반은 30초
#           표의 한 줄은 급행·갈래·지선까지 같은 노선 모두에 쓴다. 표에 없고 승강장이 300m 넘게 떨어진 쌍(신촌 2호선 ↔ 경의·중앙)은 잇지 않는다 — 밖으로 나와 걷는다
#   종류 1 = 줄기 → 이어 달리는 갈래(5호선 강동·1호선 구로·광운대): 맞는 열차를 더 기다리는 만큼 = (갈래 배차 − 줄기 배차) ÷ 2
#   갈래 → 줄기는 갈아타지 않는다 — 갈림역의 갈래 노드에서 줄기 쪽으로 같은 운행 구간을 이어 두었다(그 열차가 그대로 간다)
TR_LINE = {"경원선": "1", "경의중앙선": "경의·중앙", "경춘선": "경춘", "공항철도": "공항철도", "국철": "수인·분당", "김포골드라인": "김포 골드라인",
           "서해선": "서해", "수인분당선": "수인·분당", "신림선": "Silim", "신분당선": "신분당", "우이신설선": "W"}
TR_PAD, TR_MIN, TR_FAR = 60.0, 120.0, 300.0
def tr_key(v):
    v = str(v).strip(); m = re.fullmatch(r"(\d)호선", v)
    return m.group(1) if m else TR_LINE.get(v)
csl = {}
for (c, l), n_ in SL.items(): csl.setdefault(c, {})[l] = n_
SLXY = {}                                                # 역×노선마다 그 노선 정차 지점의 가운데
for k, r in routes:
    for s_ in r["stops"]:
        if s_ not in cid: continue
        kk = brkey(k, cid[s_]) or k
        if (cid[s_], li[kk]) in SL: SLXY.setdefault(SL[(cid[s_], li[kk])], []).append(sx[s_])
SLXY = {n_: np.mean(v, axis=0) for n_, v in SLXY.items()}
for (c, l), n_ in SL.items(): SLXY.setdefault(n_, np.array([CX[c], CY[c]]))   # 갈림역의 갈래 노드 등 정차 지점이 따로 안 잡힌 것
bases = {base(k) for k in lk}
has = lambda c, kb: any(base(lk[l_]) == kb for l_ in csl[c])
TRW = {}; SAMEW = {}; trmiss = []; TRSRC = ""
trp = files(BUS, "서울교통공사_환승역거리*.csv")
if trp:
    TRSRC = os.path.basename(trp[-1])
    for r in csv.DictReader(open(trp[-1], encoding="cp949")):
        k1, k2 = str(r["호선"]).strip(), tr_key(r["환승노선"])
        if k1 not in bases or k2 not in bases: trmiss.append(r["환승역명"] + " " + str(r["호선"]) + "→" + str(r["환승노선"])); continue
        nm = norm(r["환승역명"]); mm, ss = str(r["환승소요시간"]).split(":"); t = max(int(mm) * 60 + int(ss) + TR_PAD, TR_MIN)
        c1s = [c for c in csl if has(c, k1) and cname[c] == nm] or [c for c in csl if has(c, k1) and (nm in cname[c] or cname[c] in nm)]
        if not c1s: trmiss.append(r["환승역명"] + " " + k1 + "→" + k2); continue
        c1 = c1s[0]
        if k1 == k2: SAMEW[c1] = min(SAMEW.get(c1, 1e18), t); continue      # 같은 노선 안 — 지선·갈래 갈아타기(성수·신도림·강동)
        c2s = sorted((math.hypot(CX[c] - CX[c1], CY[c] - CY[c1]), c) for c in csl if has(c, k2))
        if not c2s or c2s[0][0] > 500: trmiss.append(r["환승역명"] + " " + k1 + "→" + k2 + " (가까운 역 없음)"); continue
        for la_, a in csl[c1].items():
            if base(lk[la_]) != k1: continue
            for lb_, b_ in csl[c2s[0][1]].items():
                if base(lk[lb_]) == k2: TRW[(a, b_)] = min(TRW.get((a, b_), 1e18), t)
    for (a, b_), t in list(TRW.items()): TRW.setdefault((b_, a), t)
SLC = {n_: (c, l) for (c, l), n_ in SL.items()}
TRK = {}; far = []; nkind = [0, 0, 0]
for c, ls in csl.items():                              # 같은 역 안의 노선 쌍
    for la, a in ls.items():
        for lb, b_ in ls.items():
            if la == lb: continue
            ka, kb = lk[la], lk[lb]
            if base(ka) == base(kb):
                if TRUNK_OF.get(kb) == ka: TRK[(a, b_)] = (0.0, 1)                 # 줄기 → 갈래
                elif TRUNK_OF.get(ka) == kb: continue                              # 갈래 → 줄기 — 열차가 그대로 간다(위 운행 구간)
                elif ka in TRUNK_OF and kb in TRUNK_OF: TRK[(a, b_)] = (SAMEW.get(c, 30.0), 0)          # 갈래 ↔ 갈래(강동·구로) — 걸어서, 다른 갈래 배차의 절반
                elif ka in SHUTTLE.values() or kb in SHUTTLE.values(): TRK[(a, b_)] = (SAMEW.get(c, TRANSFER), 0)   # 지선 ↔ 줄기(성수·신도림)
                else: TRK[(a, b_)] = (30.0, 0)                                    # 급행 ↔ 일반
            elif (a, b_) in TRW: TRK[(a, b_)] = (TRW[(a, b_)], 0)
            else:
                dd_ = float(np.hypot(*(SLXY[a] - SLXY[b_])))
                if dd_ > TR_FAR:
                    if la < lb: far.append(f"{cname[c]} {ka}↔{kb} {dd_:.0f}m")
                    continue
                TRK[(a, b_)] = (TRANSFER, 0)
for (a, b_), t in TRW.items():                          # 이름이 달라 다른 역으로 묶인 환승(총신대입구 ↔ 이수 등)
    if (a, b_) not in TRK: TRK[(a, b_)] = (t, 0)
for w_, kd in TRK.values(): nkind[kd] += 1
log(f"갈아타기 {len(TRK):,}쌍(걸어서 {nkind[0]} · 줄기→갈래 {nkind[1]}) — 서울교통공사 표에서 {len(TRW):,}쌍 + 같은 노선 갈아타기 {len(SAMEW)}역 "
    f"(못 맞춘 줄 {len(trmiss)}: {', '.join(trmiss[:6])}) · 표에 없고 승강장이 {TR_FAR:.0f}m 넘게 떨어져 잇지 않은 쌍 {len(far)}: {', '.join(far[:8])}")

# ── 5c. 버스 — 서울시 노선(정류소 순서·좌표) + 경기·인천 노선(TOPIS 구간 자료의 순서, 국토부 전국 정류장 좌표)
#    정류장 사이 = TOPIS 정류장 구간 평균 운행시간(실측), 배차 = TOPIS 정류장별 버스 운행횟수 — 평일 낮(10~16시)·출근(7~9시)·퇴근(18~20시)마다
BUS_DWELL, BUS_WAIT_MAX, BUS_DEFAULT_H, BUS_MAX_H, LIM_BUSACC, LIM_BUSACC2 = 25.0, 900.0, 12.0, 60.0, 360.0, 900.0
OBS_MIN_S, OBS_MAX_KMH = 10.0, 70.0                            # 실측을 믿는 범위(10초 이상, 직선 속도 70km/h 이하)
CAP_X, CAP_ADD = 2.0, 180.0                                    # 실측이 어림의 2배와 어림 + 3분 중 큰 값보다 길면 거기서 자른다(종점·회차 대기)
FB_KMH, FB_CIRC, FB_ADD = 8.0, 1.5, 60.0                       # 어림 상한 = 직선 × 1.5 ÷ 8km/h + 1분 (정류소가 엉뚱한 길에 붙어 터무니없이 느린 어림을 자른다)
BUS_SKIP = r"한강|출근|퇴근|새벽|심야|^N\d|A\d+$|열차버스|TOUR"   # 한강버스·연계 셔틀, 출퇴근 전용, 새벽·심야, 자율주행 시범(…A01), 관광
BUS_SKIP_TY = {1: "공항", 10: "관광", 13: "동행(출근)"}       # 노선 기본정보 ROUTE_TY
AIRPORT_X = 126.60                                            # 이보다 서쪽(영종도 인천공항)에 서는 노선 = 공항버스
BBX = (126.70, 37.37, 127.26, 37.77)
VIRT = r"가상|미정차|\((?:미)?경유\)"                        # 서울 '(가상)', 경기 '(미정차)'·'(경유)' — 길 모양만 잡는 점, 타고 내리지 못한다
PK = list(PERIODS)
BUSJ = None; BUSCHK = {}
bsp = files(BUS, "서울시버스노선별정류소정보*.xlsx"); bip = files(BUS, "*서울시노선기본정보*.xlsx")
spp = files(BUS, "tpss_route_section_speedh_*.zip"); hsp = files(BUS, "tpss_sta_route_hturn_*.zip"); tgp = files(BUS, "국토교통부_전국 버스정류장 위치정보*.csv")
if bsp:
    import pandas as pd, warnings, zipfile
    warnings.filterwarnings("ignore", message="Workbook contains no default style")
    BS = pd.read_excel(bsp[-1]); BS["노선명"] = BS["노선명"].astype(str)
    COORD = {int(n_): (float(x_), float(y_), str(m_)) for n_, x_, y_, m_ in BS.drop_duplicates("NODE_ID")[["NODE_ID", "X좌표", "Y좌표", "정류소명"]].itertuples(index=False)}
    info, isrc = {}, ""
    if bip:
        BI = pd.read_excel(bip[-1]); BI = BI[BI.STDR_DE == BI.STDR_DE.max()]; isrc = f"{os.path.basename(bip[-1])} (STDR_DE {int(BI.STDR_DE.max())})"
        for r in BI.itertuples(): info[int(r.ROUTE_ID)] = r
    # 1) 시간대 배차 — 운행횟수: 평일마다 그 시간대 시간당 운행(정류장마다) → 날짜 평균 → 노선의 정류장 가운데 값. 배차 = 60 ÷ 시간당 운행
    RUNS = {p: {} for p in PK}; hsrc = ""; hdays = []
    if hsp:
        HC = [f"버스운행횟수_{h:02d}시" for h in range(24)]
        with zipfile.ZipFile(hsp[-1]) as zf, zf.open(zf.infolist()[0]) as f:
            TN = pd.read_csv(f, encoding="cp949", usecols=["기준_날짜", "노선_ID", "정류장_ID"] + HC)
        TN = TN[pd.to_datetime(TN["기준_날짜"].astype(str), format="%Y%m%d").dt.dayofweek < 5]
        TN[HC] = TN[HC].fillna(0)
        hdays = [int(d_) for d_ in sorted(TN["기준_날짜"].unique())]
        for p, hrs in PERIODS.items():
            x = TN[["노선_ID", "정류장_ID"]].assign(r=TN[[f"버스운행횟수_{h:02d}시" for h in hrs]].sum(axis=1) / len(hrs))
            RUNS[p] = {int(k_): float(v_) for k_, v_ in x.groupby(["노선_ID", "정류장_ID"]).r.mean().groupby("노선_ID").median().items()}
        hsrc = os.path.basename(hsp[-1])
    def head(r_, p):                                         # 분 — 0이면 그 시간대에 안 다닌다
        if hsp:
            v = RUNS[p].get(int(r_), 0.0); return 60.0 / v if v > 0 else 0.0
        i_ = info.get(int(r_)); return float(i_.CARALC) if i_ is not None and i_.CARALC > 0 else BUS_DEFAULT_H
    def noon(r):                                              # 운행횟수가 없을 때만 — 첫차·막차(HHMM/10000)로 낮 12시에 다니는지
        f, l = round(r.FIRCAR_TM * 10000), round(r.LSTCAR_TM * 10000)
        if f < 0 or l > 2400 or f > 2400 or (f == 0 and l == 0): return True
        return (f <= 1200 <= l) if f <= l else (f <= 1200 or l >= 1200)
    # 2) 서울 노선 — 이름·유형·공항으로 거르고, 그 주에 안 다닌 노선·낮에 안 다니는 노선·낮 배차 60분 넘는 노선을 뺀다
    RN = BS.groupby("ROUTE_ID")["노선명"].first(); xmin = BS.groupby("ROUTE_ID")["X좌표"].min()
    why = {}
    for r_, nm in RN.items():
        i_ = info.get(int(r_))
        if re.search(BUS_SKIP, nm): why[r_] = "이름(한강·출퇴근·새벽·심야·자율주행·관광)"
        elif i_ is not None and int(i_.ROUTE_TY) in BUS_SKIP_TY: why[r_] = "유형(" + BUS_SKIP_TY[int(i_.ROUTE_TY)] + ")"
        elif xmin[r_] < AIRPORT_X: why[r_] = "유형(공항)"
        elif hsp and int(r_) not in RUNS["day"]: why[r_] = "그 주 운행 기록 없음"
        elif hsp and head(r_, "day") == 0: why[r_] = "낮에 안 다님"
        elif not hsp and i_ is not None and not noon(i_): why[r_] = "낮에 안 다님"
        elif head(r_, "day") > BUS_MAX_H: why[r_] = f"배차 {BUS_MAX_H:.0f}분 넘음"
    n0 = len(RN); wc = {}
    for v in why.values(): wc[v] = wc.get(v, 0) + 1
    keep_s = [r_ for r_ in RN.index if r_ not in why]
    nodef = 0 if hsp else sum(1 for r_ in keep_s if not (int(r_) in info and info[int(r_)].CARALC > 0))
    BS = BS[BS.ROUTE_ID.isin(keep_s)][["ROUTE_ID", "노선명", "순번", "NODE_ID", "정류소명", "X좌표", "Y좌표"]].assign(src="서울")
    # 3) 경기·인천 노선 — TOPIS 구간 자료에만 있는 노선. 순번마다 가장 많이 나온 정류장, 좌표는 서울 정류소 파일 → 국토부 전국 정류장(SEB·GGB·ICB 번호 = TOPIS 번호)
    SD = None; wdays = []; GG = pd.DataFrame(columns=BS.columns); gwc = {}; ng0 = 0; ntg = 0; nnoc = 0
    if spp:
        HALL = sorted({h for hrs in PERIODS.values() for h in hrs})
        with zipfile.ZipFile(spp[-1]) as zf, zf.open(zf.infolist()[0]) as f:
            SD = pd.read_csv(f, encoding="cp949", usecols=["기준_날짜", "노선_ID", "출발_정류장_ID", "도착_정류장_ID", "출발_정류장_순서", "도착_정류장_순서"] + [f"운행시간_{h:02d}시" for h in HALL])
        SD = SD[pd.to_datetime(SD["기준_날짜"].astype(str), format="%Y%m%d").dt.dayofweek < 5]
        wdays = [int(d_) for d_ in sorted(SD["기준_날짜"].unique())]
        if tgp:
            TG = pd.read_csv(tgp[-1], encoding="cp949", dtype=str)
            TG = TG[TG["정류장번호"].str[:3].isin(["SEB", "GGB", "ICB"])]
            for nid_, nm_, la_, lo_ in TG[["정류장번호", "정류장명", "위도", "경도"]].itertuples(index=False):
                try: k_ = int(nid_[3:]); xy_ = (float(lo_), float(la_))
                except (ValueError, TypeError): continue
                if k_ not in COORD: COORD[k_] = (xy_[0], xy_[1], str(nm_)); ntg += 1
        seoul_ids = {int(x) for x in RN.index}
        G2 = SD[~SD["노선_ID"].isin(seoul_ids)]
        st_ = pd.concat([G2[["노선_ID", "출발_정류장_순서", "출발_정류장_ID"]].set_axis(["r", "q", "n"], axis=1),
                         G2[["노선_ID", "도착_정류장_순서", "도착_정류장_ID"]].set_axis(["r", "q", "n"], axis=1)])
        st_ = (st_.groupby(["r", "q", "n"]).size().reset_index(name="c")
                  .sort_values(["r", "q", "c", "n"], ascending=[True, True, False, True]).drop_duplicates(["r", "q"]))
        rows_g = []
        for r_, g in st_.groupby("r", sort=True):
            ng0 += 1; w_ = None
            xs = [COORD[int(n_)][0] for n_ in g.n if int(n_) in COORD]
            if hsp and int(r_) not in RUNS["day"]: w_ = "그 주 운행 기록 없음"
            elif head(r_, "day") == 0: w_ = "낮에 안 다님"
            elif head(r_, "day") > BUS_MAX_H: w_ = f"배차 {BUS_MAX_H:.0f}분 넘음"
            elif xs and min(xs) < AIRPORT_X: w_ = "유형(공항)"
            if w_: gwc[w_] = gwc.get(w_, 0) + 1; continue
            for q_, n_ in zip(g.q, g.n):
                c_ = COORD.get(int(n_))
                if c_ is None: nnoc += 1
                rows_g.append((int(r_), "", int(q_), int(n_), c_[2] if c_ else "", c_[0] if c_ else np.nan, c_[1] if c_ else np.nan, "경기·인천"))
        GG = pd.DataFrame(rows_g, columns=BS.columns)
    ALL = pd.concat([BS, GG], ignore_index=True).sort_values(["ROUTE_ID", "순번"]).reset_index(drop=True)
    ALL["ord"] = ALL.groupby("ROUTE_ID").cumcount()                     # 원자료 줄 순서 — 순번에 빈 번호가 있어도 앞뒤 줄은 이어진 정류소
    ALL["virt"] = ALL["정류소명"].astype(str).str.contains(VIRT, regex=True)
    nraw = ALL.groupby("ROUTE_ID").size()
    inb = ALL["X좌표"].between(BBX[0], BBX[2]) & ALL["Y좌표"].between(BBX[1], BBX[3])   # 좌표 없는 정류장(NaN)도 여기서 빠지며 노선이 끊긴다
    nout = int((~inb).sum()); ALL = ALL[inb]
    rows = {r_: list(g.itertuples(index=False)) for r_, g in ALL.groupby("ROUTE_ID", sort=True)}
    SEGS = [(r_, a_, b_) for r_, rl in rows.items() for a_, b_ in zip(rl, rl[1:]) if b_.ord == a_.ord + 1]
    ngap = sum(1 for r_, a_, b_ in SEGS if a_.src == "서울" and b_.순번 != a_.순번 + 1)
    pid = sorted(ALL.NODE_ID.unique()); pix = {n_: i for i, n_ in enumerate(pid)}           # 정차 지점 전부(가상 포함) — 구간 시간을 잴 때만
    px = np.array([(COORD[int(n_)][0] - 126.98) * KX for n_ in pid]); py = np.array([(COORD[int(n_)][1] - LAT0) * KY for n_ in pid])
    psc = cand_c[cKDTree(np.c_[X[cand_c], Y[cand_c]]).query(np.c_[px, py])[1]]
    # 어림 = 자동차 길 시간 + 정차. 중앙차로 정류소는 길 가운데라 반대 차로에 붙을 수 있어 양방향 길로 잰다
    UI, UJ, UW, _ = build(np.r_[cu, cv], np.r_[cv, cu], np.r_[cw, cw], N)
    succ = {}
    for r_, a_, b_ in SEGS: succ.setdefault(pix[a_.NODE_ID], set()).add(pix[b_.NODE_ID])
    srcs = sorted(succ); tls = [sorted(succ[s_]) for s_ in srcs]
    ob, tpb = many(UI, UJ, UW, [psc[s_] for s_ in srcs], [[psc[t_] for t_ in tl_] for tl_ in tls], 5400.0)    # 고속도로를 타는 긴 무정차 구간까지
    road = {}; nfb = 0
    for n_, s_ in enumerate(srcs):
        for q_, t_ in zip(range(tpb[n_], tpb[n_ + 1]), tls[n_]):
            v = ob[q_]
            if not np.isfinite(v):
                d_ = math.hypot(px[s_] - px[t_], py[s_] - py[t_]); v = d_ * 1.3 / ((35 if d_ >= 5000 else 18) / 3.6); nfb += 1
            road[(s_, t_)] = v
    SD_ = [math.hypot(px[pix[a_.NODE_ID]] - px[pix[b_.NODE_ID]], py[pix[a_.NODE_ID]] - py[pix[b_.NODE_ID]]) for r_, a_, b_ in SEGS]   # 직선거리
    MOD = [road[(pix[a_.NODE_ID], pix[b_.NODE_ID])] + BUS_DWELL for r_, a_, b_ in SEGS]
    # 실측 — 시간대마다: 평일 하루마다 그 시간대 시간별 평균(0 = 자료 없음)을 고르게 평균, 그 뒤 날짜를 고르게 평균
    OB = {p: [None] * len(SEGS) for p in PK}
    if SD is not None:
        for p, hrs in PERIODS.items():
            S2 = SD.assign(t=SD[[f"운행시간_{h:02d}시" for h in hrs]].replace(0, np.nan).mean(axis=1)); S2 = S2[S2.t.notna()]
            o_seq = S2.groupby(["노선_ID", "출발_정류장_순서", "출발_정류장_ID", "도착_정류장_ID"]).t.mean().to_dict()
            o_id = S2.groupby(["노선_ID", "출발_정류장_ID", "도착_정류장_ID"]).t.mean().to_dict()
            for n_, (r_, a_, b_) in enumerate(SEGS):
                OB[p][n_] = o_seq.get((int(r_), int(a_.순번), int(a_.NODE_ID), int(b_.NODE_ID)), o_id.get((int(r_), int(a_.NODE_ID), int(b_.NODE_ID))))
    good = {p: {n_ for n_ in range(len(SEGS)) if OB[p][n_] is not None and OB[p][n_] >= OBS_MIN_S and SD_[n_] / OB[p][n_] * 3.6 <= OBS_MAX_KMH} for p in PK}
    KCAL = float(np.median([OB["day"][n_] / MOD[n_] for n_ in sorted(good["day"])])) if good["day"] else 1.0
    RAT = {p: (float(np.median([OB[p][n_] / OB["day"][n_] for n_ in sorted(good[p] & good["day"])])) if good[p] & good["day"] else 1.0) for p in PK}
    # 그 구간의 그 시간대 실측이 없을 때 — 그 구간 낮 실측 × 시간대 비율 → 같은 두 정류장 사이 다른 노선의 실측(가운데 값) → 반대 방향 → 어림
    PAIR = {p: {} for p in PK}
    for p in PK:
        for n_ in sorted(good[p]):
            r_, a_, b_ = SEGS[n_]; PAIR[p].setdefault((int(a_.NODE_ID), int(b_.NODE_ID)), []).append(OB[p][n_])
        PAIR[p] = {k_: float(np.median(v_)) for k_, v_ in PAIR[p].items()}
    TSEG = {p: [] for p in PK}; ncap = {p: 0 for p in PK}; nfbcap = 0; nsub = {p: [0, 0, 0] for p in PK}
    for n_ in range(len(SEGS)):
        m0 = MOD[n_] * KCAL; lim_ = SD_[n_] * FB_CIRC / (FB_KMH / 3.6) + FB_ADD
        r_, a_, b_ = SEGS[n_]; ab = (int(a_.NODE_ID), int(b_.NODE_ID))
        for p in PK:
            m_ = min(m0, lim_) * RAT[p]
            if n_ in good[p]: o_ = OB[p][n_]
            elif p != "day" and n_ in good["day"]: o_ = OB["day"][n_] * RAT[p]; nsub[p][0] += 1
            elif ab in PAIR[p]: o_ = PAIR[p][ab]; nsub[p][1] += 1
            elif ab[::-1] in PAIR[p]: o_ = PAIR[p][ab[::-1]]; nsub[p][2] += 1
            else: o_ = None
            if o_ is not None:
                cap_ = max(CAP_X * m_, m_ + CAP_ADD)
                if o_ > cap_: ncap[p] += 1
                TSEG[p].append(min(o_, cap_))
            else:
                TSEG[p].append(m_); nfbcap += (p == "day" and m0 > lim_)
    # 가상 정류소를 빼고 진짜 정류소끼리 잇는다 — 사이 구간 시간을 더한다. 운행 구간은 늘 바로 앞 자리 → 이 자리라서 자리마다 '앞 자리에서 오는 시간'만 둔다
    rid = sorted(rows); rix = {r_: i for i, r_ in enumerate(rid)}
    nid = sorted(ALL[~ALL.virt].NODE_ID.unique()); nix = {n_: i for i, n_ in enumerate(nid)}
    segi = {(r_, a_.ord): n_ for n_, (r_, a_, b_) in enumerate(SEGS)}
    RS = []; RT = {p: [] for p in PK}; nedge = 0
    for r_ in rid:
        last, acc_t, prev = None, {p: 0.0 for p in PK}, None
        for row in rows[r_]:
            if prev is not None:
                n_ = segi.get((r_, prev.ord))
                if n_ is not None:
                    for p in PK: acc_t[p] += TSEG[p][n_]
                else: last, acc_t = None, {p: 0.0 for p in PK}      # 범위 밖·좌표 없는 정류장으로 끊긴 곳
            if not row.virt:
                k = len(RS); RS.append((nix[row.NODE_ID], rix[r_]))
                for p in PK: RT[p].append(acc_t[p] if last is not None else None)
                nedge += last is not None
                last, acc_t = k, {p: 0.0 for p in PK}
            prev = row
    nvirt = int(ALL.virt.sum())
    bx = px[[pix[n_] for n_ in nid]]; by = py[[pix[n_] for n_ in nid]]
    bsw = cand_w[cKDTree(np.c_[X[cand_w], Y[cand_w]]).query(np.c_[bx, by])[1]]
    OBSJ = None
    if SD is not None:
        rat = np.array([OB["day"][n_] / MOD[n_] for n_ in sorted(good["day"])])
        OBSJ = {"file": os.path.basename(spp[-1]), "weekdays": wdays, "hours": {p: list(h) for p, h in PERIODS.items()}, "segments": len(SEGS),
                "matched": {p: sum(o is not None for o in OB[p]) for p in PK}, "used": {p: len(good[p]) for p in PK}, "capped": ncap,
                "k": round(KCAL, 3), "ratio_p25_p50_p75": [round(float(x), 2) for x in np.percentile(rat, [25, 50, 75])], "peak_ratio": {p: round(RAT[p], 3) for p in PK},
                "substituted": nsub}
        log(f"버스 구간 실측 {OBSJ['file']} 평일 {len(wdays)}일 — {len(SEGS):,}구간 중 실측 쓴 것 낮 {len(good['day']):,} · 출근 {len(good['am']):,} · 퇴근 {len(good['pm']):,} "
            f"(종점·회차 대기로 자른 것 낮 {ncap['day']}) · 낮 실측 ÷ 어림 중앙 {OBSJ['ratio_p25_p50_p75'][1]} (25~75% {OBSJ['ratio_p25_p50_p75'][0]}~{OBSJ['ratio_p25_p50_p75'][2]}) → "
            f"실측 없는 구간은 어림 × {KCAL:.2f}(그중 터무니없이 느린 어림을 자른 것 {nfbcap}) · 구간 시간 출근 ÷ 낮 {RAT['am']:.2f} · 퇴근 ÷ 낮 {RAT['pm']:.2f}"
            f" · 자기 실측 대신 쓴 값(낮 실측×비율/같은 정류장 쌍/반대 방향) 낮 {nsub['day'][1:]} · 출근 {nsub['am']} · 퇴근 {nsub['pm']}")
    else:
        log("버스 구간 실측 자료 없음 — 어림(자동차 길 + 정차 25초)만 쓴다")
    # 정류소 ↔ 칸: 걸어서 6분 안. 600m 안에 칸이 있는데 6분 안에는 못 닿는 정류소(중앙차로·고가 옆처럼 길을 돌아가야 하는 곳)는 15분 안 가장 가까운 칸 하나에 잇는다
    ctl = [ctree.query_ball_point([bx[i], by[i]], 600) for i in range(len(nid))]
    oa, tpa = many(WI, WJ, WWt, bsw, [[SNW[j] for j in t_] for t_ in ctl], LIM_BUSACC)
    BACC = []
    for i in range(len(nid)):
        for q_, j in zip(range(tpa[i], tpa[i + 1]), ctl[i]):
            if np.isfinite(oa[q_]): BACC.append((j, i, oa[q_] + ACC_W[j]))
    linked = np.zeros(len(nid), bool)
    for j, i, t_ in BACC: linked[i] = True
    lone = [i for i in range(len(nid)) if not linked[i] and ctl[i]]
    ol, tpl = many(WI, WJ, WWt, bsw[lone], [[SNW[j] for j in ctl[i]] for i in lone], LIM_BUSACC2)
    nlone = 0
    for n_, i in enumerate(lone):
        seg = ol[tpl[n_]:tpl[n_ + 1]]
        if len(seg) and np.isfinite(seg.min()):
            q_ = int(np.argmin(seg)); j = ctl[i][q_]; BACC.append((j, i, seg[q_] + ACC_W[j])); nlone += 1
    RH = {p: [round(head(r_, p), 1) for r_ in rid] for p in PK}
    gsrc = {r_: rows[r_][0].src for r_ in rid}
    nrt = {s_: sum(1 for r_ in rid if gsrc[r_] == s_) for s_ in ("서울", "경기·인천")}
    # 점검 — 서울 노선 중 정류소가 다 남은 노선마다 노선 길이(기본정보 DSTNC) ÷ 처음~끝 시간 = 평균 속도 (낮)
    rt, rtm = {}, {}
    for (r_, a_, b_), t_, m_ in zip(SEGS, TSEG["day"], MOD): rt[rix[r_]] = rt.get(rix[r_], 0.0) + t_; rtm[rix[r_]] = rtm.get(rix[r_], 0.0) + m_
    full = [ri for ri, r_ in enumerate(rid) if gsrc[r_] == "서울" and int(r_) in info and len(rows[r_]) == nraw[r_] and rt.get(ri, 0) > 0 and info[int(r_)].DSTNC > 0]
    spd = np.array([float(info[int(rid[ri])].DSTNC) / (rt[ri] / 3600) for ri in full])
    spdm = np.array([float(info[int(rid[ri])].DSTNC) / (rtm[ri] / 3600) for ri in full])
    sty = {}
    for ri, v in zip(full, spd): sty.setdefault({2: "마을", 3: "간선", 4: "지선", 5: "순환", 6: "광역"}.get(int(info[int(rid[ri])].ROUTE_TY), "기타"), []).append(v)
    hcmp = [head(rid[ri], "day") / float(info[int(rid[ri])].CARALC) for ri in range(len(rid)) if gsrc[rid[ri]] == "서울" and int(rid[ri]) in info and info[int(rid[ri])].CARALC > 0]
    BUSCHK = {"routes_checked": int(len(spd)), "kmh_p10": round(float(np.percentile(spd, 10)), 1), "kmh_p50": round(float(np.median(spd)), 1),
              "kmh_p90": round(float(np.percentile(spd, 90)), 1), "by_type": {k: [len(v), round(float(np.median(v)), 1)] for k, v in sorted(sty.items())},
              "model_only_kmh_p50": round(float(np.median(spdm)), 1),
              "head_vs_2024_p25_p50_p75": [round(float(x), 2) for x in np.percentile(hcmp, [25, 50, 75])] if hcmp else None,
              "head_min_p50": {p: round(float(np.median([h_ for h_ in RH[p] if h_ > 0])), 1) for p in PK},
              "not_running": {p: sum(1 for h_ in RH[p] if h_ == 0) for p in PK}}
    log(f"버스 서울 노선 {n0} → 뺀 것 " + ", ".join(f"{k} {v}" for k, v in sorted(wc.items(), key=lambda x: -x[1])) + f" → {nrt['서울']}개"
        + (f" · 경기·인천 노선 {ng0} → 뺀 것 " + ", ".join(f"{k} {v}" for k, v in sorted(gwc.items(), key=lambda x: -x[1])) + f" → {nrt['경기·인천']}개 (국토부 좌표로 찾은 정류장 {ntg:,} · 좌표 없는 자리 {nnoc})" if spp else ""))
    log(f"버스 배차(운행횟수 {hsrc or '없음 — 2024 기본정보'}) 낮 중앙 {BUSCHK['head_min_p50']['day']}분 · 출근 {BUSCHK['head_min_p50']['am']} · 퇴근 {BUSCHK['head_min_p50']['pm']} · "
        f"출근에 안 다니는 노선 {BUSCHK['not_running']['am']} · 퇴근 {BUSCHK['not_running']['pm']} · 서울 노선 2026 낮 배차 ÷ 2024 기본정보 중앙 {BUSCHK['head_vs_2024_p25_p50_p75'][1] if hcmp else '-'}")
    log(f"버스 정류소 {len(nid):,} (범위 밖·좌표 없는 정차 {nout} · 가상 정류소 {nvirt} 뺌, 순번이 건너뛴 앞뒤 줄 {ngap}곳은 이음) · 정류소×노선 {len(RS):,} · 운행 구간 {nedge:,} (길을 못 찾아 직선으로 어림 {nfb}) · 걸어서 닿는 칸 연결 {len(BACC):,}"
        f" — 6분 안에 닿는 칸이 없는 정류소 {len(lone)}곳(600m 안에 칸은 있음) 중 {nlone}곳은 15분 안 가장 가까운 칸에 이음 · 600m 안에 칸이 없는 서울 밖 정류소 {int(sum(1 for c_ in ctl if not c_)):,}곳")
    log(f"버스 서울 노선 평균 속도(낮, 정차 포함, 노선 길이 ÷ 처음~끝 시간) 중앙 {BUSCHK['kmh_p50']} km/h (10% {BUSCHK['kmh_p10']} · 90% {BUSCHK['kmh_p90']}), {BUSCHK['routes_checked']}개 노선 · 유형별 " +
        ", ".join(f"{k} {v[1]}({v[0]})" for k, v in BUSCHK["by_type"].items()) + f" · 어림만 쓰면 {BUSCHK['model_only_kmh_p50']}")
    b16 = lambda a: base64.b64encode(np.asarray(a, "<u2").tobytes()).decode()
    assert len(nid) < 65535 and len(rid) < 65535 and C < 65535      # 정류소·노선·칸 번호만 16비트로 싣는다(자리 수는 아님)
    enc_t = lambda L: b16([65535 if t_ is None else min(int(round(t_)), 65534) for t_ in L])
    BUSJ = {"n": len(nid), "h": RH, "gg": [int(gsrc[r_] != "서울") for r_ in rid], "rs": b16([x for a_, b_ in RS for x in (a_, b_)]), "rt": {p: enc_t(RT[p]) for p in PK},
            "acc": b16([x for j, i, t_ in BACC for x in (j, i, int(round(t_)))]),
            "meta": {"stops": os.path.basename(bsp[-1]), "info": isrc, "runs": hsrc, "runs_weekdays": hdays, "coords": os.path.basename(tgp[-1]) if tgp else "",
                     "routes": nrt, "dwell_s": BUS_DWELL, "wait_max_s": BUS_WAIT_MAX, "default_h": BUS_DEFAULT_H, "max_h": BUS_MAX_H,
                     "acc_s": LIM_BUSACC, "acc2_s": LIM_BUSACC2, "lone": [len(lone), nlone], "skip": BUS_SKIP, "skip_ty": BUS_SKIP_TY, "airport_x": AIRPORT_X,
                     "dropped": wc, "dropped_gg": gwc, "routes_in": n0, "routes_in_gg": ng0, "unknown_h": nodef, "fallback": nfb, "virtual_dropped": nvirt, "seq_gaps_joined": ngap,
                     "obs": OBSJ, "obs_rule": {"min_s": OBS_MIN_S, "max_kmh": OBS_MAX_KMH, "cap_x": CAP_X, "cap_add_s": CAP_ADD, "fb_kmh": FB_KMH, "fb_circ": FB_CIRC, "fb_add_s": FB_ADD},
                     "check": BUSCHK}}
else:
    log("버스 자료 없음 — 버스는 빼고 만든다")

# ── 6. 점검 — 무작위 칸 쌍: 도로망 그대로 잰 시간 vs 칸 그래프 시간
import heapq
M = len(KEY)
ADJ_CAR = [[] for _ in range(C + M)]
for i in range(C):
    for k in range(6):
        j = NB[i * 6 + k]
        if j >= 0 and np.isfinite(T_CAR[i * 6 + k]): ADJ_CAR[i].append((int(j), float(T_CAR[i * 6 + k])))
for i, j, t in CKF: ADJ_CAR[i].append((C + int(j), float(t)))
for i, j, t in CKR: ADJ_CAR[C + int(j)].append((i, float(t)))
for (a_, b_), t in KL.items(): ADJ_CAR[C + int(a_)].append((C + int(b_), float(t)))
ADJ_WALK = [[] for _ in range(C)]
q = 0
for i in range(C):
    for k in range(6):
        j = NB[i * 6 + k]
        if j >= 0 and np.isfinite(T_WALK[i * 6 + k]): ADJ_WALK[i].append((int(j), float(T_WALK[i * 6 + k])))
    for j in RING2[i]:
        if np.isfinite(T_WALK2[q]): ADJ_WALK[i].append((j, float(T_WALK2[q])))
        q += 1
def cell_graph_time(o, mode):
    adj = ADJ_CAR if mode == "car" else ADJ_WALK
    INF = 1e18; dist = [INF] * len(adj); dist[o] = 0.0; hq = [(0.0, o)]
    while hq:
        d, u = heapq.heappop(hq)
        if d > dist[u]: continue
        for v, t in adj[u]:
            if d + t < dist[v]: dist[v] = d + t; heapq.heappush(hq, (dist[v], v))
    return np.array(dist[:C])
rng = np.random.default_rng(23)
rows = []
for mode, I, J, Wt, snap, lo_, hi_, npair in (("car", CI, CJ, CW, SNC, 1000, 15000, 40), ("walk", WI, WJ, WWt, SNW, 300, 3000, 40)):
    origins = rng.choice(C, size=npair, replace=False)
    for o in origins:
        dist = cell_graph_time(int(o), mode)
        dd = np.hypot(cx - cx[o], cy - cy[o]); pool = np.flatnonzero((dd > lo_) & (dd < hi_))
        if len(pool) == 0: continue
        dests = rng.choice(pool, size=min(5, len(pool)), replace=False)
        ex, _ = many(I, J, Wt, [snap[o]], [[snap[d] for d in dests]], 7200.0)
        for d, e in zip(dests, ex):
            rows.append((mode, hid[o], hid[d], round(float(dd[d])), round(float(e), 1), round(float(dist[d]), 1)))
CHK = {}
for mode in ("car", "walk"):
    r = np.array([b / a for m, _, _, _, a, b in rows if m == mode and a > 0 and np.isfinite(a) and np.isfinite(b)])
    CHK[mode] = {"pairs": int(len(r)), "ratio_p10": round(float(np.percentile(r, 10)), 3), "ratio_p50": round(float(np.median(r)), 3), "ratio_p90": round(float(np.percentile(r, 90)), 3)}
    log(f"점검 {mode}: 칸 그래프 ÷ 도로망 — 중앙 {CHK[mode]['ratio_p50']:.2f} (10% {CHK[mode]['ratio_p10']:.2f} · 90% {CHK[mode]['ratio_p90']:.2f}), {len(r)}쌍")
with open(os.path.join(R, "이동_점검.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f); w.writerow(["수단", "출발칸", "도착칸", "직선거리_m", "도로망_초", "칸그래프_초"]); w.writerows(rows)

# ── 7. 쓰기
u16 = lambda a: base64.b64encode(np.where(np.isfinite(a), np.minimum(np.round(a), 65534), 65535).astype("<u2").tobytes()).decode()
m3857 = lambda la, lo: (round(lo * 20037508.34 / 180), round(math.log(math.tan((90 + la) * math.pi / 360)) / (math.pi / 180) * 20037508.34 / 180))
def c2ll(x, y): return LAT0 + y / KY, 126.98 + x / KX
pts = [m3857(*c2ll(CX[c], CY[c])) for c in range(len(CX))]
OUTJ = {
    "meta": {"made": time.strftime("%Y-%m-%d"), "osm": "south-korea-261011.osm.pbf (Geofabrik, ODbL)", "car_kmh": CAR, "walk_kmh": WALK_KMH, "steps_factor": STEPS_F,
             "entry_s": ENTRY, "transfer_s": TRANSFER, "check": CHK, "cells": C, "h3sha": hashlib.sha1("\n".join(hid).encode()).hexdigest(),
             "periods": {p: list(h) for p, h in PERIODS.items()}, "car_f": CAR_F,
             "src": {"car": "서울연구원 서울 모니터링 리포트 교통(2023, 6~22시) 도시고속도로 49.9·주간선 23.7·보조간선 21.0 km/h — 그 아래 등급은 가정",
                     "pt": "서울시 교통 누리집 노선별 영업거리·소요시간·배차(2025-01) — 표에 없는 노선은 가정",
                     "transfer": "서울교통공사 환승역거리 소요시간 정보(2025-03) + 1분 — 표에 없는 쌍은 4분",
                     "bus": "서울시 버스노선별 정류소정보(2026-09) · TOPIS 정류장 구간 평균 운행시간·정류장별 버스 운행횟수(2026-09 한 주, 평일 낮·출근·퇴근) · 국토교통부 전국 버스정류장 위치(2025-10, 경기·인천 정류장) — 기다림 상한 15분, 실측 없는 구간의 정차 25초는 가정",
                     "periods": "자동차 시간 배율 = 서울시 2025 평일 평균 21.7km/h ÷ 출근(7~9시) 22.5·퇴근(18~20시) 19.8 · 지하철 출근 배차 = 서울시 교통 누리집(2025-01), 퇴근도 같다고 가정"}},
    "nb": NB.tolist(),
    "car": {"t": u16(T_CAR), "acc": u16(ACC_C), "nk": M,
            "kl": [x for (a_, b_), t in sorted(KL.items()) for x in (int(a_), int(b_), int(round(t)))],
            "ckf": [x for i, j, t in CKF for x in (int(i), int(j), int(round(t)))],
            "ckr": [x for i, j, t in CKR for x in (int(i), int(j), int(round(t)))]},
    "walk": {"t": u16(T_WALK), "t2": u16(T_WALK2), "n2": base64.b64encode(N2.tobytes()).decode(), "acc": u16(ACC_W)},
    "pt": {"st": [[pts[c][0], pts[c][1], cname[c]] for c in range(len(CX))],
           "lines": [{"k": k, "v": LINES[k][0], "h": LINES[k][1], "h_am": LINES_RH.get(k, LINES[k][1]), "h_pm": LINES_RH.get(k, LINES[k][1]), "src": LINES[k][2]} for k in lk],
           "sl": [x for (c, l), n_ in sorted(SL.items(), key=lambda kv: kv[1]) for x in (c, l)],
           "ride": [x for (a, b), t in sorted(ride.items()) for x in (a, b, int(round(t)))],
           "acc": [x for j, c, t in PACC for x in (int(j), int(c), int(round(t)))],
           "tr": [x for (a, b), (t, kd) in sorted(TRK.items()) for x in (int(a), int(b), int(round(t)), kd)], "trsrc": TRSRC}}
if BUSJ: OUTJ["bus"] = BUSJ
with open(os.path.join(R, "이동_그래프.json"), "w", encoding="utf-8") as f:
    json.dump(OUTJ, f, ensure_ascii=False, separators=(",", ":"))
log(f"이동_그래프.json {os.path.getsize(os.path.join(R, '이동_그래프.json'))/1e6:.2f}MB")
