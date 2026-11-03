/// <reference types="node" />
// 자리 카드 — 내보낸 자료로 칸 몇 곳을 업종별로 읽어, 숫자 넷·한 줄 요약·왜·얼마나 믿나가 자료와 맞물리는지 본다 (와이어프레임 T2e·T2f)
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { type CardInput, PICK_HINT, buildCard, distText, pyText } from '../src/core/card'
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
const be = read<{ ind: { k: string; cap: 'ok' | 'low' | 'unk'; capnote: string }[] }>('be/index.json').ind
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
    pot = { nm: m.nm, rho: m.rho, note: m.note, cells: f, ix: potIndex(f), cap: be.find((b) => b.k === m.k) ?? null }
  }
  return { ...base, kind: { k, depth, s12Sorted: kix.s12Sorted }, pot, same: { own: sk.own[i], near: sk.near[i], nearSorted: Float64Array.from(sk.near).sort() } }
}
const at = (lat: number, lng: number) => cells.h3.indexOf(latLngToCell(lat, lng, 9))

describe('자리 카드', () => {
  it('업종을 고르지 않으면 자리 성격과 가게 수만', () => {
    const i = at(37.5657, 126.9769) // 시청(소공동)
    const c = buildCard(input(i, null))
    expect(c.title).toBe('소공동')
    expect(c.sub).toMatch(/^중구 · 시청역 \d+m$/)
    expect(c.line).toBe('가게가 아주 많은 번화가예요 — 일하러·배우러 오는 사람이 많아요.')
    expect(c.facts).toEqual([])
    expect(c.why).toBeNull()
    expect(c.n300).toMatch(/^반경 300m 가게 [\d,]+곳 \(서울 칸 상위 \d+%\)$/)
    expect(PICK_HINT).toContain('업종을 고르면')
  })

  it('카페 — 매출 수준 · 왜(배수 넷) · 믿음 · 같은 업종 · 생존', () => {
    const i = at(37.5208, 127.023) // 가로수길(신사동)
    const v = read<IndCells>('ind/CS100010.json').v[i]!
    const c = buildCard(input(i, 'I21201'))
    expect(c.title).toBe('신사동')
    expect(c.facts.map((f) => f.key)).toEqual(['pot', 'rent', 'same', 'surv'])
    expect(c.facts[0].value).toBe(levelText(v / 10))
    expect(c.facts[0].sub).toMatch(/^칠한 칸 중 상위 \d+%$/)
    expect(c.line).toContain('카페 매출 수준은 서울 평균 상권')
    expect(c.why!.rows).toHaveLength(4)
    expect(c.why!.rows.some((r) => r.text.startsWith('반경 300m 가게'))).toBe(true)
    expect(c.trust[0].title).toMatch(/^모형의 힘: /)
    expect(c.trust.some((t) => t.title.startsWith('학습한 범위'))).toBe(true)
    expect(c.facts[2].value).toMatch(/^카페 [\d,]+곳$/)
    expect(c.facts[3]).toMatchObject({ value: '84%', sub: '이 자리 값이 아니라 업종 값' })
    for (const f of c.facts) if (f.pos != null) expect(f.pos >= 0 && f.pos <= 1).toBe(true)
  })

  it('셀프 빨래방 — 자리별 매출 수준 없음 (W7.15)', () => {
    const i = at(37.556, 126.905) // 망원동
    const c = buildCard(input(i, 'S20902'))
    expect(c.facts[0]).toMatchObject({ value: '추정하지 않음', none: true, pos: null })
    expect(c.line).toContain('셀프 빨래방은 자리별 매출 수준을 추정하지 않아요')
    expect(c.why).toBeNull()
  })

  it('1층 임대료 — 조사 상권 안이면 3.3㎡당 값, 밖이면 없음', () => {
    const inside = reb.cell.findIndex((r, i) => r >= 0 && reb.rents[r].v['대표1층'] != null && cells.n300[i] > 100)
    const c1 = buildCard(input(inside, 'I21201'))
    expect(c1.facts[1].value).toMatch(/^[\d.]+만 원$/)
    expect(c1.facts[1].label).toBe('1층 임대료 (3.3㎡당)')
    expect(c1.facts[1].sub).toContain('한국부동산원 조사 상권')
    const outside = at(37.6376, 126.9183) // 진관동
    expect(reb.cell[outside]).toBe(-1)
    expect(buildCard(input(outside, 'I21201')).facts[1]).toMatchObject({ value: '—', none: true })
  })

  it('작은 글자들', () => {
    expect(distText(12)).toBe('50m')
    expect(distText(412)).toBe('400m')
    expect(distText(1234)).toBe('1.2km')
    expect(pyText(80.4)).toBe('26.6만 원')
  })
})
