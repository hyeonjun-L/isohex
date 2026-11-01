/// <reference types="node" />
// 내보낸 손익·부동산원 자료(public/data/<판>/be · reb)가 계산 모듈과 맞물리는지 — 판이 바뀌어도 그대로 돈다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reference, rowValue, type BeIndustry, type BeRow } from '../src/core/breakeven'
import { FLOORS, rebAtFloor, type RebRent } from '../src/core/rent'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const be = read<{ meta: { qs: number[]; card: [number, number, number][] }; ind: BeIndustry[] }>('be/index.json')
const cells = read<{ h3: string[] }>('cells.json')
const map = read<{ c2s: number[]; c2d: number[] }>('be/cells.json')
const golden = JSON.parse(readFileSync(new URL('./golden/be_meta.json', import.meta.url), 'utf8')) as { meta: { qs: number[]; card: unknown }; ind: BeIndustry[] }

describe('내보낸 손익 자료', () => {
  it('시험용 고정 자료(be_meta)와 같은 판 — 분위값·수수료표가 같다', () => {
    expect(be.meta.qs).toEqual(golden.meta.qs)
    expect(be.meta.card).toEqual(golden.meta.card)
    expect(be.ind.map((d) => [d.k, d.q])).toEqual(golden.ind.map((d) => [d.k, d.q]))
  })
  it('칸 → 상권·행정동 번호가 칸 수만큼, 행정동은 모든 칸에', () => {
    expect(map.c2s.length).toBe(cells.h3.length)
    expect(map.c2d.length).toBe(cells.h3.length)
    expect(map.c2d.every((d) => d >= 0)).toBe(true)
  })
  it('커피-음료: 상권 행이 있는 칸은 상권 평균(진입 희석)으로, 상권 밖 칸은 행정동으로 견준다', () => {
    const ii = be.ind.findIndex((d) => d.k === 'CS100010')
    const ind = be.ind[ii]
    const rows = read<{ S: number[][]; D: number[][] }>(`be/ind/${ind.k}.json`)
    const S = new Map(rows.S.map((r) => [r[0], r]))
    const D = new Map(rows.D.map((r) => [r[0], r]))
    const asRow = (r: number[] | undefined): BeRow | null => (r ? [r[0], ii, r[1], r[2], r[3], r[4]] : null)
    let sang = 0, dong = 0
    for (let i = 0; i < cells.h3.length; i++) {
      const s = map.c2s[i] >= 0 ? asRow(S.get(map.c2s[i])) : null
      const d = asRow(D.get(map.c2d[i]))
      const ref = reference(ind, rowValue(s), rowValue(d))
      if (s) {
        sang++
        expect(ref.level).toBe('상권')
        expect(ref.ref).toBeLessThan(s[2] / 10) // 내가 들어가면 가게당 매출이 준다
      } else if (d) {
        dong++
        expect(ref.level).toBe('행정동')
      }
    }
    expect(sang).toBeGreaterThan(500)
    expect(dong).toBeGreaterThan(1000)
  })
})

describe('내보낸 부동산원 자료', () => {
  const reb = read<{ rents: RebRent[]; cell: number[] }>('reb/index.json')
  it('72곳 · 칸마다 상권 번호(밖 −1)', () => {
    expect(reb.rents.length).toBe(72)
    expect(reb.cell.length).toBe(cells.h3.length)
    expect(reb.cell.filter((x) => x >= 0).length).toBeGreaterThan(700)
    for (const r of reb.rents) {
      const f1 = rebAtFloor(r, FLOORS['1'])
      if (f1.value != null) expect(f1.value).toBeGreaterThan(10)
      const f2 = rebAtFloor(r, FLOORS['2'])
      if (f1.value != null && f2.value != null) expect(f2.value).toBeLessThan(f1.value)
    }
  })
})
