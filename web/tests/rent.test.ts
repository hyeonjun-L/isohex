/// <reference types="node" />
// 월세 수준 — 옛 뷰어의 층 표(BE_FLOOR)와 층 보정 함수(drAdjD·drFloorR)를 viewer/template.html에서 꺼내 같은 값인지 본다
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { FLOORS, NEED_AREA, adjustedFloorRatio, compareRent, floorAdjust, monthlyBurden, perSqm, rebAtFloor, rebFloorNote, rentCell, type FloorKey } from '../src/core/rent'

const SRC = readFileSync(new URL('../../viewer/template.html', import.meta.url), 'utf8').split('\n')
const line = (start: string) => {
  const l = SRC.find((x) => x.startsWith(start))
  if (!l) throw new Error(`옛 뷰어에 ${start}이 없다`)
  return l.replace(/\/\/[^"']*$/, '')
}
// 동 둘(가운데값 0.643 기준으로 낮은 동·높은 동)과 값 없는 동을 가짜로 둔다
const ctx: Record<string, unknown> = { DR: { meta: { floor_ratio: { median: 0.643 } }, d: [{ fr: 0.3 }, { fr: 1.2 }, { fr: null }, { fr: 0.643 }] } }
vm.createContext(ctx)
vm.runInContext([line('var BE_FLOOR='), line('function drFs('), line('function drAdjD('), line('function drFloorR(')].join('\n') + '\nthis.O={BE_FLOOR,drAdjD,drFloorR}', ctx)
const O = ctx.O as { BE_FLOOR: Record<string, { nm: string; r: number; key?: string }>; drAdjD: (d: number) => number; drFloorR: (fl: { r: number }, a: number) => number }

describe('월세 수준 — 옛 뷰어와 같은 값', () => {
  it('층 표', () => {
    for (const k of Object.keys(O.BE_FLOOR) as FloorKey[]) {
      expect(FLOORS[k].nm).toBe(O.BE_FLOOR[k].nm)
      expect(FLOORS[k].r).toBe(O.BE_FLOOR[k].r)
      expect(FLOORS[k].rebKey).toBe(O.BE_FLOOR[k].key)
    }
    expect(Object.keys(FLOORS).sort()).toEqual(Object.keys(O.BE_FLOOR).sort())
  })
  it('행정동 층 보정 — 자르기(0.6~1.5)·1층 그대로·0.95 상한', () => {
    const median = 0.643
    const frs = [0.3, 1.2, null, 0.643]
    frs.forEach((fr, d) => {
      const a = floorAdjust(fr, median)
      expect(a).toBe(O.drAdjD(d))
      for (const k of Object.keys(FLOORS) as FloorKey[]) expect(adjustedFloorRatio(FLOORS[k], a)).toBe(O.drFloorR(FLOORS[k], a))
    })
    expect(floorAdjust(0.5, null)).toBe(1)
  })
})

describe('월세 수준 — 부동산원 값과 견주기', () => {
  const reb = { n: '홍대합정', v: { 대표1층: 80.4, 중대형2층효용_2025: 50.1, 중대형지하효용_2025: null } }
  it('㎡당 값 — 보증금 1%를 더한다', () => {
    expect(monthlyBurden(150, 3000)).toBe(180)
    expect(perSqm(150, 3000, 33)).toBeCloseTo(54.5454, 3)
    expect(perSqm(150, 0, 0)).toBeNull()
  })
  it('층 환산 — 그 상권 효용비율이 있으면 그것, 없으면 서울 평균', () => {
    expect(rebAtFloor(reb, FLOORS['1'])).toEqual({ value: 80.4, ratio: 1, own: false })
    const f2 = rebAtFloor(reb, FLOORS['2'])
    expect(f2.own).toBe(true)
    expect(f2.value).toBeCloseTo(80.4 * 0.501, 9)
    const b1 = rebAtFloor(reb, FLOORS['-1'])
    expect(b1).toMatchObject({ ratio: 0.275, own: false })
    expect(rebFloorNote(FLOORS['2'], f2.ratio, true)).toBe('부동산원 값의 2층은 이 상권의 층별 효용비율 50.1(1층=100)로 환산했습니다.')
    expect(rebFloorNote(FLOORS['1'], 1, false)).toBeNull()
  })
  it('견주기 말과 칸', () => {
    expect(compareRent(79.9, 100).word).toBe('싼 편')
    expect(compareRent(80, 100).word).toBe('비슷')
    expect(compareRent(125, 100).word).toBe('비슷')
    expect(compareRent(125.1, 100).word).toBe('비싼 편')
    expect(rentCell(56, 68.88)).toBe('56.0천 원 (1.23배)')
    expect(NEED_AREA).toBe('면적을 넣으면 부동산원 조사값과 견줍니다.')
  })
})
