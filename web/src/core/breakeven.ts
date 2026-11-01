// 손익 점검 — 매물의 비용으로 손익분기 월매출을 내고, 그 자리 같은 업종 가게의 매출과 견준다 (마스터플랜 §5.14).
// 예전 뷰어(viewer/template.html)의 beCard·beSolve·beProfit·beShare·beShareTxt와 beRender의 계산 부분을 옮겼다.
// 단위: 돈은 만 원/월, 카드 구간은 원/년, 분위값 q는 천 원(÷10 하면 만 원), 객단가는 백 원(×100 하면 원).
// tests/breakeven.test.ts가 옛 함수와 같은 값을 내는지 견준다.

/** [연매출 상한(원), 신용카드 수수료율, 체크카드 수수료율] — 우대수수료 구간 (손익 자료 meta.card) */
export type CardTable = [number, number, number][]

export interface BeIndustry {
  k: string
  nm: string
  /** 원가율 기본값 (0~1) */
  v: number
  /** 진입 희석 탄력성 — 가게 하나가 더 들어오면 가게당 매출이 얼마나 줄어드나 */
  alpha: number
  /** 상권별 점포당 월매출의 분위값(천 원) — 분위 위치는 meta.qs */
  q: number[]
  /** 서울 객단가(백 원) */
  ticket: number
}

/** 상권·행정동 한 줄 — [지역 번호, 업종 번호, 월매출(천 원), 점포 수, 하루 결제(×10), 객단가(백 원)] */
export type BeRow = [number, number, number, number, number, number]

export interface BeVal {
  /** 점포당 월매출(만 원) */
  sales: number
  /** 점포 수 */
  n: number
  /** 점포당 하루 결제(건) */
  tx: number
  /** 객단가(원) */
  ticket: number
}

export interface BeInputs {
  /** 만 원/월 */
  rent: number
  mgmt: number
  labor: number
  other: number
  /** 초기 투자(만 원)와 회수 개월 */
  inv: number
  months: number
  /** 원가율·기타 변동비 (0~1) */
  costRate: number
  otherRate: number
}

export function rowValue(r: BeRow | null | undefined): BeVal | null {
  return r ? { sales: r[2] / 10, n: r[3], tx: r[4] / 10, ticket: r[5] * 100 } : null
}

/** 연매출(원)에 맞는 신용카드 수수료율 — 마지막 구간을 넘으면 마지막 값 */
export function cardRate(card: CardTable, wonPerYear: number): number {
  for (const [cap, credit] of card) if (wonPerYear <= cap) return credit
  return card[card.length - 1][1]
}

/** 월 고정비(만 원) = 월세 + 관리비 + 인건비 + 기타 + 투자 ÷ 회수 개월 */
export function fixedCost(i: BeInputs): number {
  return i.rent + i.mgmt + i.labor + i.other + i.inv / Math.max(1, i.months)
}

/**
 * 손익분기 월매출 S(만 원) — S = F ÷ (1 − 변동비 − 카드 수수료). 수수료가 매출 구간에 따라 바뀌어 여덟 번까지 고쳐 푼다.
 * 변동비와 수수료를 더해 100%가 넘으면 S = ∞
 */
export function solve(F: number, v: number, card: CardTable): { S: number; r: number } {
  let r = cardRate(card, 0)
  let S = Infinity
  for (let k = 0; k < 8; k++) {
    const d = 1 - v - r
    if (d <= 0) return { S: Infinity, r }
    S = F / d
    const r2 = cardRate(card, S * 12e4)
    if (r2 === r) break
    r = r2
  }
  return { S, r }
}

/** 월매출 X(만 원)를 팔 때 남는 돈(만 원) */
export function profitAt(X: number, F: number, v: number, card: CardTable): number {
  return X * (1 - v - cardRate(card, X * 12e4)) - F
}

/** 연매출 30억 원을 넘으면 우대 수수료 대상이 아니다 — 계산에 쓴 수수료보다 실제가 높다 */
export function overPreferential(S: number, card: CardTable): boolean {
  return S * 12e4 > card[card.length - 1][0]
}

/** 서울 이 업종 가게 가운데 점포당 평균 매출이 X(만 원)를 넘는 상권에 있는 몫 — 분위 사이는 로그 눈금으로 잇는다 */
export function shareAbove(ind: Pick<BeIndustry, 'q'>, qs: number[], X: number): number {
  const q = ind.q.map((v) => v / 10)
  const n = q.length
  if (X <= q[0]) return 1 - qs[0]
  if (X >= q[n - 1]) return 1 - qs[n - 1]
  for (let i = 0; i < n - 1; i++) {
    if (X <= q[i + 1]) {
      const den = Math.log(q[i + 1]) - Math.log(q[i])
      const t = den > 0 ? (Math.log(X) - Math.log(q[i])) / den : 1
      return 1 - (qs[i] + t * (qs[i + 1] - qs[i]))
    }
  }
  return 1 - qs[n - 1]
}

export function shareText(ind: Pick<BeIndustry, 'q' | 'nm'>, qs: number[], S: number): string {
  const p = shareAbove(ind, qs, S)
  const nm = ind.nm
  if (p >= 0.95) return `서울 ${nm} 가게의 95% 이상이 점포당 평균 매출이 손익분기를 넘는 상권에 있습니다.`
  if (p <= 0.05) return `서울 ${nm} 가게 가운데 점포당 평균 매출이 손익분기를 넘는 상권에 있는 곳은 5%가 안 됩니다.`
  return `서울 ${nm} 가게의 약 ${Math.round(p * 100)}%가 점포당 평균 매출이 손익분기를 넘는 상권에 있습니다.`
}

export interface Reference {
  /** 견준 곳 — 그 자리 상권, 상권 밖이면 행정동, 둘 다 없으면 서울 */
  level: '상권' | '행정동' | '서울'
  /** 견준 월매출(만 원) — 상권·행정동이면 내가 들어간 뒤 평균(진입 희석), 서울이면 중앙값 */
  ref: number
  /** 진입 희석(음수, 예: −0.05 = 5% 줆) — 서울 중앙값이면 0 */
  dil: number
  word: '평균' | '중앙값'
  /** 객단가(원) */
  ticket: number
}

export function reference(ind: BeIndustry, s: BeVal | null, d: BeVal | null): Reference {
  const prim = s ? { level: '상권' as const, r: s } : d ? { level: '행정동' as const, r: d } : null
  if (!prim) return { level: '서울', ref: ind.q[3] / 10, dil: 0, word: '중앙값', ticket: ind.ticket * 100 }
  const n = prim.r.n
  const dil = Math.pow((n + 1) / n, ind.alpha - 1) - 1
  return { level: prim.level, ref: prim.r.sales * (1 + dil), dil, word: '평균', ticket: prim.r.ticket }
}

/** 손익분기 ÷ 견준 매출 → 판정 문장 (0.6 · 0.85 · 1 · 1.3에서 끊는다) */
export function verdict(R: number, word: '평균' | '중앙값'): string {
  if (R < 0.6) return `${word}의 60%만 팔아도 남습니다 — 여유가 큰 편입니다`
  if (R < 0.85) return `${word}보다 15% 넘게 덜 팔아도 남습니다`
  if (R < 1) return `${word}만큼 팔면 남지만 여유가 크지 않습니다`
  if (R < 1.3) return `${word}보다 더 팔아야 남습니다`
  return `${word}보다 30% 넘게 더 팔아야 남습니다 — 빠듯합니다`
}

/** 손익분기를 하루 결제 건수로 — S(만 원) ÷ 30일 ÷ 객단가(원) */
export function paymentsPerDay(S: number, ticketWon: number): number {
  return (S * 1e4) / 30 / ticketWon
}

/** 일반과세자의 부가세 몫 어림(매출 대비) — (매출 − 매입) ÷ 11, 매입 = 원가 */
export function vatShare(costRate: number): number {
  return Math.max(0, 1 - costRate) / 11
}
