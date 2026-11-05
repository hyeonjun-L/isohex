// 손익 점검 화면 규칙 — 고른 업종(상가정보 소분류)으로 견줄 서울시 업종을 찾고, 예시 입력 · 주소 상태 · 쉬운 말 문장을 만든다
// (마스터플랜 W7.4 '손익 점검' · §5.14). 계산(손익분기 · 카드 수수료 · 진입 뒤 평균 · 분포 위치)은 breakeven.ts, 월세 견주기는 rent.ts 그대로다.
// 화면 말은 손익분기 → '본전 매출'(W7.13 '말 바꾸기 더하기'), 본전을 하루 결제 건수로도 말한다
// 견줄 업종 = be/index.json 업종의 codes(p26 업종 대응표)에 고른 업종 코드가 든 것. 셀프 빨래방은 견주지 않는다(W7.15)
import {
  type BeIndustry, type BeVal, type CardTable, type Reference, fixedCost, overPreferential, paymentsPerDay, profitAt, reference, shareAbove, solve,
} from './breakeven'
import { comma, josa } from './format'
import { FLOORS, type FloorKey, perSqm, rebAtFloor, compareRent, type RebRent } from './rent'

/** be/index.json 업종 한 줄 */
export interface BeInd extends BeIndustry {
  grp: string
  /** 원가율 기본값의 근거 */
  vsrc: string
  /** 카드 매출 포착 — ok 외부 자료와 비슷 · low 낮게 잡힘 · unk 확인 못 함 */
  cap: 'ok' | 'low' | 'unk'
  capnote: string
  /** 점포당 하루 결제(서울) */
  tx: number
  /** 이 서울시 업종에 대응하는 상가정보 소분류 */
  codes: string[]
  /** 대응이 맞는 정도 — 합계비율(서울시 점포 ÷ 상가정보 점포) · 상권별 점포 수 순위상관 · 매출 수준 모형에 썼나 */
  fit: { ratio: number; rho: number; ok: boolean } | null
}

export interface BeMeta {
  qs: number[]
  card: CardTable
  year: number
}

/** 셀프 빨래방은 서울시 '세탁소'(맡기는 세탁소 위주) 매출과 견주지 않는다 — 무인 빨래방 가맹점 매출은 무인매장 묶음에서 (W7.15) */
export const BE_SKIP = new Set(['S20902'])

/** 고른 업종에 대응하는 서울시 업종 — 없으면 null */
export function beFor(kindCode: string, inds: readonly BeInd[]): BeInd | null {
  if (BE_SKIP.has(kindCode)) return null
  return inds.find((d) => d.codes.includes(kindCode)) ?? null
}

// ── 입력 ────────────────────────────────────────────────────────

export interface CheckInputs {
  /** 계약면적 ㎡ (전용 + 공용) */
  area: number
  /** 만 원/월 */
  rent: number
  /** 보증금 만 원 — 월세 견주기에만(1%를 월세에 더한다) */
  dep: number
  mgmt: number
  labor: number
  other: number
  /** 초기 투자 만 원 · 회수 개월 */
  inv: number
  months: number
  /** 원가율 · 기타 변동비 (%) — 원가율 null이면 업종 기본값 */
  cost: number | null
  other2: number
  /** 층 — 월세 견주기에만 */
  floor: FloorKey
}

/** 예시 값 (예전 뷰어 BE_DEF) — 처음엔 예시라고 밝힌다 */
export const CHECK_DEFAULT: CheckInputs = { area: 50, rent: 250, dep: 3000, mgmt: 30, labor: 0, other: 50, inv: 6000, months: 36, cost: null, other2: 0, floor: '1' }

/** 아직 예시 값 그대로인가 */
export function isExample(inp: CheckInputs): boolean {
  return (Object.keys(CHECK_DEFAULT) as (keyof CheckInputs)[]).every((k) => inp[k] === CHECK_DEFAULT[k])
}

const MAIN = ['area', 'rent', 'dep', 'mgmt'] as const
const MORE = ['labor', 'other', 'inv', 'months', 'cost', 'other2'] as const
const FLOOR_KEYS: FloorKey[] = ['1', '2', '3', '-1']

const num = (s: string | undefined, min = 0) => {
  const v = Number(s)
  return s != null && s !== '' && Number.isFinite(v) && v >= min ? v : null
}

/** 주소에서 — in=면적_월세_보증금_관리비 · inx=인건비_기타_투자_회수_원가율_기타변동_층 (빈칸이면 예시 값. 층에 '-1'이 있어 '_'로 나눈다) */
export function readCheck(q: URLSearchParams): CheckInputs {
  const out: CheckInputs = { ...CHECK_DEFAULT }
  const a = (q.get('in') ?? '').split('_'), b = (q.get('inx') ?? '').split('_')
  MAIN.forEach((k, j) => {
    const v = num(a[j], k === 'area' ? 1 : 0)
    if (v != null) out[k] = v
  })
  MORE.forEach((k, j) => {
    const v = num(b[j], k === 'months' ? 1 : 0)
    if (v == null) return
    if (k === 'cost') out.cost = Math.min(v, 99)
    else if (k === 'other2') out.other2 = Math.min(v, 99)
    else out[k] = v
  })
  const fl = b[MORE.length]
  if (FLOOR_KEYS.includes(fl as FloorKey)) out.floor = fl as FloorKey
  return out
}

/** 주소에 — 예시 값과 다른 것만 (원가율은 업종 기본과 다를 때만) */
export function writeCheck(q: URLSearchParams, inp: CheckInputs) {
  const D = CHECK_DEFAULT
  const a = MAIN.map((k) => (inp[k] !== D[k] ? String(inp[k]) : ''))
  const b = [...MORE.map((k) => (inp[k] !== D[k] && inp[k] != null ? String(inp[k]) : '')), inp.floor !== D.floor ? inp.floor : '']
  const trim = (x: string[]) => {
    let n = x.length
    while (n && !x[n - 1]) n--
    return x.slice(0, n).join('_')
  }
  if (trim(a)) q.set('in', trim(a))
  if (trim(b)) q.set('inx', trim(b))
}

// ── 계산 한 번 ──────────────────────────────────────────────────

export interface CheckResult {
  /** 월 고정비 · 변동비(원가 + 기타, 0~1) · 카드 수수료율 */
  F: number
  v: number
  r: number
  /** 본전 매출(손익분기 월매출, 만 원) — 변동비와 수수료가 100%를 넘으면 Infinity */
  S: number
  over: boolean
  ref: Reference
  /** 본전 매출 ÷ 견준 매출 */
  R: number
  /** 본전 매출을 하루 결제 건수로 */
  need: number
  /** 견준 매출의 60 · 80 · 100 · 120%일 때 월 손익 */
  profits: { f: number; X: number; P: number }[]
  /** 서울 이 업종 가게 가운데 점포당 평균 매출이 본전 매출을 넘는 상권에 있는 몫 */
  share: number
}

export function costRate(inp: CheckInputs, ind: Pick<BeInd, 'v'>): number {
  return inp.cost ?? Math.round(ind.v * 1000) / 10
}

export function runCheck(ind: BeInd, meta: BeMeta, inp: CheckInputs, s: BeVal | null, d: BeVal | null): CheckResult {
  const F = fixedCost({ rent: inp.rent, mgmt: inp.mgmt, labor: inp.labor, other: inp.other, inv: inp.inv, months: inp.months, costRate: 0, otherRate: 0 })
  const v = (costRate(inp, ind) + inp.other2) / 100
  const { S, r } = solve(F, v, meta.card)
  const ref = reference(ind, s, d)
  const ok = Number.isFinite(S)
  return {
    F, v, r, S,
    over: ok && overPreferential(S, meta.card),
    ref,
    R: ok ? S / ref.ref : Infinity,
    need: ok ? paymentsPerDay(S, ref.ticket) : Infinity,
    profits: [0.6, 0.8, 1, 1.2].map((f) => ({ f, X: ref.ref * f, P: profitAt(ref.ref * f, F, v, meta.card) })),
    share: ok ? shareAbove(ind, meta.qs, S) : 0,
  }
}

// ── 글자 ────────────────────────────────────────────────────────

/** 만 원 → '843만 원' · '1억 2,000만 원' */
export function won(x: number): string {
  const m = Math.round(x)
  if (Math.abs(m) >= 10000) {
    const e = Math.trunc(m / 10000), r = Math.abs(m % 10000)
    return `${e < 0 ? '−' : ''}${comma(Math.abs(e))}억${r ? ` ${comma(r)}만` : ''} 원`
  }
  return `${m < 0 ? '−' : ''}${comma(Math.abs(m))}만 원`
}

/** 월 손익 — '+134만 원' · '−52만 원' · '0원' */
export function signedWon(x: number): string {
  const m = Math.round(x)
  return m === 0 ? '0원' : `${m > 0 ? '+' : ''}${won(m)}`
}

/** 쉬운 말 판정 — breakeven.ts verdict와 같은 경계(0.6 · 0.85 · 1 · 1.3) */
export function verdictEasy(R: number, word: '평균' | '중앙값'): string {
  if (R < 0.6) return `${word}의 60%만 팔아도 남아요 — 여유가 큰 편이에요`
  if (R < 0.85) return `${word}보다 15% 넘게 덜 팔아도 남아요`
  if (R < 1) return `${word}만큼 팔면 남지만 여유가 크지 않아요`
  if (R < 1.3) return `${word}보다 더 팔아야 남아요`
  return `${word}보다 30% 넘게 더 팔아야 남아요 — 빠듯해요`
}

/** 결과 첫 문장 — 무엇과 견줬는지 */
export function leadText(res: CheckResult, ind: Pick<BeInd, 'nm'>): string {
  const what = res.ref.level === '서울' ? `서울 '${ind.nm}' 상권별 점포당 월매출의 가운데 값` : '이 동네 같은 업종 가게가 내가 들어간 뒤 올릴 평균 월매출'
  return `본전 매출은 ${what}(${won(res.ref.ref)})의 ${Math.round(res.R * 100)}%예요.`
}

export function shareEasy(ind: Pick<BeInd, 'nm'>, p: number): string {
  if (p >= 0.95) return `서울 '${ind.nm}' 가게의 95% 넘게가 점포당 평균 매출이 이 본전 매출을 넘는 상권에 있어요.`
  if (p <= 0.05) return `서울 '${ind.nm}' 가게 가운데 점포당 평균 매출이 이 본전 매출을 넘는 상권에 있는 곳은 5%가 안 돼요.`
  return `서울 '${ind.nm}' 가게의 약 ${Math.round(p * 100)}%가 점포당 평균 매출이 이 본전 매출을 넘는 상권에 있어요.`
}

/** 자료 글(합니다체) → 화면 말(해요체) — be/index.json의 capnote · vsrc는 옛 뷰어 글이라 끝말만 바꾼다 (시험이 60업종 글을 모두 돌려 본다) */
const HAEYO: [RegExp, string][] = [
  [/잡힙니다/g, '잡혀요'], [/큽니다/g, '커요'], [/못했습니다/g, '못했어요'], [/보입니다/g, '보여요'], [/비슷합니다/g, '비슷해요'],
  [/없습니다/g, '없어요'], [/않습니다/g, '않아요'], [/씁니다/g, '써요'], [/다릅니다/g, '달라요'], [/가져갑니다/g, '가져가요'],
]

export function haeyo(t: string): string {
  let s = t
  for (const [re, to] of HAEYO) s = s.replace(re, to)
  // '…입니다' — 앞 글자 받침에 따라 이에요 · 예요 ('%'는 '퍼센트'로 읽어 예요)
  return s.replace(/(\S)입니다/g, (_, w: string) => (w === '%' ? '%예요' : josa(w, '이에요', '예요')))
}

export const CAP_TEXT: Record<BeInd['cap'], string> = {
  ok: '카드 매출이 외부 자료와 비슷한 업종',
  low: '카드 매출이 실제보다 낮게 잡혔을 수 있는 업종',
  unk: '카드 매출을 외부 자료와 맞춰 보지 못한 업종',
}

/** 고른 업종과 서울시 업종이 어떻게 이어졌나 */
export function fitText(ind: Pick<BeInd, 'nm' | 'codes' | 'fit'>, kindNm: string): string {
  const head = `서울시 상권분석 '${ind.nm}'의 매출과 견줘요`
  const bundle = ind.codes.length > 1 ? ` — 상가정보 업종 ${ind.codes.length}개를 묶은 값이에요` : ''
  const weak = ind.fit && !ind.fit.ok ? ` · ${josa(kindNm, '과', '와')} 상권마다 가게 수가 잘 맞지 않는 짝이라 비교는 거칠게 보세요` : ''
  return head + bundle + weak
}

/** 견줄 업종이 없을 때 */
export function noBeText(kindNm: string, code: string): string {
  if (BE_SKIP.has(code)) return `${josa(kindNm, '은', '는')} 서울시 '세탁소' 매출(맡기는 세탁소 위주)과 맞지 않아 견주지 않아요. 무인 빨래방 가맹점 매출은 무인매장 묶음에서 붙여요. 아래에서 가장 가까운 업종을 직접 고를 수는 있어요.`
  return `${josa(kindNm, '은', '는')} 서울시 상권분석 업종과 바로 이어지지 않아요. 아래에서 가장 가까운 업종을 고르면 그 매출과 견줘요.`
}

/** 하루 결제로 바꾼 문장 — txHere는 견준 상권·행정동 가게의 하루 카드 결제 */
export function needText(res: CheckResult, txHere: number | null): string {
  const base = `하루로 바꾸면 결제 약 ${comma(Math.round(res.need))}건이에요 (객단가 ${comma(Math.round(res.ref.ticket / 100) * 100)}원, 30일 기준).`
  return txHere != null ? `${base} 이 동네 같은 업종 가게는 카드 결제가 하루 ${txHere.toFixed(1)}건으로 잡혀요.` : base
}

/** 계산 풀이 한 줄 */
export function calcText(res: CheckResult, inp: CheckInputs, cost: number): string {
  const dep = inp.inv / Math.max(1, inp.months)
  return `고정비 월 ${won(res.F)}(월세 ${won(inp.rent)} · 관리비 ${won(inp.mgmt)} · 인건비 ${won(inp.labor)} · 기타 ${won(inp.other)} · 투자 회수 ${won(dep)}) ÷ (1 − 변동비 ${((res.v + res.r) * 100).toFixed(1)}% = 원가 ${cost.toFixed(1)}% + 기타 ${inp.other2.toFixed(1)}% + 카드 ${(res.r * 100).toFixed(2)}%)` +
    (res.over ? '. 연매출 30억 원이 넘으면 우대 수수료 대상이 아니라 실제 카드 수수료는 더 높아요' : '')
}

/** 부가세 어림 안내 — 일반과세자: (매출 − 매입) ÷ 11, 매입 = 원가 */
export function vatHint(cost: number): string {
  return `일반과세자라면 부가세 몫도 기타 변동비에 — 지금 원가율이면 매출의 약 ${((Math.max(0, 100 - cost) / 11)).toFixed(1)}%예요 (매출에서 매입을 뺀 금액의 1/11로 어림)`
}

// ── 월세 수준 — 한국부동산원 조사 상권(서울 72곳)만 (행정동 임대시세는 공개판에 없다, W7.8) ──

export interface RentCheck {
  /** 내 월세(보증금 1% 포함) — 3.3㎡당 만 원 */
  myPy: number
  /** 그 상권 그 층 — 3.3㎡당 만 원 */
  basePy: number
  x: number
  word: '싼 편' | '비슷' | '비싼 편'
  name: string
  floorNm: string
  /** 층 환산을 그 상권 효용비율로 했나 */
  own: boolean
  ratio: number
}

const PY = 3.3058

export function rentCheck(inp: CheckInputs, reb: RebRent | null): RentCheck | null {
  if (!reb || inp.area <= 0) return null
  const fl = FLOORS[inp.floor], at = rebAtFloor(reb, fl)
  if (at.value == null) return null
  const my = perSqm(inp.rent, inp.dep, inp.area)!
  const c = compareRent(my, at.value)
  return { myPy: (my * PY) / 10, basePy: (at.value * PY) / 10, x: c.x, word: c.word, name: reb.n, floorNm: fl.nm, own: at.own, ratio: at.ratio }
}

export function rentText(rc: RentCheck, dep: number): string {
  const how = dep > 0 ? '보증금의 1%를 더하면' : '입력한 월세는'
  const tail = rc.word === '싼 편' ? '싼 편이에요' : rc.word === '비슷' ? '비슷한 수준이에요' : '비싼 편이에요 — 역 앞 · 큰길 1층처럼 그럴 만한 자리인지 따져 보세요'
  return `${how} 3.3㎡당 ${rc.myPy.toFixed(1)}만 원 — 이 상권(${rc.name}) ${rc.floorNm} 평균 ${rc.basePy.toFixed(1)}만 원의 ${rc.x.toFixed(2)}배로 ${tail}.`
}
