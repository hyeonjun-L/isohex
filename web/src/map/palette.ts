// 지도 색 — 지표마다 고정 (마스터플랜 W7.5).
// 매출 수준: 평균 대비라 두 색 + 가운데 회색. 낮은 쪽을 빨강 대신 주황으로 — 낮음이 '나쁨'으로 읽히지 않게(임대료가 싼 곳이기도 하다).
// 가게 수: 많고 적음이라 한 색의 진하기.
// 이웃 단계끼리 색 거리(OKLab ΔE×100)를 색약 세 가지까지 따져 8 이상으로 맞췄다 — 매출 수준 최소 9.0, 가게 수 8.6 (2026-10-24)
// '추정하지 않음'은 색을 쓰지 않고 빗금으로 — 가운데 회색('비슷함')과 섞이지 않게 (2026-10-24 화면 점검에서 둘이 같아 보였다)

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

// 건물(bldg): 회색 반투명 — 칸 바닥 색이 비쳐 보이게 (W7.5 '투명도 0.3 안팎', P1 시안에서 다시 정한다)
export const BASE_COLORS: Record<Theme, { bg: string; land: string; gu: string; seoul: string; none: string; select: string; hatch: RGBA; bldg: string; bldgOpacity: number }> = {
  light: { bg: '#e9e8e4', land: '#f4f3ef', gu: '#8a8a86', seoul: '#55554f', none: '#c9c7c1', select: '#111111', hatch: [120, 118, 110, 175], bldg: '#8c8a83', bldgOpacity: 0.32 },
  dark: { bg: '#141416', land: '#1d1d20', gu: '#6a6a70', seoul: '#9a9aa2', none: '#38383c', select: '#ffffff', hatch: [138, 138, 146, 170], bldg: '#b4b4bd', bldgOpacity: 0.26 },
}

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
