import { useEffect, useMemo, useRef, useState } from 'react'
import { type CandGrid, type CandQuery, type CandResult, type SortKey, candGrid, findCandidates, fromSparse, isoEdges, nbSum, timeBand } from '../core/candidates'
import { type BaseData, dataUrl, loadIndustry, loadJSON } from '../core/data'
import { type FindState, bandPass, compOptions, kindBand } from '../core/find'
import { edgeLines } from '../core/grid'
import type { Kind } from '../core/kinds'
import { type PlaceIndex, type StationData, buildPlaceIndex, examplePlace, nearestStation, placeGrid, placeName } from '../core/places'
import type { SiteData } from '../core/site'
import type { TravelClient } from '../core/travel/client'
import type { FindLook } from '../map/MapView'
import type { FeatureCollection } from 'geojson'

// 후보 찾기에 드는 자료와 계산 — 후보 찾기를 처음 열 때 이동 그래프(2.6MB)를 일꾼이 받는다(마스터플랜 W7.7 '이동 시간 일꾼').
// 칸 자리 값(grid/site.json · grid/nb.json) · 역 찾기 · 업종 가게 수(kinds/cnt) · 매출 수준(순서에 쓸 때만)을 모아
// core/candidates.ts의 거르기 → 순서 → 띄우기를 돌린다. 계산 규칙은 core/find.ts

export interface FindBase {
  grid: CandGrid
  places: PlaceIndex
  /** 서울 칸 주택가 정도(×1000) 오름차순 — 범위 설명 */
  tiltSorted: Float64Array
}

export interface FindKind {
  code: string
  cnt: Int32Array
  /** 이 칸 + 둘레 6칸 */
  cntw: Int32Array
  band: ReturnType<typeof kindBand>
  stores: number
  /** 두 범위에 다 드는 서울 칸 몫 */
  pass: number
  /** 같은 업종 상한 고르기 */
  opts: number[]
}

export interface FindOut {
  base: FindBase | null
  /** 기준 칸 — 주소에 없으면 예시(시청역) */
  from: number | null
  fromLabel: string
  example: boolean
  kind: FindKind | null
  times: Float64Array | null
  query: CandQuery | null
  result: CandResult | null
  /** 지도 — 칸마다 시간 띠(−1 = 밖) · 흐린 칸 · 그림 */
  classes: Int8Array | null
  fade: Uint8Array | null
  look: FindLook | null
  /** 그래프를 받는 중 · 계산 중 */
  busy: string | null
  err: string | null
}

/** 칸 이름 — 300m 안 역이 있으면 '시청역 근처', 아니면 '소공동 (중구)' */
function cellLabel(i: number, data: BaseData, base: FindBase): string {
  const st = nearestStation(base.places, base.grid.x[i], base.grid.y[i], 300)
  return st ? `${st.name}역 근처` : placeName(data.dongs[data.cells.dong[i]])
}

export function useFind(data: BaseData | null, on: boolean, kind: Kind | null, potK: string | null, s: FindState, sort: SortKey, label: string | null): FindOut {
  const [base, setBase] = useState<FindBase | null>(null)
  const [fk, setFk] = useState<FindKind | null>(null)
  const [pot, setPot] = useState<{ k: string; v: (number | null)[] } | null>(null)
  const [times, setTimes] = useState<{ key: string; T: Float64Array } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const client = useRef<TravelClient | null>(null)

  // 칸 자리 값 · 역 찾기 — 처음 열 때 한 번
  useEffect(() => {
    if (!on || !data || base) return
    let live = true
    Promise.all([loadJSON<SiteData>(data.ver, 'grid/site.json'), loadJSON<number[]>(data.ver, 'grid/nb.json'), loadJSON<StationData>(data.ver, 'places/stations.json')])
      .then(([site, nb, st]) => {
        if (!live) return
        setBase({ grid: candGrid(data.cells, site, nb), places: buildPlaceIndex(placeGrid(data.cells), data.dongs, st), tiltSorted: Float64Array.from(site.tilt).sort() })
      })
      .catch((e: unknown) => live && setErr(String(e)))
    return () => { live = false }
  }, [on, data, base])

  // 일꾼은 한 번 만들어 둔다 (닫을 때 끈다)
  useEffect(() => () => client.current?.terminate(), [])

  // 업종 가게 수 → 비슷한 자리 범위 · 같은 업종 (이 칸 + 둘레)
  useEffect(() => {
    if (!on || !data || !base || !kind) return
    if (fk?.code === kind.c) return
    let live = true
    loadJSON<number[]>(data.ver, `kinds/cnt/${kind.c}.json`)
      .then((a) => {
        if (!live) return
        const g = base.grid, cnt = fromSparse(a, g.n), cntw = nbSum(cnt, g.nb)
        let stores = 0
        for (let i = 0; i < g.n; i++) stores += cnt[i]
        const band = kindBand(cnt, g.n300, g.tilt)
        setFk({ code: kind.c, cnt, cntw, band, stores, pass: band ? bandPass(band, g.n300, g.tilt) : 0, opts: compOptions(cntw) })
      })
      .catch((e: unknown) => live && setErr(String(e)))
    return () => { live = false }
  }, [on, data, base, kind, fk])

  // 매출 수준 — 순서에 쓸 때만
  useEffect(() => {
    if (!on || !data || sort !== 'pot' || !potK || pot?.k === potK) return
    let live = true
    loadIndustry(data.ver, potK)
      .then((v) => live && setPot({ k: potK, v }))
      .catch((e: unknown) => live && setErr(String(e)))
    return () => { live = false }
  }, [on, data, sort, potK, pot])

  const from = s.from ?? (base ? examplePlace(base.places).cell : null)

  // 이동 시간 — 일꾼에게
  const tkey = from == null ? '' : `${s.by}|${from}|${s.by === 'walk' ? 'day' : s.at}`
  useEffect(() => {
    if (!on || !data || from == null || times?.key === tkey) return
    let live = true
    const run = async () => {
      if (!client.current) {
        setBusy('이동 시간 그래프를 받는 중이에요 (2.6MB, 처음 한 번)')
        const { TravelClient } = await import('../core/travel/client')
        client.current ??= new TravelClient(new URL(dataUrl(data.ver, 'graph/mv.json'), window.location.href).href)
        await client.current.ready
      }
      if (!live) return
      setBusy('걸리는 시간을 재는 중이에요')
      const T = await client.current.times(s.by, from, s.at)
      if (live) setTimes({ key: tkey, T })
    }
    run()
      .catch((e: unknown) => live && setErr(String(e)))
      .finally(() => live && setBusy(null))
    return () => { live = false }
  }, [on, data, from, tkey, s.by, s.at, times])

  const T = times && times.key === tkey ? times.T : null
  const kindReady = !!(kind && fk && fk.code === kind.c)
  const potV = sort === 'pot' && pot && pot.k === potK ? pot.v : null

  const query = useMemo<CandQuery | null>(() => {
    if (!T || !base || !kindReady || !fk) return null
    if (sort === 'pot' && potK && !potV) return null // 매출 수준을 받는 중
    return { times: T, min: s.min, site: s.like ? fk.band : null, comp: s.comp, cntw: fk.cntw, sort, pot: potV }
  }, [T, base, kindReady, fk, s.min, s.like, s.comp, sort, potK, potV])

  const result = useMemo(() => (base && query ? findCandidates(base.grid, query) : null), [base, query])

  // 지도 — 업종이 없으면 시간 띠만
  const map = useMemo(() => {
    if (!T || !base || !data || from == null) return { classes: null, fade: null, look: null }
    const n = base.grid.n, lim = s.min * 60
    let classes: Int8Array, fade: Uint8Array | null = null
    if (result) {
      classes = result.tband
      fade = new Uint8Array(n)
      for (let i = 0; i < n; i++) if ((result.pass[i] & 1) && (result.pass[i] & 6) !== 6) fade[i] = 1
    } else {
      classes = new Int8Array(n)
      for (let i = 0; i < n; i++) classes[i] = T[i] <= lim ? timeBand(T[i]) : -1
    }
    const iso: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: edgeLines(data.cells.h3, isoEdges(T, s.min, base.grid.nb)) } }] }
    // 맞춰 볼 범위 — 정한 시간 안 칸 중심들 (EPSG:3857 → 경위도)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < n; i++) {
      if (!(T[i] <= lim)) continue
      const x = base.grid.x[i], y = base.grid.y[i]
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    const ll = (x: number, y: number): [number, number] => [(x / 6378137) * (180 / Math.PI), (Math.atan(Math.sinh(y / 6378137)) * 180) / Math.PI]
    const bounds = Number.isFinite(x0) ? ([ll(x0, y0), ll(x1, y1)] as [[number, number], [number, number]]) : null
    const look: FindLook = { iso, base: from, cands: result?.list ?? [], bounds, fitKey: `${tkey}|${s.min}` }
    return { classes, fade, look }
  }, [T, base, data, from, result, s.min, tkey])

  const ex = base ? examplePlace(base.places) : null
  const fromLabel = from == null || !base || !data ? '' : s.from == null && ex ? (ex.kind === 'st' ? `${ex.name}역` : ex.label) : label ?? cellLabel(from, data, base)

  return {
    base,
    from,
    fromLabel,
    example: s.from == null,
    kind: kindReady ? fk : null,
    times: T,
    query,
    result,
    classes: map.classes,
    fade: map.fade,
    look: map.look,
    busy,
    err,
  }
}
