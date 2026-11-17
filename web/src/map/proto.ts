// 지도 설정 타입 · 기본값 — 지도 라이브러리(maplibre)를 끌어오지 않는 작은 파일. App은 여기서 읽고, 지도 화면(MapView)은 첫 화면 글자 뒤에 받는다 (마스터플랜 W7.16 쓰임새 2)
export type View = '3d' | 'top'
export interface Proto { bldg: 'gray' | 'tint' | 'off'; bop: number | null; bg: 'vworld' | 'none' }
export const PROTO_DEFAULT: Proto = { bldg: 'tint', bop: 0.5, bg: 'vworld' }
