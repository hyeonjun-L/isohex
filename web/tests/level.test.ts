import { describe, expect, it } from 'vitest'
import { levelClass, levelText, storeClass, strength, toPct } from '../src/core/level'

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
