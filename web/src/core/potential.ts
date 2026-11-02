// 매출 수준을 '왜 이 값인가'로 푼다 — 예전 뷰어 cellInfo의 매출 잠재 부분(재료별 몫 · 끝값 맞춤 · 칠한 칸 중 상위 % · 가게가 드문 곳 안내,
// 마스터플랜 W7.4·W7.13 '자리 카드 → 왜 이 값인가').
// 자료: ind/<업종>.json — v(매출 수준 %×10, 칠하지 않는 칸 null) · m(칠한 칸마다 재료 넷의 배수 ×100 — 거주 · 출근·등교 · 기타 도착 · 주변 가게) ·
// clamp([칸, 비트]…: 1<<j 학습한 상권보다 낮아 끝값으로 · 16<<j 높아서) · index.json의 min300(칠하는 칸의 반경 300m 가게 수 하한)
// 배수 넷을 곱하면 매출 수준(1 + %/100)이 된다 — 배수를 0.01 단위로 반올림해 실었으므로 곱은 조금 다를 수 있다.
// 칸마다 접근성 값 자체는 싣지 않는다 (W7.8). 예전 말 '점포'는 웹 말 '가게'로 바꿨다

import { fracAbove } from './candidates'
import { comma } from './format'

/** 재료 이름 (예전 FEAT_SHORT) */
export const FACTOR_NM = ['거주', '출근·등교', '기타 도착', '주변 가게'] as const

/** 끝값 맞춤 설명 (예전 FEAT_LOW · FEAT_HIGH) */
export const CLAMP_LOW = [
  '거주 접근성이 학습한 상권보다 낮음',
  '출근·등교 접근성이 학습한 상권보다 낮음',
  '기타 도착 접근성이 학습한 상권보다 낮음',
  '주변 가게가 학습한 상권보다 적음',
] as const
export const CLAMP_HIGH = [
  '거주 접근성이 학습한 상권보다 높음',
  '출근·등교 접근성이 학습한 상권보다 높음',
  '기타 도착 접근성이 학습한 상권보다 높음',
  '주변 가게가 학습한 상권보다 많음',
] as const

/** ind/<업종>.json */
export interface IndCells {
  k: string
  /** 매출 수준 %×10 (칠하지 않는 칸 null) */
  v: (number | null)[]
  /** 칠한 칸 순서대로 재료 넷의 배수 ×100 */
  m: number[]
  /** 끝값으로 맞춘 칸 [칸, 비트]… */
  clamp: number[]
}

export interface PotIndex {
  /** 칸 → 칠한 칸 순번 (칠하지 않는 칸 −1) */
  at: Int32Array
  /** 칠한 칸의 매출 수준(%×10) 오름차순 */
  sorted: Float64Array
  /** 칸 → 끝값 맞춤 비트 */
  clamp: Map<number, number>
}

export function potIndex(d: IndCells): PotIndex {
  const n = d.v.length, at = new Int32Array(n).fill(-1), vals: number[] = []
  for (let i = 0; i < n; i++) {
    const v = d.v[i]
    if (v != null) {
      at[i] = vals.length
      vals.push(v)
    }
  }
  if (d.m.length !== vals.length * 4) throw new Error(`${d.k}: 재료 배수 수가 칠한 칸과 다르다`)
  const clamp = new Map<number, number>()
  for (let k = 0; k < d.clamp.length; k += 2) clamp.set(d.clamp[k], d.clamp[k + 1])
  return { at, sorted: Float64Array.from(vals).sort(), clamp }
}

export interface Factor {
  /** 재료 번호 0~3 */
  j: number
  name: string
  /** 배수 — 1.62면 이 재료가 62% 올렸다 */
  x: number
}

export interface PotExplain {
  /** 매출 수준(%) */
  pct: number
  /** 재료 넷 — 거주 · 출근·등교 · 기타 도착 · 주변 가게 순 */
  factors: Factor[]
  /** 끝값으로 맞춘 재료 설명 (없으면 빈 배열) */
  clamped: string[]
  /** 칠한 칸 가운데 이 칸보다 높은 칸의 몫 */
  up: number
}

/** 칸 하나 풀기 — 칠하지 않는 칸이면 null */
export function explainCell(d: IndCells, ix: PotIndex, i: number): PotExplain | null {
  const q = ix.at[i]
  if (q < 0) return null
  const v = d.v[i]!
  return {
    pct: v / 10,
    factors: FACTOR_NM.map((name, j) => ({ j, name, x: d.m[q * 4 + j] / 100 })),
    clamped: clampText(ix.clamp.get(i) ?? 0),
    up: fracAbove(ix.sorted, v),
  }
}

/** 끝값 맞춤 비트 → 설명 (예전 cellInfo) */
export function clampText(c: number): string[] {
  const out: string[] = []
  for (let j = 0; j < 4; j++) {
    if (c & (1 << j)) out.push(CLAMP_LOW[j])
    if (c & (16 << j)) out.push(CLAMP_HIGH[j])
  }
  return out
}

/** 영향이 큰 재료부터 — 배수가 1에서 먼 순(로그 크기), 같으면 원래 순서 */
export function byInfluence(f: readonly Factor[]): Factor[] {
  return [...f].sort((a, b) => Math.abs(Math.log(b.x)) - Math.abs(Math.log(a.x)) || a.j - b.j)
}

/** '×1.62' (예전 fmtX 모양) */
export function times(x: number): string {
  return `×${x.toFixed(2)}`
}

/** '칠한 칸 중 상위 12%' — 1% 아래는 1% (예전 cellInfo) */
export function upText(up: number): string {
  return `칠한 칸 중 상위 ${Math.max(1, Math.round(up * 100))}%`
}

/** 칠하지 않는 칸 안내 (예전 cellInfo) */
export function sparseText(nm: string, n300: number, min300: number): string {
  return `가게가 드문 곳 — 반경 300m 가게 ${comma(n300)}곳. ${nm} 매출이 공개된 상권은 모두 약 ${comma(min300)}곳 이상이었습니다.`
}
