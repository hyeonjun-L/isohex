/// <reference types="node" />
// 이동 시간 — 예전 뷰어(viewer/template.html)의 이동 시간 함수(cGraph·cPt·cDijkstra·cRaw·cTimes)를 그 파일에서 꺼내 돌리고,
// src/core/travel이 같은 그래프를 만들고 칸마다 같은 시간(초)을 내는지 견준다. 둘 다 내보낸 graph/mv.json(예전 VD.mv와 같은 것)을 읽는다
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { b64i16, b64u16, b64u8 } from '../src/core/travel/decode'
import { buildGraphs, type Csr, type MvData, type Period } from '../src/core/travel/graph'
import { MAX_MIN, cellsWithin, countWithin, timeText, travelTimes, type Mode } from '../src/core/travel/times'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const mv = read<MvData>('graph/mv.json')
const N = mv.meta.cells

const SRC = readFileSync(new URL('../../viewer/template.html', import.meta.url), 'utf8').split('\n')
/** 'function 이름(' 줄부터 중괄호가 닫힐 때까지 */
function grab(name: string): string {
  const i = SRC.findIndex((l) => l.startsWith(`function ${name}(`))
  if (i < 0) throw new Error(`옛 뷰어에 ${name}이 없다`)
  let depth = 0
  const out: string[] = []
  for (let j = i; j < SRC.length; j++) {
    out.push(SRC[j])
    for (const ch of SRC[j].replace(/\/\/[^"']*$/, '')) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth === 0) break
  }
  return out.join('\n')
}
/** 이 글자로 시작하는 한 줄 (옛 뷰어 맨 위의 변수) */
function line(start: string): string {
  const l = SRC.find((s) => s.startsWith(start))
  if (l === undefined) throw new Error(`옛 뷰어에 '${start}'로 시작하는 줄이 없다`)
  return l
}

// 옛 코드가 바깥에서 받는 것은 VD.mv · 칸 수 N · atob뿐 — MV · NB6 · CMAX(60분) · CG는 옛 줄을 그대로 돌려 만든다
const OLD = ['b64u8', 'b64u16', 'b64i16', 'cEdges', 'cAdd', 'cCsr', 'cGraph', 'cPt', 'cDijkstra', 'cRaw', 'cTimes']
const ctx: Record<string, unknown> = { VD: { mv }, N, atob }
vm.createContext(ctx)
vm.runInContext([...OLD.map(grab), line('var MV='), line('var NB6='), line('var CMAX='), line('var CG=')].join('\n') + `\nthis.O = { ${OLD.join(', ')} }`, ctx)
const O = ctx.O as {
  b64u8(s: string): ArrayLike<number>
  b64u16(s: string): ArrayLike<number>
  b64i16(s: string): ArrayLike<number>
  cGraph(): { walk: Csr; car: Csr; bad: number }
  cPt(p: Period): Csr
  cTimes(mode: Mode, o: number, p: Period): ArrayLike<number>
}

const G = buildGraphs(mv)
const ORIGINS = [6570, 4172, 6346, 8266, 188] // 6570 = 서울시청
const PERIODS: Period[] = ['day', 'am', 'pm']

/** 두 배열에서 값이 다른 자리 수 (길이가 다르면 −1) */
function diffs(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return -1
  let c = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) c++
  return c
}

/** 그래프 둘이 마디 수·변 순서·무게까지 같은지 */
function sameGraph(a: Csr, b: Csr, what: string) {
  expect(a.n, what).toBe(b.n)
  expect(diffs(a.ptr, b.ptr), `${what} ptr`).toBe(0)
  expect(diffs(a.idx, b.idx), `${what} idx`).toBe(0)
  expect(diffs(a.w, b.w), `${what} w`).toBe(0)
}

/** 새 시간 vs 옛 시간 — 닿지 않는 칸(Infinity) 자리가 같고, 닿는 칸은 1e-6초 안에서 같아야 한다 */
function sameTimes(mode: Mode, o: number, p: Period) {
  const what = `${mode} ${p} 기준 칸 ${o}`
  const a = travelTimes(G, mode, o, p), b = O.cTimes(mode, o, p)
  expect(a.length, what).toBe(N)
  expect(b.length, what).toBe(N)
  let maxd = 0, inf = 0, odd = 0, reach = 0
  for (let i = 0; i < N; i++) {
    const x = a[i], y = b[i]
    if (Number.isNaN(x) || Number.isNaN(y) || x < 0 || y < 0) odd++ // NaN·음수는 어느 쪽에도 없어야
    else if ((x === Infinity) !== (y === Infinity)) inf++
    else if (x !== Infinity) {
      reach++
      maxd = Math.max(maxd, Math.abs(x - y))
    }
  }
  expect(odd, `${what} — NaN·음수`).toBe(0)
  expect(inf, `${what} — 닿음/안 닿음이 다른 칸`).toBe(0)
  expect(maxd, `${what} — 가장 큰 차이(초)`).toBeLessThan(1e-6)
  expect(a[o], what).toBe(0)
  expect(reach, what).toBeGreaterThan(1)
}

describe('이동 시간 — 옛 뷰어와 같은 값', () => {
  it('칸 순서가 웹 칸(cells.json)과 같다 — h3 목록의 sha1', () => {
    const h3 = read<{ h3: string[] }>('cells.json').h3
    expect(h3.length).toBe(N)
    expect(createHash('sha1').update(h3.join('\n')).digest('hex')).toBe(mv.meta.h3sha)
  })

  it('base64 풀기 — 바이트 · 16비트 · 부호 있는 16비트', () => {
    for (const s of [mv.nb, mv.car.t, mv.car.kl, mv.walk.t2, mv.walk.n2, mv.pt.tr, mv.bus!.rs, mv.bus!.rt.am]) {
      expect(diffs(b64u8(s), O.b64u8(s))).toBe(0)
      expect(diffs(b64u16(s), O.b64u16(s))).toBe(0)
      expect(diffs(b64i16(s), O.b64i16(s))).toBe(0)
    }
    const nb = b64i16(mv.nb)
    expect(nb.includes(-1) && nb.every((j) => j >= -1 && j < N)).toBe(true)
  })

  it('그래프 — 도보 · 자동차 · 대중교통(시간대 셋)의 마디 · 변 순서 · 무게가 같다', { timeout: 60_000 }, () => {
    const og = O.cGraph()
    expect(G.bad).toBe(0)
    expect(og.bad).toBe(0)
    sameGraph(G.walk, og.walk, '도보')
    sameGraph(G.car, og.car, '자동차')
    for (const p of PERIODS) sameGraph(G.pt(p), O.cPt(p), `대중교통 ${p}`)
  })

  it(`도보 — 기준 칸 ${ORIGINS.length}곳 (시간대와 상관없다)`, { timeout: 60_000 }, () => {
    for (const o of ORIGINS) {
      sameTimes('walk', o, 'day')
      expect(diffs(travelTimes(G, 'walk', o, 'pm'), travelTimes(G, 'walk', o, 'day'))).toBe(0)
    }
  })

  it(`자동차 — 기준 칸 ${ORIGINS.length}곳 × 시간대 3`, { timeout: 60_000 }, () => {
    for (const o of ORIGINS) for (const p of PERIODS) sameTimes('car', o, p)
  })

  it(`대중교통(지하철·버스) — 기준 칸 ${ORIGINS.length}곳 × 시간대 3`, { timeout: 60_000 }, () => {
    for (const o of ORIGINS) for (const p of PERIODS) sameTimes('pt', o, p)
  })

  it('서울시청(6570)에서 30분 안 칸 수 — 예전에 잰 값', { timeout: 60_000 }, () => {
    const n30 = (m: Mode, p: Period) => countWithin(travelTimes(G, m, 6570, p), 30)
    expect(n30('car', 'day')).toBe(3378)
    expect(n30('car', 'pm')).toBe(2745)
    expect(n30('pt', 'day')).toBe(544)
    expect(n30('pt', 'am')).toBe(698)
  })

  it('도움 함수 — 분 안 칸 · 시간 글자', () => {
    const T = travelTimes(G, 'car', 6570, 'day')
    const c = cellsWithin(T, 30)
    expect(c.length).toBe(countWithin(T, 30))
    expect(c.every((i, k) => T[i] <= 1800 && (k === 0 || c[k - 1] < i))).toBe(true)
    // 도착 칸의 걷는 시간은 60분을 자른 뒤에 더한다 — 3,600초를 넘는 값이 있다(옛 뷰어와 같음)
    expect(T.some((t) => Number.isFinite(t) && t > MAX_MIN * 60)).toBe(true)
    expect(countWithin(T, MAX_MIN)).toBeLessThan(T.filter(Number.isFinite).length)
    expect(timeText(0)).toBe('1분')
    expect(timeText(1800)).toBe('30분')
    expect(timeText(1800.5)).toBe('31분')
    expect(timeText(Infinity)).toBe('60분 넘음')
    expect(() => travelTimes(G, 'walk', N, 'day')).toThrow(RangeError)
  })
})
