// 자리 성격 — 칸마다 주택가 정도와 접근성 순위(grid/site.json), 반경 300m 가게 수(cells.json)로 '어떤 자리인가'를 말한다
// (마스터플랜 W7.4 '한 줄 요약 규칙'. 기준은 서울 칸 분위수 — 2026-11-03 정함, 아래 placeType).
// 접근성 값 자체는 싣지 않는다 — 주택가 정도(두 접근성의 차)와 순위(그 칸보다 값이 큰 칸 수)만 (W7.8)

/** grid/site.json */
export interface SiteData {
  /** 주택가 정도 ×1000 — 거주 접근성 − 출근·등교 접근성(log). 클수록 사는 사람 쪽 */
  tilt: number[]
  /** 그 칸보다 거주 접근성이 큰 칸 수 (0이 가장 높고, 값이 같으면 같은 수) */
  rr: number[]
  /** 출근·등교 접근성 순위 */
  rw: number[]
  /** 기타 도착(쇼핑·병원 등) 접근성 순위 */
  ro: number[]
}

/** 정렬된 수의 분위수 — numpy 기본(선형 보간)과 같은 셈 */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (!n) return NaN
  const pos = q * (n - 1), lo = Math.floor(pos), hi = Math.min(n - 1, lo + 1)
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo])
}

/** 자리 성격 기준 — 서울 칸 분위수 (가게 수는 곳, 주택가 정도는 ×1000 정수 그대로) */
export interface SiteCuts {
  /** 이보다 적으면 가게가 거의 없는 곳 */
  few: number
  /** 가게 수 가운데(50%) · 위 10%(90%) */
  n50: number
  n90: number
  /** 주택가 정도 아래 25% · 위 40%(60%) */
  t25: number
  t60: number
}

export function siteCuts(n300: ArrayLike<number>, tilt: ArrayLike<number>): SiteCuts {
  const ns = Float64Array.from(n300).sort(), ts = Float64Array.from(tilt).sort()
  return { few: 10, n50: quantile(ns, 0.5), n90: quantile(ns, 0.9), t25: quantile(ts, 0.25), t60: quantile(ts, 0.6) }
}

export type PlaceType = 'few' | 'busy' | 'work' | 'home' | 'mixed'

/**
 * 자리 성격 하나 — 순서대로 본다.
 * 가게 10곳 미만 → 가게가 거의 없는 곳 · 가게 서울 위 10% → 번화가 · 주택가 정도 아래 25% + 가게 가운데 이상 → 업무 중심 ·
 * 주택가 정도 위 40% → 주거지 · 나머지 → 섞인 곳.
 * (시청·명동·역삼·여의도처럼 가게가 아주 많은 업무지는 번화가로 두고 '일하러 오는 사람이 많다'를 덧붙인다 — placeText)
 */
export function placeType(n300: number, tilt: number, c: SiteCuts): PlaceType {
  if (n300 < c.few) return 'few'
  if (n300 >= c.n90) return 'busy'
  if (tilt <= c.t25 && n300 >= c.n50) return 'work'
  if (tilt >= c.t60) return 'home'
  return 'mixed'
}

/** 자리 성격 문장 (마침표 없이) */
export function placeText(n300: number, tilt: number, c: SiteCuts): string {
  switch (placeType(n300, tilt, c)) {
    case 'few':
      return '가게가 거의 없는 곳이에요'
    case 'busy':
      if (tilt <= c.t25) return '가게가 아주 많은 번화가예요 — 일하러·배우러 오는 사람이 많아요'
      if (tilt >= c.t60) return '가게가 아주 많은 번화가예요 — 둘레에 사는 사람도 많아요'
      return '가게가 아주 많은 번화가예요'
    case 'work':
      return '회사·학교가 많은 업무 중심지예요'
    case 'home':
      return '사는 사람이 많은 주거지예요'
    default:
      return '사는 곳과 가게가 섞인 곳이에요'
  }
}

/** 순위 → 위쪽 몫 (0 = 서울 칸 가운데 가장 높음) */
export function upOf(rank: number, n: number): number {
  return rank / n
}

/** 위쪽 몫 → '위쪽 3%' · '가운데쯤' · '아래쪽 10%' (위·아래 30% 안만 숫자로) */
export function sideText(up: number): string {
  const p = Math.round(up * 100)
  if (p <= 30) return `위쪽 ${Math.max(1, p)}%`
  if (p >= 70) return `아래쪽 ${Math.max(1, 100 - p)}%`
  return '가운데쯤'
}
