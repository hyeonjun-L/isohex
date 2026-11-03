// 후보 찾기 화면의 규칙 — 고른 업종(상가정보 소분류 247)에 맞춘 '비슷한 자리' 범위 · 같은 업종 상한 고르기 · 주소 상태 · 깔때기 · 목록 · '왜' 글자
// (마스터플랜 W7.4 '후보 찾기', §5.18). 거르기 · 순서 · 띄우기 · 등시선 계산은 candidates.ts 그대로다.
// · 비슷한 자리 = 그 업종 가게가 지금 있는 칸의 가운데 80%(반경 300m 가게 수 · 주택가 정도). 가게 하나를 한 번씩 센다 —
//   p24(무인 6종)와 같은 셈이라 같은 가게 수를 넣으면 같은 범위가 나온다(tests/find.test.ts). 무인 명단 기준은 무인매장 묶음에서
// · 같은 업종 상한은 동네 보기 '같은 업종' 지도의 단계 경계에 맞춘다 — 지도에서 본 색 단계로 거를 수 있게
import { CN, PASS_COMP, PASS_SITE, PASS_TIME, SORT_NM, type CandGrid, type CandQuery, type CandResult, type CandStat, type SiteBand, type SortKey } from './candidates'
import { comma } from './format'
import { sameBreaks } from './layers'
import { quantile } from './site'
import { MAX_MIN, timeText, type Mode, type Period } from './travel/times'

/** 가게가 이보다 적은 업종은 '비슷한 자리' 범위를 내지 않는다 */
export const BAND_MIN = 30

export const MODE_NM: Record<Mode, string> = { car: '자동차', pt: '대중교통', walk: '도보' }
export const PER_NM: Record<Period, string> = { day: '평일 낮', am: '출근', pm: '퇴근' }
export const PER_HOURS: Record<Period, string> = { day: '10~16시', am: '7~9시', pm: '18~20시' }

/** 걸리는 시간 고르기(분) */
export const MIN_MIN = 10
export const MIN_STEP = 5

/** 소수 셋째 자리 — 파이썬 round(x, 3)처럼 딱 반이면 짝수 쪽 */
function round3(v: number): number {
  const s = v * 1000, f = Math.floor(s), d = s - f
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1
  return r / 1000
}

/** 업종 가게가 있는 칸의 10 · 50 · 90% — cnt는 칸마다 그 업종 가게 수, tilt는 ×1000 정수. 가게가 BAND_MIN보다 적으면 null */
export function kindBand(cnt: ArrayLike<number>, n300: ArrayLike<number>, tilt1000: ArrayLike<number>): SiteBand | null {
  let total = 0
  for (let i = 0; i < cnt.length; i++) total += cnt[i]
  if (total < BAND_MIN) return null
  const a = new Float64Array(total), b = new Float64Array(total)
  let k = 0
  for (let i = 0; i < cnt.length; i++) {
    for (let r = 0; r < cnt[i]; r++) {
      a[k] = n300[i]
      b[k] = tilt1000[i] / 1000
      k++
    }
  }
  a.sort()
  b.sort()
  const q = (s: Float64Array) => [0.1, 0.5, 0.9].map((p) => round3(quantile(s, p))) as [number, number, number]
  return { n300: q(a), tilt: q(b) }
}

/** 두 범위에 다 드는 서울 칸 몫 */
export function bandPass(B: SiteBand, n300: ArrayLike<number>, tilt1000: ArrayLike<number>): number {
  let c = 0
  for (let i = 0; i < n300.length; i++) {
    const t = tilt1000[i] / 1000
    if (n300[i] >= B.n300[0] && n300[i] <= B.n300[2] && t >= B.tilt[0] && t <= B.tilt[2]) c++
  }
  return c / Math.max(n300.length, 1)
}

/** 같은 업종 상한 고르기 — 제한 없음(−1) · 없는 곳만(0) · 같은 업종 지도 단계의 위 끝 */
export function compOptions(near: ArrayLike<number>): number[] {
  const out = [-1, 0]
  for (const b of sameBreaks(near)) if (b - 1 > 0 && !out.includes(b - 1)) out.push(b - 1)
  return out
}

export function compText(c: number): string {
  return c < 0 ? '제한 없음' : c === 0 ? '없는 곳만' : `${comma(c)}곳 이하`
}

// ── 주소 상태 ───────────────────────────────────────────────────

export interface FindState {
  /** 기준 칸 (없으면 예시 — 시청역) */
  from: number | null
  by: Mode
  at: Period
  /** 걸리는 시간(분) — 10~60, 5분 단위 */
  min: number
  /** 비슷한 자리만 */
  like: boolean
  /** 같은 업종(이 칸 + 둘레) 상한, −1 = 제한 없음 */
  comp: number
  /** 순서 — null이면 업종의 기본 */
  sort: SortKey | null
}

export const FIND_DEFAULT: Omit<FindState, 'from'> = { by: 'car', at: 'day', min: 30, like: true, comp: -1, sort: null }

const MODES: Mode[] = ['car', 'pt', 'walk']
const PERS: Period[] = ['day', 'am', 'pm']
const SORTS: SortKey[] = ['pot', 'res', 'few', 'near']

/** 주소에서 — 모르는 값은 기본으로 */
export function readFind(q: URLSearchParams, cellOf: (h3: string) => number): FindState {
  const from = q.get('from'), min = Number(q.get('min')), comp = Number(q.get('comp'))
  const i = from ? cellOf(from) : -1
  return {
    from: i >= 0 ? i : null,
    by: MODES.find((m) => m === q.get('by')) ?? FIND_DEFAULT.by,
    at: PERS.find((p) => p === q.get('at')) ?? FIND_DEFAULT.at,
    min: Number.isInteger(min) && min >= MIN_MIN && min <= MAX_MIN && min % MIN_STEP === 0 ? min : FIND_DEFAULT.min,
    like: q.get('like') !== '0',
    comp: q.has('comp') && Number.isInteger(comp) && comp >= -1 ? comp : FIND_DEFAULT.comp,
    sort: SORTS.find((s) => s === q.get('sort')) ?? null,
  }
}

/** 주소에 — 기본과 다른 것만 */
export function writeFind(q: URLSearchParams, s: FindState, h3: readonly string[]) {
  q.set('mode', 'find')
  if (s.from != null) q.set('from', h3[s.from])
  if (s.by !== FIND_DEFAULT.by) q.set('by', s.by)
  if (s.at !== FIND_DEFAULT.at && s.by !== 'walk') q.set('at', s.at)
  if (s.min !== FIND_DEFAULT.min) q.set('min', String(s.min))
  if (!s.like) q.set('like', '0')
  if (s.comp !== FIND_DEFAULT.comp) q.set('comp', String(s.comp))
  if (s.sort) q.set('sort', s.sort)
}

// ── 글자 ────────────────────────────────────────────────────────

/** '자동차 30분 · 평일 낮' (도보는 시간대 없음) */
export function tripText(s: Pick<FindState, 'by' | 'at' | 'min'>): string {
  return `${MODE_NM[s.by]} ${s.min}분${s.by === 'walk' ? '' : ` · ${PER_NM[s.at]}`}`
}

export interface FunnelRow {
  k: string
  v: string
  last?: boolean
}

/** 깔때기 — '자동차 30분 안 3,378칸 → 비슷한 자리 … → 같은 업종 … → 20곳' */
export function funnelRows(st: CandStat, s: Pick<FindState, 'by' | 'min' | 'comp'>, kindNm: string, likeOn: boolean, sort: SortKey): FunnelRow[] {
  const rows: FunnelRow[] = [{ k: `${MODE_NM[s.by]} ${s.min}분 안에 닿는 칸`, v: `${comma(st.reach)}칸` }]
  if (likeOn) rows.push({ k: `그중 ${kindNm} 자리와 비슷한 칸`, v: `${comma(st.prof)}칸` })
  if (s.comp >= 0) rows.push({ k: s.comp === 0 ? '그중 같은 업종이 없는 칸' : `그중 같은 업종이 ${comma(s.comp)}곳 이하인 칸`, v: `${comma(st.comp)}칸` })
  rows.push({ k: `${SORT_NM[sort]}으로 뽑은 후보`, v: `${st.picked}곳`, last: true })
  return rows
}

/** 후보가 20곳보다 적을 때 */
export function shortText(st: CandStat): string | null {
  if (st.picked >= CN) return null
  return st.comp ? `조건에 맞는 칸이 적어 ${st.picked}곳만 뽑았어요.` : '조건에 맞는 칸이 없어요. 시간을 늘리거나 조건을 풀어 보세요.'
}

/** 비슷한 자리 설명 — 서울 칸의 주택가 정도 오름차순(tiltSorted, ×1000)으로 양 끝에서 뺀 몫을 말한다 */
export function bandText(B: SiteBand, kindNm: string, stores: number, tiltSorted: ArrayLike<number>, pass: number): string[] {
  let lo = 0, hi = 0
  for (let i = 0; i < tiltSorted.length; i++) {
    const t = tiltSorted[i] / 1000
    if (t < B.tilt[0]) lo++
    else if (t > B.tilt[2]) hi++
  }
  const n = Math.max(tiltSorted.length, 1), pl = Math.round((lo / n) * 100), ph = Math.round((hi / n) * 100)
  const ends = [pl ? `회사·학교 쪽 끝 ${pl}%` : '', ph ? `주택가 쪽 끝 ${ph}%` : ''].filter(Boolean).join('와 ')
  return [
    `${kindNm} ${comma(stores)}곳이 지금 있는 칸의 가운데 80% — 반경 300m 가게 ${comma(Math.round(B.n300[0]))}~${comma(Math.round(B.n300[2]))}곳` +
      (ends ? `, 주택가 정도는 서울 칸 가운데 ${ends}를 뺀 사이예요.` : '이에요.'),
    `두 범위에 다 드는 칸만 남겨요 — 서울 칸의 ${Math.round(pass * 100)}%.`,
  ]
}

/** 순서 설명 */
export function sortText(sort: SortKey, potNm: string | null): string {
  return {
    pot: `${potNm ?? ''} 매출 수준(추정)이 높은 칸부터 — 동네 보기 '매출 수준'과 같은 값이에요. 가게가 드물어 추정하지 않는 칸은 뒤로 가요.`,
    res: '주민이 많은 칸부터 — 둘레에 사는 사람(SGIS 100m 격자)에 닿기 쉬운 정도예요.',
    few: '같은 업종 가게(이 칸 + 둘레 6칸)가 적은 칸부터, 같으면 가까운 칸부터.',
    near: '기준점에서 가까운 칸부터.',
  }[sort]
}

export const SPACING_TEXT = '붙어 있는 칸은 사실상 같은 자리라, 먼저 뽑힌 후보에서 0.7km 안인 칸은 건너뛰어요. 값을 섞은 점수는 만들지 않아요 — 시간과 조건은 거르기만 하고 순서는 하나만 써요.'

/** 걸리는 시간을 낸 방법 */
export function methodText(by: Mode, at: Period): string {
  if (by === 'car')
    return 'OpenStreetMap 길을 따라 잰 칸 사이 시간을 이었어요. 속도는 서울 낮 평균(도시고속도로 49.9 · 간선 23.7 · 보조간선 21.0km/h, 서울연구원 2023)이고 신호 대기 · 주차는 넣지 않았어요.' +
      (at === 'day' ? '' : ` ${PER_NM[at]} 시간은 서울시 2025년 평균 속도(평일 21.7 · 출근 22.5 · 퇴근 19.8km/h)에 맞춰 길 위 시간을 줄이거나 늘렸어요.`) +
      ' 걷는 편이 빠른 칸은 걷는 시간이에요.'
  if (by === 'pt')
    return `걷기(4.5km/h)에 지하철과 버스를 더했어요. 버스는 정류장 사이를 실제로 걸린 시간과 그 시간대 배차(서울시 교통정보센터, 2026년 9월 평일 ${PER_HOURS[at]})로, 지하철은 노선별 평균 속도로 달려요. ` +
      '기다림은 배차의 절반(버스는 최대 15분), 역 들고 나기 2분씩, 지하철 갈아타기는 역마다 환승 거리로 잰 시간을 넣었어요.'
  return '걷기 4.5km/h(계단은 그 0.6배)로 길을 따라 잽니다. 시간대와 상관없어요.'
}

/** 시간 띠 범례 — 정한 시간까지 */
export function timeLegend(min: number): { label: string; c: number }[] {
  const edges = [10, 20, 30, 45, 60]
  const out: { label: string; c: number }[] = []
  for (let b = 0; b < edges.length; b++) {
    const lo = b ? edges[b - 1] : 0
    if (lo >= min) break
    const hi = Math.min(edges[b], min)
    out.push({ label: b ? `${lo}~${hi}분` : `${hi}분 안`, c: b })
  }
  return out
}

/** 칸 하나가 왜 후보인가 / 왜 빠졌나 — 쉬운 말로 (candidates.ts whyText와 같은 판단) */
export function findWhy(i: number, g: CandGrid, q: CandQuery, r: CandResult, kindNm: string, by: Mode): string {
  const f = r.pass[i], B = q.site, why: string[] = []
  if (!(f & PASS_TIME)) why.push(`${MODE_NM[by]} ${q.min}분 밖이에요 (${timeText(q.times[i])})`)
  if (!(f & PASS_SITE) && B) {
    const n3 = g.n300[i], tl = g.tilt[i] / 1000
    if (n3 < B.n300[0]) why.push(`반경 300m 가게가 적어요 — ${comma(n3)}곳 (${kindNm} 자리는 ${comma(Math.round(B.n300[0]))}곳부터)`)
    else if (n3 > B.n300[2]) why.push(`반경 300m 가게가 많아요 — ${comma(n3)}곳 (${kindNm} 자리는 ${comma(Math.round(B.n300[2]))}곳까지)`)
    if (tl < B.tilt[0]) why.push(`일하러·배우러 오는 사람 쪽이 ${kindNm} 자리보다 강해요`)
    else if (tl > B.tilt[2]) why.push(`사는 사람 쪽이 ${kindNm} 자리보다 강해요`)
  }
  if (!(f & PASS_COMP)) why.push(`같은 업종이 이 칸 + 둘레에 ${comma(q.cntw[i])}곳 — 정한 상한(${compText(q.comp)})보다 많아요`)
  if (why.length) return `조건 밖 — ${why.join(' · ')}`
  if (r.rank[i]) return `조건에 맞아 ${SORT_NM[q.sort]}으로 ${r.rank[i]}번째예요`
  return r.skip[i] ? '조건에 맞지만 0.7km 안에 먼저 뽑힌 후보가 있어 건너뛰었어요' : `조건에 맞지만 ${CN}곳 안에 들지 않았어요`
}

/** 카드 머리 — '후보 3 · 자동차 18분' · '자동차 42분' · '자동차 60분 넘음' */
export function findHead(i: number, r: CandResult, times: ArrayLike<number>, by: Mode): string {
  const t = `${MODE_NM[by]} ${timeText(times[i])}`
  return r.rank[i] ? `후보 ${r.rank[i]} · ${t}` : t
}

/** 예시 기준점 안내 */
export function exampleNote(label: string): string {
  return `지금 기준점은 예시(${label})예요. 집이나 일터를 찾거나 지도에서 찍어 바꾸세요.`
}

/** 업종 없이 열었을 때 */
export function needKindText(): string {
  return '업종을 먼저 고르세요 — 그 업종 가게가 있는 자리와 비슷한 곳, 같은 업종이 적은 곳을 찾아요.'
}
