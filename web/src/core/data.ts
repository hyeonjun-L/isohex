// 웹 데이터 읽기 — pipeline/export_web.py가 쓴 판 폴더(public/data/<판>/)를 읽는다.

export interface Manifest {
  ver: string
  made: string
  snapshot: string
  /** 매출 수준을 배운 매출 기간 (예: '2025Q3~2026Q2') — 2026-10-25 판부터 */
  sales?: string
  cells: number
  sources: { what: string; name: string; via: string; license: string; as_of?: string }[]
  excluded: string[]
}

export interface Cells {
  h3: string[]
  dong: number[]
  n300: number[]
}

export interface Industry {
  k: string
  nm: string
  sn?: string
  codes: string[]
  paint: boolean
  rho: number
  n: number
  cells: number
  /** 이 업종 값을 읽을 때 꼭 알아야 할 것 (예: 세탁소 — 셀프빨래방에는 맞지 않음) */
  note?: string
  /** 칠하지 않는 까닭 */
  why?: string
}

export interface Bounds {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: { kind: 'seoul' | 'gu'; name: string }; geometry: { type: 'Polygon'; coordinates: number[][][] } }[]
}

export interface BaseData {
  ver: string
  manifest: Manifest
  cells: Cells
  dongs: string[]
  industries: Industry[]
  bounds: Bounds
}

const ROOT = `${import.meta.env.BASE_URL}data`

/** 판 폴더 안 파일 주소 (예: dataUrl(ver, 'graph/mv.json')) */
export function dataUrl(ver: string, path: string): string {
  return `${ROOT}/${ver}/${path}`
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} — ${r.status}`)
  return (await r.json()) as T
}

export async function loadBase(): Promise<BaseData> {
  const { ver } = await getJSON<{ ver: string }>(`${ROOT}/latest.json`)
  const base = `${ROOT}/${ver}`
  const [manifest, cells, dongs, industries, bounds] = await Promise.all([
    getJSON<Manifest>(`${base}/manifest.json`),
    getJSON<Cells>(`${base}/cells.json`),
    getJSON<string[]>(`${base}/dongs.json`),
    getJSON<Industry[]>(`${base}/ind/index.json`),
    getJSON<Bounds>(`${base}/bounds.json`),
  ])
  if (cells.h3.length !== manifest.cells) throw new Error('칸 수가 manifest와 다릅니다')
  return { ver, manifest, cells, dongs, industries, bounds }
}

const jsonCache = new Map<string, Promise<unknown>>()

/** 판 폴더 안 JSON 하나 — 처음 부를 때 한 번만 받는다 (실패하면 다음에 다시 받는다) */
export function loadJSON<T>(ver: string, path: string): Promise<T> {
  const key = `${ver}/${path}`
  let p = jsonCache.get(key) as Promise<T> | undefined
  if (!p) {
    p = getJSON<T>(dataUrl(ver, path))
    jsonCache.set(key, p)
    p.catch(() => jsonCache.delete(key))
  }
  return p
}

/** 업종별 칸 값(×10 정수 또는 null) — 처음 고를 때 한 번만 받는다 (자리 카드와 같은 파일을 나눠 쓴다) */
export function loadIndustry(ver: string, k: string): Promise<(number | null)[]> {
  return loadJSON<{ k: string; v: (number | null)[] }>(ver, `ind/${k}.json`).then((d) => d.v)
}

/** 3D 건물 타일 안내 (pipeline/bldg_tiles.py가 쓴 tiles/bldg/latest.json) */
export interface BldgMeta {
  ver: string
  /** 건물 자료 기준일 (예: '2026-10-09') */
  as_of: string
  /** 'tiles/bldg/<판>/{z}/{x}/{y}.pbf' — 판 폴더는 바뀌지 않는다 */
  path: string
  layer: string
  minzoom: number
  maxzoom: number
}

let bldgMeta: Promise<BldgMeta | null> | null = null

/** 건물 타일 안내 — 없거나 못 받으면 null (지도는 건물 없이 그린다) */
export function loadBldgMeta(): Promise<BldgMeta | null> {
  bldgMeta ??= fetch(`${import.meta.env.BASE_URL}tiles/bldg/latest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<BldgMeta>) : null))
    .catch(() => null)
  return bldgMeta
}

/** '행정동|자치구' → { dong, gu } */
export function splitDong(key: string): { dong: string; gu: string } {
  const [dong, gu] = key.split('|')
  return { dong, gu }
}
