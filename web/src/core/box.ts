// 비교함 — 자리 최대 5곳을 같은 줄로 나란히, 줄마다 가장 높은·낮은 값을 글자로 (마스터플랜 W7.4 '비교함', 와이어프레임 D3).
// 값은 자리 카드와 같은 입력(core/card.ts CardInput)에서 — 지금 고른 업종으로 읽는다(업종을 바꾸면 모든 곳이 따라간다).
// 이 동네 가게당 월매출은 손익 점검과 같은 자료(be/ — 그 칸의 상권, 없으면 행정동 점포당 월매출)
import { fracAbove } from './candidates'
import { type CardInput, distText, pyText } from './card'
import { won } from './check'
import { comma, josa, rankText } from './format'
import { survText } from './kinds'
import { levelText } from './level'
import { explainCell, upText } from './potential'
import { type PlaceType, placeType } from './site'

export const BOX_MAX = 5

export const PLACE_SHORT: Record<PlaceType, string> = { few: '가게가 거의 없는 곳', busy: '번화가', work: '업무 중심지', home: '주거지', mixed: '섞인 곳' }

/** 이 동네 같은 업종 가게의 점포당 월매출 — 상권(없으면 행정동) */
export interface BoxSales {
  /** 만 원 */
  v: number
  where: string
  n: number
}

export interface BoxCell {
  v: string
  sub?: string
  /** '가장 높음' 같은 표시 */
  mark?: string
  none?: boolean
}

export interface BoxRow {
  key: string
  label: string
  hint?: string
  /** 곳마다 한 칸 — 모든 곳이 같은 값이면 span */
  cells?: BoxCell[]
  span?: string
}

/**
 * 가장 높은·낮은 곳 표시 — 값이 있는 곳이 둘이면 '먼저 볼 쪽'(primary)만, 셋 넘으면 양쪽 다. 모두 같으면 표시하지 않는다.
 * primary가 'min'이면(역까지 거리) 작은 쪽이 먼저다
 */
export function marks(vals: readonly (number | null)[], maxLabel: string, minLabel: string, primary: 'max' | 'min' = 'max'): (string | undefined)[] {
  const ok = vals.filter((v): v is number => v != null)
  if (ok.length < 2) return vals.map(() => undefined)
  const hi = Math.max(...ok), lo = Math.min(...ok)
  if (hi === lo) return vals.map(() => undefined)
  const both = ok.length >= 3
  return vals.map((v) => {
    if (v == null) return undefined
    if (v === hi && (both || primary === 'max')) return maxLabel
    if (v === lo && (both || primary === 'min')) return minLabel
    return undefined
  })
}

function withMarks(cells: BoxCell[], vals: (number | null)[], maxLabel: string, minLabel: string, primary: 'max' | 'min' = 'max'): BoxCell[] {
  const m = marks(vals, maxLabel, minLabel, primary)
  return cells.map((c, j) => (m[j] ? { ...c, mark: m[j] } : c))
}

/**
 * 비교함 줄 — 곳마다 카드 입력(같은 업종으로 만든 것) · 이 동네 가게당 월매출(undefined면 견줄 업종이 없음, null이면 그 둘레 자료 없음).
 * sales 전체가 null이면 매출 자료를 받는 중이라 그 줄을 뺀다
 */
export function boxRows(ins: readonly CardInput[], sales: readonly (BoxSales | null)[] | null | 'none'): BoxRow[] {
  const rows: BoxRow[] = []
  const k = ins[0]?.kind?.k ?? null
  if (k) {
    const nm = k.nm
    // ① 매출 수준
    const pot = ins[0].pot
    if (!ins[0].kind!.depth.pot || !pot) {
      rows.push({ key: 'pot', label: `${nm} 매출 수준 (추정)`, span: `${josa(nm, '은', '는')} 자리별 매출 수준을 추정하지 않아요` })
    } else {
      const ex = ins.map((c) => (c.pot ? explainCell(c.pot.cells, c.pot.ix, c.i) : null))
      const cells = ex.map((e): BoxCell => (e ? { v: levelText(e.pct), sub: upText(e.up) } : { v: '칠하지 않음', sub: '가게가 드문 곳', none: true }))
      rows.push({ key: 'pot', label: `${pot.nm} 매출 수준 (추정)`, hint: '서울 이 업종 평균 상권 대비', cells: withMarks(cells, ex.map((e) => e?.pct ?? null), '가장 높음', '가장 낮음') })
    }
    // ② 이 동네 가게당 월매출 (카드 결제로 만든 추정)
    if (sales === 'none') rows.push({ key: 'sales', label: '이 동네 가게당 월매출', span: `${josa(nm, '은', '는')} 서울시 상권분석 매출 업종과 바로 이어지지 않아요` })
    else if (sales) {
      const cells = sales.map((s): BoxCell => (s ? { v: won(s.v), sub: `${s.where} · ${comma(s.n)}곳 평균` } : { v: '—', sub: '둘레 상권·행정동 매출 비공개', none: true }))
      rows.push({ key: 'sales', label: '이 동네 가게당 월매출', hint: '같은 업종 · 카드 결제로 만든 추정', cells: withMarks(cells, sales.map((s) => s?.v ?? null), '가장 높음', '가장 낮음') })
    }
    // ③ 같은 업종 (이 칸 + 둘레)
    const same = ins.map((c) => c.same ?? null)
    rows.push({
      key: 'same',
      label: '같은 업종 (이 칸 + 둘레)',
      hint: '손님을 나눠 가져요',
      cells: withMarks(same.map((s): BoxCell => (s ? { v: `${nm} ${comma(s.near)}곳`, sub: `이 칸 ${comma(s.own)}곳` } : { v: '—', none: true })), same.map((s) => s?.near ?? null), '가장 많음', '가장 적음'),
    })
  }
  // ④ 반경 300m 가게
  rows.push({
    key: 'n300',
    label: '반경 300m 가게',
    cells: withMarks(ins.map((c) => ({ v: `${comma(c.n300)}곳`, sub: `서울 칸 ${rankText(fracAbove(c.n300Sorted, c.n300))}` })), ins.map((c) => c.n300), '가장 많음', '가장 적음'),
  })
  // ⑤ 자리 성격
  rows.push({ key: 'place', label: '자리 성격', cells: ins.map((c) => ({ v: PLACE_SHORT[placeType(c.n300, c.site.tilt[c.i], c.cuts)] })) })
  // ⑥ 1층 임대료 — 한국부동산원 조사 상권 72곳만 (W7.8)
  const rent = ins.map((c) => (c.reb && c.reb.v != null ? c.reb.v : null))
  rows.push({
    key: 'rent',
    label: '1층 임대료 (3.3㎡당)',
    hint: '한국부동산원 조사 상권',
    cells: withMarks(ins.map((c, j): BoxCell => (rent[j] != null ? { v: pyText(rent[j]!), sub: c.reb!.name } : { v: '—', sub: '조사 상권 밖', none: true })), rent, '가장 비쌈', '가장 쌈'),
  })
  // ⑦ 가까운 역
  const st = ins.map((c) => c.station ?? null)
  rows.push({
    key: 'station',
    label: '가까운 역',
    cells: withMarks(st.map((s): BoxCell => (s ? { v: `${s.name}역`, sub: distText(s.m) } : { v: '—', sub: '1km 안에 없음', none: true })), st.map((s) => s?.m ?? null), '가장 멂', '가장 가까움', 'min'),
  })
  // ⑧ 새 가게 1년 생존 — 업종 값이라 모든 곳이 같다
  if (k) rows.push({ key: 'surv', label: `새 가게 1년 생존 (${k.nm}, 서울)`, span: `${survText(k)} — 업종 값이라 모든 곳이 같아요` })
  return rows
}

// ── 주소 ────────────────────────────────────────────────────────

/** box=h3_h3_… — 없는 칸 · 겹친 칸은 빼고 5곳까지 */
export function readBox(v: string | null, idx: (h3: string) => number): number[] {
  const out: number[] = []
  for (const h of (v ?? '').split('_')) {
    const i = idx(h)
    if (i >= 0 && !out.includes(i) && out.length < BOX_MAX) out.push(i)
  }
  return out
}

export function writeBox(q: URLSearchParams, box: readonly number[], h3: readonly string[]) {
  if (box.length) q.set('box', box.map((i) => h3[i]).join('_'))
}
