// 이 자리에 맞는 업종(거꾸로 찾기) — 칸 하나에서 칠하는 업종마다 매출 수준이 그 업종 칸들 가운데 어디쯤인지 줄 세운다 (마스터플랜 W7.16 권함 9).
// 매물을 먼저 본 사람의 질문 "여기서 뭘 하면 좋을까". 값을 섞은 점수는 만들지 않는다 — 업종끼리 매출 금액을 견주는 것이 아니라
// 업종마다 '이 자리가 그 업종에게 좋은 편인가'(칠한 칸 중 상위 몇 %)를 나란히 놓을 뿐이다.
// 자료: ind/all.json — k(업종 코드) · v(칸 값 %×10, 16비트 리틀엔디언 base64, 업종마다 칸 수만큼, 칠하지 않는 칸 −32768) ·
// near(같은 업종 가게 수: 이 칸 + 둘레 6칸, 8비트 base64, 255에서 자름)
import { fracAbove } from './candidates'
import { levelText, strength } from './level'

/** ind/index.json 한 줄에서 쓰는 것 */
export interface FitInd {
  k: string
  nm: string
  codes: string[]
  rho: number
}

export interface FitRaw {
  k: string[]
  n: number
  v: string
  near: string
}

export interface FitData {
  k: string[]
  n: number
  /** 업종 j · 칸 i → v[j * n + i] (%×10, 없으면 NONE) */
  v: Int16Array
  near: Uint8Array
  /** 업종마다 칠한 칸 값 오름차순 */
  sorted: Float64Array[]
}

export const FIT_NONE = -32768

function bytes(b64: string): Uint8Array {
  const s = atob(b64), out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function decodeFit(raw: FitRaw): FitData {
  const vb = bytes(raw.v), n = raw.n, K = raw.k.length
  if (vb.length !== K * n * 2) throw new Error('맞는 업종 자료의 칸 수가 다르다')
  const v = new Int16Array(K * n), dv = new DataView(vb.buffer)
  for (let i = 0; i < v.length; i++) v[i] = dv.getInt16(i * 2, true)
  const near = bytes(raw.near)
  if (near.length !== K * n) throw new Error('맞는 업종 자료의 가게 수가 다르다')
  const sorted = raw.k.map((_, j) => Float64Array.from(v.subarray(j * n, (j + 1) * n).filter((x) => x !== FIT_NONE)).sort())
  return { k: raw.k, n, v, near, sorted }
}

export interface FitRow {
  k: string
  /** 매출 수준 업종 이름 (한식 · 빵집·제과…) */
  nm: string
  /** 고르면 바꿀 업종 코드 — 그 업종의 첫 상가정보 소분류 */
  code: string
  pct: number
  /** 칠한 칸 가운데 이 칸보다 높은 칸의 몫 */
  up: number
  level: string
  upText: string
  /** 같은 업종 가게 (이 칸 + 둘레) — 255곳 이상은 '255곳 이상' */
  nearText: string
  strength: string
}

export interface FitModel {
  rows: FitRow[]
  /** 이 칸에서는 추정하지 않는 업종 (가게가 드문 곳) */
  none: string[]
}

/** 칸 i — 상위 몫이 작은(그 업종에게 좋은 자리인) 순, 같으면 매출 수준이 높은 순 */
export function fitRows(f: FitData, inds: readonly FitInd[], i: number): FitModel {
  const by = new Map(inds.map((d) => [d.k, d]))
  const rows: FitRow[] = [], none: string[] = []
  f.k.forEach((k, j) => {
    const d = by.get(k)
    if (!d) return
    const v = f.v[j * f.n + i]
    if (v === FIT_NONE) {
      none.push(d.nm)
      return
    }
    const up = fracAbove(f.sorted[j], v), nr = f.near[j * f.n + i]
    rows.push({
      k, nm: d.nm, code: d.codes[0], pct: v / 10, up,
      level: levelText(v / 10),
      upText: `상위 ${Math.max(1, Math.round(up * 100))}%`,
      nearText: nr >= 255 ? '같은 업종 255곳 이상' : nr ? `같은 업종 ${nr}곳` : '같은 업종 없음',
      strength: `모형의 힘 ${strength(d.rho)}`,
    })
  })
  rows.sort((a, b) => a.up - b.up || b.pct - a.pct)
  return { rows, none }
}

/** 공유 · 머리 한 줄 — '역삼1동 이 자리에 맞는 업종: 한식(상위 3%) · 카페(상위 5%) · 일식(상위 8%)' */
export function fitLine(dong: string, m: FitModel): string {
  if (!m.rows.length) return `${dong} 이 자리는 가게가 드물어 업종별 매출 수준을 추정하지 않아요`
  return `${dong} 이 자리에 맞는 업종: ${m.rows.slice(0, 3).map((r) => `${r.nm}(${r.upText})`).join(' · ')}`
}
