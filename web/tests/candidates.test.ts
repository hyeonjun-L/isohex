/// <reference types="node" />
// 후보 찾기 — 예전 뷰어(viewer/template.html)의 cRun(거르기·순서·띄우기·깔때기) · cDraw(등시선 경계 변) · candInfo(왜 들었나/빠졌나) ·
// cSparse·cNbSum · cResUp·cPotUp를 그 파일에서 꺼내 돌리고, src/core/candidates가 같은 목록·깔때기·칸마다 값·문장을 내는지 견준다.
// 옛 코드에 넣는 칸 값은 내보낸 자료로 만든다 — 거주 접근성 자리(F[i×4])에 −주민 순위, 출근·등교 자리에 그 값 − 주택가 정도.
// 이렇게 두면 옛 코드의 '거주 접근성 큰 순'과 (F0 − F1) ÷ 1000이 진짜 옛 값과 같다.
// 진짜 옛 자료(viewer_data.json의 접근성·좌표)로 견준 것은 2026-11-01 한 번(4,158가지 모두 같음, 마스터플랜 P3) — 그 결과 일부를 '진짜 옛 결과'에 박았다.
// 자료 판이 바뀌면 그 숫자는 다시 낸다
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { cellToBoundary } from 'h3-js'
import { describe, expect, it } from 'vitest'
import * as C from '../src/core/candidates'
import { cellCenters, edgeLines } from '../src/core/grid'
import type { SiteData } from '../src/core/site'
import { buildGraphs, type MvData, type Period } from '../src/core/travel/graph'
import { travelTimes, type Mode } from '../src/core/travel/times'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[]; dong: number[] }>('cells.json')
const nb = read<number[]>('grid/nb.json')
const cd = read<C.CandData>('cand/index.json')
const site = read<SiteData>('grid/site.json')
const mv = read<MvData>('graph/mv.json')
const inds = read<{ k: string; nm: string; paint: boolean }[]>('ind/index.json')
const N = cells.h3.length
const grid = C.candGrid(cells, site, nb)
const TC = Object.fromEntries(cd.types.map((t) => [t.t, C.typeCounts(cd, t.t, nb, N)]))
const G = buildGraphs(mv)

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

const noop = () => {}
interface El {
  cls: string | null
  txt: string | null
  kids: El[]
  appendChild(c: El): El
  classList: { add(): void }
}
const el = (_tag: string, cls: string | null, txt: string | null): El => ({
  cls,
  txt,
  kids: [],
  appendChild(c) {
    this.kids.push(c)
    return c
  },
  classList: { add: noop },
})

// ── 옛 코드: 거르기·순서·띄우기(cRun)와 왜(candInfo). 화면·지도·저장은 비워 둔다
const F = new Int32Array(N * 4)
for (let i = 0; i < N; i++) {
  F[i * 4] = -site.rr[i]
  F[i * 4 + 1] = -site.rr[i] - site.tilt[i]
}
const TIMES = new Map<string, Float64Array>()
const ctx: Record<string, unknown> = {
  N, F, NB6: Int32Array.from(nb), mode: 'cand',
  VD: { n300: cells.n300, x: grid.x, y: grid.y, cand: { types: cd.types, cnt: cd.cnt, un: cd.un, meta: cd.meta } },
  document: { getElementById: (id: string) => (id === 'tt' ? { hidden: true } : { dataset: {} }) },
  hideTT: noop, cBaseText: noop, cDraw: noop, cLegend: noop, cFoot: noop, cInfo: noop, cList: noop, cSave: noop,
  el, rows: () => el('div', 'rows', null), cFacts: () => [], cPlace: () => '',
  cTimes: (m: string, o: number, p: string) => TIMES.get(`${m}|${o}|${p}`),
}
const OLD = ['cSparse', 'cNbSum', 'cTypeOf', 'cSetType', 'cRun', 'candInfo', 'cMin', 'comma', 'cResUp', 'cPotUp']
vm.createContext(ctx)
vm.runInContext(
  [line('var MV='), line('var CMAX='), line('var MODE_NM='), line('var SORT_NM='), line('var cand='), line('var CT='), line('var CCNT='), ...OLD.map(grab)].join('\n') +
    `
this.run = function (t, o, m, p, min, prof, comp, sort, pot) {
  if (!CTYPE || CTYPE.t !== t) cSetType(t)
  CPOT = pot || null
  cand.base = { cell: o }; cand.mode = m; cand.per = p; cand.min = min; cand.prof = prof; cand.comp = comp; cand.sort = sort
  cRun()
  return { list: CLIST.slice(), stat: CSTAT, band: CBAND, pass: CPASS, rank: CRANK, skip: CSKIP, cnt: CCNT, cntw: CCNTW, un: CUN, unw: CUNW }
}
this.why = function (i) { var b = candInfo(i); for (var k = 0; k < b.kids.length; k++) if (b.kids[k].cls === 'msg') return b.kids[k].txt; return null }
this.O = { cResUp: cResUp, cPotUp: cPotUp, CN: CN, CSEP2: CSEP2, TB: TB, CELL_KM2: CELL_KM2 }`,
  ctx,
)
interface OldRun {
  list: number[]
  stat: C.CandStat
  band: Int8Array
  pass: Uint8Array
  rank: Int16Array
  skip: Uint8Array
  cnt: Int32Array
  cntw: Int32Array
  un: Int32Array
  unw: Int32Array
}
interface OldPot {
  d: { nm: string }
  v: Float64Array
  dom: Uint8Array
  srt: Float64Array
}
const run = ctx.run as (t: string, o: number, m: Mode, p: Period, min: number, prof: boolean, comp: number, sort: C.SortKey, pot?: OldPot) => OldRun
const why = ctx.why as (i: number) => string | null
const O = ctx.O as { cResUp(i: number): number; cPotUp(P: OldPot, v: number): number; CN: number; CSEP2: number; TB: number[]; CELL_KM2: number }

// ── 옛 cDraw: 좌표에 칸 번호와 꼭짓점 번호를 심어(x = 칸×8 + 꼭짓점) 그린 선에서 (칸, 변)을 되읽는다
interface Src {
  f: unknown
  clear(): void
  addFeature(f: unknown): void
}
const isoSrc: Src = {
  f: null,
  clear() {
    this.f = null
  },
  addFeature(f) {
    this.f = f
  },
}
const dctx: Record<string, unknown> = {
  N, NB6: Int32Array.from(nb), map: {}, gridLayer: { changed: noop }, CLIST: [], CT: null,
  cand: { min: 30, base: { x: 0, y: 0 } },
  VD: {
    x: Float64Array.from({ length: N }, (_, i) => i * 8),
    y: new Float64Array(N),
    off: Float64Array.from({ length: N * 12 }, (_, q) => (q % 12 < 6 ? q % 12 : 0)),
  },
  isoSrc,
  baseSrc: { clear: noop, addFeature: noop },
  candSrc: { clear: noop, addFeature: noop },
  ol: {
    Feature: function (this: { g: unknown; set: () => void }, g: unknown) { this.g = g; this.set = noop },
    geom: { MultiLineString: function (this: { s: unknown }, s: unknown) { this.s = s }, Point: function () {} },
  },
  document: { getElementById: () => ({ dataset: {} }) },
}
vm.createContext(dctx)
vm.runInContext(grab('cDraw'), dctx)
/** 옛 cDraw가 그은 변 — i×6 + k */
function oldEdges(T: Float64Array, min: number): number[] {
  dctx.CT = T
  ;(dctx.cand as { min: number }).min = min
  vm.runInContext('cDraw()', dctx)
  const f = isoSrc.f as { g: { s: number[][][] } } | null
  if (!f) return []
  return f.g.s.map(([[x1], [x2]]) => {
    const i = Math.floor(x1 / 8), k = x1 % 8
    expect(Math.floor(x2 / 8)).toBe(i)
    expect(x2 % 8).toBe((k + 1) % 6)
    return i * 6 + k
  })
}

/** 두 배열에서 값이 다른 자리 수 */
function diffs(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return -1
  let c = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) c++
  return c
}

// 같은 씨앗이면 같은 수 — 시험이 매번 같은 경우를 본다
let seed = 20261101
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]

const ORIGINS = [6570, 4172, 188] // 6570 = 서울시청(소공동)
const MP: [Mode, Period][] = [['car', 'day'], ['car', 'pm'], ['pt', 'am'], ['walk', 'day']]
for (const o of ORIGINS) for (const [m, p] of MP) TIMES.set(`${m}|${o}|${p}`, travelTimes(G, m, o, p))

// 매출 수준 순 — 칠한 업종 하나의 값을 넣어 본다 (무인 6종에는 쓰지 않지만 계산은 옮겨 둔다)
const potInd = inds.find((d) => d.paint)!
const potV = read<{ v: (number | null)[] }>(`ind/${potInd.k}.json`).v
const oldPot: OldPot = {
  d: { nm: potInd.nm },
  v: Float64Array.from(potV, (x) => x ?? 0),
  dom: Uint8Array.from(potV, (x) => (x == null ? 0 : 1)),
  srt: Float64Array.from(potV.filter((x): x is number => x != null)).sort(),
}

describe('후보 찾기 — 옛 뷰어와 같은 결과', () => {
  it('상수', () => {
    expect(C.CN).toBe(O.CN)
    expect(C.SEP2).toBe(O.CSEP2)
    expect([...C.TIME_BANDS]).toEqual([...O.TB])
    expect(C.CELL_KM2).toBe(O.CELL_KM2)
  })

  it('같은 업종·명단의 무인 — 칸마다, 이웃 포함', () => {
    for (const t of cd.types) {
      const old = run(t.t, 6570, 'car', 'day', 30, true, -1, 'res')
      expect(diffs(TC[t.t].cnt, old.cnt), t.t).toBe(0)
      expect(diffs(TC[t.t].cntw, old.cntw), t.t).toBe(0)
      expect(diffs(TC[t.t].un, old.un), t.t).toBe(0)
      expect(diffs(TC[t.t].unw, old.unw), t.t).toBe(0)
      let total = 0
      for (let i = 0; i < N; i++) total += TC[t.t].cnt[i]
      expect(total, `${t.t} 같은 업종 합`).toBe(t.cnt_total)
    }
  })

  it('목록·깔때기·칸마다 시간 띠·통과·순번·건너뜀·왜 — 기준점 3 × 수단·시간대 4 × 조건 바꿔 가며', () => {
    let runs = 0, whys = 0
    for (const o of ORIGINS) for (const [m, p] of MP) {
      const T = TIMES.get(`${m}|${o}|${p}`)!
      const combos: [string, number, boolean, number, C.SortKey, boolean][] = cd.types.map((t) => [t.t, 30, true, -1, 'res', false])
      for (let c = 0; c < 18; c++) combos.push([pick(cd.types).t, pick([10, 15, 20, 30, 45, 60]), rnd() < 0.75, pick([-1, -1, 0, 2, 5, 10, 20]), pick(['res', 'few', 'near'] as const), false])
      for (let c = 0; c < 2; c++) combos.push([pick(cd.types).t, pick([20, 30, 45]), rnd() < 0.5, pick([-1, 5]), 'pot', true])
      for (const [t, min, prof, comp, sort, usePot] of combos) {
        const what = `${t} · 기준 칸 ${o} · ${m} ${p} ${min}분 · 자리 ${prof} · 같은 업종 ${comp} · ${sort}`
        const old = run(t, o, m, p, min, prof, comp, sort, usePot ? oldPot : undefined)
        const ty = cd.types.find((x) => x.t === t)!
        const q: C.CandQuery = { times: T, min, site: prof ? ty.band : null, comp, cntw: TC[t].cntw, sort, pot: usePot ? potV : null }
        const r = C.findCandidates(grid, q)
        runs++
        expect(r.list, what).toEqual(old.list)
        expect(r.stat, what).toEqual(old.stat)
        expect(diffs(r.tband, old.band), `${what} 시간 띠`).toBe(0)
        expect(diffs(r.pass, old.pass), `${what} 통과`).toBe(0)
        expect(diffs(r.rank, old.rank), `${what} 순번`).toBe(0)
        expect(diffs(r.skip, old.skip), `${what} 건너뜀`).toBe(0)
        if (sort === 'pot') continue // 순서 이름만 다르다 ('매출 잠재' → '매출 수준')
        const look = [...r.list]
        for (let i = 0, s = 0; i < N && s < 5; i++) if (r.skip[i]) (look.push(i), s++)
        for (let k = 0; k < 10; k++) look.push(Math.floor(rnd() * N))
        for (const i of look) {
          expect(C.whyText(i, grid, q, r), `${what} 칸 ${i}`).toBe(why(i))
          whys++
        }
      }
    }
    expect(runs).toBe(ORIGINS.length * MP.length * 26)
    expect(whys).toBeGreaterThan(5000)
  }, 60_000)

  it('등시선 테두리 변 — 시간 5가지', () => {
    for (const o of ORIGINS) for (const [m, p] of MP) {
      const T = TIMES.get(`${m}|${o}|${p}`)!
      for (const min of [10, 20, 30, 45, 60]) expect(Array.from(C.isoEdges(T, min, nb)), `${o} ${m} ${p} ${min}분`).toEqual(oldEdges(T, min))
    }
  })

  it('주민 순위 몫·매출 수준 몫', () => {
    for (let i = 0; i < N; i++) expect(C.resUp(grid, i)).toBe(O.cResUp(i))
    for (const v of [-Infinity, -1e9, ...Array.from(oldPot.srt.filter((_, k) => k % 97 === 0)), 0, 1e9]) expect(C.fracAbove(oldPot.srt, v)).toBe(O.cPotUp(oldPot, v))
    expect(C.fracAbove([], 3)).toBe(0)
  })
})

describe('후보 찾기 — 진짜 옛 결과 (2026-11-01, 판 v2-20261025 · p24 다시 낸 범위)', () => {
  it('시청 · 자동차 평일 낮 30분 · 빨래방 · 주민 순', () => {
    const r = C.findCandidates(grid, { times: TIMES.get('car|6570|day')!, min: 30, site: cd.types.find((t) => t.t === '빨래방')!.band, comp: -1, cntw: TC['빨래방'].cntw, sort: 'res' })
    expect(r.stat).toEqual({ reach: 3378, prof: 1157, comp: 1157, picked: 20, potNA: 0 })
    expect(r.list.slice(0, 5)).toEqual([2263, 6892, 6716, 6869, 2036]) // 행당2동 · 신대방2동 · 신길6동 · 은천동 · 답십리2동
  })
  it('시청 · 대중교통 출근 30분 · 카페 · 주민 순', () => {
    const r = C.findCandidates(grid, { times: TIMES.get('pt|6570|am')!, min: 30, site: cd.types.find((t) => t.t === '카페')!.band, comp: -1, cntw: TC['카페'].cntw, sort: 'res' })
    expect(r.stat).toEqual({ reach: 698, prof: 216, comp: 216, picked: 20, potNA: 0 })
    expect(r.list.slice(0, 5)).toEqual([2263, 6412, 2281, 2234, 6430])
  })
  it('칸 중심 — 예전 뷰어의 EPSG:3857 정수', () => {
    const { x, y } = cellCenters(cells.h3)
    expect([x[0], y[0], x[6570], y[6570], x[8321], y[8321]]).toEqual([14127332, 4499791, 14134930, 4518195, 14121609, 4514875])
  })
})

describe('칸 변과 이웃', () => {
  it('이웃 k는 꼭짓점 k → k+1 변 건너편 (h3-js 경계 순서)', () => {
    let shared = 0
    for (let i = 0; i < N; i++) {
      const b = cellToBoundary(cells.h3[i]).map((v) => v.join(','))
      for (let k = 0; k < 6; k++) {
        const j = nb[i * 6 + k]
        if (j < 0) continue
        const bj = new Set(cellToBoundary(cells.h3[j]).map((v) => v.join(',')))
        expect(bj.has(b[k]) && bj.has(b[(k + 1) % 6]), `칸 ${i} 변 ${k}`).toBe(true)
        shared++
      }
    }
    expect(shared).toBeGreaterThan(48000)
  })
  it('변 → 선 [경도, 위도]', () => {
    const codes = [6570 * 6 + 2, 6570 * 6 + 5, 0]
    const lines = edgeLines(cells.h3, codes)
    const b = cellToBoundary(cells.h3[6570]), b0 = cellToBoundary(cells.h3[0])
    expect(lines[0]).toEqual([[b[2][1], b[2][0]], [b[3][1], b[3][0]]])
    expect(lines[1]).toEqual([[b[5][1], b[5][0]], [b[0][1], b[0][0]]])
    expect(lines[2]).toEqual([[b0[0][1], b0[0][0]], [b0[1][1], b0[1][0]]])
  })
})

describe('후보 찾기 — 작은 것들', () => {
  it('시간 띠 경계', () => {
    expect([0, 600, 600.001, 1200, 1201, 1800, 2700, 2701, 3600, 4000].map(C.timeBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 4, 4])
  })
  it('기본 순서 — 매출 수준이 없으면 주민 순 (무인 6종, W7.15)', () => {
    expect(C.defaultSort(false)).toBe('res')
    expect(C.defaultSort(true)).toBe('pot')
    expect(C.sortKeys(false)).toEqual(['res', 'few', 'near'])
    expect(cd.types.every((t) => !('pot' in t))).toBe(true)
  })
  it('[칸, 수] 풀기 · 이웃 합', () => {
    expect(Array.from(C.fromSparse([1, 5, 3, 2], 5))).toEqual([0, 5, 0, 2, 0])
    const s = C.nbSum([1, 2, 3], [1, 2, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, 1, -1, -1, -1, -1])
    expect(Array.from(s)).toEqual([6, 3, 6])
  })
  it('넓이 글자', () => {
    expect(C.reachText(3378)).toBe('3,378칸 (약 356㎢)')
  })
  it('자료 — 유형 6 · 칸 수 · 범위 모양', () => {
    expect(cd.types.map((t) => t.t)).toEqual(['빨래방', '스터디카페', '아이스크림', '카페', '사진관', '밀키트'])
    expect(site.tilt.length).toBe(N)
    expect(Math.min(...site.rr)).toBe(0)
    for (const t of cd.types) {
      expect(t.band.n300[0] <= t.band.n300[1] && t.band.n300[1] <= t.band.n300[2]).toBe(true)
      expect(t.band.tilt[0] <= t.band.tilt[1] && t.band.tilt[1] <= t.band.tilt[2]).toBe(true)
    }
  })
})
