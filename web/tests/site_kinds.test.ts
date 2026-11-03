/// <reference types="node" />
// 자리 성격 · 업종 247 · 한 줄 요약 — 내보낸 자료(grid/site.json · kinds/)와 규칙(마스터플랜 W7.4, 2026-11-03 정함)을 본다
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { type KindsData, NO_POT, findKinds, kindIndex, sameKind, survText } from '../src/core/kinds'
import { type SiteData, placeText, placeType, quantile, sideText, siteCuts, upOf } from '../src/core/site'
import { noPotSentence, oneLine, potSentence, rentSentence } from '../src/core/summary'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[] }>('cells.json')
const site = read<SiteData>('grid/site.json')
const nb = read<number[]>('grid/nb.json')
const kinds = read<KindsData>('kinds/index.json')
const ind = read<{ k: string; codes: string[]; paint: boolean }[]>('ind/index.json')
const entry = read<{ ind: { k: string }[] }>('entry/index.json').ind
const N = cells.h3.length
const cuts = siteCuts(cells.n300, site.tilt)
const at = (lat: number, lng: number) => cells.h3.indexOf(latLngToCell(lat, lng, 9))

describe('자리 성격', () => {
  it('자료 — 칸마다 주택가 정도와 순위 셋, 순위는 0부터', () => {
    for (const k of ['tilt', 'rr', 'rw', 'ro'] as const) expect(site[k].length, k).toBe(N)
    for (const k of ['rr', 'rw', 'ro'] as const) {
      expect(Math.min(...site[k]), k).toBe(0)
      expect(Math.max(...site[k]), k).toBeLessThan(N)
    }
  })

  it('분위수 — numpy 기본(선형 보간)과 같은 셈', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([0, 10], 0.25)).toBe(2.5)
    expect(quantile([7], 0.9)).toBe(7)
    expect(cuts.n50).toBe(109)
    expect(cuts.n90).toBeCloseTo(693.9, 6) // 파이썬 numpy로 낸 값 693.9000000000005
    expect(cuts.t25).toBe(909)
    expect(cuts.t60).toBeCloseTo(1148, 0)
  })

  it('알려진 곳 — 시청·역삼은 일하러 오는 번화가, 망원은 번화가, 목동·진관동은 주거지', () => {
    const cases: [string, number, number, string][] = [
      ['시청(소공동)', 37.5657, 126.9769, 'busy'],
      ['역삼역', 37.5007, 127.0365, 'busy'],
      ['홍대입구', 37.5572, 126.9245, 'busy'],
      ['망원동', 37.556, 126.905, 'busy'],
      ['목동 아파트', 37.531, 126.874, 'home'],
      ['진관동', 37.6376, 126.9183, 'home'],
      ['상암 DMC', 37.5795, 126.8895, 'mixed'],
    ]
    for (const [nm, lat, lng, want] of cases) {
      const i = at(lat, lng)
      expect(i, nm).toBeGreaterThanOrEqual(0)
      expect(placeType(cells.n300[i], site.tilt[i], cuts), nm).toBe(want)
    }
    const i = at(37.5657, 126.9769)
    expect(placeText(cells.n300[i], site.tilt[i], cuts)).toBe('가게가 아주 많은 번화가예요 — 일하러·배우러 오는 사람이 많아요')
  })

  it('서울 칸 나눔 — 다섯 가지가 다 나오고, 번화가는 위 10%', () => {
    const c = new Map<string, number>()
    for (let i = 0; i < N; i++) {
      const t = placeType(cells.n300[i], site.tilt[i], cuts)
      c.set(t, (c.get(t) ?? 0) + 1)
    }
    expect([...c.keys()].sort()).toEqual(['busy', 'few', 'home', 'mixed', 'work'])
    expect(c.get('busy')! / N).toBeCloseTo(0.1, 2)
  })

  it('위쪽 몫 글자', () => {
    expect(sideText(upOf(0, N))).toBe('위쪽 1%')
    expect(sideText(0.024)).toBe('위쪽 2%')
    expect(sideText(0.3)).toBe('위쪽 30%')
    expect(sideText(0.5)).toBe('가운데쯤')
    expect(sideText(0.9)).toBe('아래쪽 10%')
    expect(sideText(1)).toBe('아래쪽 1%')
  })
})

describe('업종 247', () => {
  const ix = kindIndex(kinds, ind, entry)
  it('목록 — 247개, 가게 수 합, 대분류 9', () => {
    expect(kinds.kinds.length).toBe(247)
    expect(kinds.meta.poi).toBe('2026Q2')
    expect(ix.groups.size).toBe(9)
    expect(kinds.kinds.filter((k) => k.s12 === null).every((k) => k.grade === 'X')).toBe(true)
    expect(ix.s12Sorted.length).toBe(241)
  })

  it('볼 수 있는 깊이 — 카페는 매출 수준, 셀프빨래방은 세탁소로 배운 값을 쓰지 않는다 (W7.15)', () => {
    expect(ix.depth('I21201').pot).toBe('CS100010')
    expect(NO_POT.has('S20902')).toBe(true)
    expect(ix.depth('S20902').pot).toBeNull()
    expect(ix.depth('S20901').pot).toBe('CS200031')
    expect(ix.depth('I20101')).toEqual({ pot: 'CS100001', entry: true })
    expect(ix.depth('G20201').pot).toBeNull()
  })

  it('같은 업종 칸 수 — 파일 합이 서울 가게 수, 둘레를 더하면 늘거나 같다', () => {
    for (const c of ['I21201', 'S20902', 'R10202', 'G20201']) {
      const k = ix.byCode.get(c)!
      const { own, near } = sameKind(read<number[]>(`kinds/cnt/${c}.json`), nb, N)
      let s = 0, cs = 0
      for (let i = 0; i < N; i++) {
        s += own[i]
        if (own[i]) cs++
        expect(near[i]).toBeGreaterThanOrEqual(own[i])
      }
      expect(s, c).toBe(k.n)
      expect(cs, c).toBe(k.cells)
    }
  })

  it('이름으로 찾기 · 생존 글자', () => {
    expect(findKinds(kinds, '카페')[0].c).toBe('I21201')
    expect(findKinds(kinds, '  ')).toEqual([])
    expect(findKinds(kinds, '빨래').map((k) => k.c)).toContain('S20902')
    expect(survText(ix.byCode.get('I21201')!)).toBe('84%')
    expect(survText(kinds.kinds.find((k) => k.grade === 'X')!)).toBe('—')
  })
})

describe('한 줄 요약', () => {
  it('매출 수준 문장 — 10% 단위, 2배 언저리부터 배', () => {
    expect(potSentence('카페', 144)).toBe('카페 매출 수준은 서울 평균 상권의 2.4배예요 (추정)')
    expect(potSentence('카페', 45.4)).toBe('카페 매출 수준은 서울 평균 상권보다 50% 높아요 (추정)')
    expect(potSentence('카페', 3)).toBe('카페 매출 수준은 서울 평균 상권과 비슷해요 (추정)')
    expect(potSentence('빵집', -26.3)).toBe('빵집 매출 수준은 서울 평균 상권보다 30% 낮아요 (추정)')
    expect(potSentence('빵집', -95)).toBe('빵집 매출 수준은 서울 평균 상권보다 90% 넘게 낮아요 (추정)')
    expect(potSentence('카페', null)).toBe('가게가 드물어 카페 매출 수준을 추정하지 않는 칸이에요')
    expect(noPotSentence('셀프 빨래방')).toBe('셀프 빨래방은 자리별 매출 수준을 추정하지 않아요 — 가게당 매출·새 가게·생존으로 보세요')
    expect(noPotSentence('제과점')).toBe('제과점은 자리별 매출 수준을 추정하지 않아요 — 가게당 매출·새 가게·생존으로 보세요')
    expect(noPotSentence('카페')).toBe('카페는 자리별 매출 수준을 추정하지 않아요 — 가게당 매출·새 가게·생존으로 보세요')
  })

  it('1층 임대료 — 조사 상권 위·아래 20%일 때만', () => {
    const s = Float64Array.from({ length: 10 }, (_, i) => (i + 1) * 10) // 10~100
    expect(rentSentence(100, s)).toBe('1층 임대료는 서울 조사 상권 가운데 비싼 편이에요')
    expect(rentSentence(90, s)).toBe('1층 임대료는 서울 조사 상권 가운데 비싼 편이에요') // 위에 한 곳(10%)
    expect(rentSentence(80, s)).toBeNull() // 위에 두 곳(20%)
    expect(rentSentence(20, s)).toBe('1층 임대료는 서울 조사 상권 가운데 싼 편이에요')
    expect(rentSentence(30, s)).toBeNull()
    expect(rentSentence(null, s)).toBeNull()
  })

  it('한 줄로 잇기', () => {
    expect(oneLine(['가게가 아주 많은 번화가예요', potSentence('카페', 144), null])).toBe(
      '가게가 아주 많은 번화가예요. 카페 매출 수준은 서울 평균 상권의 2.4배예요 (추정).',
    )
  })
})
