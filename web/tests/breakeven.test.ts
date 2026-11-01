/// <reference types="node" />
// 손익 계산 — 옛 뷰어의 함수(beCard·beSolve·beProfit·beShare·beShareTxt)를 viewer/template.html에서 꺼내 돌려 같은 값인지 본다.
// 수수료표·분위값은 tests/golden/be_meta.json (pipeline/golden_be.py가 p19 결과에서 만든다)
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { cardRate, fixedCost, paymentsPerDay, profitAt, reference, rowValue, shareAbove, shareText, solve, verdict, type BeIndustry, type CardTable } from '../src/core/breakeven'

const G = JSON.parse(readFileSync(new URL('./golden/be_meta.json', import.meta.url), 'utf8')) as {
  meta: { card: CardTable; qs: number[] }
  ind: BeIndustry[]
}
const SRC = readFileSync(new URL('../../viewer/template.html', import.meta.url), 'utf8').split('\n')
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
const NAMES = ['beCard', 'beSolve', 'beProfit', 'beShare', 'beShareTxt'] as const
const ctx: Record<string, unknown> = { BE: { meta: G.meta } }
vm.createContext(ctx)
vm.runInContext(NAMES.map(grab).join('\n') + `\nthis.O = { ${NAMES.join(', ')} }`, ctx)
const O = ctx.O as Record<(typeof NAMES)[number], (...a: unknown[]) => unknown>
const card = G.meta.card
const qs = G.meta.qs

const Fs = [0, 1, 50, 150, 300, 496.67, 1000, 2500, 5000, 12000, 25000, 60000, 200000]
const vs = [0, 0.1, 0.15, 0.3, 0.35, 0.5, 0.65, 0.8, 0.95, 0.99, 0.996, 1, 1.2]

describe('손익 — 옛 뷰어와 같은 값', () => {
  it('카드 수수료 구간', () => {
    for (const won of [0, 1, 3e8, 3e8 + 1, 5e8, 5e8 + 1, 1e9, 1e9 + 1, 3e9, 3e9 + 1, 1e11]) expect(cardRate(card, won)).toBe(O.beCard(won))
  })
  it('손익분기(고쳐 풀기 포함) — 고정비 × 변동비 격자', () => {
    for (const F of Fs) for (const v of vs) {
      const a = solve(F, v, card)
      const b = O.beSolve(F, v) as { S: number; r: number }
      expect(a.r, `r F=${F} v=${v}`).toBe(b.r)
      expect(a.S, `S F=${F} v=${v}`).toBe(b.S)
    }
  })
  it('남는 돈', () => {
    for (const F of Fs) for (const v of vs.slice(0, 9)) for (const X of [0, 100, 674, 901, 2500, 30000, 300000]) {
      expect(profitAt(X, F, v, card)).toBe(O.beProfit(X, F, v))
    }
  })
  it('손익분기를 넘는 상권에 있는 몫과 문장 — 60개 업종', () => {
    for (const ind of G.ind) {
      const xs = [0, ...ind.q.map((v) => v / 10), ...ind.q.map((v) => v / 10 * 1.07), ind.q[6] / 10 * 3]
      for (const X of xs) {
        expect(shareAbove(ind, qs, X), `${ind.nm} ${X}`).toBe(O.beShare(ind, X))
        expect(shareText(ind, qs, X)).toBe(O.beShareTxt(ind, X))
      }
    }
  })
})

describe('손익 — 견줄 매출과 판정', () => {
  const cafe = G.ind.find((d) => d.k === 'CS100010')! // 커피-음료
  it('상권 행이 있으면 진입 희석을 넣은 평균, 없으면 행정동, 둘 다 없으면 서울 중앙값', () => {
    const s = rowValue([1, 0, 90100, 12, 3000, 110])!
    const d = rowValue([2, 0, 80000, 30, 2500, 100])!
    const rs = reference(cafe, s, d)
    expect(rs.level).toBe('상권')
    expect(rs.dil).toBeCloseTo(Math.pow(13 / 12, cafe.alpha - 1) - 1, 12)
    expect(rs.ref).toBeCloseTo(9010 * (1 + rs.dil), 9)
    expect(rs.ticket).toBe(11000)
    expect(reference(cafe, null, d).level).toBe('행정동')
    const se = reference(cafe, null, null)
    expect(se).toMatchObject({ level: '서울', ref: cafe.q[3] / 10, dil: 0, word: '중앙값', ticket: cafe.ticket * 100 })
  })
  it('판정 경계', () => {
    expect(verdict(0.59, '평균')).toBe('평균의 60%만 팔아도 남습니다 — 여유가 큰 편입니다')
    expect(verdict(0.6, '평균')).toBe('평균보다 15% 넘게 덜 팔아도 남습니다')
    expect(verdict(0.85, '평균')).toBe('평균만큼 팔면 남지만 여유가 크지 않습니다')
    expect(verdict(1, '중앙값')).toBe('중앙값보다 더 팔아야 남습니다')
    expect(verdict(1.3, '평균')).toBe('평균보다 30% 넘게 더 팔아야 남습니다 — 빠듯합니다')
  })
  it('고정비·하루 결제', () => {
    expect(fixedCost({ rent: 150, mgmt: 20, labor: 250, other: 30, inv: 3000, months: 60, costRate: 0.35, otherRate: 0.05 })).toBe(500)
    expect(fixedCost({ rent: 0, mgmt: 0, labor: 0, other: 0, inv: 100, months: 0, costRate: 0, otherRate: 0 })).toBe(100)
    expect(paymentsPerDay(674, 5000)).toBeCloseTo(44.93, 2)
  })
})
