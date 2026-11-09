// 업종 247 (상가정보 소분류) — 업종 고르기와 자리 카드의 '같은 업종(이 칸 + 둘레)' · '새 가게 1년 생존' (마스터플랜 W7.4).
// 자료: kinds/index.json(이름 · 대분류 · 서울 가게 수 · 생존 · 등급) · kinds/cnt/<코드>.json([칸, 수]… — 격자와 같은 상가정보 스냅샷)
// 업종마다 볼 수 있는 깊이가 다르다 — 자리별 매출 수준은 칠하는 업종의 코드만(ind/index.json codes), 새 가게 지도는 개업 48업종(entry/index.json)
// 무인매장 묶음 6종(unm/index.json, 코드 'UN-…')은 업종처럼 고르되 깊이가 따로다 — 무인 가게 지도 · 명단 기준 비슷한 자리 · 브랜드 손익 (core/unm.ts)
import { fromSparse, nbSum } from './candidates'
import { type UnType, type UnmData, UN_GROUP, unKind } from './unm'

export interface Kind {
  /** 상가정보 소분류 코드 */
  c: string
  nm: string
  /** 대분류 — 묶음 칩 */
  g: string
  /** 서울 가게 수 (격자 안) */
  n: number
  /** 가게가 있는 칸 수 */
  cells: number
  /** A 격자 학습 가능 · B 상권·행정동 집계 · C 부족 · X 제외(원천 일괄 등록·삭제) */
  grade: 'A' | 'B' | 'C' | 'X'
  /** 새 가게 1년 생존 [추정, 아래, 위] — X 등급은 null */
  s12: [number, number, number] | null
  /** 기존 가게 연 폐업률 */
  close: number | null
  note: string
}

export interface KindsData {
  meta: { poi: string; s12: string }
  kinds: Kind[]
}

/** 매출 수준을 칠하더라도 이 코드에는 보이지 않는다 — 셀프빨래방은 '세탁소'로 배운 값이 맞지 않는다 (W7.15) */
export const NO_POT = new Set(['S20902'])

export interface KindDepth {
  /** 자리별 매출 수준 — 칠하는 업종(ind/index.json)의 코드면 그 업종 코드 */
  pot: string | null
  /** 새 가게 지도 (개업 48업종) */
  entry: boolean
  /** 무인매장 묶음 — 무인 가게 지도 · 명단 기준 비슷한 자리 · 가맹 브랜드 손익 */
  un: boolean
}

export interface KindIndex {
  /** 업종 247 + 무인 6종 */
  byCode: Map<string, Kind>
  /** 대분류 → 업종 (가게 많은 순) — 무인매장 묶음은 맨 끝 */
  groups: Map<string, Kind[]>
  /** 업종 247 + 무인 6종 — 이름 찾기 · '전체' 목록 */
  all: Kind[]
  /** 생존 추정이 있는 업종의 생존 오름차순 — 서울 업종 가운데 위치 (업종 247만 — 무인 유형은 빌려 온 값이라 넣지 않는다) */
  s12Sorted: Float64Array
  /** 무인 유형 (코드 'UN-…') */
  un: Map<string, UnType>
  depth(c: string): KindDepth
}

export function kindIndex(
  d: KindsData,
  ind: readonly { k: string; codes: string[]; paint: boolean }[],
  entry: readonly { k: string }[],
  unm: UnmData | null = null,
): KindIndex {
  const byCode = new Map(d.kinds.map((k) => [k.c, k]))
  const groups = new Map<string, Kind[]>()
  for (const k of d.kinds) {
    const a = groups.get(k.g)
    if (a) a.push(k)
    else groups.set(k.g, [k])
  }
  for (const a of groups.values()) a.sort((x, y) => y.n - x.n || (x.c < y.c ? -1 : 1))
  const pot = new Map<string, string>()
  for (const m of ind) if (m.paint) for (const c of m.codes) if (!NO_POT.has(c)) pot.set(c, m.k)
  const en = new Set(entry.map((e) => e.k))
  const s12Sorted = Float64Array.from(d.kinds.filter((k) => k.s12).map((k) => k.s12![0])).sort()
  const un = new Map((unm?.types ?? []).map((u) => [u.k, u]))
  const unKinds = [...un.values()].map((u) => unKind(u, byCode)).sort((x, y) => y.n - x.n)
  for (const k of unKinds) byCode.set(k.c, k)
  if (unKinds.length) groups.set(UN_GROUP, unKinds)
  return {
    byCode,
    groups,
    all: [...d.kinds, ...unKinds],
    s12Sorted,
    un,
    depth: (c) => (un.has(c) ? { pot: null, entry: false, un: true } : { pot: pot.get(c) ?? null, entry: en.has(c), un: false }),
  }
}

/** 이 칸 + 이웃 6칸 같은 업종 가게 수 (kinds/cnt/<코드>.json) */
export function sameKind(cnt: ArrayLike<number>, nb: ArrayLike<number>, n: number): { own: Int32Array; near: Int32Array } {
  const own = fromSparse(cnt, n)
  return { own, near: nbSum(own, nb) }
}

/** 이름으로 업종 찾기 — 정확 → 앞부분 → 들어 있음, 같은 단계에서는 가게 많은 순 */
export function findKinds(d: KindsData, q: string, limit = 8): Kind[] {
  const s = q.replace(/\s/g, '')
  if (!s) return []
  const T: Kind[][] = [[], [], []]
  for (const k of d.kinds) {
    const nm = k.nm.replace(/\s/g, '')
    if (nm === s) T[0].push(k)
    else if (nm.startsWith(s)) T[1].push(k)
    else if (nm.includes(s)) T[2].push(k)
  }
  return T.flatMap((t) => t.sort((x, y) => y.n - x.n)).slice(0, limit)
}

/** '84%' — 생존 추정이 없으면 '—' */
export function survText(k: Kind): string {
  return k.s12 ? `${Math.round(k.s12[0] * 100)}%` : '—'
}
