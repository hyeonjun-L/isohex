// 주소 찾기 — 도로명 · 지번 주소를 브이월드 검색 API 2.0(type=address)으로 찾아 칸에 잇는다 (마스터플랜 W7.4 '검색창(주소·동·역·업종)', W7.16 쓰임새 5).
// 동 이름으로 찾으면 '동 가운데에 가장 가까운 칸'이라 손익을 견주는 상권이 다를 수 있다(가게 있는 칸의 48%) — 주소면 그 건물이 든 칸으로 간다.
// 브이월드는 다른 출처 요청(CORS)을 받지 않아 callback(JSONP)으로 부른다(ui/useAddress.ts). 찾은 주소 · 좌표는 저장하지 않는다 — 주소(URL)에는 칸(h3)만 남는다.
// 키는 배경지도와 같은 VITE_VWORLD_KEY. 키에 '검색 API'가 들어 있지 않으면 응답이 ERROR라 '주소 찾기를 쓸 수 없어요'로 말한다
import { latLngToCell } from 'h3-js'

export type AddrCategory = 'road' | 'parcel'

/** 주소처럼 생겼나 — '망원로 23' · '월드컵로13길 12' · '망원동 395-1' · '신사동 산 12'. 동 · 역 · 업종 이름(역삼1동 · 종로3가)은 아니다 */
export function looksLikeAddress(q: string): boolean {
  return /(로|길|동|가|리)\s*(산\s*)?\d+(-\d+)?(번지)?$/.test(q.trim())
}

/** 먼저 찾을 갈래 — '…로 · …길 + 번호'면 도로명, 아니면 지번. 없으면 다른 갈래로 한 번 더 */
export function addrOrder(q: string): [AddrCategory, AddrCategory] {
  return /(로|길)\s*\d+(-\d+)?$/.test(q.trim()) ? ['road', 'parcel'] : ['parcel', 'road']
}

/** 요청 주소 — 서울 밖 같은 이름을 줄이려고 '서울'을 앞에 붙인다 */
export function addrUrl(key: string, q: string, category: AddrCategory, callback: string): string {
  const query = /서울/.test(q) ? q.trim() : `서울 ${q.trim()}`
  const p = new URLSearchParams({ service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', size: '5', page: '1', query, type: 'address', category, format: 'json', errorformat: 'json', key, callback })
  return `https://api.vworld.kr/req/search?${p.toString()}`
}

export interface AddrHit {
  /** 도로명 주소(없으면 지번) — '서울특별시'는 뗀다 */
  label: string
  /** 다른 쪽 주소 · 건물 이름 */
  sub: string
  cell: number
}

export type AddrStatus = 'ok' | 'none' | 'error'

interface VwItem { address?: { road?: string; parcel?: string; bldnm?: string }; point?: { x?: string | number; y?: string | number } }
interface VwResponse { response?: { status?: string; result?: { items?: VwItem[] } } }

const short = (s: string) => s.replace(/^서울(특별시)?\s*/, '')

/** 응답 → 서울 칸에 이어지는 주소만 (같은 주소는 한 번). look = h3 → 칸 번호(없으면 −1) */
export function parseAddr(json: unknown, look: (h3: string) => number): { status: AddrStatus; hits: AddrHit[] } {
  const r = (json as VwResponse | null)?.response
  if (!r || (r.status !== 'OK' && r.status !== 'NOT_FOUND')) return { status: 'error', hits: [] }
  const hits: AddrHit[] = [], seen = new Set<string>()
  for (const it of r.result?.items ?? []) {
    const road = it.address?.road ?? '', parcel = it.address?.parcel ?? ''
    const full = road || parcel
    const x = Number(it.point?.x), y = Number(it.point?.y)
    if (!full.startsWith('서울') || !Number.isFinite(x) || !Number.isFinite(y)) continue
    const cell = look(latLngToCell(y, x, 9))
    const label = short(full)
    if (cell < 0 || seen.has(label)) continue
    seen.add(label)
    hits.push({ label, sub: [road && parcel ? short(parcel) : '', it.address?.bldnm ?? ''].filter(Boolean).join(' · '), cell })
  }
  return { status: hits.length ? 'ok' : 'none', hits }
}
