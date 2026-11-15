// 맞힘 성적(성적표) — 모형이 높다 · 낮다고 본 상권이 실제로 어땠는지를 쉬운 말로 (마스터플랜 W7.16 '맞힘 성적을 쉬운 말로').
// 자료: ind/index.json의 hit([위, 아래] — 처음 보는 구에서 위 20% · 아래 20%로 본 상권 가운데 실제 가게당 매출이 그 업종 가운데 값을 넘은 몫,
// 운이면 둘 다 0.5) · lift(위 20% ÷ 아래 20% 실제 매출 배수) · ny(다음 해 성적 [위, 아래]) · manifest model.score · model.next_year(칠하는 업종의 가운데 값).
// '처음 보는 구' = 자치구 하나를 통째로 빼고 배운 뒤 그 구를 맞혀 본 것(p26). 다음 해 = 한 해 앞 자료만으로 배운 같은 모형을 이듬해 실제와 견준 것
import type { Industry, Manifest } from './data'

/** 0.68 → '10곳 중 7곳' */
export function tenOf(p: number): string {
  return `10곳 중 ${Math.round(Math.min(1, Math.max(0, p)) * 10)}곳`
}

/** '2025Q1~2025Q4' → '2025년' · '2026Q1~2026Q2' → '2026년 상반기' · 그 밖은 '2025년 3분기~2026년 2분기' */
export function spanText(s: string): string {
  const m = /^(\d{4})Q(\d)~(\d{4})Q(\d)$/.exec(s)
  if (!m) return s
  const [, y0, q0, y1, q1] = m
  if (y0 === y1) {
    if (q0 === '1' && q1 === '4') return `${y0}년`
    if (q0 === '1' && q1 === '2') return `${y0}년 상반기`
    if (q0 === '3' && q1 === '4') return `${y0}년 하반기`
  }
  return `${y0}년 ${q0}분기~${y1}년 ${q1}분기`
}

/** '높다고 본 상권(위 20%)은 10곳 중 8곳, 낮다고 본 상권(아래 20%)은 10곳 중 2곳' */
function pair(hit: readonly [number, number]): string {
  return `높다고 본 상권(위 20%)은 ${tenOf(hit[0])}, 낮다고 본 상권(아래 20%)은 ${tenOf(hit[1])}`
}

/** 자리 카드 '얼마나 믿을 수 있나' 첫 줄 — 성적이 없으면(옛 자료) 순위상관만 */
export function cardScore(nm: string, rho: number, hit?: readonly [number, number] | null): string {
  if (!hit) return `처음 보는 구에서 상권 매출 순서를 맞힌 정도 ${rho.toFixed(2)} (1이면 완벽, 0이면 운). 여러 자리를 견주는 데 쓰세요`
  return `처음 보는 구에서 시험하니 ${pair(hit)}이 실제로 ${nm} 가운데 값보다 많이 팔았어요(운이면 둘 다 5곳). 여러 자리를 견주는 데 쓰세요 · 순위상관 ${rho.toFixed(2)}`
}

export interface ScoreLine {
  key: 'ind' | 'ny' | 'all' | 'how'
  head: string
  text: string
}

/** 동네 보기 '이 지도, 얼마나 맞나요?' — 이 업종 · 다음 해 · 칠하는 업종 전체 · 읽는 법. 성적이 없는 자료면 빈 배열 */
export function scoreLines(ind: Pick<Industry, 'nm' | 'hit' | 'lift' | 'ny'>, model: Manifest['model']): ScoreLine[] {
  if (!ind.hit) return []
  const out: ScoreLine[] = [{
    key: 'ind',
    head: ind.nm,
    text: `${pair(ind.hit)}에서 실제 가게당 매출이 업종 가운데 값을 넘었어요.${ind.lift ? ` 위 20% 상권의 가게당 매출은 아래 20%의 ${ind.lift.toFixed(1)}배였어요.` : ''}`,
  }]
  const ny = model?.next_year
  if (ind.ny && ny)
    out.push({ key: 'ny', head: '다음 해에도', text: `${spanText(ny.train)} 자료만으로 배운 같은 모형은 ${spanText(ny.test)}에 ${tenOf(ind.ny[0])} · ${tenOf(ind.ny[1]).replace('10곳 중 ', '')}이었어요.` })
  const s = model?.score
  if (s)
    out.push({
      key: 'all',
      head: `칠하는 ${s.ind}개 업종`,
      text: `가운데 값은 ${tenOf(s.top)} · ${tenOf(s.bot).replace('10곳 중 ', '')}${ny ? ` (다음 해 ${tenOf(ny.top).replace('10곳 중 ', '')} · ${tenOf(ny.bot).replace('10곳 중 ', '')})` : ''}이에요.`,
    })
  out.push({
    key: 'how',
    head: '읽는 법',
    text: '모형이 보지 못한 자치구에서 잰 성적이에요 — 구 하나를 통째로 빼고 배운 뒤 그 구를 맞혀 봤어요. 운으로 찍으면 둘 다 10곳 중 5곳이에요. 실제 매출 금액을 맞히는 값이 아니라 자리끼리 견주는 데 쓰는 값이에요.',
  })
  return out
}
