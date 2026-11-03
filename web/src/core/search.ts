// 첫 화면 찾기 — 동 · 역 · 업종 이름을 한 칸에서 (마스터플랜 W7.4 공통 틀 '검색창(주소·동·역·업종)').
// 주소(지번·도로명)는 브이월드 지오코더가 붙으면(W7.8 운영키) 여기에 더한다. 곳은 places.ts findPlace, 업종은 kinds.ts findKinds 그대로 쓴다
import { type Kind, type KindsData, findKinds } from './kinds'
import { type PlaceEntry, type PlaceIndex, findPlace } from './places'

export type Hit = { kind: 'kind'; k: Kind } | { kind: 'place'; p: PlaceEntry }

export interface SearchResult {
  kinds: Kind[]
  places: PlaceEntry[]
}

/** 업종 4개 · 곳 5개까지 */
export function searchAll(q: string, kd: KindsData | null, places: PlaceIndex | null): SearchResult {
  const s = q.trim()
  if (!s) return { kinds: [], places: [] }
  const kinds = kd ? findKinds(kd, s, 4) : []
  const r = places ? findPlace(places, s) : { e: null, alts: [] }
  return { kinds, places: r.e ? [r.e, ...r.alts].slice(0, 5) : [] }
}

/** 엔터를 누르면 — 업종 이름과 똑같으면 업종, 아니면 찾은 곳, 그것도 없으면 첫 업종 */
export function bestHit(q: string, r: SearchResult): Hit | null {
  const s = q.replace(/\s/g, '')
  const exact = r.kinds.find((k) => k.nm.replace(/\s/g, '') === s)
  if (exact) return { kind: 'kind', k: exact }
  if (r.places[0]) return { kind: 'place', p: r.places[0] }
  if (r.kinds[0]) return { kind: 'kind', k: r.kinds[0] }
  return null
}

/** 첫 화면 바로 가기 — 가게를 차리려는 사람이 많이 보는 업종 (모두 매출 수준을 칠하거나 새 가게 지도가 있다) */
export const QUICK_KINDS = ['I21201', 'I20101', 'I21006', 'I21007', 'G20405', 'S20701', 'S20703', 'S20902'] as const
