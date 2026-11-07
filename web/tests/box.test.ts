/// <reference types="node" />
// 비교함 — 줄마다 가장 높은·낮은 값 표시 · 업종에 따라 줄이 바뀜 · 주소 (마스터플랜 W7.4 '비교함', 와이어프레임 D3)
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { BOX_MAX, boxRows, marks, readBox, writeBox } from '../src/core/box'
import type { CardInput } from '../src/core/card'
import { type KindsData, kindIndex, sameKind } from '../src/core/kinds'
import { levelText } from '../src/core/level'
import { buildPlaceIndex, nearestStation, placeGrid, type StationData } from '../src/core/places'
import { type IndCells, potIndex } from '../src/core/potential'
import { type SiteData, siteCuts } from '../src/core/site'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const site = read<SiteData>('grid/site.json')
const nb = read<number[]>('grid/nb.json')
const kinds = read<KindsData>('kinds/index.json')
const ind = read<{ k: string; nm: string; codes: string[]; paint: boolean; rho: number; note?: string }[]>('ind/index.json')
const reb = read<{ rents: { n: string; v: Record<string, number | null> }[]; cell: number[] }>('reb/index.json')
const places = buildPlaceIndex(placeGrid(cells), dongs, read<StationData>('places/stations.json'))
const N = cells.h3.length
const kix = kindIndex(kinds, ind, read<{ ind: { k: string }[] }>('entry/index.json').ind)
const cuts = siteCuts(cells.n300, site.tilt)
const n300Sorted = Float64Array.from(cells.n300).sort()
const rebSorted = Float64Array.from(reb.rents.map((r) => r.v['대표1층']).filter((v): v is number => v != null)).sort()
const grid = placeGrid(cells)

function input(i: number, code: string | null): CardInput {
  const base: CardInput = {
    i, dongKey: dongs[cells.dong[i]], n: N, n300: cells.n300[i], n300Sorted, site, cuts,
    station: nearestStation(places, grid.x[i], grid.y[i]),
    reb: reb.cell[i] >= 0 ? { name: reb.rents[reb.cell[i]].n, v: reb.rents[reb.cell[i]].v['대표1층'] ?? null, sorted: rebSorted } : null,
  }
  if (!code) return base
  const k = kix.byCode.get(code)!, depth = kix.depth(code)
  const sk = sameKind(read<number[]>(`kinds/cnt/${code}.json`), nb, N)
  let pot: CardInput['pot'] = null
  if (depth.pot) {
    const m = ind.find((x) => x.k === depth.pot)!, f = read<IndCells>(`ind/${m.k}.json`)
    pot = { nm: m.nm, rho: m.rho, note: m.note, cells: f, ix: potIndex(f), cap: null }
  }
  return { ...base, kind: { k, depth, s12Sorted: kix.s12Sorted }, pot, same: { own: sk.own[i], near: sk.near[i], nearSorted: Float64Array.from(sk.near).sort() } }
}
const at = (lat: number, lng: number) => cells.h3.indexOf(latLngToCell(lat, lng, 9))
const SOGONG = at(37.5657, 126.9769) // 시청(소공동)
const SINSA = at(37.5208, 127.023) // 가로수길(신사동)
const MANGWON = at(37.5556, 126.9019) // 망원동
const three = [SOGONG, SINSA, MANGWON]

describe('가장 높은 · 낮은 곳 표시', () => {
  it('셋 넘으면 양쪽, 둘이면 먼저 볼 쪽만, 같으면 없음', () => {
    expect(marks([3, 1, 2], '높음', '낮음')).toEqual(['높음', '낮음', undefined])
    expect(marks([1, 2], '높음', '낮음')).toEqual([undefined, '높음'])
    expect(marks([100, 300], '멂', '가까움', 'min')).toEqual(['가까움', undefined])
    expect(marks([2, 2], '높음', '낮음')).toEqual([undefined, undefined])
    expect(marks([2, 2, 1], '높음', '낮음')).toEqual(['높음', '높음', '낮음'])
    expect(marks([null, 1, 2], '높음', '낮음')).toEqual([undefined, undefined, '높음']) // 값이 있는 곳은 둘
    expect(marks([5], '높음', '낮음')).toEqual([undefined])
  })
})

describe('비교함 줄', () => {
  it('카페 세 곳 — 매출 수준 · 가게당 월매출 · 같은 업종 · 가게 수 · 자리 성격 · 임대료 · 역 · 생존', () => {
    const ins = three.map((i) => input(i, 'I21201'))
    const sales = [{ v: 1200, where: '상권 가', n: 40 }, null, { v: 800, where: '행정동 나', n: 12 }]
    const rows = boxRows(ins, sales)
    expect(rows.map((r) => r.key)).toEqual(['pot', 'sales', 'same', 'n300', 'place', 'rent', 'station', 'surv'])
    const r = (k: string) => rows.find((x) => x.key === k)!
    // 매출 수준 — 카드와 같은 글자, 가장 높은 곳 · 낮은 곳
    const v = read<IndCells>('ind/CS100010.json').v
    const pct = three.map((i) => (v[i] == null ? null : v[i]! / 10))
    r('pot').cells!.forEach((c, j) => expect(c.v).toBe(pct[j] == null ? '칠하지 않음' : levelText(pct[j])))
    expect(r('pot').cells!.map((c) => c.mark)).toEqual(marks(pct, '가장 높음', '가장 낮음'))
    // 가게당 월매출 — 값이 있는 곳이 둘이면 높은 쪽만
    expect(r('sales').cells!.map((c) => [c.v, c.mark ?? ''])).toEqual([['1,200만 원', '가장 높음'], ['—', ''], ['800만 원', '']])
    // 반경 300m 가게 — 가로수길(1,604곳)이 가장 많고 망원(542곳)이 가장 적다
    expect(r('n300').cells!.map((c) => c.mark)).toEqual([undefined, '가장 많음', '가장 적음'])
    expect(r('n300').cells![1].v).toBe('1,604곳')
    expect(r('place').cells![0].v).toBe('번화가')
    expect(r('station').cells![0].v).toBe('시청역')
    expect(r('surv').span).toBe('84% — 업종 값이라 모든 곳이 같아요')
    for (const c of r('rent').cells!) expect(c.v).toMatch(/^(—|[\d.]+만 원)$/)
  })

  it('업종 없이 — 가게 수 · 자리 성격 · 임대료 · 역만', () => {
    expect(boxRows(three.map((i) => input(i, null)), null).map((r) => r.key)).toEqual(['n300', 'place', 'rent', 'station'])
  })

  it('매출 수준이 없는 업종 · 서울시 매출과 이어지지 않는 업종은 한 줄로 말한다', () => {
    const bread = boxRows(three.map((i) => input(i, 'I21001')), null)
    expect(bread.find((r) => r.key === 'pot')!.span).toBe('빵/도넛은 자리별 매출 수준을 추정하지 않아요')
    expect(bread.some((r) => r.key === 'sales')).toBe(false) // 받는 중
    const agent = boxRows(three.map((i) => input(i, 'L10203')), 'none')
    expect(agent.find((r) => r.key === 'sales')!.span).toBe('부동산 중개/대리업은 서울시 상권분석 매출 업종과 바로 이어지지 않아요')
  })
})

describe('주소', () => {
  it('box=h3_h3 — 없는 칸 · 겹친 칸은 빼고 다섯 곳까지', () => {
    const idx = new Map(cells.h3.map((h, i) => [h, i]))
    const look = (h: string) => idx.get(h) ?? -1
    const q = new URLSearchParams()
    writeBox(q, three, cells.h3)
    expect(q.get('box')).toBe(three.map((i) => cells.h3[i]).join('_'))
    expect(readBox(q.get('box'), look)).toEqual(three)
    const many = [...three, SOGONG, 0, 1, 2, 3].map((i) => cells.h3[i]).join('_') + '_zzz'
    expect(readBox(many, look)).toEqual([...three, 0, 1].slice(0, BOX_MAX))
    expect(readBox(null, look)).toEqual([])
    const empty = new URLSearchParams()
    writeBox(empty, [], cells.h3)
    expect(empty.has('box')).toBe(false)
  })
})
