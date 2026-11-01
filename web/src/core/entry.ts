// 개업 — 2025년 상반기 새 가게를 그 칸과 이웃 6칸에서 센다 (예전 뷰어 computeE·ebinOf·entryInfo, 마스터플랜 §5.15).
// 자료: entry/<업종>.json {O: [칸, 새 가게, 같은 건물 이어받기]…, K: [칸, 2024년 말 가게]…} · grid/nb.json (칸마다 이웃 6, −1 = 없음)

export interface EntryCells {
  /** [칸, 새 가게, 같은 건물 이어받기]… 납작 배열 */
  O: number[]
  /** [칸, 2024년 말 같은 업종 가게]… 납작 배열 */
  K: number[]
}

/** 지도 색 단계 경계 — 이 칸과 이웃 6칸의 새 가게 1 · 2 · 4 · 7 · 13곳 이상 */
export const ENTRY_EDGES = [1, 2, 4, 7, 13] as const

/** 새 가게 수 → 색 단계 (없으면 −1, 0~4) */
export function entryBin(v: number): number {
  if (v < 1) return -1
  let c = 0
  while (c < 4 && v >= ENTRY_EDGES[c + 1]) c++
  return c
}

export interface EntryWindow {
  /** 칸마다: 새 가게 · 이어받기 · 2024년 말 가게 */
  o: Int32Array
  rep: Int32Array
  k: Int32Array
  /** 이 칸 + 이웃 6칸 합 */
  ow: Int32Array
  kw: Int32Array
  cls: Int8Array
}

export function entryWindow(d: EntryCells, nb: ArrayLike<number>, n: number): EntryWindow {
  const o = new Int32Array(n), rep = new Int32Array(n), k = new Int32Array(n)
  for (let t = 0; t < d.O.length; t += 3) {
    o[d.O[t]] = d.O[t + 1]
    rep[d.O[t]] = d.O[t + 2]
  }
  for (let u = 0; u < d.K.length; u += 2) k[d.K[u]] = d.K[u + 1]
  const ow = new Int32Array(n), kw = new Int32Array(n), cls = new Int8Array(n)
  for (let i = 0; i < n; i++) {
    let a = o[i], b = k[i]
    for (let j = 0; j < 6; j++) {
      const q = nb[i * 6 + j]
      if (q >= 0) {
        a += o[q]
        b += k[q]
      }
    }
    ow[i] = a
    kw[i] = b
    cls[i] = entryBin(a)
  }
  return { o, rep, k, ow, kw, cls }
}

/** 6개월 개업 비율 — 이웃 포함 2024년 말 가게가 5곳 미만이면 내지 않는다(null) */
export function openRate(ow: number, kw: number): number | null {
  return kw >= 5 ? ow / kw : null
}

/** 서울 전체 — 새 가게가 생긴 칸 수 · 새 가게 합(격자 안) */
export function entryTotals(o: Int32Array): { cells: number; total: number } {
  let cells = 0, total = 0
  for (let i = 0; i < o.length; i++) {
    if (o[i] > 0) cells++
    total += o[i]
  }
  return { cells, total }
}
