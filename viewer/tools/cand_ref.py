# 후보 찾기 기준 계산 (뷰어 JS와 따로 짠 파이썬) — 이동_그래프.json·후보_조건.json·viewer_data.json에서 바로 읽는다
import base64, heapq, json, math
import numpy as np

R = "/home/claude/work_result"
J = json.load(open(R + "/이동_그래프.json", encoding="utf-8"))
K = json.load(open(R + "/후보_조건.json", encoding="utf-8"))
V = json.load(open(R + "/viewer_data.json", encoding="utf-8"))
C = J["meta"]["cells"]; NB = J["nb"]
u16 = lambda s: np.frombuffer(base64.b64decode(s), "<u2").astype(np.int64)
CAR_T, CAR_ACC, WALK_T, WALK_T2, WALK_ACC = u16(J["car"]["t"]), u16(J["car"]["acc"]), u16(J["walk"]["t"]), u16(J["walk"]["t2"]), u16(J["walk"]["acc"])
N2 = np.frombuffer(base64.b64decode(J["walk"]["n2"]), np.uint8).astype(np.int64)
F = V["f"]; N300 = V["n300"]; CMAX = 60; TB = [10, 20, 30, 45, 60]

def ring2(i):
    r1 = [j for j in NB[i * 6:i * 6 + 6] if j >= 0]
    return sorted({k for j in r1 for k in NB[j * 6:j * 6 + 6] if k >= 0} - set(r1) - {i})

def graphs():
    walk = [[] for _ in range(C)]; q = 0
    for i in range(C):
        for k in range(6):
            j = NB[i * 6 + k]
            if j >= 0 and WALK_T[i * 6 + k] < 65535: walk[i].append((j, int(WALK_T[i * 6 + k])))
        r2 = ring2(i); assert len(r2) == N2[i]
        for x, j in enumerate(r2):
            if WALK_T2[q + x] < 65535: walk[i].append((j, int(WALK_T2[q + x])))
        q += int(N2[i])
    M = J["car"]["nk"]; car = [[] for _ in range(C + M)]
    for i in range(C):
        for k in range(6):
            j = NB[i * 6 + k]
            if j >= 0 and CAR_T[i * 6 + k] < 65535: car[i].append((j, int(CAR_T[i * 6 + k])))
    a = J["car"]["ckf"]
    for x in range(0, len(a), 3): car[a[x]].append((C + a[x + 1], a[x + 2]))
    a = J["car"]["ckr"]
    for x in range(0, len(a), 3): car[C + a[x + 1]].append((a[x], a[x + 2]))
    a = J["car"]["kl"]
    for x in range(0, len(a), 3): car[C + a[x]].append((C + a[x + 1], a[x + 2]))
    return {"car": car, "walk": walk, "pt": {p: pt_graph(walk, p) for p in ("day", "am", "pm")}}

def pt_graph(walk, p):
    # 대중교통(시간대 p): 칸 · 역 들어감 · 역 나옴 · 역×노선 · 정류소 탐 · 정류소 내림 · 정류소×노선
    P = J["pt"]; Kc = len(P["st"]); S = len(P["sl"]) // 2; ENT = J["meta"]["entry_s"]; hk = "h" if p == "day" else "h_" + p
    hl = lambda n: P["lines"][P["sl"][2 * n + 1]][hk]
    B = J.get("bus"); NS = B["n"] if B else 0; rs = u16(B["rs"]) if B else np.zeros(0, np.int64); NR = len(rs) // 2
    oSl = C + 2 * Kc; oBi = oSl + S; oBo = oBi + NS; oRs = oBo + NS
    pt = [list(e) for e in walk] + [[] for _ in range(2 * Kc + S + 2 * NS + NR)]
    a = P["acc"]
    for x in range(0, len(a), 3):
        cell, cx, w = a[x], a[x + 1], max(0, a[x + 2] - int(WALK_ACC[a[x]]))
        pt[cell].append((C + cx, w + ENT)); pt[C + Kc + cx].append((cell, w + ENT))
    for s in range(S):
        cx = P["sl"][2 * s]
        pt[C + cx].append((oSl + s, hl(s) * 30)); pt[oSl + s].append((C + Kc + cx, 0))
    a = P["tr"]                                          # 지하철 갈아타기 — [앞, 뒤, 걷기, 종류]: 0 걷기 + 뒤 노선 배차 절반 · 1 (뒤 배차 − 앞 배차) ÷ 2
    for x in range(0, len(a), 4):
        kd = a[x + 3]; w = a[x + 2] + hl(a[x + 1]) * 30 if kd == 0 else (max(0, hl(a[x + 1]) - hl(a[x])) * 30 if kd == 1 else 0)
        pt[oSl + a[x]].append((oSl + a[x + 1], w))
    a = P["ride"]
    for x in range(0, len(a), 3): pt[oSl + a[x]].append((oSl + a[x + 1], a[x + 2]))
    if B:
        WMAX = B["meta"]["wait_max_s"]; a = u16(B["acc"]); rt = u16(B["rt"][p]); hh = B["h"][p]
        for x in range(0, len(a), 3):
            cell, st, w = int(a[x]), int(a[x + 1]), max(0, int(a[x + 2]) - int(WALK_ACC[a[x]]))
            pt[cell].append((oBi + st, w)); pt[oBo + st].append((cell, w))
        for s in range(NR):                              # 탐 → 노선 자리(기다림, 그 시간대에 다니는 노선만) · 자리 → 내림 · 내림 → 다른 노선 자리 · 앞 자리 → 이 자리
            st = int(rs[2 * s]); h = hh[int(rs[2 * s + 1])]
            if h > 0:
                wt = min(h * 30, WMAX); pt[oBi + st].append((oRs + s, wt)); pt[oBo + st].append((oRs + s, wt))
            pt[oRs + s].append((oBo + st, 0))
            if s > 0 and rt[s] != 65535: pt[oRs + s - 1].append((oRs + s, int(rt[s])))
    return pt

G = graphs(); ACC = {"car": CAR_ACC, "walk": WALK_ACC, "pt": WALK_ACC}

def times(mode, o, p="day"):
    if mode == "car":                                    # 자동차: 걷는 편이 빠른 칸은 걷는 시간, 기준 칸 = 0
        T = np.minimum(raw("car", o, p), raw("walk", o, p)); T[o] = 0.0; return T
    T = raw(mode, o, p); T[o] = 0.0; return T

def raw(mode, o, p="day"):
    adj = G["pt"][p] if mode == "pt" else G[mode]; acc = ACC[mode]; f = J["meta"]["car_f"][p] if mode == "car" else 1
    dist = {o: float(acc[o])}; done = set(); hq = [(float(acc[o]), o)]; lim = CMAX * 60
    while hq:
        d, u = heapq.heappop(hq)
        if u in done or d > dist[u]: continue
        if d > lim: break
        done.add(u)
        for v, w in adj[u]:
            nd = d + w * f
            if nd < dist.get(v, math.inf): dist[v] = nd; heapq.heappush(hq, (nd, v))
    return np.array([dist[j] + acc[j] if j in done else math.inf for j in range(C)])

def nbsum(a):
    a = np.asarray(a); out = a.copy()
    for i in range(C):
        for k in range(6):
            j = NB[i * 6 + k]
            if j >= 0: out[i] += a[j]
    return out

def pot(name):
    d = [x for x in V["ind"] if x["nm"] == name and x["paint"]]
    if not d: return None
    d = d[0]; v = np.zeros(C); dom = np.zeros(C, bool)
    for i in range(C):
        s = 0.0; dom[i] = F[i * 4 + 3] / 1000 >= d["lo"][3]
        for j in range(4):
            x = F[i * 4 + j] / 1000
            if x < d["lo"][j]: x = d["lo"][j]
            elif x > d["hi"][j]: x = d["hi"][j]
            s += d["b"][j] * (x - d["mu"][j])
        v[i] = s
    return v, dom

def candidates(t, base, mode, mins, prof=True, comp=-1, sort=None, T=None, per="day"):
    ty = [x for x in K["types"] if x["t"] == t][0]; B = ty["band"]
    T = times(mode, base, per) if T is None else T
    cntw = nbsum(K["cnt"][t]); P = pot(ty["pot"]) if ty["pot"] else None
    sort = sort or ("pot" if P is not None else "res")
    lim = mins * 60; reach = T <= lim
    tilt = np.array([(F[i * 4] - F[i * 4 + 1]) / 1000 for i in range(C)]); n3 = np.array(N300)
    okp = np.ones(C, bool) if not prof else (n3 >= B["n300"][0]) & (n3 <= B["n300"][2]) & (tilt >= B["tilt"][0]) & (tilt <= B["tilt"][2])
    okc = np.ones(C, bool) if comp < 0 else cntw <= comp
    pool = [i for i in range(C) if reach[i] and okp[i] and okc[i]]
    def key(i):
        if sort == "pot": pk = (-P[0][i] if P[1][i] else math.inf,)
        elif sort == "res": pk = (-F[i * 4],)
        elif sort == "few": pk = (cntw[i],)
        else: pk = ()
        return pk + (T[i], i)
    pool.sort(key=key)
    sep2 = (700 / math.cos(37.55 * math.pi / 180)) ** 2; X, Y = V["x"], V["y"]; out = []
    for c in pool:                                       # 먼저 뽑힌 후보에서 땅 위 0.7km(3857 거리로 환산) 안이면 건너뜀
        if len(out) >= 20: break
        if any((X[c] - X[p]) ** 2 + (Y[c] - Y[p]) ** 2 < sep2 for p in out): continue
        out.append(c)
    return {"list": out, "reach": int(reach.sum()), "prof": int((reach & okp).sum()), "comp": int((reach & okp & okc).sum()), "sort": sort,
            "segs": sum(1 for i in range(C) if reach[i] for k in range(6) if not (NB[i * 6 + k] >= 0 and reach[NB[i * 6 + k]]))}

def edge_order_check():
    # 이웃 k가 꼭짓점 k → k+1 변 건너편인지: 변 가운데 ≈ 두 칸 중심의 가운데
    x, y, off = V["x"], V["y"], V["off"]; worst = 0.0
    for i in range(C):
        for k in range(6):
            j = NB[i * 6 + k]
            if j < 0: continue
            k2 = (k + 1) % 6
            mx = x[i] + (off[i * 12 + k] + off[i * 12 + k2]) / 2; my = y[i] + (off[i * 12 + 6 + k] + off[i * 12 + 6 + k2]) / 2
            worst = max(worst, math.hypot(mx - (x[i] + x[j]) / 2, my - (y[i] + y[j]) / 2))
    return worst
