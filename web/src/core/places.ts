// 곳 찾기 — 동·역 이름으로 기준점을 고르고, 지도에서 찍은 곳을 칸으로 잇는다
// (예전 뷰어 cSearchIndex·cFind·cExample·cNearest·cPlace·cPickAt, 마스터플랜 §5.18 '입력').
// · 동은 그 동 칸들의 가운데(평균 좌표)에 가장 가까운 칸, 역은 역에서 가장 가까운 칸으로 잇는다(1.3km 넘게 떨어진 역은 뺀다)
// · 이름 맞추기 — 정확한 이름 → '○○동'이면 '○○1동·○○2동…' → 앞부분이 같음 → 들어 있음. 비슷한 이름은 4개까지
// · 목록 순서는 예전과 같다: 동('동|구' 글자 순) 다음 역(이동 그래프 순)
// 예전과 다른 곳 하나 — 노선 이름표에 없던 1호선 경원 갈래·급행 갈래 키('1경원' · '1급행경인' …)가 이름 대신 키로 나오던 것을 '1호선'으로 바로잡았다
// 자료: cells.json(h3 → grid.ts cellCenters) · dongs.json · places/stations.json(이동 그래프의 역·노선)
import { cellCenters } from './grid'

/** 노선 키 → 이름 (예전 뷰어 LINE_NM + '1경원') — 갈래·지선은 줄기 노선 이름으로 */
export const LINE_NM: Readonly<Record<string, string>> = {
  '1': '1호선', '1경인': '1호선', '1경부': '1호선', '1경원': '1호선', '2성수': '2호선', '2신정': '2호선', '5하남': '5호선', '5마천': '5호선',
  '2': '2호선', '3': '3호선', '4': '4호선', '5': '5호선', '6': '6호선', '7': '7호선', '8': '8호선', '9': '9호선',
  W: '우이신설선', Silim: '신림선', 신분당: '신분당선', 경강: '경강선', '경의·중앙': '경의·중앙선', 경춘: '경춘선', 공항철도: '공항철도',
  서해: '서해선', '수인·분당': '수인·분당선', 'GTX-A': 'GTX-A', U: '의정부 경전철', '김포 골드라인': '김포 골드라인', 인천1: '인천 1호선', I2: '인천 2호선',
}

/** 노선 키 하나 → 이름 ('4급행'·'1급행경인'처럼 급행이 붙은 키도 그 노선 이름으로) */
export function lineName(k: string): string {
  return LINE_NM[k] ?? LINE_NM[k.replace(/급행/, '')] ?? k
}

/** places/stations.json */
export interface StationData {
  /** 역 [x, y (EPSG:3857 m), 이름 — 끝의 '역'은 뺀 것] */
  st: [number, number, string][]
  /** 노선 키 (이동 그래프 노선 순서) */
  lines: string[]
  /** [역, 노선]… */
  sl: number[]
  /** 칸에서 걸어 닿는 역 번호 — 나머지 역은 찾기에서 뺀다 */
  has: number[]
}

export interface PlaceEntry {
  kind: 'dong' | 'st'
  /** 동 이름 · 역 이름 */
  name: string
  /** '역삼1동 (강남구)' · '시청역 (1호선·2호선)' */
  label: string
  /** 이어 둔 칸 */
  cell: number
  /** 그 곳 EPSG:3857 (동은 이은 칸의 중심, 역은 역 자리) */
  x: number
  y: number
}

export interface PlaceIndex {
  list: PlaceEntry[]
  byLabel: Map<string, PlaceEntry>
}

/** 칸 자리 — 중심 좌표와 행정동 번호 */
export interface PlaceGrid {
  x: ArrayLike<number>
  y: ArrayLike<number>
  dong: ArrayLike<number>
}

export function placeGrid(cells: { h3: string[]; dong: number[] }): PlaceGrid {
  const { x, y } = cellCenters(cells.h3)
  return { x, y, dong: cells.dong }
}

/** '역삼1동|강남구' → '역삼1동 (강남구)' (예전 cPlace) */
export function placeName(dongKey: string): string {
  const [d, g] = dongKey.split('|')
  return `${d} (${g})`
}

/** 가장 가까운 칸과 거리(EPSG:3857 m) — 같으면 번호가 작은 칸 (예전 cNearest) */
export function nearestCell(g: Pick<PlaceGrid, 'x' | 'y'>, x: number, y: number): { i: number; d: number } {
  let best = -1, bd = Infinity
  for (let i = 0; i < g.x.length; i++) {
    const dx = g.x[i] - x, dy = g.y[i] - y, d = dx * dx + dy * dy
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return { i: best, d: Math.sqrt(bd) }
}

/** 지도에서 찍은 곳 → 칸. 가장 가까운 칸 중심이 500m(EPSG:3857)보다 멀면 서울 격자 밖이라 null (예전 cPickAt) */
export function pickCell(g: Pick<PlaceGrid, 'x' | 'y'>, x: number, y: number): number | null {
  const nr = nearestCell(g, x, y)
  return nr.d > 500 ? null : nr.i
}

/** 찾기 목록 — 동 425 · 역 (예전 cSearchIndex) */
export function buildPlaceIndex(g: PlaceGrid, dongs: readonly string[], s: StationData | null): PlaceIndex {
  const n = g.x.length
  const sx = new Map<number, number>(), sy = new Map<number, number>(), sn = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const d = g.dong[i]
    sx.set(d, (sx.get(d) ?? 0) + g.x[i])
    sy.set(d, (sy.get(d) ?? 0) + g.y[i])
    sn.set(d, (sn.get(d) ?? 0) + 1)
  }
  // 동마다 가운데에 가장 가까운 칸 — 같으면 번호가 작은 칸
  const best = new Map<number, number>(), bd = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const d = g.dong[i], cx = sx.get(d)! / sn.get(d)!, cy = sy.get(d)! / sn.get(d)!
    const dd = (g.x[i] - cx) * (g.x[i] - cx) + (g.y[i] - cy) * (g.y[i] - cy)
    if (!bd.has(d) || dd < bd.get(d)!) {
      bd.set(d, dd)
      best.set(d, i)
    }
  }
  const ds = [...best.keys()].sort((a, b) => (dongs[a] < dongs[b] ? -1 : dongs[a] > dongs[b] ? 1 : 0))
  const list: PlaceEntry[] = ds.map((d) => {
    const c = best.get(d)!, name = dongs[d].split('|')[0]
    return { kind: 'dong', name, label: placeName(dongs[d]), cell: c, x: g.x[c], y: g.y[c] }
  })
  if (s) {
    const has = new Set(s.has), lines = new Map<number, number[]>()
    for (let k = 0; k < s.sl.length; k += 2) {
      const a = lines.get(s.sl[k])
      if (a) a.push(s.sl[k + 1])
      else lines.set(s.sl[k], [s.sl[k + 1]])
    }
    const lineText = (ls: number[] | undefined) => {
      const out: string[] = []
      for (const l of [...(ls ?? [])].sort((a, b) => a - b)) {
        const nm = lineName(s.lines[l])
        if (!out.includes(nm)) out.push(nm)
      }
      return out.join('·')
    }
    s.st.forEach(([x, y, name], c3) => {
      if (!has.has(c3) || /^역\d+$/.test(name)) return
      const nr = nearestCell(g, x, y)
      if (nr.d > 1300) return
      list.push({ kind: 'st', name, label: `${name}역 (${lineText(lines.get(c3))})`, cell: nr.i, x, y })
    })
  }
  const byLabel = new Map<string, PlaceEntry>()
  for (const e of list) byLabel.set(e.label, e)
  return { list, byLabel }
}

/** 이름으로 찾기 → 고른 곳 하나와 비슷한 이름 4개까지 (예전 cFind) */
export function findPlace(idx: PlaceIndex, v: string | null | undefined): { e: PlaceEntry | null; alts: PlaceEntry[] } {
  const raw = (v || '').trim(), q = raw.replace(/\(.*?\)|\s/g, '')
  const hit = idx.byLabel.get(raw)
  if (hit) return { e: hit, alts: [] }
  if (!q) return { e: null, alts: [] }
  const qs = q.replace(/역$/, ''), stem = q.replace(/동$/, '')
  const T: PlaceEntry[][] = [[], [], [], []]
  for (const x of idx.list) {
    const nm = x.name.replace(/\s/g, '')
    if (nm === q || (x.kind === 'st' && nm === qs)) T[0].push(x)
    else if (x.kind === 'dong' && stem !== q && stem && nm.indexOf(stem) === 0 && /^[0-9·가본제]*동$/.test(nm.slice(stem.length))) T[1].push(x)
    else if (qs && nm.indexOf(qs) === 0) T[2].push(x)
    else if (qs && nm.indexOf(qs) >= 0) T[3].push(x)
  }
  const all = T[0].concat(T[1]), e = all[0] || T[2][0] || T[3][0] || null
  return { e, alts: (all.length ? all : T[2]).filter((x) => x !== e).slice(0, 4) }
}

/** 처음 기준점 — 시청역 (없으면 목록 맨 앞) (예전 cExample) */
export function examplePlace(idx: PlaceIndex): PlaceEntry {
  return idx.list.find((x) => x.kind === 'st' && x.name === '시청') ?? idx.list[0]
}

/** 칸에서 가장 가까운 역 — 땅 위 거리(m, EPSG:3857 거리 × cos 위도)로 maxM 안에서만 */
export function nearestStation(idx: PlaceIndex, x: number, y: number, maxM = 1000): { name: string; m: number } | null {
  const k = Math.cos(Math.atan(Math.sinh(y / 6378137)))
  let best: PlaceEntry | null = null, bd = Infinity
  for (const e of idx.list) {
    if (e.kind !== 'st') continue
    const d = Math.hypot(e.x - x, e.y - y) * k
    if (d < bd) {
      bd = d
      best = e
    }
  }
  return best && bd <= maxM ? { name: best.name, m: bd } : null
}
