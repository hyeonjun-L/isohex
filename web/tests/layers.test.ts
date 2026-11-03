/// <reference types="node" />
// 동네 보기 지표 칩 — 업종마다 칩 줄 · 기본 지표 · 칸 색 번호 · 범례가 자료와 맞는지 (마스터플랜 W7.4 '동네 보기', 2026-11-03)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pyText } from '../src/core/card'
import { type EntryCells, entryWindow } from '../src/core/entry'
import { type KindsData, kindIndex, sameKind } from '../src/core/kinds'
import {
  RENT_LABELS, SHOW_STEPS, chipsFor, countClass, countLabels, entryLayer, parseShow, perPy, periodText, pickShow, potLayer, rentLayer, sameBreaks, sameLayer, spread, storeLayer,
} from '../src/core/layers'
import { levelClass, storeClass, toPct } from '../src/core/level'
import { SHOW_COLORS } from '../src/map/palette'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[] }>('cells.json')
const nb = read<number[]>('grid/nb.json')
const kinds = read<KindsData>('kinds/index.json')
const ind = read<{ k: string; nm: string; codes: string[]; paint: boolean }[]>('ind/index.json')
const entry = read<{ meta: { period: string }; ind: { k: string }[] }>('entry/index.json')
const reb = read<{ rents: { n: string; v: Record<string, number | null> }[]; cell: number[] }>('reb/index.json')
const N = cells.h3.length
const kix = kindIndex(kinds, ind, entry.ind)
const near = (c: string) => sameKind(read<number[]>(`kinds/cnt/${c}.json`), nb, N).near
const chipsOf = (c: string) => chipsFor(kix.byCode.get(c)!.nm, kix.depth(c))

describe('칩 줄과 기본 지표', () => {
  it('업종을 고르기 전 — 가게 수 · 1층 임대료', () => {
    const ch = chipsFor(null, null)
    expect(ch.map((c) => c.s)).toEqual(['store', 'rent'])
    expect(pickShow(null, ch)).toBe('store')
    expect(pickShow('rent', ch)).toBe('rent')
    expect(pickShow('pot', ch)).toBe('store') // 업종이 없으면 매출 수준은 없다
  })

  it('카페 — 넷 다 있고 기본은 매출 수준', () => {
    const ch = chipsOf('I21201')
    expect(ch.map((c) => [c.s, c.ok])).toEqual([['pot', true], ['rent', true], ['entry', true], ['same', true]])
    expect(ch.map((c) => c.nm)).toEqual(['매출 수준', '1층 임대료', '새 가게', '같은 업종'])
    expect(pickShow(null, ch)).toBe('pot')
    expect(pickShow('same', ch)).toBe('same')
  })

  it('셀프 빨래방 — 매출 수준·새 가게가 없어 같은 업종 (W7.15)', () => {
    const ch = chipsOf('S20902')
    expect(ch.filter((c) => !c.ok).map((c) => c.s)).toEqual(['pot', 'entry'])
    expect(ch[0].why).toBe('셀프 빨래방은 자리별 매출 수준을 추정하지 않아요')
    expect(ch[2].why).toContain('48업종')
    expect(pickShow(null, ch)).toBe('same')
    expect(pickShow('pot', ch)).toBe('same') // 앞 업종에서 고른 매출 수준이 남아 있어도
  })

  it('매출 수준은 없고 새 가게는 있는 업종이면 새 가게가 기본 (W7.4 ‘추정하지 않는 업종은 새 가게’)', () => {
    const c = kinds.kinds.find((k) => !kix.depth(k.c).pot && kix.depth(k.c).entry)!
    expect(c).toBeTruthy()
    expect(pickShow(null, chipsOf(c.c))).toBe('entry')
  })

  it('주소의 show 값', () => {
    expect(parseShow('rent')).toBe('rent')
    expect(parseShow('level')).toBeNull()
    expect(parseShow('toString')).toBeNull()
    expect(parseShow(null)).toBeNull()
  })
})

describe('칸 색 번호', () => {
  it('매출 수준 · 가게 수 — 예전 계산과 같다', () => {
    const cafe = ind.find((x) => x.nm === '카페')!
    const v = read<{ v: (number | null)[] }>(`ind/${cafe.k}.json`).v
    const L = potLayer(v, cafe.nm)
    expect(Array.from(L.classes)).toEqual(v.map((x) => levelClass(toPct(x))))
    expect(L.legend.none).toEqual({ label: '추정하지 않음 (가게가 드문 곳)', look: 'hatch' })
    const S = storeLayer(cells.n300)
    expect(Array.from(S.classes)).toEqual(cells.n300.map(storeClass))
    expect(S.legend.title).toBe('가게가 모인 정도 — 반경 300m 가게 수')
  })

  it('같은 업종 — 업종마다 1곳 이상인 칸을 나눠 보기 좋은 수로', () => {
    expect(sameBreaks(near('I21201'))).toEqual([8, 20, 30, 60]) // 카페
    expect(sameBreaks(near('G20405'))).toEqual([5, 10, 15, 20]) // 편의점
    expect(sameBreaks(near('S20902'))).toEqual([2, 3, 4, 5]) // 셀프 빨래방
    expect(countLabels([8, 20, 30, 60])).toEqual(['없음', '1~7곳', '8~19곳', '20~29곳', '30~59곳', '60곳 이상'])
    expect(countLabels([2, 3, 4, 5])).toEqual(['없음', '1곳', '2곳', '3곳', '4곳', '5곳 이상'])
    expect([0, 1, 7, 8, 59, 60, 204].map((v) => countClass(v, [8, 20, 30, 60]))).toEqual([0, 1, 1, 2, 4, 5, 5])
    // 247업종 모두 — 경계는 오름차순, 가장 큰 값을 넘지 않고, 색 번호는 단계 차례를 지킨다
    for (const k of kinds.kinds) {
      const nr = near(k.c), b = sameBreaks(nr), mx = Math.max(...nr)
      for (let j = 1; j < b.length; j++) expect(b[j], k.c).toBeGreaterThan(b[j - 1])
      if (b.length) expect(b[b.length - 1], k.c).toBeLessThanOrEqual(mx)
      const L = sameLayer(nr, k.nm, '2026년 2분기')
      const items = L.legend.items.map((x) => x.c)
      expect(items[0], k.c).toBe(0)
      expect(items[items.length - 1], k.c).toBe(SHOW_STEPS.same - 1)
      for (let i = 0; i < N; i += 97) expect(L.classes[i]).toBe(items[countClass(nr[i], b)])
    }
  })

  it('새 가게 — entry.ts 단계(1·2·4·7·13곳)와 같고 0곳은 ‘없음’', () => {
    for (const { k } of entry.ind) {
      const w = entryWindow(read<EntryCells>(`entry/${k}.json`), nb, N)
      const L = entryLayer(w.ow, k, entry.meta.period)
      for (let i = 0; i < N; i++) expect(L.classes[i]).toBe(w.ow[i] > 0 ? w.cls[i] + 1 : 0)
    }
    const L = entryLayer(new Int32Array(3), '카페', '2025Q1~Q2')
    expect(L.legend.items.map((x) => x.label)).toEqual(['없음', '1곳', '2~3곳', '4~6곳', '7~12곳', '13곳 이상'])
    expect(L.legend.sub).toContain('2025년 상반기')
    expect(periodText('2025Q1~Q2')).toBe('2025년 상반기')
  })

  it('1층 임대료 — 조사 상권 72곳 안 칸만, 3.3㎡당 만 원 다섯 단계', () => {
    const L = rentLayer(reb.cell, reb.rents)
    const inside = reb.cell.filter((r) => r >= 0).length
    expect(Array.from(L.classes).filter((c) => c >= 0).length).toBe(inside)
    expect(L.legend.none?.look).toBe('empty')
    expect(L.legend.items.map((x) => x.label)).toEqual([...RENT_LABELS])
    // 상권마다 단계 — 경계 12·15·20·25만 원이 상권을 고르게 나누는지 (자료가 바뀌면 다시 본다)
    const per = [0, 0, 0, 0, 0]
    for (const r of reb.rents) {
      const v = r.v['대표1층']!
      const py = perPy(v)
      expect(pyText(v)).toBe(`${py.toFixed(1)}만 원`)
      per[py < 12 ? 0 : py < 15 ? 1 : py < 20 ? 2 : py < 25 ? 3 : 4]++
    }
    expect(per).toEqual([10, 22, 20, 14, 6])
    for (let i = 0; i < N; i++) if (reb.cell[i] < 0) expect(L.classes[i]).toBe(-1)
  })

  it('단계가 적으면 색을 고르게 벌린다 — 가장 높은 단계는 가장 진하게', () => {
    expect([0, 1, 2, 3, 4, 5].map((j) => spread(j, 6, 6))).toEqual([0, 1, 2, 3, 4, 5])
    expect([0, 1, 2, 3].map((j) => spread(j, 4, 6))).toEqual([0, 2, 3, 5])
    expect([0, 1, 2].map((j) => spread(j, 3, 6))).toEqual([0, 3, 5])
  })
})

describe('지도 색', () => {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  it('지표마다 색 수가 단계 수와 같고, 한 색 지표는 라이트에서 어두워지고 다크에서 밝아진다', () => {
    for (const s of Object.keys(SHOW_STEPS) as (keyof typeof SHOW_STEPS)[]) {
      for (const t of ['light', 'dark'] as const) {
        const cols = SHOW_COLORS[s][t]
        expect(cols.length, `${s} ${t}`).toBe(SHOW_STEPS[s])
        if (s === 'pot') continue // 매출 수준은 두 색 + 가운데 회색
        const Y = cols.map(lum)
        for (let j = 1; j < Y.length; j++) expect(t === 'light' ? Y[j] < Y[j - 1] : Y[j] > Y[j - 1], `${s} ${t} ${j}`).toBe(true)
      }
    }
  })
})
