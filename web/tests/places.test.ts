/// <reference types="node" />
// 곳 찾기 — 예전 뷰어(viewer/template.html)의 cSearchIndex·cFind·cExample·cNearest·cPlace를 그 파일에서 꺼내 돌리고,
// src/core/places가 같은 목록·같은 찾기 결과를 내는지 견준다. 옛 코드에는 옛 순서의 행정동('동|구' 글자 순)과 이동 그래프(VD.mv)를 넣는다.
// 노선 이름표는 바로잡은 키(1호선 경원·급행 갈래)를 더해 견주고, 바로잡지 않은 옛 이름표와는 그 역들만 다른지 따로 본다
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as P from '../src/core/places'
import { b64u16 } from '../src/core/travel/decode'
import type { MvData } from '../src/core/travel/graph'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const mv = read<MvData>('graph/mv.json')
const stations = read<P.StationData>('places/stations.json')
const N = cells.h3.length
const grid = P.placeGrid(cells)
const idx = P.buildPlaceIndex(grid, dongs, stations)

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
function line(start: string): string {
  const l = SRC.find((s) => s.startsWith(start))
  if (l === undefined) throw new Error(`옛 뷰어에 '${start}'로 시작하는 줄이 없다`)
  return l
}

// 옛 순서의 행정동 — 옛 뷰어는 '동|구' 글자 순, 웹 dongs.json은 구·동 순
const oldDongs = [...dongs].sort()
const oldAt = new Map(oldDongs.map((k, i) => [k, i]))
const oldDong = cells.dong.map((d) => oldAt.get(dongs[d])!)
const FIXED = { '1경원': '1호선', '1급행경인': '1호선', '1급행경부': '1호선', '1급행경원': '1호선' }

interface OldEntry {
  kind: string
  name: string
  label: string
  cell: number
  x: number
  y: number
}
interface Old {
  idx(): { list: OldEntry[] }
  find(v: string): { e: OldEntry | null; alts: OldEntry[] }
  example(): { cell: number; x: number; y: number; label: string }
  nearest(x: number, y: number): { i: number; d: number }
  place(i: number): string
}
function oldCode(fix: boolean): Old {
  const ctx: Record<string, unknown> = { N, atob, VD: { x: grid.x, y: grid.y, dong: oldDong, dongs: oldDongs, mv } }
  vm.createContext(ctx)
  vm.runInContext(
    [line('var MV='), line('var LINE_NM='), fix ? `Object.assign(LINE_NM, ${JSON.stringify(FIXED)});` : '', 'var CST=null;',
      ...['b64u8', 'b64u16', 'cNearest', 'cPlace', 'cSearchIndex', 'cFind', 'cExample'].map(grab)].join('\n') +
      '\nthis.O = { idx: cSearchIndex, find: cFind, example: cExample, nearest: cNearest, place: cPlace }',
    ctx,
  )
  return ctx.O as Old
}
const OLD = oldCode(true)
const RAW = oldCode(false)

const pick = (e: OldEntry | P.PlaceEntry) => ({ kind: e.kind, name: e.name, label: e.label, cell: e.cell, x: e.x, y: e.y })

describe('곳 찾기 — 옛 뷰어와 같은 결과', () => {
  it('역 자료 = 이동 그래프의 역', () => {
    expect(stations.st).toEqual(mv.pt.st)
    expect(stations.sl).toEqual(mv.pt.sl)
    expect(stations.lines).toEqual(mv.pt.lines.map((l) => l.k))
    const a = b64u16(mv.pt.acc), has = new Set<number>()
    for (let k = 0; k < a.length; k += 3) has.add(a[k + 1])
    expect(stations.has).toEqual([...has].sort((x, y) => x - y))
  })

  it('찾기 목록 — 동 425 · 역, 순서·이름·이은 칸·좌표까지', () => {
    const old = OLD.idx().list
    expect(idx.list.map(pick)).toEqual(old.map(pick))
    expect(idx.list.filter((e) => e.kind === 'dong').length).toBe(425)
    expect(idx.list.filter((e) => e.kind === 'st').length).toBeGreaterThan(250)
  })

  it('바로잡은 노선 이름 — 옛 이름표와는 1호선 경원·급행 갈래 역만 다르다', () => {
    const raw = RAW.idx().list
    expect(raw.length).toBe(idx.list.length)
    let diff = 0
    raw.forEach((e, k) => {
      if (e.label === idx.list[k].label) return
      diff++
      expect(e.label, e.name).toMatch(/1경원|1급행/)
      expect(idx.list[k].label, e.name).not.toMatch(/1경원|1급행/)
    })
    expect(diff).toBeGreaterThan(0)
    expect(P.lineName('1급행경원')).toBe('1호선')
    expect(P.lineName('4급행')).toBe('4호선')
    expect(P.lineName('수인·분당급행')).toBe('수인·분당선')
    expect(P.lineName('새노선')).toBe('새노선')
  })

  it('이름으로 찾기 — 정확 · ○○동 → ○○1동… · 앞부분 · 들어 있음 · 괄호·빈칸', () => {
    const names = idx.list.map((e) => e.name)
    const qs = new Set<string>(['', '   ', '동', '역', '가', '1', 'xyz', '시청', '시청역', ' 시청 (중구) ', '역삼', '역삼동', '신사동', '중앙동', '종로', '종로3가', '서울역', '강남', '홍대입구역', '(강남구)', '상계', '상계동', '면목동', '1동', '본동'])
    for (const e of idx.list) {
      qs.add(e.label)
      qs.add(` ${e.label} `)
      qs.add(e.name)
      if (e.kind === 'st') qs.add(`${e.name}역`)
      qs.add(e.name.replace(/[0-9·]+동$|본동$|제\d동$/, '동'))
    }
    for (const nm of names) {
      qs.add(nm.slice(0, 1))
      qs.add(nm.slice(0, 2))
      qs.add(nm.slice(-2))
      qs.add(nm.split('').join(' '))
    }
    let n = 0
    for (const q of qs) {
      const a = P.findPlace(idx, q), b = OLD.find(q)
      expect(a.e?.label ?? null, `'${q}'`).toBe(b.e?.label ?? null)
      expect(a.alts.map((x) => x.label), `'${q}' 비슷한 이름`).toEqual(b.alts.map((x) => x.label))
      n++
    }
    expect(n).toBeGreaterThan(2000)
    expect(P.findPlace(idx, null)).toEqual({ e: null, alts: [] })
  })

  it('예시 기준점 — 시청역', () => {
    const a = P.examplePlace(idx), b = OLD.example()
    expect([a.cell, a.x, a.y, a.label]).toEqual([b.cell, b.x, b.y, b.label])
    expect(a.label).toMatch(/^시청역 \(/)
  })

  it('가장 가까운 칸 · 격자 밖(500 넘음) · 칸 이름', () => {
    let s = 20261102
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
    for (let i = 0; i < N; i++) {
      xmin = Math.min(xmin, grid.x[i]); xmax = Math.max(xmax, grid.x[i]); ymin = Math.min(ymin, grid.y[i]); ymax = Math.max(ymax, grid.y[i])
    }
    let outside = 0
    for (let k = 0; k < 300; k++) {
      const x = xmin - 3000 + rnd() * (xmax - xmin + 6000), y = ymin - 3000 + rnd() * (ymax - ymin + 6000)
      const a = P.nearestCell(grid, x, y), b = OLD.nearest(x, y)
      expect([a.i, a.d]).toEqual([b.i, b.d])
      expect(P.pickCell(grid, x, y)).toBe(b.d > 500 ? null : b.i)
      if (b.d > 500) outside++
    }
    expect(outside).toBeGreaterThan(10)
    for (let i = 0; i < N; i += 7) expect(P.placeName(dongs[cells.dong[i]])).toBe(OLD.place(i))
  })
})
