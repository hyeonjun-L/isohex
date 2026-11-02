// 칸 자리 — H3 res 9 칸 중심을 EPSG:3857(m)로, 칸 변을 경위도로.
// 예전 뷰어(VD.x·VD.y·VD.off)는 pyproj로 바꾼 값을 정수로 반올림해 실었다. 웹은 자료에 싣지 않고 h3-js로 같은 식을 써서 만든다 —
// 8,322칸 중심과 꼭짓점 99,864개가 예전 정수와 모두 같다(2026-11-01 확인. 반올림 방식이 갈리는 .5 값은 없었다).
// 이웃 순서(grid/nb.json): 칸 i의 이웃 k는 경계 꼭짓점 k → k+1 변의 건너편 — h3-js cellToBoundary 순서와 같다 (tests/candidates.test.ts)
import { cellToBoundary, cellToLatLng } from 'h3-js'

const R = 6378137

/** 경위도 → EPSG:3857 (m) */
export function merc(lat: number, lng: number): [number, number] {
  return [(R * lng * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
}

/** 칸 중심 — EPSG:3857 정수 m (예전 뷰어와 같은 값). 후보를 0.7km씩 띄울 때 쓴다 */
export function cellCenters(h3: readonly string[]): { x: Float64Array; y: Float64Array } {
  const n = h3.length
  const x = new Float64Array(n), y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const [lat, lng] = cellToLatLng(h3[i])
    const [mx, my] = merc(lat, lng)
    x[i] = Math.round(mx)
    y[i] = Math.round(my)
  }
  return { x, y }
}

/**
 * 칸 변 → 선 — codes는 i×6 + k (칸 i의 변 k = 꼭짓점 k → k+1, 이웃 k와 나누는 변).
 * 돌려주는 값은 [[경도, 위도], [경도, 위도]] 선들 (MapLibre MultiLineString 좌표)
 */
export function edgeLines(h3: readonly string[], codes: ArrayLike<number>): [number, number][][] {
  const out: [number, number][][] = []
  let last = -1
  let ring: number[][] = []
  for (let q = 0; q < codes.length; q++) {
    const i = Math.floor(codes[q] / 6), k = codes[q] % 6
    if (i !== last) {
      ring = cellToBoundary(h3[i])
      last = i
    }
    const a = ring[k], b = ring[(k + 1) % 6]
    out.push([[a[1], a[0]], [b[1], b[0]]])
  }
  return out
}
