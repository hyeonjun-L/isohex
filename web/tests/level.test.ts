import { describe, expect, it } from 'vitest'
import { levelClass, levelPos, levelText, storeClass, strength, toPct } from '../src/core/level'

describe('매출 수준 단계', () => {
  it('경계값은 위 단계에 넣는다', () => {
    expect(levelClass(null)).toBe(-1)
    expect(levelClass(-79.4)).toBe(0)
    expect(levelClass(-50)).toBe(1)
    expect(levelClass(-30)).toBe(2)
    expect(levelClass(-10)).toBe(3)
    expect(levelClass(0)).toBe(3)
    expect(levelClass(10)).toBe(4)
    expect(levelClass(40)).toBe(5)
    expect(levelClass(100)).toBe(6)
    expect(levelClass(294.6)).toBe(6)
  })

  it('저장값(×10 정수)을 %로', () => {
    expect(toPct(-263)).toBe(-26.3)
    expect(toPct(null)).toBeNull()
  })
})

describe('매출 수준 문장 — 10% 단위, 2배 넘으면 배수', () => {
  it.each([
    [null, '추정하지 않음'],
    [0, '비슷함'],
    [9.9, '비슷함'],
    [-9.9, '비슷함'],
    [10, '10% 높음'],
    [26.3, '30% 높음'],
    [-26.3, '30% 낮음'],
    [-14, '10% 낮음'],
    [-79.4, '80% 낮음'],
    [-95, '90% 넘게 낮음'],
    [94, '90% 높음'],
    [99, '2.0배'],
    [100, '2.0배'],
    [194.6, '2.9배'],
    [294.6, '3.9배'],
  ])('%s → %s', (pct, text) => {
    expect(levelText(pct)).toBe(text)
  })
})

describe('가게가 모인 정도 단계', () => {
  it.each([
    [0, 0], [9, 0], [10, 1], [49, 1], [50, 2], [149, 2], [150, 3], [399, 3], [400, 4], [2000, 4],
  ])('%s곳 → %s단계', (n, c) => {
    expect(storeClass(n)).toBe(c)
  })
})

describe('모형의 힘 — 처음 보는 구 순위상관을 세 단계로', () => {
  it.each([
    [0.4, '보통'], [0.3, '보통'], [0.29, '약함'], [0.2, '약함'], [0.19, '아주 약함'], [0.09, '아주 약함'],
  ])('%s → %s', (rho, label) => {
    expect(strength(rho)).toBe(label)
  })
})

describe('추정 막대 위 자리 — 일곱 단계 같은 폭, 단계 안은 값 비율 (자리 카드)', () => {
  it('30% 높음은 10~40% 높음 단계(다섯째)의 3분의 2 — 시안 S06의 253 / 380px', () => {
    expect(levelPos(30)).toBeCloseTo((4 + 2 / 3) / 7, 6)
    expect(Math.round(levelPos(30) * 380)).toBe(253)
  })
  it('단계 경계 · 두 끝 · 끝 밖', () => {
    expect(levelPos(-10)).toBeCloseTo(3 / 7, 6) // 비슷함이 시작하는 곳
    expect(levelPos(0)).toBeCloseTo(3.5 / 7, 6) // 비슷함 한가운데 — 막대 한가운데
    expect(levelPos(-80)).toBe(0)
    expect(levelPos(-95)).toBe(0)
    expect(levelPos(200)).toBe(1)
    expect(levelPos(550)).toBe(1)
  })
  it('값이 클수록 오른쪽', () => {
    const xs = [-70, -40, -20, 5, 25, 70, 150].map(levelPos)
    for (let j = 1; j < xs.length; j++) expect(xs[j]).toBeGreaterThan(xs[j - 1])
  })
})
