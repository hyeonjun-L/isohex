// 이동 그래프 만들기 — graph/mv.json(예전 뷰어의 VD.mv)에서 도보·자동차·대중교통 그래프를 만든다 (예전 뷰어 cGraph·cPt).
// 마디 번호: 0 ~ 칸 수−1은 격자 칸이고, 그 뒤에 자동차 교차점, 또는 역(들어감·나옴)·역×노선·정류소(탐·내림)·정류소×노선 자리가 붙는다.
// 나가는 변은 CSR로 싼다 — 마디 u의 변은 idx·w의 ptr[u]부터 ptr[u+1] 앞까지. 변을 넣는 순서도 예전 뷰어와 같다
import { b64i16, b64u16, b64u8 } from './decode'

/** 시간대 — 평일 낮(10~16시) · 출근(7~9시) · 퇴근(18~20시) */
export type Period = 'day' | 'am' | 'pm'

/** 16비트 배열의 표시 — 시간 배열에서는 '변 없음', 버스 운행 구간에서는 '노선 시작' */
export const NONE = 65535

/** graph/mv.json — 예전 뷰어 VD.mv와 같은 모양 (pipeline/export_web.py가 쓴다). 글자로 된 배열은 16비트 리틀엔디언 base64 */
export interface MvData {
  meta: {
    cells: number
    /** 칸 순서 확인용 — h3 목록을 줄바꿈으로 이은 글자의 sha1 */
    h3sha: string
    /** 역에 들어가고 나오는 데 더하는 초 */
    entry_s: number
    /** 자동차 시간대 배율 — 길 위 시간에만 곱한다 */
    car_f: Record<Period, number>
    [k: string]: unknown
  }
  /** 칸마다 여섯 이웃 (테두리 순서, −1 = 없음) · int16 */
  nb: string
  car: {
    /** 칸 → 여섯 이웃 칸 시간(초, 65535 = 없음) */
    t: string
    /** 칸 중심 ↔ 길 걷는 시간(초) */
    acc: string
    /** 교차점 수 */
    nk: number
    /** 교차점 → 교차점 [앞, 뒤, 초]… */
    kl: string
    /** 칸 → 교차점 [칸, 교차점, 초]… */
    ckf: string
    /** 교차점 → 칸 [칸, 교차점, 초]… */
    ckr: string
  }
  walk: {
    /** 칸 → 여섯 이웃 칸 걷는 시간(초, 65535 = 없음) */
    t: string
    /** 칸 → 두 겹째 이웃(번호 순) 걷는 시간 — 칸마다 n2개씩 이어 붙였다 (65535 = 없음) */
    t2: string
    /** 칸마다 두 겹째 이웃 수 · uint8 */
    n2: string
    /** 칸 중심 ↔ 길 걷는 시간(초) */
    acc: string
  }
  pt: {
    /** 역 [x, y (EPSG:3857), 이름] */
    st: [number, number, string][]
    /** 노선 — 배차(분): h 낮 · h_am 출근 · h_pm 퇴근 */
    lines: { k: string; v: number; h: number; h_am: number; h_pm: number }[]
    /** 역×노선 자리 [역, 노선]… */
    sl: number[]
    /** 열차 운행 [앞 자리, 뒤 자리, 초]… */
    ride: string
    /** 칸 → 역 [칸, 역, 칸 중심에서 걷는 초]… */
    acc: string
    /** 갈아타기 [앞 자리, 뒤 자리, 걷는 초, 종류(0 걸어서 · 1 줄기 → 갈래 · 2 같은 열차)]… */
    tr: string
  }
  bus?: {
    /** 정류소 수 */
    n: number
    /** 노선별 배차(분) — 0이면 그 시간대에 안 다닌다 */
    h: Record<Period, number[]>
    /** 정류소×노선 자리 [정류소, 노선]… (노선마다 정류소 순번 순서) */
    rs: string
    /** 자리마다 바로 앞 자리에서 오는 운행 초 (65535 = 노선 시작) */
    rt: Record<Period, string>
    /** 칸 → 정류소 [칸, 정류소, 칸 중심에서 걷는 초]… */
    acc: string
    /** 버스 기다림 상한(초) */
    wmax: number
    meta?: Record<string, unknown>
  }
}

/** CSR 그래프 — 마디 n개. 마디 u에서 나가는 변은 e = ptr[u] … ptr[u+1]−1, 도착 idx[e] · 무게 w[e](초) */
export interface Csr {
  n: number
  ptr: Int32Array
  idx: Int32Array
  w: Float64Array
}

export interface TravelGraphs {
  /** 격자 칸 수 */
  cells: number
  /** 칸마다 여섯 이웃 (−1 = 없음) */
  nb: Int16Array
  walk: Csr
  car: Csr
  /** 칸 중심 ↔ 길까지 걷는 시간(초) — 도보·대중교통은 walk, 자동차는 car */
  acc: { walk: Uint16Array; car: Uint16Array }
  /** 자동차 시간대 배율 */
  carF: Record<Period, number>
  /** 두 겹째 이웃 수가 자료와 맞지 않아 두 겹 변을 뺀 칸 수 (0이어야 정상) */
  bad: number
  /** 대중교통 그래프 — 시간대마다 처음 부를 때 만들어 둔다 */
  pt(p: Period): Csr
}

/** 변 목록 — 넣는 순서대로 쌓는다 (출발 · 도착 · 무게) */
class Edges {
  f: Int32Array
  t: Int32Array
  w: Float64Array
  m = 0
  constructor(cap: number) {
    this.f = new Int32Array(cap)
    this.t = new Int32Array(cap)
    this.w = new Float64Array(cap)
  }
  add(f: number, t: number, w: number): void {
    if (this.m === this.f.length) this.grow()
    this.f[this.m] = f
    this.t[this.m] = t
    this.w[this.m] = w
    this.m++
  }
  /** 다른 목록을 순서대로 이어 붙인다 */
  addAll(e: Edges): void {
    for (let k = 0; k < e.m; k++) this.add(e.f[k], e.t[k], e.w[k])
  }
  private grow(): void {
    const cap = this.f.length * 2 + 1024
    const f = new Int32Array(cap), t = new Int32Array(cap), w = new Float64Array(cap)
    f.set(this.f)
    t.set(this.t)
    w.set(this.w)
    this.f = f
    this.t = t
    this.w = w
  }
}

/** 변 목록 → CSR. 한 마디 안의 변 순서는 넣은 순서 그대로 (예전 뷰어 cCsr) */
function toCsr(n: number, e: Edges): Csr {
  const m = e.m, ptr = new Int32Array(n + 1)
  for (let i = 0; i < m; i++) ptr[e.f[i] + 1]++
  for (let i = 0; i < n; i++) ptr[i + 1] += ptr[i]
  const pos = ptr.slice(0, n), idx = new Int32Array(m), w = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    const q = pos[e.f[i]]++
    idx[q] = e.t[i]
    w[q] = e.w[i]
  }
  return { n, ptr, idx, w }
}

/** 도보 — 이웃 한 겹 + 두 겹. 두 겹째 이웃은 p23과 같은 규칙(번호 순)으로 다시 찾아 시간 배열(t2)과 맞춘다 */
function walkEdges(mv: MvData, nb: Int16Array, C: number): { e: Edges; bad: number } {
  const t1 = b64u16(mv.walk.t), t2 = b64u16(mv.walk.t2), n2 = b64u8(mv.walk.n2)
  const e = new Edges(C * 18)
  const stamp = new Int32Array(C) // 이번 칸에서 이미 본 칸 = i+1
  const r1: number[] = [], r2: number[] = []
  let q = 0, bad = 0
  for (let i = 0; i < C; i++) {
    r1.length = 0
    r2.length = 0
    stamp[i] = i + 1
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k]
      if (j < 0) continue
      r1.push(j)
      stamp[j] = i + 1
      const w = t1[i * 6 + k]
      if (w < NONE) e.add(i, j, w)
    }
    for (const u of r1) {
      for (let k = 0; k < 6; k++) {
        const j = nb[u * 6 + k]
        if (j >= 0 && stamp[j] !== i + 1) {
          stamp[j] = i + 1
          r2.push(j)
        }
      }
    }
    r2.sort((x, y) => x - y)
    if (r2.length === n2[i]) {
      for (let k = 0; k < r2.length; k++) {
        const w = t2[q + k]
        if (w < NONE) e.add(i, r2[k], w)
      }
    } else bad++
    q += n2[i]
  }
  return { e, bad }
}

/** 자동차 — 이웃 칸 + 칸 → 교차점 · 교차점 → 칸 + 교차점끼리 (도시고속도로·간선·보조간선을 줄인 망). 교차점 k는 마디 C+k */
function carEdges(mv: MvData, nb: Int16Array, C: number): Edges {
  const t = b64u16(mv.car.t), ckf = b64u16(mv.car.ckf), ckr = b64u16(mv.car.ckr), kl = b64u16(mv.car.kl)
  const e = new Edges(C * 6 + (ckf.length + ckr.length + kl.length) / 3)
  for (let i = 0; i < C; i++) {
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k], w = t[i * 6 + k]
      if (j >= 0 && w < NONE) e.add(i, j, w)
    }
  }
  for (let k = 0; k < ckf.length; k += 3) e.add(ckf[k], C + ckf[k + 1], ckf[k + 2])
  for (let k = 0; k < ckr.length; k += 3) e.add(C + ckr[k + 1], ckr[k], ckr[k + 2])
  for (let k = 0; k < kl.length; k += 3) e.add(C + kl[k], C + kl[k + 1], kl[k + 2])
  return e
}

/**
 * 대중교통 (시간대 p) — 칸(도보 변 그대로) · 역 들어감 · 역 나옴 · 역×노선 · 정류소 탐 · 정류소 내림 · 정류소×노선 자리.
 * 기다림 = 그 시간대 배차의 절반(분 × 30초). 버스 기다림은 wmax(15분)까지, 배차 0인 노선은 그 시간대에 못 탄다.
 * 지하철 갈아타기 종류 0: 걷기 + 갈아탈 노선 배차의 절반 · 1(줄기 → 이어 달리는 갈래): (갈래 배차 − 줄기 배차) ÷ 2 · 2: 0.
 * 버스끼리는 같은 정류소에서 내림 → 다른 노선 기다림. 버스 ↔ 지하철·다른 정류소는 칸을 거쳐 걸어서
 */
function ptCsr(mv: MvData, we: Edges, walkAcc: Uint16Array, C: number, p: Period): Csr {
  const P = mv.pt, K = P.st.length, S = P.sl.length / 2, ENT = mv.meta.entry_s
  const oIn = C, oOut = C + K, oSl = C + 2 * K
  let n = C + 2 * K + S
  const hk = p === 'day' ? 'h' : p === 'am' ? 'h_am' : 'h_pm'
  const hl = (s: number) => P.lines[P.sl[2 * s + 1]][hk] // 자리 s 노선의 배차(분)
  const e = new Edges(we.m * 4) // 크기는 어림 — 모자라면 저절로 늘어난다
  e.addAll(we)
  let a = b64u16(P.acc)
  for (let k = 0; k < a.length; k += 3) {
    const w = Math.max(0, a[k + 2] - walkAcc[a[k]]) // 칸 중심 → 길 걷는 시간은 양 끝에서 따로 더하므로 뺀다
    e.add(a[k], oIn + a[k + 1], w + ENT)
    e.add(oOut + a[k + 1], a[k], w + ENT)
  }
  for (let s = 0; s < S; s++) {
    const cx = P.sl[2 * s]
    e.add(oIn + cx, oSl + s, hl(s) * 30)
    e.add(oSl + s, oOut + cx, 0)
  }
  a = b64u16(P.tr)
  for (let k = 0; k < a.length; k += 4) {
    const kd = a[k + 3]
    e.add(oSl + a[k], oSl + a[k + 1], kd === 0 ? a[k + 2] + hl(a[k + 1]) * 30 : kd === 1 ? Math.max(0, hl(a[k + 1]) - hl(a[k])) * 30 : 0)
  }
  a = b64u16(P.ride)
  for (let k = 0; k < a.length; k += 3) e.add(oSl + a[k], oSl + a[k + 1], a[k + 2])
  const B = mv.bus
  if (B) {
    const NS = B.n, rs = b64u16(B.rs), R = rs.length / 2, rt = b64u16(B.rt[p]), hh = B.h[p]
    const oBi = n, oBo = n + NS, oRs = n + 2 * NS
    a = b64u16(B.acc)
    for (let k = 0; k < a.length; k += 3) {
      const w = Math.max(0, a[k + 2] - walkAcc[a[k]])
      e.add(a[k], oBi + a[k + 1], w)
      e.add(oBo + a[k + 1], a[k], w)
    }
    for (let s = 0; s < R; s++) {
      const st = rs[2 * s], h = hh[rs[2 * s + 1]]
      if (h > 0) {
        const wt = Math.min(h * 30, B.wmax) // 소수 배차(예: 8.3분)는 30을 곱해도 정수가 아니다 — 그대로 둔다
        e.add(oBi + st, oRs + s, wt)
        e.add(oBo + st, oRs + s, wt)
      }
      e.add(oRs + s, oBo + st, 0)
      if (s > 0 && rt[s] !== NONE) e.add(oRs + s - 1, oRs + s, rt[s]) // 운행 구간은 늘 바로 앞 자리 → 이 자리
    }
    n += 2 * NS + R
  }
  return toCsr(n, e)
}

/** graph/mv.json → 도보·자동차 그래프(바로) + 대중교통 그래프(시간대마다 처음 쓸 때) */
export function buildGraphs(mv: MvData): TravelGraphs {
  const C = mv.meta.cells
  const nb = b64i16(mv.nb)
  if (nb.length !== C * 6) throw new Error(`이웃 배열 길이가 칸 수와 맞지 않습니다 (${nb.length} ≠ ${C}×6)`)
  const walkAcc = b64u16(mv.walk.acc)
  const { e: we, bad } = walkEdges(mv, nb, C)
  const cache = new Map<Period, Csr>()
  return {
    cells: C,
    nb,
    walk: toCsr(C, we),
    car: toCsr(C + mv.car.nk, carEdges(mv, nb, C)),
    acc: { walk: walkAcc, car: b64u16(mv.car.acc) },
    carF: { ...mv.meta.car_f },
    bad,
    pt(p: Period): Csr {
      let g = cache.get(p)
      if (!g) {
        g = ptCsr(mv, we, walkAcc, C, p)
        cache.set(p, g)
      }
      return g
    },
  }
}
