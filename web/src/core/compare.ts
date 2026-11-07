// 업종 둘 견주기 (마스터플랜 W7.4 '업종 고르기' · 와이어프레임 T1b · 과제 T1 "카페와 빵집 중 뭐가 나을까")
// 차이 셋 — ① 가게당 매출(서울시 상권분석 업종 대응, 상권별 점포당 월매출의 가운데 값) ② 경쟁 가게 수(서울 상가정보) ③ 생존과 자리 정보.
// 숫자는 이미 싣는 자료뿐이다 — kinds/index.json · entry/index.json · ind/index.json · be/index.json (새 파일 없음)
import { BE_SKIP, type BeInd, beFor, won } from './check'
import type { Industry } from './data'
import { comma, josa, man } from './format'
import type { Kind } from './kinds'
import { periodText } from './layers'
import { strength } from './level'

/** 견주는 업종 하나 — 가게 수 · 생존은 업종 247 모두, 가게당 매출은 서울시 업종에 이어진 것만 */
export interface Side {
  k: Kind
  /** 견줄 서울시 업종 (가게당 매출) */
  be: BeInd | null
  /** 자리별 매출 수준 — 칠하는 업종 */
  pot: Industry | null
  /** 자리별 매출 수준이 없는 까닭 (pot이 있으면 null) */
  noPot: string | null
  /** 최근 새 가게 수 — 개업 48업종만 */
  fresh: number | null
}

export function makeSide(k: Kind, potCode: string | null, inds: readonly Industry[], be: readonly BeInd[], fresh: ReadonlyMap<string, number>): Side {
  const pot = potCode ? inds.find((d) => d.k === potCode) ?? null : null
  let noPot: string | null = null
  if (!pot) {
    const m = inds.find((d) => d.codes.includes(k.c))
    noPot = m && !m.paint ? '자리 차이를 맞히지 못해 칠하지 않아요' : m ? `'${m.nm}' 값이 맞지 않아 칠하지 않아요` : '자리별 매출 수준을 배운 업종이 아니에요'
  }
  return { k, be: beFor(k.c, be), pot, noPot, fresh: fresh.get(k.c) ?? null }
}

// ── 글자 ────────────────────────────────────────────────────────

/** 배수 — 10배 아래는 소수 한 자리('3.7배'), 위는 정수('12배') */
export function bae(x: number): string {
  return x < 9.95 ? `${x.toFixed(1)}배` : `${Math.round(x)}배`
}

/** 한 번 결제 — 7,987원 → '8천 원', 11,100원 → '1.1만 원' */
export function ticketText(w: number): string {
  if (w >= 9500) {
    const m = Math.round(w / 1000) / 10
    return `${Number.isInteger(m) ? m : m.toFixed(1)}만 원`
  }
  if (w >= 1000) return `${Math.round(w / 1000)}천 원`
  return `${comma(Math.round(w))}원`
}

const pc = (x: number) => `${Math.round(x * 100)}%`
/** 가게당 월매출(만 원) — 상권별 점포당 월매출의 가운데 값 */
export const med = (b: BeInd) => b.q[3] / 10

/** 가게당 매출이 없는 까닭 */
function noSales(s: Side): string {
  return BE_SKIP.has(s.k.c)
    ? `${josa(s.k.nm, '은', '는')} 서울시 '세탁소' 매출(맡기는 세탁소 위주)과 맞지 않아 견주지 않아요`
    : `${josa(s.k.nm, '은', '는')} 서울시 상권분석 매출 업종과 바로 이어지지 않아요`
}

export interface Diff {
  key: 'sales' | 'comp' | 'surv'
  /** 굵은 머리 — '가게당 매출은 빵/도넛이 1.4배' */
  head: string
  /** 숫자 — '월 1,303만 원 vs 909만 원' (머리의 업종이 앞, 비슷하면 고른 순서) */
  text: string
  /** 덧붙임 (흐리게) */
  sub: string | null
}

/** 차이 셋 — 매출 · 경쟁 · 생존과 자리. 숫자는 머리에 이름이 나온 업종부터(와이어프레임 T1b), 비슷하면 고른 순서 */
export function diffThree(a: Side, b: Side): Diff[] {
  return [salesDiff(a, b), compDiff(a, b), survDiff(a, b)]
}

function salesDiff(a: Side, b: Side): Diff {
  const A = a.be, B = b.be
  if (!A && !B) return { key: 'sales', head: '가게당 매출은 둘 다 알 수 없어요', text: '두 업종 모두 서울시 상권분석 매출 업종과 바로 이어지지 않아요', sub: null }
  if (!A || !B) {
    const has = A ? a : b, no = A ? b : a
    return { key: 'sales', head: `가게당 매출은 ${has.k.nm}만 알 수 있어요`, text: `${has.k.nm} 월 ${won(med(has.be!))}`, sub: noSales(no) }
  }
  if (A.k === B.k) {
    return { key: 'sales', head: '가게당 매출은 견줄 수 없어요', text: `둘 다 서울시 상권분석 '${A.nm}' 한 업종으로 묶여 있어요 — 월 ${won(med(A))}`, sub: null }
  }
  const ma = med(A), mb = med(B), r = Math.max(ma, mb) / Math.min(ma, mb)
  const same = r < 1.1
  const [x, y] = same || ma >= mb ? [a, b] : [b, a]
  return {
    key: 'sales',
    head: same ? '가게당 매출은 비슷해요' : `가게당 매출은 ${josa(x.k.nm, '이', '가')} ${bae(r)}`,
    text: `월 ${won(med(x.be!))} vs ${won(med(y.be!))}`,
    sub: `한 번에 ${ticketText(x.be!.ticket * 100)} vs ${ticketText(y.be!.ticket * 100)}을 써요`,
  }
}

function compDiff(a: Side, b: Side): Diff {
  const na = a.k.n, nb = b.k.n, r = Math.max(na, nb) / Math.max(1, Math.min(na, nb))
  const same = r < 1.1
  const [x, y] = same || na >= nb ? [a, b] : [b, a]
  return {
    key: 'comp',
    head: same ? '경쟁 가게 수는 비슷해요' : `경쟁 가게는 ${josa(x.k.nm, '이', '가')} ${bae(r)}`,
    text: `서울 ${comma(x.k.n)}곳 vs ${comma(y.k.n)}곳`,
    sub: '자리마다 몇 곳인지는 지도의 \'같은 업종\'으로 봐요',
  }
}

/** 자리를 무엇으로 보나 — 자리별 매출 수준이 없으면 새 가게 · 같은 업종 */
function placeSub(a: Side, b: Side): string {
  const by = (s: Side[]) => (s.every((x) => x.fresh != null) ? '새 가게 · 같은 업종 수' : '같은 업종 수')
  if (a.pot && b.pot) return '둘 다 자리별 매출 수준 지도가 있어요'
  if (a.pot || b.pot) {
    const no = a.pot ? b : a
    return `다만 ${josa(no.k.nm, '은', '는')} 자리별 매출 수준을 추정하지 못해요 — 자리는 ${by([no])}로 봐요`
  }
  return `둘 다 자리별 매출 수준은 없어요 — 자리는 ${by([a, b])}로 봐요`
}

function survDiff(a: Side, b: Side): Diff {
  const sa = a.k.s12, sb = b.k.s12, sub = placeSub(a, b)
  if (sa && sb) {
    // 구간(아래~위)이 겹치면 '비슷' — 추정값 차이만으로 줄 세우지 않는다
    const same = sa[1] <= sb[2] && sb[1] <= sa[2]
    const [x, y] = same || sa[0] >= sb[0] ? [a, b] : [b, a]
    return { key: 'surv', head: same ? '버티는 힘은 비슷해요' : `1년 버티는 비율은 ${josa(x.k.nm, '이', '가')} 높아요`, text: `새 가게 1년 생존 ${pc(x.k.s12![0])} vs ${pc(y.k.s12![0])}`, sub }
  }
  if (sa || sb) {
    const has = sa ? a : b, no = sa ? b : a
    return { key: 'surv', head: `1년 생존은 ${has.k.nm}만 알 수 있어요`, text: `새 가게 1년 생존 ${pc(has.k.s12![0])} · ${josa(no.k.nm, '은', '는')} 가게 기록이 한꺼번에 바뀌어 셀 수 없어요`, sub }
  }
  return { key: 'surv', head: '1년 생존은 둘 다 알 수 없어요', text: '두 업종 모두 가게 기록이 한꺼번에 바뀌어 셀 수 없어요', sub }
}

// ── 자세히 표 ───────────────────────────────────────────────────

export interface Cell {
  v: string
  sub?: string
  strong?: boolean
}

export interface Row {
  key: string
  label: string
  hint?: string
  a: Cell
  b: Cell
}

export const CAP_SHORT: Record<BeInd['cap'], string> = { ok: '외부 자료와 비슷', low: '낮게 잡혔을 수 있음', unk: '확인 못 함' }

const NONE: Cell = { v: '—' }

/** '2026Q2' → '2026년 2분기' */
export function quarterText(q: string): string {
  const m = q.match(/^(\d{4})Q([1-4])$/)
  return m ? `${m[1]}년 ${m[2]}분기` : q
}

export function compareRows(a: Side, b: Side, meta: { poi: string; period: string }): Row[] {
  const row = (key: string, label: string, hint: string | undefined, f: (s: Side) => Cell): Row => ({ key, label, hint, a: f(a), b: f(b) })
  return [
    row('n', '서울 가게', `상가정보 ${quarterText(meta.poi)}`, (s) => ({ v: `${comma(s.k.n)}곳`, strong: true })),
    row('fresh', '최근 새로 연 가게', periodText(meta.period), (s) => (s.fresh != null ? { v: `${comma(s.fresh)}곳` } : { v: '—', sub: '새 가게 지도가 없는 업종' })),
    row('med', '가게당 월매출', '상권별 가운데 값', (s) => (s.be ? { v: won(med(s.be)), strong: true } : NONE)),
    row('mid', '가운데 절반', undefined, (s) => (s.be ? { v: `${man(s.be.q[2] / 10)}~${man(s.be.q[4] / 10)}` } : NONE)),
    row('tx', '하루 결제 · 한 번에', '가게당', (s) => (s.be ? { v: `${Math.round(s.be.tx)}건 · ${ticketText(s.be.ticket * 100)}` } : NONE)),
    row('s12', '새 가게 1년 생존', undefined, (s) => (s.k.s12 ? { v: pc(s.k.s12[0]), sub: `${Math.round(s.k.s12[1] * 100)}~${pc(s.k.s12[2])}` } : NONE)),
    row('close', '기존 가게 한 해 폐업', undefined, (s) => (s.k.close != null ? { v: pc(s.k.close) } : NONE)),
    row('pot', '자리별 매출 수준 지도', undefined, (s) => (s.pot ? { v: '있음', sub: `모형의 힘 ${strength(s.pot.rho)} (${s.pot.rho.toFixed(2)})` } : { v: '없음', sub: s.noPot ?? undefined })),
    row('cap', '카드 매출이 실제를 잡는 정도', undefined, (s) => (s.be ? { v: CAP_SHORT[s.be.cap] } : NONE)),
    row('be', '견준 서울시 업종', undefined, (s) => (s.be ? { v: `'${s.be.nm}'`, sub: s.be.codes.length > 1 ? `상가정보 업종 ${s.be.codes.length}개를 묶은 값` : undefined } : NONE)),
  ]
}

// ── 주소 ────────────────────────────────────────────────────────

const CODE = /^[A-Z]\d{5}$/

/** cmp=A_B (고른 순서 그대로) — 다른 꼴이거나 같은 업종 둘이면 null */
export function readCmp(v: string | null): [string, string] | null {
  const m = (v ?? '').split('_')
  return m.length === 2 && CODE.test(m[0]) && CODE.test(m[1]) && m[0] !== m[1] ? [m[0], m[1]] : null
}
