// 자리 카드 한 줄 요약 — 마스터플랜 W7.4 '한 줄 요약 규칙' (P4에서 만듦, 2026-11-03)
// ① 자리 성격(site.ts placeText)
// ② 매출 수준 — 10% 단위(level.ts levelText). 칠하지 않는 칸이면 그렇다고, 자리별 매출 수준이 없는 업종이면 다른 숫자로 보라고
// ③ 1층 임대료 — 견줄 값(한국부동산원 조사 상권 72곳)이 있고 그 가운데 위·아래 20%일 때만. 행정동 임대시세는 공개판에 없다(W7.8)
import { fracAbove } from './candidates'
import { josa } from './format'
import { levelText } from './level'

/** 매출 수준 문장 — pct는 % 차이(level.ts toPct), 칠하지 않는 칸이면 null */
export function potSentence(nm: string, pct: number | null): string {
  if (pct == null) return `가게가 드물어 ${nm} 매출 수준을 추정하지 않는 칸이에요`
  const t = levelText(pct), head = `${nm} 매출 수준은 서울 평균 상권`
  if (t.endsWith('배')) return `${head}의 ${t}예요 (추정)`
  if (t === '비슷함') return `${head}과 비슷해요 (추정)`
  return `${head}보다 ${t.replace(/높음$/, '높아요').replace(/낮음$/, '낮아요')} (추정)`
}

/** 자리별 매출 수준이 없는 업종 (W7.4) */
export function noPotSentence(nm: string): string {
  return `${josa(nm, '은', '는')} 자리별 매출 수준을 추정하지 않아요 — 가게당 매출·새 가게·생존으로 보세요`
}

/** 정렬된 값 가운데 v보다 작은 몫 */
function fracBelow(sorted: ArrayLike<number>, v: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (sorted[m] < v) lo = m + 1
    else hi = m
  }
  return lo / Math.max(sorted.length, 1)
}

/** 1층 임대료 문장 — v는 그 칸이 든 조사 상권의 1층 임대료(천 원/㎡), sorted는 72곳 값 오름차순. 위·아래 20% 밖이면 null */
export function rentSentence(v: number | null | undefined, sorted: ArrayLike<number>): string | null {
  if (v == null || !sorted.length) return null
  if (fracAbove(sorted, v) < 0.2) return '1층 임대료는 서울 조사 상권 가운데 비싼 편이에요'
  if (fracBelow(sorted, v) < 0.2) return '1층 임대료는 서울 조사 상권 가운데 싼 편이에요'
  return null
}

/** 문장들 → 한 줄 ('…예요. …예요 (추정).') */
export function oneLine(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => !!p)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ')
}
