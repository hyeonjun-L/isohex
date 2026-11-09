// 무인매장 묶음 — 가맹 브랜드 정보공개서가 붙은 무인 6종(빨래방 · 스터디카페 · 아이스크림 · 카페 · 사진관 · 밀키트)을 업종처럼 고른다
// (마스터플랜 W7.4 '업종 고르기'의 무인매장 묶음 · 와이어프레임 T1m · T1n, §5.16 · §5.17 · W7.15).
// 상가정보는 무인 가게를 따로 나누지 않아 코드를 'UN-<영문>'으로 따로 둔다. 업종 247과 다른 점:
//  · 무인 가게 지도 — 서울시 무인점포 명단 중 이름으로 상가정보에 붙인 곳(명단의 약 절반, cand/index.json의 un)
//  · 같은 업종 — 그 유형과 손님을 나누는 가게(유형마다 정한 코드 · 이름 규칙, cand/index.json의 cnt — 상가정보 2025Q4)
//  · 비슷한 자리 — 명단의 무인 가게가 있는 칸의 가운데 80% (p24와 같은 셈, find.ts kindBand)
//  · 매출 · 창업비 — 정보공개서의 브랜드 가운데 값(unm/index.json). 자리별 매출 수준은 칠하지 않는다
//    (W7.15 — 무인 가게는 업종 전체와 다른 자리를 골라, 업종 전체로 배운 값이 맞지 않는다)
//  · 생존 — 그 유형이 주로 실린 업종의 값. 같은 코드 안에서 무인이 더 빨리 닫는다는 증거는 없다(§5.16)
import { type CardTable, fixedCost, overPreferential, profitAt, solve } from './breakeven'
import { type CheckInputs, CHECK_DEFAULT, costRate, haeyo, won } from './check'
import { comma, josa, man } from './format'
import type { Kind } from './kinds'
import type { FloorKey } from './rent'

export const UN_GROUP = '무인매장'
const PREFIX = 'UN-'

export type Trend = 'up' | 'flat' | 'slow' | 'down'

/** 가맹 브랜드 하나 — 정보공개서의 기본값 브랜드(매출을 낸 가맹점 30곳 이상 · 유인 형식과 섞이지 않음) */
export interface UnBrand {
  nm: string
  /** 가맹점 평균 월매출(만 원) */
  sales: number
  /** 평균을 낸 가맹점 — '서울' 또는 '전국' */
  basis: string
  /** 그 기준의 가맹점 수 */
  stores: number
  year: number
  /** 창업비(만 원, 점포 임차 빼고) */
  open: number
}

export interface UnMoney {
  /** 가맹점 평균 월매출(만 원) — 기본값 브랜드의 [가운데, 가장 낮은, 가장 높은] */
  sales: [number, number, number]
  /** 창업비(만 원, 점포 임차 빼고) — [가운데, 가장 낮은, 가장 높은] */
  open: [number, number, number]
  /** 손익 점검 초기 투자 기본값(만 원) — 돌려받는 가맹 보증금을 뺀 값 */
  inv: number
  /** 어림 면적(㎡) */
  area: number
  /** 기준연도 가맹점 수 · 새로 연 곳 · 문 닫은 곳(계약종료 · 해지) · 연초 가맹점 · 문 닫은 몫 */
  stores: number
  new: number
  closed: number
  start: number
  closeRate: number
  /** 기준연도 — '2024' · '2024·2025' */
  year: string
  /** 정보공개서에 있는 브랜드 수 (기본값이 아닌 것 포함) */
  brands: number
}

export interface UnType {
  /** 'UN-cafe' */
  k: string
  /** '카페' — 후보 자료(cand/index.json)의 유형 이름 */
  t: string
  /** '무인 카페' */
  nm: string
  /** 서울시 무인점포 명단 수 · 서울시 발표(2025-04) 수 · 명단 중 상가정보에 붙인 수 */
  list: number
  apr: number
  linked: number
  /** 붙인 가게가 실린 업종 셋 — [업종 이름, 수, 몫] */
  codes: [string, number, number][]
  /** 흐름 — 명단 · 새 가게 중 무인 몫으로 본 방향 (§5.16) */
  trend: [Trend, string]
  /** 자리 — '1층, 주변 가게가 적은 주거지' */
  place: string
  /** 생존을 빌려 올 업종(상가정보 소분류) — 첫 코드 */
  surv: string[]
  /** 참고 매출 — 서울시 상권분석 업종(무인 · 유인 함께), 없으면 null */
  cs: string | null
  /** 원가율(0~1) — null이면 cs 업종 예시 값 */
  v: number | null
  vnote: string
  /** 기본 층 */
  floor: FloorKey
  money: UnMoney
  brands: UnBrand[]
}

export interface UnmData {
  meta: { list: string; apr: string; ftc: string; rule: string }
  types: UnType[]
}

export function isUn(c: string | null | undefined): boolean {
  return !!c && c.startsWith(PREFIX)
}

/** 무인 유형을 업종 한 줄로 — 서울 가게 수는 명단 수, 생존은 그 유형이 주로 실린 업종 값. 칸 수는 세지 않는다(0) */
export function unKind(u: UnType, byCode: ReadonlyMap<string, Kind>): Kind {
  const s = byCode.get(u.surv[0]) ?? null
  return { c: u.k, nm: u.nm, g: UN_GROUP, n: u.list, cells: 0, grade: s?.grade ?? 'C', s12: s?.s12 ?? null, close: s?.close ?? null, note: s ? `${s.nm} 업종 값` : '' }
}

/** 생존을 빌려 온 업종 — '카페 업종 값 — 무인 카페의 83%가 이 업종으로 실려 있어요' (거의 다 실렸으면 덧붙이지 않는다) */
export function survNote(u: UnType, byCode: ReadonlyMap<string, Kind>): string {
  const s = byCode.get(u.surv[0])
  if (!s) return '생존을 빌려 올 업종이 없어요'
  const c = u.codes.find((x) => x[0] === s.nm)
  return `${s.nm} 업종 값${c && c[2] < 0.9 ? ` — ${u.nm}의 ${Math.round(c[2] * 100)}%가 이 업종으로 실려 있어요` : ''}`
}

/** 이 업종(상가정보 소분류)에 실린 무인 유형 — 붙인 무인 가게의 30% 넘게가 이 코드인 것 (업종 견주기의 '무인 카페는 카페 안에') */
export function unInside(kind: Kind, types: readonly UnType[]): UnType[] {
  return types.filter((u) => u.surv.includes(kind.c) && u.codes.some((x) => x[0] === kind.nm && x[2] >= 0.3))
}

/** 같은 업종으로 세는 가게 — 짧은 이름 (자세한 셈은 cand/index.json의 label) */
export const UN_SAME: Record<string, string> = { 빨래방: '빨래방', 스터디카페: '스터디카페', 아이스크림: '아이스크림 가게', 카페: '카페', 사진관: '사진관', 밀키트: '반찬·밀키트 가게' }

// ── 칸 자료는 ui/unCells.ts (cand/index.json을 받는다) ────────────

/** '서울시 무인점포 현황 2025-12-31' → '2025년 말' */
export function listWhen(list: string): string {
  const m = list.match(/(\d{4})-12-3\d/)
  return m ? `${m[1]}년 말` : list.replace(/^서울시 무인점포 현황 /, '')
}

// ── 글자 ────────────────────────────────────────────────────────

/** 만 원 → 짧은 돈 — '1.9억 원' · '6,485만 원' */
export function wonShort(x: number): string {
  const m = Math.round(x)
  if (m >= 10000) {
    const e = Math.round(m / 1000) / 10
    return `${Number.isInteger(e) ? e : e.toFixed(1)}억 원`
  }
  return `${comma(m)}만 원`
}

const pc = (x: number) => `${Math.round(x * 100)}%`

/** '62.6㎡(약 19평)' */
export function areaText(m2: number): string {
  return `${Math.round(m2)}㎡(약 ${Math.round(m2 / 3.3058)}평)`
}

/** 브랜드 가운데 값이 브랜드 몇 곳에서 나왔나 — '브랜드 6곳 가운데' · '브랜드 한 곳(워시엔조이) 값' */
export function brandBasis(u: UnType): string {
  return u.brands.length > 1 ? `브랜드 ${u.brands.length}곳 가운데` : `브랜드 한 곳(${u.brands[0]?.nm ?? '—'}) 값`
}

/** 업종 고르기 카드 (와이어프레임 T1m) — 흐름 · 가맹점 월매출 · 창업비 · 생존 */
export interface UnCard {
  trend: Trend
  trendText: string
  sales: string
  salesSub: string
  open: string
  surv: string
  survSub: string
  foot: string
}

export function unCard(u: UnType, k: Kind, byCode: ReadonlyMap<string, Kind>): UnCard {
  const s = byCode.get(u.surv[0])
  return {
    trend: u.trend[0],
    trendText: u.trend[1],
    sales: wonShort(u.money.sales[0]),
    salesSub: brandBasis(u),
    open: wonShort(u.money.open[0]),
    surv: k.s12 ? pc(k.s12[0]) : '—',
    survSub: s ? `${s.nm} 업종 값` : '',
    foot: `서울 명단 ${comma(u.list)}곳 · ${u.place}`,
  }
}

// ── 손익 ────────────────────────────────────────────────────────

/** 무인 유형 하나 — 원가율과 그 근거, 생존을 빌려 온 업종 */
export interface UnSide {
  u: UnType
  k: Kind
  /** 생존을 빌려 온 업종 */
  sk: Kind | null
  /** 원가율 0~1 — 유형 값, 없으면 참고 매출 업종(cs)의 예시 값 */
  v: number
  /** 원가율을 빌려 온 서울시 업종 이름 (유형 값이면 null) · 근거 글 */
  vcs: string | null
  vsrc: string
}

export function unSide(u: UnType, byCode: ReadonlyMap<string, Kind>, be: readonly { k: string; nm: string; v: number; vsrc: string }[]): UnSide {
  const c = u.v == null && u.cs ? be.find((d) => d.k === u.cs) ?? null : null
  const v = u.v ?? c?.v ?? 0
  const vsrc = c ? `${u.vnote ? `${u.vnote} — ` : ''}서울시 '${c.nm}' 예시 값을 썼어요: ${haeyo(c.vsrc)}` : u.vnote || '예시 값이에요'
  return { u, k: unKind(u, byCode), sk: byCode.get(u.surv[0]) ?? null, v, vcs: c?.nm ?? null, vsrc }
}

/** 손익 점검의 처음 숫자 — 면적 · 초기 투자 · 층은 브랜드 가운데 값, 인건비 0 (예전 뷰어 beUnFill) */
export function unDefaults(u: UnType): CheckInputs {
  return { ...CHECK_DEFAULT, area: Math.round(u.money.area), inv: Math.round(u.money.inv / 100) * 100, labor: 0, floor: u.floor }
}

export interface UnCheck {
  F: number
  v: number
  r: number
  /** 본전 매출(만 원) — 변동비와 수수료가 100%를 넘으면 Infinity */
  S: number
  over: boolean
  /** 견준 매출 — 가맹점 평균 월매출의 브랜드 가운데 값 */
  ref: number
  R: number
  /** 가맹점 평균 월매출이 본전 매출 이상인 브랜드 수 */
  above: number
  profits: { f: number; X: number; P: number }[]
}

/** 본전 매출을 브랜드 가운데 값과 견준다 (예전 뷰어 beRenderUn) */
export function runUn(s: UnSide, card: CardTable, inp: CheckInputs): UnCheck {
  const F = fixedCost({ rent: inp.rent, mgmt: inp.mgmt, labor: inp.labor, other: inp.other, inv: inp.inv, months: inp.months, costRate: 0, otherRate: 0 })
  const v = (costRate(inp, s) + inp.other2) / 100
  const { S, r } = solve(F, v, card)
  const ref = s.u.money.sales[0], ok = Number.isFinite(S)
  return {
    F, v, r, S,
    over: ok && overPreferential(S, card),
    ref,
    R: ok ? S / ref : Infinity,
    above: ok ? s.u.brands.filter((b) => b.sales >= S).length : 0,
    profits: [0.6, 0.8, 1, 1.2].map((f) => ({ f, X: ref * f, P: profitAt(ref * f, F, v, card) })),
  }
}

/** '가맹 브랜드 6곳 중 4곳의 가맹점 평균 월매출이 본전 매출을 넘어요' */
export function aboveText(res: UnCheck, u: UnType): string {
  const n = u.brands.length
  if (n <= 1) return `견줄 수 있는 가맹 브랜드가 ${u.brands[0]?.nm ?? '—'} 한 곳뿐이라 거친 기준이에요.`
  if (!res.above) return `가맹 브랜드 ${n}곳 모두 가맹점 평균 월매출이 본전 매출보다 낮아요.`
  if (res.above === n) return `가맹 브랜드 ${n}곳 모두 가맹점 평균 월매출이 본전 매출을 넘어요.`
  return `가맹 브랜드 ${n}곳 중 ${res.above}곳의 가맹점 평균 월매출이 본전 매출을 넘어요.`
}

/** 결과 첫 문장 */
export function unLead(res: UnCheck, u: UnType): string {
  const what = u.brands.length > 1 ? `${u.nm} 가맹점 평균 월매출의 브랜드 가운데 값(${won(res.ref)})` : `${u.nm} 가맹점 평균 월매출(${u.brands[0]?.nm ?? '—'} ${won(res.ref)})`
  return `본전 매출은 ${what}의 ${Math.round(res.R * 100)}%예요.`
}

/** 가맹점이 한 해에 문 닫은 몫 */
export function closeText(u: UnType): string {
  const m = u.money
  return `가맹 브랜드 ${u.brands.length}곳은 한 해(${m.year}년)에 연초 가맹점 ${comma(m.start)}곳 중 ${comma(m.closed)}곳(${pc(m.closeRate)})이 문을 닫았어요(계약 종료 · 해지).`
}

// ── 둘 견주기 (와이어프레임 T1n) ─────────────────────────────────

/** 예시 비용 — 월세 · 관리비 · 기타 고정비(만 원), 인건비 0, 창업비는 이 개월에 나눠 (T1n) */
export const UN_EX = { rent: 250, mgmt: 30, other: 50, months: 36 } as const

export interface UnEx {
  /** 본전 매출(만 원) · 가맹점 평균(브랜드 가운데) · 본전 ÷ 평균 */
  S: number
  ref: number
  R: number
}

/** 예시 비용으로 낸 본전 매출 — 초기 투자는 유형의 기본값(가맹 보증금 뺌) */
export function unExample(s: UnSide, card: CardTable): UnEx {
  const inv = Math.round(s.u.money.inv / 100) * 100
  const F = fixedCost({ rent: UN_EX.rent, mgmt: UN_EX.mgmt, labor: 0, other: UN_EX.other, inv, months: UN_EX.months, costRate: 0, otherRate: 0 })
  const { S } = solve(F, s.v, card)
  const ref = s.u.money.sales[0]
  return { S, ref, R: S / ref }
}

/** 배수 — 10배 아래는 소수 한 자리 */
const bae = (x: number) => (x < 9.95 ? `${x.toFixed(1)}배` : `${Math.round(x)}배`)

export interface UnDiff {
  key: 'sales' | 'open' | 'trend'
  head: string
  text: string
  sub: string | null
}

const TREND_ORDER: Record<Trend, number> = { up: 3, flat: 2, slow: 1, down: 0 }

/** 차이 셋 — 가맹점 매출 · 창업비 · 흐름. 숫자는 머리에 이름이 나온 쪽부터, 비슷하면 고른 순서 */
export function unDiffThree(a: UnSide, b: UnSide): UnDiff[] {
  return [salesDiff(a, b), openDiff(a, b), trendDiff(a, b)]
}

function salesDiff(a: UnSide, b: UnSide): UnDiff {
  const sa = a.u.money.sales[0], sb = b.u.money.sales[0], r = Math.max(sa, sb) / Math.min(sa, sb)
  const same = r < 1.1
  const [x, y] = same || sa >= sb ? [a, b] : [b, a]
  const subs: string[] = []
  // 원가율이 크게 다르면 물건값을 뺀 몫으로 다시 — 매출이 큰 쪽이 물건을 많이 파는 유형일 수 있다
  if (Math.abs(a.v - b.v) >= 0.1) {
    const mx = x.u.money.sales[0] * (1 - x.v), my = y.u.money.sales[0] * (1 - y.v), rm = Math.max(mx, my) / Math.min(mx, my)
    // x가 매출이 큰 쪽(비슷하면 고른 순서) — 물건값을 빼고 작아지면 앞뒤가 바뀐다
    const how = rm < 1.1 ? '비슷해져요' : same ? `${bae(rm)} 차이가 나요` : mx < my ? '앞뒤가 바뀌어요' : rm < r ? `${bae(rm)}로 차이가 줄어요` : `${bae(rm)}로 차이가 커져요`
    subs.push(`물건값(매출의 ${pc(x.v)} · ${pc(y.v)})을 빼면 월 ${won(mx)} vs ${won(my)} — ${how}`)
  }
  for (const s of [x, y]) if (s.u.brands.length <= 1) subs.push(`${josa(s.u.nm, '은', '는')} 브랜드 한 곳 값이라 거칠어요`)
  return {
    key: 'sales',
    head: same ? '가맹점 매출은 비슷해요' : `가맹점 매출은 ${josa(x.u.nm, '이', '가')} ${bae(r)}`,
    text: `월 ${won(x.u.money.sales[0])} vs ${won(y.u.money.sales[0])}`,
    sub: subs.length ? subs.join('. ') : null,
  }
}

function openDiff(a: UnSide, b: UnSide): UnDiff {
  const oa = a.u.money.open[0], ob = b.u.money.open[0], r = Math.max(oa, ob) / Math.min(oa, ob)
  const [x, y] = oa <= ob ? [a, b] : [b, a] // x가 적은 쪽
  const head = r < 1.1 ? '창업비는 비슷해요'
    : r >= 3 ? `창업비는 ${josa(y.u.nm, '이', '가')} ${bae(r)}`
    : r >= 2 ? `창업비는 ${josa(x.u.nm, '이', '가')} 절반 이하`
    : `창업비는 ${josa(x.u.nm, '이', '가')} ${Math.round((1 - 1 / r) * 100)}% 적어요`
  const [p, q] = r >= 3 ? [y, x] : [x, y]
  return {
    key: 'open',
    head,
    text: `${wonShort(p.u.money.open[0])} vs ${wonShort(q.u.money.open[0])} (점포 임차 빼고)`,
    sub: `어림 면적 ${areaText(p.u.money.area)} vs ${areaText(q.u.money.area)}`,
  }
}

function trendDiff(a: UnSide, b: UnSide): UnDiff {
  const ta = a.u.trend, tb = b.u.trend
  const same = ta[0] === tb[0]
  const [x, y] = same || TREND_ORDER[ta[0]] >= TREND_ORDER[tb[0]] ? [a, b] : [b, a]
  return {
    key: 'trend',
    head: same ? '흐름은 같은 쪽이에요' : `흐름은 ${josa(x.u.nm, '이', '가')} 나아요`,
    text: `${x.u.nm} ${x.u.trend[1]} · ${y.u.nm} ${y.u.trend[1]}`,
    sub: `한 해에 문 닫은 가맹점 ${pc(x.u.money.closeRate)} vs ${pc(y.u.money.closeRate)}`,
  }
}

export interface UnCell {
  v: string
  sub?: string
  strong?: boolean
}

export interface UnRow {
  key: string
  label: string
  hint?: string
  a: UnCell
  b: UnCell
}

/** 원가율 칸 — '65%' · 파는 물건이 거의 없음 */
function costCell(s: UnSide): UnCell {
  if (s.v === 0) return { v: '0%', sub: '파는 물건이 거의 없음' }
  return { v: pc(s.v), sub: s.vcs ? `서울시 '${s.vcs}' 예시` : '예시 값' }
}

/** 자세히 표 (T1n) */
export function unRows(a: UnSide, b: UnSide): UnRow[] {
  const row = (key: string, label: string, hint: string | undefined, f: (s: UnSide) => UnCell): UnRow => ({ key, label, hint, a: f(a), b: f(b) })
  return [
    row('trend', '흐름', '명단 · 새 가게 중 무인 몫', (s) => ({ v: s.u.trend[1], strong: true })),
    row('sales', '가맹점 평균 월매출', '브랜드 가운데 값', (s) => ({ v: won(s.u.money.sales[0]), strong: true, sub: s.u.brands.length > 1 ? `브랜드 ${s.u.brands.length}곳 ${man(s.u.money.sales[1])}~${man(s.u.money.sales[2])}` : `브랜드 한 곳(${s.u.brands[0]?.nm ?? '—'})` })),
    row('open', '창업비', '점포 임차 빼고 · 브랜드 가운데 값', (s) => ({ v: wonShort(s.u.money.open[0]), strong: true, sub: s.u.brands.length > 1 ? `${wonShort(s.u.money.open[1])}~${wonShort(s.u.money.open[2])}` : undefined })),
    row('cost', '매출 중 물건값', '원가율', costCell),
    row('close', '한 해 문 닫은 가맹점', '연초 가맹점 대비', (s) => ({ v: pc(s.u.money.closeRate), sub: `${comma(s.u.money.closed)}곳 / ${comma(s.u.money.start)}곳 · ${s.u.money.year}년` })),
    row('s12', '새 가게 1년 생존', '무인만 따로 세지 않음', (s) => (s.k.s12 ? { v: pc(s.k.s12[0]), sub: s.sk ? `${s.sk.nm} 업종 값` : undefined } : { v: '—' })),
    row('area', '어림 면적', '브랜드 가운데 값', (s) => ({ v: `${Math.round(s.u.money.area)}㎡`, sub: `약 ${Math.round(s.u.money.area / 3.3058)}평` })),
    row('place', '자리', '명단의 무인 가게가 있는 곳', (s) => ({ v: s.u.place })),
    row('list', '서울 무인 가게', '서울시 무인점포 명단', (s) => ({ v: `${comma(s.u.list)}곳`, sub: `상가정보에 붙인 곳 ${comma(s.u.linked)}곳` })),
    row('brands', '견준 브랜드', '정보공개서', (s) => ({ v: s.u.brands.map((x) => x.nm).join(' · ') })),
  ]
}

// ── 동네 보기 · 카드 문장 ───────────────────────────────────────

/** 동네 보기 첫머리 — 명단 수 · 가맹점 월매출 · 창업비 · 1년 생존 */
export function unIntro(u: UnType, k: Kind, byCode: ReadonlyMap<string, Kind>): string {
  const s = byCode.get(u.surv[0])
  return `서울시 무인점포 명단 ${comma(u.list)}곳 · 가맹점 평균 월매출 ${won(u.money.sales[0])} · 창업비 ${wonShort(u.money.open[0])}(${brandBasis(u)}) · 새 가게 1년 생존 ${k.s12 ? pc(k.s12[0]) : '—'}${s ? `(${s.nm} 업종 값)` : ''}. 자리별 매출 수준은 칠하지 않아요 — 무인 가게는 업종 전체와 다른 자리를 골라요.`
}

/** 카드 한 줄 — 둘레 무인 가게 */
export function unSentence(nm: string, near: number): string {
  return near ? `둘레에 ${nm} ${comma(near)}곳이 있어요 (명단에서 찾은 곳)` : `둘레에서 명단의 ${josa(nm, '을', '를')} 찾지 못했어요`
}
