// 자리 카드 한 줄 요약 — 마스터플랜 W7.4 '한 줄 요약 규칙' (P4에서 만듦, 2026-11-03)
// ① 자리 성격(site.ts placeText)
// ⓪ 이 동네 가게당 월매출(서울시 추정매출) — 있으면 매출 수준보다 앞에 (2026-11-20)
// ② 매출 수준 — 10% 단위(level.ts levelText). 칠하지 않는 칸이면 그렇다고, 자리별 매출 수준이 없는 업종이면 다른 숫자로 보라고
// ③ 1층 임대료 — 견줄 값(한국부동산원 조사 상권 72곳)이 있고 그 가운데 위·아래 20%일 때만. 행정동 임대시세는 공개판에 없다(W7.8)
import { fracAbove } from './candidates'
import { josa } from './format'
import { levelText } from './level'

/** 이 동네 매출 문장 — v는 '1,243만 원', where는 '상권 가로수길' · '행정동 신사동' (2026-11-20: 금액이 있으면 추정 비율보다 앞에 둔다) */
export function recSentence(nm: string, v: string, where: string, n: number): string {
  return `${josa(nm, '은', '는')} 이 동네에서 가게당 월 ${v}쯤 팔아요 (${where} ${n.toLocaleString('ko-KR')}곳 평균 · 카드 결제 기준)`
}

/**
 * 매출 수준 문장 — pct는 % 차이(level.ts toPct), 칠하지 않는 칸이면 null.
 * base('408만 원')를 주면 기준인 평균 상권이 얼마인지 함께 말한다 — 비율만 보면 좋게 읽혀서(가게 수로 센 서울 가운데 값은 평균 상권보다 높다)
 */
export function potSentence(nm: string, pct: number | null, base: string | null = null): string {
  if (pct == null) return `가게가 드물어 ${nm} 매출 수준을 추정하지 않는 칸이에요`
  const t = levelText(pct), head = `${nm} 매출 수준은 서울 평균 상권${base ? `(가게당 월 ${base}쯤)` : ''}`
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
