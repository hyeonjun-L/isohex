// 자리 카드에서 다음 행동으로 — 근처 상가 매물(당근부동산)과 거리 보기(카카오맵 로드뷰) (2026-11-20 전체 검토 4번).
// 주소 형식은 2026-11-20에 열어 확인했다:
//   · 당근부동산 지역 매물 지도 — /map/서울특별시/<자치구>/<법정동>/상가 ('서울 마포구 망원동 상가 매물' · '성수동1가'도 됨).
//     역 이름 주소(/map/subway/<역>/상가)도 있지만 이름이 하나라도 다르면 '페이지를 찾을 수 없어요'라 법정동 주소를 쓴다(places/bdong.json, 칸 → 법정동)
//   · 카카오맵 로드뷰 — /link/roadview/<위도>,<경도> → 가장 가까운 로드뷰 사진으로 바뀐다(panoid)
// 네이버 부동산은 이 작업 환경에서 열어 볼 수 없어 넣지 않았다(주소 형식을 확인하지 못함)
// 링크에는 칸 중심 좌표와 동 이름만 실린다 — 사용자가 넣은 숫자(면적 · 월세 등)는 싣지 않는다

export interface OutLink {
  key: 'listing' | 'roadview'
  label: string
  /** 어느 서비스로 가나 */
  sub: string
  href: string
}

/** places/bdong.json — 칸 → 법정동 */
export interface BdongData {
  gu: string[]
  /** [법정동, 자치구 번호] */
  bd: [string, number][]
  /** 칸마다 bd 번호 */
  c: number[]
}

/** 칸 i의 법정동 — 자료가 없으면 null */
export function bdongAt(d: BdongData | null, i: number): { nm: string; gu: string } | null {
  const b = d ? d.bd[d.c[i]] : undefined
  return b ? { nm: b[0], gu: d!.gu[b[1]] } : null
}

const enc = encodeURIComponent

export function listingUrl(gu: string, bdong: string): string {
  return `https://realty.daangn.com/map/${enc('서울특별시')}/${enc(gu)}/${enc(bdong)}/${enc('상가')}`
}

export function roadviewUrl(lat: number, lng: number): string {
  return `https://map.kakao.com/link/roadview/${lat.toFixed(6)},${lng.toFixed(6)}`
}

/** 카드 링크 — 법정동을 모르면 매물 링크는 뺀다 */
export function outLinks(lat: number, lng: number, bd: { nm: string; gu: string } | null): OutLink[] {
  const out: OutLink[] = []
  if (bd) out.push({ key: 'listing', label: `${bd.nm} 상가 매물`, sub: '당근부동산', href: listingUrl(bd.gu, bd.nm) })
  out.push({ key: 'roadview', label: '이 칸 거리 보기', sub: '카카오맵 로드뷰', href: roadviewUrl(lat, lng) })
  return out
}
