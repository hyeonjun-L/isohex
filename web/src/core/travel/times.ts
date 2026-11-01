// 칸마다 기준 칸에서 걸리는 시간(초) — 예전 뷰어 cRaw·cTimes와 같은 뜻.
// · 칸 중심에서 길(역·정류소)까지 걷는 시간(acc)을 양 끝에 더한다. 그래프 안 시간이 60분을 넘는 칸은 Infinity.
//   60분은 시작 쪽 걷는 시간을 넣고 자른 뒤 도착 쪽 걷는 시간을 더하므로, 3,600초를 넘는 값도 나온다
// · 자동차: 시간대 배율은 길 위 시간에만 곱한다(걷는 시간은 그대로). 걸어가는 편이 빠른 칸은 걷는 시간을 쓴다
// · 대중교통: 칸 사이는 걷고, 역·정류소에서 기다렸다 탄다. 도보는 시간대와 상관없다
// · 기준 칸 자신은 0초
import { minutes } from '../format'
import { dijkstra } from './dijkstra'
import type { Period, TravelGraphs } from './graph'

export type { Period } from './graph'
export type Mode = 'walk' | 'car' | 'pt'

/** 이보다 오래 걸리는 칸은 '닿지 않음' (분) */
export const MAX_MIN = 60

/** 한 가지 수단으로만 — 기준 칸 o에서 칸마다 시간 (예전 뷰어 cRaw) */
function raw(g: TravelGraphs, mode: Mode, o: number, p: Period): Float64Array {
  const acc = mode === 'car' ? g.acc.car : g.acc.walk
  const gr = mode === 'pt' ? g.pt(p) : mode === 'car' ? g.car : g.walk
  const f = mode === 'car' ? g.carF[p] : 1
  const r = dijkstra(gr, o, acc[o], MAX_MIN * 60, f)
  const T = new Float64Array(g.cells)
  for (let j = 0; j < g.cells; j++) T[j] = r.done[j] ? r.dist[j] + acc[j] : Infinity
  return T
}

/** 기준 칸 origin에서 칸마다 걸리는 시간(초, 닿지 않으면 Infinity) — 예전 뷰어 cTimes */
export function travelTimes(g: TravelGraphs, mode: Mode, origin: number, period: Period = 'day'): Float64Array {
  if (!(Number.isInteger(origin) && origin >= 0 && origin < g.cells)) throw new RangeError(`없는 칸 번호: ${origin}`)
  const T = raw(g, mode, origin, period)
  if (mode === 'car') {
    const W = raw(g, 'walk', origin, period)
    for (let j = 0; j < g.cells; j++) if (W[j] < T[j]) T[j] = W[j]
  }
  T[origin] = 0
  return T
}

/** 정한 분 안(시간 ≤ 분×60초)에 닿는 칸 수 — 예전 뷰어의 '○분 안 칸' */
export function countWithin(T: ArrayLike<number>, min: number): number {
  const lim = min * 60
  let c = 0
  for (let i = 0; i < T.length; i++) if (T[i] <= lim) c++
  return c
}

/** 정한 분 안에 닿는 칸 번호 (작은 번호부터) */
export function cellsWithin(T: ArrayLike<number>, min: number): number[] {
  const lim = min * 60, out: number[] = []
  for (let i = 0; i < T.length; i++) if (T[i] <= lim) out.push(i)
  return out
}

/** 시간 → '23분' · 닿지 않으면 '60분 넘음' (예전 뷰어 칸 정보의 큰 글자) */
export function timeText(t: number): string {
  return Number.isFinite(t) ? minutes(t) : `${MAX_MIN}분 넘음`
}
