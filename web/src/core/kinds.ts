// 업종 247 (상가정보 소분류) — 업종 고르기와 자리 카드의 '같은 업종(이 칸 + 둘레)' · '새 가게 1년 생존' (마스터플랜 W7.4).
// 자료: kinds/index.json(이름 · 대분류 · 서울 가게 수 · 생존 · 등급) · kinds/cnt/<코드>.json([칸, 수]… — 격자와 같은 상가정보 스냅샷)
// 업종마다 볼 수 있는 깊이가 다르다 — 자리별 매출 수준은 칠하는 업종의 코드만(ind/index.json codes), 새 가게 지도는 개업 48업종(entry/index.json)
// 무인매장 묶음 6종(unm/index.json, 코드 'UN-…')은 업종처럼 고르되 깊이가 따로다 — 무인 가게 지도 · 명단 기준 비슷한 자리 · 브랜드 손익 (core/unm.ts)
import { aliasExact, aliasInside, aliasPrefix, normQ } from './alias'
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

export interface KindMatch {
  kinds: Kind[]
  /** 업종 이름이 아니라 일상 낱말(별칭 — core/alias.ts)로 찾았으면 그 낱말. 맨 앞 결과가 이름으로 찾은 것이면 null */
  via: string | null
}

/** 끝에 붙는 말 — '치킨집' · '피자가게' · '안경점'은 떼고 한 번 더 찾는다 (긴 것 먼저) */
const TAILS = ['전문점', '가게', '매장', '집', '샵', '숍', '점']

function tiers(d: KindsData, s: string): KindMatch {
  const T: Kind[][] = [[], [], []]
  for (const k of d.kinds) {
    const nm = normQ(k.nm)
    if (nm === s) T[0].push(k)
    else if (nm.startsWith(s)) T[1].push(k)
    else if (nm.includes(s)) T[2].push(k)
  }
  for (const t of T) t.sort((x, y) => y.n - x.n)
  const by = new Map(d.kinds.map((k) => [k.c, k]))
  const pick = (codes: readonly string[]) => codes.map((c) => by.get(c)).filter((k): k is Kind => !!k)
  const exact = pick(aliasExact(s))
  const named = new Set(T.flat().map((k) => k.c))
  const out: Kind[] = [], seen = new Set<string>(), word = new Map<string, string>()
  const add = (ks: Kind[], w: string | null) => {
    for (const k of ks) {
      if (seen.has(k.c)) continue
      seen.add(k.c)
      out.push(k)
      if (w && !named.has(k.c)) word.set(k.c, w)
    }
  }
  add(T[0], null)
  add(exact, s)
  add(T[1], null)
  add(T[2], null)
  for (const h of aliasPrefix(s)) add(pick(h.codes), h.w)
  return { kinds: out, via: out[0] ? word.get(out[0].c) ?? null : null }
}

/**
 * 업종 찾기 — 이름과 똑같음 → 별칭과 똑같음('커피' → 카페) → 이름 앞부분 → 이름에 들어 있음 → 치는 중인 별칭('삼겹' → 삼겹살).
 * 같은 단계에서는 가게 많은 순(별칭은 사전에 적은 순). 하나도 없으면 끝말('집' · '가게' · '점'…)을 떼고, 그래도 없으면 말 안에 든 업종 이름 · 별칭으로 찾는다
 */
export function matchKinds(d: KindsData, q: string, limit = 8): KindMatch {
  const s = normQ(q)
  if (!s) return { kinds: [], via: null }
  let r = tiers(d, s)
  if (!r.kinds.length) {
    const t = TAILS.find((x) => s.length > x.length && s.endsWith(x))
    if (t) r = tiers(d, s.slice(0, -t.length))
  }
  if (!r.kinds.length) {
    // 말 안에 든 가장 긴 업종 이름(빗금으로 나뉜 낱말 포함) · 별칭 — '동네카페' → 카페, '참치김밥' → 김밥/만두/분식, '24시국밥' → 국밥
    let nm: Kind | null = null, len = 0
    for (const k of d.kinds) {
      const full = normQ(k.nm)
      for (const x of full.includes('/') ? [full, ...full.split('/')] : [full]) {
        if (x.length < 2 || x.length >= s.length || !s.includes(x)) continue
        if (x.length > len || (x.length === len && nm && k.n > nm.n)) {
          nm = k
          len = x.length
        }
      }
    }
    const al = aliasInside(s)
    if (nm && (!al || len >= al.w.length)) r = { kinds: [nm], via: null }
    else if (al) {
      const by = new Map(d.kinds.map((k) => [k.c, k]))
      const ks = al.codes.map((c) => by.get(c)).filter((k): k is Kind => !!k)
      r = { kinds: ks, via: ks.length ? al.w : null }
    }
  }
  return { kinds: r.kinds.slice(0, limit), via: r.via }
}

/** 업종 찾기 — matchKinds의 목록만 */
export function findKinds(d: KindsData, q: string, limit = 8): Kind[] {
  return matchKinds(d, q, limit).kinds
}

/** '84%' — 생존 추정이 없으면 '—' */
export function survText(k: Kind): string {
  return k.s12 ? `${Math.round(k.s12[0] * 100)}%` : '—'
}
