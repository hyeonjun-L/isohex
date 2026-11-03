// 지도 색 — 지표마다 고정 (마스터플랜 W7.5).
// 매출 수준: 평균 대비라 두 색 + 가운데 회색. 낮은 쪽을 빨강 대신 주황으로 — 낮음이 '나쁨'으로 읽히지 않게(임대료가 싼 곳이기도 하다).
// 가게 수: 많고 적음이라 한 색의 진하기.
// 이웃 단계끼리 색 거리(OKLab ΔE×100)를 색약 세 가지까지 따져 8 이상으로 맞췄다 — 매출 수준 최소 9.0, 가게 수 8.6 (2026-10-24)
// '추정하지 않음'은 색을 쓰지 않고 빗금으로 — 가운데 회색('비슷함')과 섞이지 않게 (2026-10-24 화면 점검에서 둘이 같아 보였다)

import type { Show } from '../core/layers'

export type Theme = 'light' | 'dark'
export type RGBA = readonly [number, number, number, number]

export const LEVEL_COLORS: Record<Theme, string[]> = {
  light: ['#9c4d0c', '#d0802f', '#efbe86', '#e2e0db', '#a3c5e6', '#4d8bc9', '#1b4f8f'],
  dark: ['#e08b35', '#a8642a', '#6a4c31', '#3a3a3c', '#2e5070', '#3d7fc2', '#86bdf2'],
}

export const STORE_COLORS: Record<Theme, string[]> = {
  light: ['#e0eaf0', '#b4cfdf', '#80aeca', '#4a85a8', '#1b557a'],
  dark: ['#25313a', '#2d4b5b', '#3c6f8c', '#62a0c4', '#a5cfe8'],
}

// 동네 보기 지표 셋 (2026-11-03) — 지표마다 다른 한 색의 진하기(OKLCH 색상 고정, 밝기만 고르게 내림). 다크는 낮은 값이 어둡고 높은 값이 밝다.
// 같은 업종 = 보라(305°) · 새 가게 = 초록(150°): 가장 옅은 단계가 '없음(0곳)'이라 바탕에 묻혀도 된다.
// 1층 임대료 = 장밋빛(12°): 가장 싼 단계도 '조사 상권 밖'(칠하지 않음)과 갈리게 바탕 대비 2:1 넘게 진하게 시작한다.
// 이웃 단계 색 거리 ΔE×100(정상 · 적색약 · 녹색약 · 청색약 가운데 가장 작은 값) — 라이트/다크:
// 같은 업종 10.7/10.9 · 새 가게 10.4/10.9 · 1층 임대료 9.6/8.9. dataviz 검사기 --ordinal에서 한 색·밝기 차례·이웃 밝기 차 0.06 통과
// (같은 업종·새 가게는 옅은 끝의 바탕 대비만 일부러 넘지 않는다 — 0곳이라서)
export const SAME_COLORS: Record<Theme, string[]> = {
  light: ['#f2ebfc', '#d5c0f0', '#b896df', '#9a6ec9', '#7b4aaa', '#5a2d83'],
  dark: ['#342d3d', '#56436c', '#7c5ba0', '#a078cd', '#c29cee', '#e0c8fe'],
}

export const ENTRY_COLORS: Record<Theme, string[]> = {
  light: ['#e1f5e4', '#abd8b3', '#73bb83', '#429c5a', '#25793f', '#115629'],
  dark: ['#253528', '#2f5839', '#3d7d4d', '#4aa462', '#68c980', '#99ebaa'],
}

export const RENT_COLORS: Record<Theme, string[]> = {
  light: ['#df9ca4', '#d16b7a', '#b83c55', '#8f1b39', '#610722'],
  dark: ['#833b46', '#b74b5e', '#e1697c', '#fa96a3', '#ffccd0'],
}

export const SHOW_COLORS: Record<Show, Record<Theme, string[]>> = { pot: LEVEL_COLORS, store: STORE_COLORS, same: SAME_COLORS, entry: ENTRY_COLORS, rent: RENT_COLORS }

// 건물(bldg): 회색 반투명 — 칸 바닥 색이 비쳐 보이게 (W7.5 '투명도 0.3 안팎', P1 시안에서 다시 정한다)
// 기둥(pillar): 고른 칸을 세운 반투명 기둥 — 강조색(W7.5 '기둥'), 높이는 둘레 건물 위로
export const BASE_COLORS: Record<Theme, { bg: string; land: string; gu: string; seoul: string; none: string; select: string; hatch: RGBA; bldg: string; bldgOpacity: number; pillar: string }> = {
  light: { bg: '#e9e8e4', land: '#f4f3ef', gu: '#8a8a86', seoul: '#55554f', none: '#c9c7c1', select: '#111111', hatch: [120, 118, 110, 175], bldg: '#8c8a83', bldgOpacity: 0.32, pillar: '#1b4f8f' },
  dark: { bg: '#141416', land: '#1d1d20', gu: '#6a6a70', seoul: '#9a9aa2', none: '#38383c', select: '#ffffff', hatch: [138, 138, 146, 170], bldg: '#b4b4bd', bldgOpacity: 0.26, pillar: '#86bdf2' },
}

export const PILLAR_HEIGHT = 220 // m — 서울 도심 건물 대부분보다 높게

export const rgbaCss = ([r, g, b, a]: RGBA) => `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`

/** 빗금 무늬 한 장 (16×16, 화면 8×8) — '/' 방향, 바탕은 비워 배경지도가 보인다 */
export function hatchImage(c: RGBA) {
  const size = 16
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % 8 >= 2) continue
      const o = (y * size + x) * 4
      data[o] = c[0]
      data[o + 1] = c[1]
      data[o + 2] = c[2]
      data[o + 3] = c[3]
    }
  }
  return { width: size, height: size, data }
}
