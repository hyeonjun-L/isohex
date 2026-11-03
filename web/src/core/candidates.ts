// 후보 찾기 — 기준점에서 정한 시간 안에 닿는 칸 가운데 자리 조건·같은 업종 조건을 맞는 칸을 순서 하나로 줄 세우고,
// 먼저 뽑힌 후보에서 0.7km 안(이웃 두 겹)인 칸은 건너뛰며 20곳 (마스터플랜 §5.18).
// 예전 뷰어(viewer/template.html)의 cRun(거르기·순서·띄우기·깔때기) · cDraw(등시선 경계 변) · candInfo(왜 들었나/빠졌나) ·
// cSparse·cNbSum · cResUp·cPotUp를 옮겼다. tests/candidates.test.ts가 옛 함수와 같은 값을 내는지 견준다.
// 값을 섞은 점수는 없다 — 시간·조건은 거르기만, 순서는 하나만 (W3 가중합 폐기와 같은 원칙).
// 자료: cand/index.json(p24 — 무인 6종 자리 조건 범위 · 같은 업종 · 명단의 무인) · grid/site.json(칸마다 주택가 정도·주민 순위) · grid/nb.json · 이동 시간(travel)
// 무인 6종에는 매출 수준 순서를 쓰지 않는다(W7.15) — 기본은 주민 순. 'pot'은 칠하는 업종으로 넓힐 때 쓸 자리로 남겨 둔다

import { comma } from './format'
import { cellCenters } from './grid'
import type { SiteData } from './site'

/** 뽑는 후보 수 */
export const CN = 20
/** 시간 띠 경계(분) — 등시선 색 */
export const TIME_BANDS = [10, 20, 30, 45, 60] as const
/** res 9 칸 하나 넓이(㎢) — '○칸 (약 ○㎢)' */
export const CELL_KM2 = 0.1053
/** 띄우는 거리 — 땅 위 0.7km를 서울 가운데 위도(37.55°)의 EPSG:3857 거리로 바꾼 값의 제곱 */
export const SEP2 = Math.pow(700 / Math.cos((37.55 * Math.PI) / 180), 2)

/** 칸마다 거르기 결과 비트 — 시간 안 · 자리 조건 · 같은 업종 조건 */
export const PASS_TIME = 1
export const PASS_SITE = 2
export const PASS_COMP = 4

export type SortKey = 'pot' | 'res' | 'few' | 'near'

/** 순서 이름 — 예전 뷰어의 '매출 잠재'는 웹 말 '매출 수준'으로 */
export const SORT_NM: Record<SortKey, string> = {
  pot: '매출 수준 높은 순',
  res: '주민이 많은 순',
  few: '같은 업종이 적은 순',
  near: '가까운 순',
}

/** 자리 조건 — 그 유형 무인 가게가 있는 칸의 10 · 50 · 90% (반경 300m 가게 수 · 주택가 정도) */
export interface SiteBand {
  n300: [number, number, number]
  tilt: [number, number, number]
}

/** cand/index.json의 유형 하나 (p24) */
export interface CandType {
  /** 유형 이름 — '빨래방', '카페' … */
  t: string
  /** 같은 업종으로 세는 가게 */
  label: string
  codes: string[]
  /** 이름 규칙 (정규식 글자, 없으면 '') */
  rx: string
  /** 이름 규칙을 볼 코드 (비면 모든 코드) */
  rxc: string[]
  /** 개업 지도 업종 코드 (없으면 null) */
  entry: string | null
  /** 명단에서 찾아 상가정보에 붙인 무인 가게 수 */
  found: number
  band: SiteBand
  /** 두 조건을 다 맞는 서울 칸 비율 */
  pass: number
  /** 같은 업종 가게 합 */
  cnt_total: number
}

export interface CandData {
  meta: { poi: string; band: [number, number]; list: string }
  types: CandType[]
  /** 유형마다 [칸, 같은 업종 가게 수]… */
  cnt: Record<string, number[]>
  /** 유형마다 [칸, 명단에서 찾은 무인 가게 수]… */
  un: Record<string, number[]>
}

/** 후보 계산에 쓰는 칸마다 값 */
export interface CandGrid {
  n: number
  /** 반경 300m 가게 수 (cells.json) */
  n300: ArrayLike<number>
  /** 주택가 정도 ×1000 */
  tilt: ArrayLike<number>
  /** 주민 순위 */
  rr: ArrayLike<number>
  /** 칸 중심 EPSG:3857 정수 m (grid.ts cellCenters) */
  x: ArrayLike<number>
  y: ArrayLike<number>
  /** 칸마다 이웃 6 (grid/nb.json, −1 = 없음) */
  nb: ArrayLike<number>
}

/** 칸 자리 값 모으기 — site는 grid/site.json (주택가 정도 · 주민 순위) */
export function candGrid(cells: { h3: string[]; n300: number[] }, site: Pick<SiteData, 'tilt' | 'rr'>, nb: ArrayLike<number>): CandGrid {
  const n = cells.h3.length
  if (site.tilt.length !== n || site.rr.length !== n || nb.length !== n * 6) throw new Error('후보 자료의 칸 수가 격자와 다르다')
  const { x, y } = cellCenters(cells.h3)
  return { n, n300: cells.n300, tilt: site.tilt, rr: site.rr, x, y, nb }
}

/** [칸, 수]… → 칸마다 수 (예전 cSparse) */
export function fromSparse(a: ArrayLike<number>, n: number): Int32Array {
  const out = new Int32Array(n)
  for (let k = 0; k < a.length; k += 2) out[a[k]] = a[k + 1]
  return out
}

/** 이 칸 + 이웃 6칸 합 (예전 cNbSum) */
export function nbSum(src: ArrayLike<number>, nb: ArrayLike<number>): Int32Array {
  const n = src.length, out = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    let s = src[i]
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k]
      if (j >= 0) s += src[j]
    }
    out[i] = s
  }
  return out
}

/** 유형 하나의 칸마다 같은 업종·명단의 무인 — 이 칸만과 이웃 포함 (예전 cSetType) */
export function typeCounts(d: Pick<CandData, 'cnt' | 'un'>, t: string, nb: ArrayLike<number>, n: number) {
  const cnt = fromSparse(d.cnt[t] ?? [], n), un = fromSparse(d.un[t] ?? [], n)
  return { cnt, cntw: nbSum(cnt, nb), un, unw: nbSum(un, nb) }
}

/** 기본 순서 — 매출 수준이 있으면 그것, 없으면 주민 순 (무인 6종은 매출 수준이 없다 — W7.15) */
export function defaultSort(hasPot: boolean): SortKey {
  return hasPot ? 'pot' : 'res'
}

/** 고를 수 있는 순서 */
export function sortKeys(hasPot: boolean): SortKey[] {
  return hasPot ? ['pot', 'res', 'few', 'near'] : ['res', 'few', 'near']
}

export interface CandQuery {
  /** 기준점에서 칸마다 걸리는 시간(초, 닿지 않으면 Infinity) — travelTimes */
  times: ArrayLike<number>
  /** 정한 시간(분) */
  min: number
  /** 자리 조건 — null이면 끔 */
  site: SiteBand | null
  /** 같은 업종(이 칸 + 이웃 6칸) 상한 — 음수면 제한 없음, 0이면 없는 곳만 */
  comp: number
  /** 칸마다 이 칸 + 이웃 6칸 같은 업종 가게 수 (typeCounts의 cntw) */
  cntw: ArrayLike<number>
  sort: SortKey
  /** 매출 수준(칠한 칸만, 나머지 null) — sort가 'pot'일 때만 쓴다. 없으면 'pot'은 가까운 순과 같다 */
  pot?: ArrayLike<number | null> | null
}

export interface CandStat {
  /** 정한 시간 안 칸 */
  reach: number
  /** 그중 자리 조건을 맞는 칸 (조건을 끄면 reach와 같다) */
  prof: number
  /** 그중 같은 업종 조건도 맞는 칸 */
  comp: number
  /** 뽑은 후보 */
  picked: number
  /** 매출 수준 순일 때 매출 수준이 없는 후보 수 */
  potNA: number
}

export interface CandResult {
  /** 후보 칸 번호 — 순서대로 */
  list: number[]
  /** 칸마다 시간 띠(0~4, TIME_BANDS), 정한 시간 밖이면 −1 */
  tband: Int8Array
  /** 칸마다 PASS_TIME | PASS_SITE | PASS_COMP */
  pass: Uint8Array
  /** 후보 순번(1부터), 후보가 아니면 0 */
  rank: Int16Array
  /** 조건은 맞지만 먼저 뽑힌 후보 0.7km 안이라 건너뛴 칸 */
  skip: Uint8Array
  stat: CandStat
}

/** 시간(초) → 시간 띠 번호 — 10분 안 0 · 20분 1 · 30분 2 · 45분 3 · 그 뒤 4 */
export function timeBand(t: number): number {
  let b = 0
  while (b < TIME_BANDS.length - 1 && t > TIME_BANDS[b] * 60) b++
  return b
}

/** 자리 조건 안인가 — 두 범위(10~90%)에 다 든다. tilt는 ×1000 정수가 아니라 실제 값 */
export function inSite(B: SiteBand, n300: number, tilt: number): boolean {
  return n300 >= B.n300[0] && n300 <= B.n300[2] && tilt >= B.tilt[0] && tilt <= B.tilt[2]
}

/** 거르기 → 순서 → 0.7km 띄워 CN곳 (예전 cRun) */
export function findCandidates(g: CandGrid, q: CandQuery): CandResult {
  const n = g.n, T = q.times, lim = q.min * 60, B = q.site
  if (T.length !== n || q.cntw.length !== n) throw new Error('칸 수가 다르다')
  const tband = new Int8Array(n), pass = new Uint8Array(n), rank = new Int16Array(n), skip = new Uint8Array(n)
  let reach = 0, prof = 0, comp = 0
  const pool: number[] = []
  for (let i = 0; i < n; i++) {
    const t = T[i]
    let f = 0
    if (t <= lim) {
      f |= PASS_TIME
      reach++
      tband[i] = timeBand(t)
    } else tband[i] = -1
    if (!B || inSite(B, g.n300[i], g.tilt[i] / 1000)) f |= PASS_SITE
    if (q.comp < 0 || q.cntw[i] <= q.comp) f |= PASS_COMP
    pass[i] = f
    if ((f & 3) === 3) {
      prof++
      if (f & PASS_COMP) {
        comp++
        pool.push(i)
      }
    }
  }
  // 순서 하나 — 같으면 가까운 칸, 그것도 같으면 칸 번호가 작은 쪽 (매출 수준이 없는 칸은 있는 칸 다음)
  const so = q.sort, P = so === 'pot' && q.pot ? q.pot : null, rr = g.rr, cw = q.cntw
  pool.sort((x, y) => {
    if (P) {
      const a = P[x] ?? -Infinity, c = P[y] ?? -Infinity
      if (a !== c) return c > a ? 1 : -1
    } else if (so === 'res') {
      if (rr[x] !== rr[y]) return rr[x] - rr[y]
    } else if (so === 'few') {
      if (cw[x] !== cw[y]) return cw[x] - cw[y]
    }
    return T[x] - T[y] || x - y
  })
  // 붙은 칸은 사실상 같은 자리 — 먼저 뽑힌 후보에서 0.7km 안인 칸은 건너뛴다
  const list: number[] = []
  for (let p = 0; p < pool.length && list.length < CN; p++) {
    const c = pool[p]
    let near = false
    for (let k = 0; k < list.length; k++) {
      const dx = g.x[c] - g.x[list[k]], dy = g.y[c] - g.y[list[k]]
      if (dx * dx + dy * dy < SEP2) {
        near = true
        break
      }
    }
    if (near) {
      skip[c] = 1
      continue
    }
    list.push(c)
    rank[c] = list.length
  }
  let potNA = 0
  if (P) for (const c of list) if (P[c] == null) potNA++
  return { list, tband, pass, rank, skip, stat: { reach, prof, comp, picked: list.length, potNA } }
}

/**
 * 등시선 테두리 — 정한 시간 안 칸의 변 가운데 건너편 칸이 시간 밖이거나 격자 밖인 변 (예전 cDraw).
 * 돌려주는 값은 i×6 + k (칸 i의 꼭짓점 k → k+1 변) — 선은 grid.ts edgeLines로 만든다
 */
export function isoEdges(times: ArrayLike<number>, min: number, nb: ArrayLike<number>): Int32Array {
  const lim = min * 60, out: number[] = []
  for (let i = 0; i < times.length; i++) {
    if (!(times[i] <= lim)) continue
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k]
      if (j >= 0 && times[j] <= lim) continue
      out.push(i * 6 + k)
    }
  }
  return Int32Array.from(out)
}

/** 칸 하나가 왜 후보가 되었나 / 빠졌나 — 예전 candInfo의 한 줄 */
export function whyText(i: number, g: CandGrid, q: CandQuery, r: CandResult): string {
  const f = r.pass[i], B = q.site, why: string[] = []
  if (!(f & PASS_TIME)) why.push(`정한 ${q.min}분 밖`)
  if (!(f & PASS_SITE) && B) {
    const n3 = g.n300[i], tl = g.tilt[i] / 1000
    if (n3 < B.n300[0]) why.push(`주변 가게가 적음(${comma(n3)} < ${comma(Math.round(B.n300[0]))})`)
    else if (n3 > B.n300[2]) why.push(`주변 가게가 많음(${comma(n3)} > ${comma(Math.round(B.n300[2]))})`)
    if (tl < B.tilt[0]) why.push(`주택가 정도가 낮음(${tl.toFixed(2)} < ${B.tilt[0].toFixed(2)})`)
    else if (tl > B.tilt[2]) why.push(`주택가 정도가 높음(${tl.toFixed(2)} > ${B.tilt[2].toFixed(2)})`)
  }
  if (!(f & PASS_COMP)) why.push(`같은 업종 이웃 포함 ${q.cntw[i]}곳 — 정한 ${q.comp}곳보다 많음`)
  if (why.length) return `조건 밖 — ${why.join(' · ')}`
  if (r.rank[i]) return `조건에 맞는 칸 — ${SORT_NM[q.sort]}으로 ${r.rank[i]}번째`
  return r.skip[i] ? '조건에 맞지만 가까이에 먼저 뽑힌 후보가 있어 건너뜀' : `조건에 맞지만 ${CN}곳 안에 들지 않음`
}

/** 정렬된 값들 가운데 v보다 큰 몫 (예전 cPotUp — 칠한 칸의 매출 수준을 정렬해 넣는다. '상위 ○%'는 format.rankText) */
export function fracAbove(sorted: ArrayLike<number>, v: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (sorted[m] <= v) lo = m + 1
    else hi = m
  }
  return (sorted.length - lo) / Math.max(sorted.length, 1)
}

/** 주민 순위 몫 — 거주 접근성이 이 칸보다 큰 칸의 몫 (예전 cResUp) */
export function resUp(g: Pick<CandGrid, 'n' | 'rr'>, i: number): number {
  return g.rr[i] / g.n
}

/** 정한 시간 안 넓이 — '3,378칸 (약 356㎢)' */
export function reachText(reach: number): string {
  return `${comma(reach)}칸 (약 ${comma(Math.round(reach * CELL_KM2))}㎢)`
}
