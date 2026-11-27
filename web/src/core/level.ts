// 매출 수준(추정) — 서울 그 업종의 평균 상권 대비 % 차이를 쉬운 말과 색 단계로 바꾼다.
// 값은 export_web.py가 0.1% 단위 정수(×10)로 쓴다: -263 = 26.3% 낮음, null = 추정하지 않는 칸.

/** 단계 경계(%) — 7단계: 절반 이하 · 30~50% 낮음 · 10~30% 낮음 · 비슷함(±10%) · 10~40% 높음 · 40%~2배 · 2배 넘음 */
export const LEVEL_BREAKS = [-50, -30, -10, 10, 40, 100] as const

/** 한 줄 범례(지도 위 막대) 아래에 적는 쉬운 말 세 마디 — 두 끝 단계와 가운데(비슷함, 단계 3). 일곱 단계 이름은 범례를 펴면 나온다 */
export const LEVEL_SHORT = { lo: '절반 이하', mid: '비슷', hi: '2배 넘음', midAt: 3 } as const

export const LEVEL_LABELS = [
  '평균의 절반 이하',
  '30~50% 낮음',
  '10~30% 낮음',
  '비슷함 (±10%)',
  '10~40% 높음',
  '40% 높음 ~ 2배',
  '2배 넘음',
] as const

/** 저장값(×10 정수)을 % 차이로 */
export function toPct(raw: number | null | undefined): number | null {
  return raw == null ? null : raw / 10
}

/** % 차이 → 단계 번호(0~6), 추정하지 않으면 -1 */
export function levelClass(pct: number | null): number {
  if (pct == null || Number.isNaN(pct)) return -1
  let c = 0
  for (const b of LEVEL_BREAKS) if (pct >= b) c++
  return c
}

/** 일곱 단계 막대의 두 끝 — 절반 이하 단계는 −80%부터, 2배 넘음 단계는 +200%까지를 단계 폭으로 본다 */
const POS_EDGES = [-80, ...LEVEL_BREAKS, 200] as const

/** % 차이 → 일곱 단계 막대(단계마다 같은 폭, 지도 칸 색 순서) 위 자리 0~1 — 단계 안에서는 값 비율로 (자리 카드의 추정 막대, 화면 다시 잡기 11-25) */
export function levelPos(pct: number): number {
  const c = Math.max(0, levelClass(pct))
  const lo = POS_EDGES[c], hi = POS_EDGES[c + 1]
  const f = Math.min(1, Math.max(0, (pct - lo) / (hi - lo)))
  return (c + f) / 7
}

/** % 차이 → 문장 조각. 10% 단위로 둥글게, 2배 언저리부터는 '○.○배' (마스터플랜 W7.4 한 줄 요약 규칙) */
export function levelText(pct: number | null): string {
  if (pct == null || Number.isNaN(pct)) return '추정하지 않음'
  const ratio = 1 + pct / 100
  if (pct >= 95) return `${(Math.round(ratio * 10) / 10).toFixed(1)}배` // 둥글리면 '100% 높음'이 될 값부터 배수로
  if (pct >= 10) return `${Math.round(pct / 10) * 10}% 높음`
  if (pct <= -90) return '90% 넘게 낮음'
  if (pct <= -10) return `${Math.round(-pct / 10) * 10}% 낮음`
  return '비슷함'
}

/** 모형의 힘 — 처음 보는 구에서 상권 매출 순서를 맞힌 정도(순위상관)를 세 단계 말로 (마스터플랜 W7.13) */
export function strength(rho: number): '보통' | '약함' | '아주 약함' {
  if (rho >= 0.3) return '보통'
  if (rho >= 0.2) return '약함'
  return '아주 약함'
}

/** 반경 300m 가게 수 단계 — 업종을 고르기 전 '가게가 모인 정도' */
export const STORE_BREAKS = [10, 50, 150, 400] as const
export const STORE_LABELS = ['10곳 미만', '10~50곳', '50~150곳', '150~400곳', '400곳 이상'] as const

export function storeClass(n: number): number {
  let c = 0
  for (const b of STORE_BREAKS) if (n >= b) c++
  return c
}
