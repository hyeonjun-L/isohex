// 동네 보기 지표 — 지도에 칠할 것 하나를 고른다 (마스터플랜 W7.4 '동네 보기': 지표 한 줄 전환 [매출 수준 · 1층 임대료 · 새 가게 · 같은 업종] + 쉬운 말 범례).
// 칸마다 색 번호(0 = 가장 옅음, −1 = 칠하지 않음)와 범례를 만든다. 지도(MapView)는 번호를 색으로 바꾸기만 한다.
// 업종을 고르기 전에는 [가게 수 · 1층 임대료]. 업종마다 볼 수 있는 것이 달라(KindDepth) 없는 칩은 흐리게 두고 누르면 까닭을 말한다
import { ENTRY_EDGES } from './entry'
import { comma, josa } from './format'
import type { KindDepth } from './kinds'
import { LEVEL_LABELS, STORE_LABELS, levelClass, storeClass, toPct } from './level'
import { quantile } from './site'

export type Show = 'pot' | 'rent' | 'entry' | 'same' | 'store'

export const SHOW_NM: Record<Show, string> = { pot: '매출 수준', rent: '1층 임대료', entry: '새 가게', same: '같은 업종', store: '가게 수' }

/** 지표마다 색 단계 수 — palette.ts의 색 수와 같다 */
export const SHOW_STEPS: Record<Show, number> = { pot: 7, rent: 5, entry: 6, same: 6, store: 5 }

export interface Chip {
  s: Show
  nm: string
  ok: boolean
  /** 흐린 칩을 눌렀을 때 말할 까닭 */
  why: string | null
}

export interface LegendSpec {
  title: string
  sub: string | null
  /** 위에서 아래로 낮은 값 → 높은 값. c = 색 번호 */
  items: { label: string; c: number }[]
  /** 칠하지 않는 칸(−1) — 빗금(추정하지 않음) 또는 빈칸(자료 밖) */
  none: { label: string; look: 'hatch' | 'empty' } | null
}

export interface Layer {
  show: Show
  /** 칸마다 색 번호 (−1 = 칠하지 않음) */
  classes: Int8Array
  legend: LegendSpec
}

/** 주소의 show 값 — 모르는 값이면 null */
export function parseShow(s: string | null): Show | null {
  return s && (Object.keys(SHOW_NM) as string[]).includes(s) ? (s as Show) : null
}

/** 칩 줄 — 업종이 없으면 [가게 수 · 1층 임대료], 있으면 [매출 수준 · 1층 임대료 · 새 가게 · 같은 업종] */
export function chipsFor(kindNm: string | null, depth: KindDepth | null): Chip[] {
  const chip = (s: Show, ok = true, why: string | null = null): Chip => ({ s, nm: SHOW_NM[s], ok, why: ok ? null : why })
  if (!kindNm || !depth) return [chip('store'), chip('rent')]
  return [
    chip('pot', !!depth.pot, `${josa(kindNm, '은', '는')} 자리별 매출 수준을 추정하지 않아요`),
    chip('rent'),
    chip('entry', depth.entry, '새 가게 지도는 가게가 충분한 48업종만 있어요'),
    chip('same'),
  ]
}

/** 고른 지표가 이 업종에 있으면 그대로, 아니면 기본 — 매출 수준 → 새 가게 → 같은 업종 (W7.4 '추정하지 않는 업종은 새 가게') */
export function pickShow(want: Show | null, chips: Chip[]): Show {
  const ok = (s: Show) => chips.some((c) => c.s === s && c.ok)
  if (want && ok(want)) return want
  for (const s of ['pot', 'entry', 'same', 'store'] as const) if (ok(s)) return s
  return chips[0].s
}

/** 단계 j(0~k−1)를 n색 줄에 고르게 — 단계가 적어도 가장 높은 단계는 가장 진한 색 */
export function spread(j: number, k: number, n: number): number {
  return k <= 1 ? n - 1 : Math.round((j * (n - 1)) / (k - 1))
}

/** '2025Q1~Q2' → '2025년 상반기' */
export function periodText(p: string): string {
  const m = p.match(/^(\d{4})Q1~Q2$/)
  return m ? `${m[1]}년 상반기` : p
}

// ── 매출 수준 · 가게 수 ───────────────────────────────────────────

export function potLayer(values: readonly (number | null)[], nm: string): Layer {
  const classes = Int8Array.from(values, (v) => levelClass(toPct(v)))
  return {
    show: 'pot',
    classes,
    legend: {
      title: `${nm} 매출 수준(추정) — 서울 이 업종 평균 상권 대비`,
      sub: null,
      items: LEVEL_LABELS.map((label, c) => ({ label, c })),
      none: { label: '추정하지 않음 (가게가 드문 곳)', look: 'hatch' },
    },
  }
}

export function storeLayer(n300: readonly number[]): Layer {
  return {
    show: 'store',
    classes: Int8Array.from(n300, storeClass),
    legend: { title: '가게가 모인 정도 — 반경 300m 가게 수', sub: null, items: STORE_LABELS.map((label, c) => ({ label, c })), none: null },
  }
}

// ── 같은 업종 · 새 가게 (가게 수 단계) ─────────────────────────────

/** 보기 좋은 단계 경계 */
const NICE = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000]
/** 1곳 이상인 칸을 나누는 위치 — 많은 쪽을 더 잘게 */
const SAME_AT = [0.3, 0.55, 0.75, 0.9]

/** 같은 업종 단계 경계 — 업종마다 가게 수가 크게 달라(둘레 최대 편의점 58곳 · 카페 204곳 · 셀프 빨래방 9곳)
 *  1곳 이상인 칸의 30·55·75·90% 위치를 보기 좋은 수로 둥글게 잡는다. 가장 큰 값을 넘는 경계는 버린다 */
export function sameBreaks(near: ArrayLike<number>): number[] {
  const pos: number[] = []
  for (let i = 0; i < near.length; i++) if (near[i] > 0) pos.push(near[i])
  const nz = Float64Array.from(pos).sort()
  if (!nz.length) return []
  const max = nz[nz.length - 1], out: number[] = []
  for (const p of SAME_AT) {
    const q = Math.max(quantile(nz, p), 1e-9)
    let c = NICE.reduce((a, b) => (Math.abs(Math.log(b / q)) < Math.abs(Math.log(a / q)) ? b : a))
    if (out.length && c <= out[out.length - 1]) c = NICE.find((x) => x > out[out.length - 1]) ?? Infinity
    if (c > max) break
    out.push(c)
  }
  return out
}

/** 경계 → ['없음', '1~7곳', '8~19곳', …, '80곳 이상'] */
export function countLabels(breaks: readonly number[]): string[] {
  const out = ['없음']
  let lo = 1
  for (const b of breaks) {
    out.push(b - 1 === lo ? `${comma(lo)}곳` : `${comma(lo)}~${comma(b - 1)}곳`)
    lo = b
  }
  out.push(`${comma(lo)}곳 이상`)
  return out
}

/** 가게 수 → 단계 (0 = 없음) */
export function countClass(v: number, breaks: readonly number[]): number {
  if (v <= 0) return 0
  let c = 1
  for (const b of breaks) if (v >= b) c++
  return c
}

function countLayer(show: 'same' | 'entry', vals: ArrayLike<number>, breaks: readonly number[], title: string, sub: string): Layer {
  const labels = countLabels(breaks), k = labels.length, n = SHOW_STEPS[show]
  const col = labels.map((_, j) => spread(j, k, n))
  const classes = new Int8Array(vals.length)
  for (let i = 0; i < vals.length; i++) classes[i] = col[countClass(vals[i], breaks)]
  return { show, classes, legend: { title, sub, items: labels.map((label, j) => ({ label, c: col[j] })), none: null } }
}

/** 같은 업종 — 이 칸 + 둘레 6칸의 같은 업종 가게 수 (kinds.ts sameKind의 near) */
export function sameLayer(near: ArrayLike<number>, nm: string, asOf: string): Layer {
  return countLayer('same', near, sameBreaks(near), `같은 업종 — 이 칸과 둘레 6칸의 ${nm} 가게 수`, `상가정보 ${asOf} · 단계는 이 업종 칸들을 나눠 정했어요`)
}

/** 새 가게 — 이 칸 + 둘레 6칸에 새로 생긴 같은 업종 가게 (entry.ts entryWindow의 ow).
 *  단계는 entry.ts ENTRY_EDGES(1 · 2 · 4 · 7 · 13곳) 그대로 — 0곳은 '없음'으로 가장 옅게 (예전 뷰어는 칠하지 않았다) */
export function entryLayer(ow: ArrayLike<number>, nm: string, period: string): Layer {
  return countLayer('entry', ow, ENTRY_EDGES.slice(1), `새 가게 — 이 칸과 둘레 6칸에 새로 생긴 ${nm}`, `${periodText(period)}(6개월) · 상가정보 분기 자료를 이어 셈`)
}

// ── 1층 임대료 ──────────────────────────────────────────────────

/** 3.3㎡(1평)당 한 달 만 원 — 단계 경계 (서울 72 상권 2025년: 10 · 22 · 20 · 14 · 6곳) */
export const RENT_BREAKS = [12, 15, 20, 25] as const
export const RENT_LABELS = ['12만 원 미만', '12~15만 원', '15~20만 원', '20~25만 원', '25만 원 이상'] as const

/** 천 원/㎡·월 → 3.3㎡당 만 원 */
export function perPy(v: number): number {
  return (v * 3.3058) / 10
}

export function rentClass(v: number | null | undefined): number {
  if (v == null) return -1
  const py = perPy(v)
  let c = 0
  for (const b of RENT_BREAKS) if (py >= b) c++
  return c
}

/** 한국부동산원 조사 상권 72곳 — 상권 안 칸은 그 상권 값, 밖은 칠하지 않는다 (행정동 임대시세는 공개판에 없다, W7.8) */
export function rentLayer(cell: readonly number[], rents: readonly { v: Record<string, number | null | undefined> }[]): Layer {
  const classes = Int8Array.from(cell, (r) => (r >= 0 ? rentClass(rents[r]?.v['대표1층']) : -1))
  return {
    show: 'rent',
    classes,
    legend: {
      title: '1층 임대료 — 3.3㎡(1평)당 한 달',
      sub: `한국부동산원 조사 상권 ${rents.length}곳 · 2025년 평균 · 상권 안 칸은 같은 값`,
      items: RENT_LABELS.map((label, c) => ({ label, c })),
      none: { label: '칠하지 않은 곳 — 조사 상권 밖', look: 'empty' },
    },
  }
}
