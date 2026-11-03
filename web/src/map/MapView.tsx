import { useEffect, useRef, useState } from 'react'
import { Map as MLMap, Marker, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type PaddingOptions, type StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToBoundary, cellToLatLng } from 'h3-js'
import { loadBldgMeta, type BaseData } from '../core/data'
import { BASE_COLORS, MAP_COLORS, PILLAR_HEIGHT, hatchImage, type MapMode, type Theme } from './palette'

setWorkerUrl(workerUrl)

/** 칠하는 것 — 동네 보기 지표(core/layers.ts) 또는 후보 찾기 시간 띠 */
export type Mode = MapMode

/** 후보 찾기 그림 — 정한 시간 경계선 · 기준 칸 · 후보 칸(순서대로) · 맞춰 볼 범위(fitKey가 바뀔 때만 옮긴다) */
export interface FindLook {
  iso: FeatureCollection
  base: number | null
  cands: number[]
  bounds: [[number, number], [number, number]] | null
  fitKey: string
}
export type View = '3d' | 'top'
/** P1 지도 시안 비교 (?proto=1) — 건물 표현·진하기·배경. 기본값은 회색·테마 기본 진하기·브이월드 */
export interface Proto { bldg: 'gray' | 'tint' | 'off'; bop: number | null; bg: 'vworld' | 'none' }
/** 기본 지도 모양 — 이현준님이 시안 비교판에서 고름(2026-11-02): 건물은 칸 색 · 진하게 · 브이월드 배경 */
export const PROTO_DEFAULT: Proto = { bldg: 'tint', bop: 0.5, bg: 'vworld' }

interface Props {
  data: BaseData
  classes: Int8Array | null // 칸마다 색 번호(-1 = 칠하지 않음)
  mode: Mode
  /** 칠하지 않는 칸(-1)을 빗금으로(추정하지 않음) — 아니면 비워 둔다(자료 밖) */
  hatch: boolean
  theme: Theme
  view: View
  selected: number | null
  onSelect: (i: number | null) => void
  proto?: Proto
  /** 이곳으로 날아가기 (n이 바뀔 때마다) */
  goTo?: { at: [number, number]; n: number } | null
  /** 정한 시간 안이지만 조건 밖인 칸(1) — 흐리게 (후보 찾기) */
  fade?: Uint8Array | null
  /** 후보 찾기 — 있으면 경계선 · 기준점 · 번호 기둥을 그린다 */
  find?: FindLook | null
  /** 지도에서 기준점 찍기 — 켜져 있으면 칸을 누를 때 onPick */
  picking?: boolean
  onPick?: (i: number) => void
  /** 폰 아래 시트가 덮는 지도 높이 몫 (살짝 · 반 · 전체) */
  sheet?: number
}

type Cam = { center: [number, number]; zoom: number; pitch: number; bearing: number }

const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY as string | undefined
const SEOUL: [number, number] = [126.986, 37.5615]
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const narrow = () => window.innerWidth < 640
const NONE: ExpressionSpecification = ['==', ['coalesce', ['feature-state', 'c'], -1], -1]
const FADED: ExpressionSpecification = ['==', ['coalesce', ['feature-state', 'f'], 0], 1]
const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }
/** 칸 바닥 진하기 — 배경지도가 있으면 조금 비치게 */
const FILL_OP = VWORLD_KEY ? 0.74 : 0.86

/** 후보 칸들 — 번호 기둥 자료 */
function candFeatures(h3: string[], cands: readonly number[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cands.map((i, n) => {
      const ring = cellToBoundary(h3[i], true)
      ring.push(ring[0])
      return { type: 'Feature', id: i, properties: { i, n: n + 1 }, geometry: { type: 'Polygon', coordinates: [ring] } }
    }),
  }
}

function camera(view: View) {
  if (view === 'top') return { pitch: 0, bearing: 0 }
  return narrow() ? { pitch: 35, bearing: -15 } : { pitch: 45, bearing: -15 }
}

/** 패널에 가리지 않는 지도 영역 — 데스크톱은 왼쪽 패널(12 + 360 + 12), 폰은 아래 시트(지도 높이의 sheet 몫). styles.css와 맞춘다 */
function viewPadding(sheet: number, h: number): PaddingOptions {
  if (narrow()) return { top: 8, right: 8, left: 8, bottom: Math.round(h * sheet) + 8 }
  return { top: 12, right: 12, bottom: 12, left: 384 }
}

/** 고른 칸 하나 (없으면 빈 모음) — 기둥 자료 */
function selFeature(h3: string[], i: number | null): FeatureCollection {
  if (i == null) return { type: 'FeatureCollection', features: [] }
  const ring = cellToBoundary(h3[i], true)
  ring.push(ring[0])
  return { type: 'FeatureCollection', features: [{ type: 'Feature', id: i, properties: { i }, geometry: { type: 'Polygon', coordinates: [ring] } }] }
}

function cellFeatures(h3: string[]) {
  return {
    type: 'FeatureCollection' as const,
    features: h3.map((h, i) => {
      const ring = cellToBoundary(h, true)
      ring.push(ring[0])
      return { type: 'Feature' as const, id: i, properties: { i }, geometry: { type: 'Polygon' as const, coordinates: [ring] } }
    }),
  }
}

function fillColor(mode: Mode, theme: Theme): ExpressionSpecification {
  const cols = MAP_COLORS[mode][theme]
  const pairs = cols.flatMap((c, i) => [i, c])
  return ['match', ['coalesce', ['feature-state', 'c'], -1], ...pairs, BASE_COLORS[theme].none] as unknown as ExpressionSpecification
}

/** 건물 색 — 회색, 또는 바닥 칸과 같은 색(물들이기). 칸 밖·추정하지 않는 칸의 건물은 회색 */
function bldgColor(p: Proto, classes: Int8Array | null, mode: Mode, theme: Theme): string | ExpressionSpecification {
  const B = BASE_COLORS[theme]
  if (p.bldg !== 'tint' || !classes) return B.bldg
  const cols = MAP_COLORS[mode][theme]
  const arr = Array.from(classes, (c) => (c >= 0 ? cols[c] : B.bldg))
  // 글자 색 배열은 to-color로 감싸야 한다 — 그냥 두면 'array<color> 자리에 array<string>'으로 거절된다
  return ['case', ['has', 'c'], ['to-color', ['at', ['get', 'c'], ['literal', arr]]], B.bldg] as unknown as ExpressionSpecification
}

function styleBldg(map: MLMap, p: Proto, classes: Int8Array | null, mode: Mode, theme: Theme) {
  if (!map.getLayer('bldg')) return
  map.setLayoutProperty('bldg', 'visibility', p.bldg === 'off' ? 'none' : 'visible')
  map.setPaintProperty('bldg', 'fill-extrusion-color', bldgColor(p, classes, mode, theme))
  map.setPaintProperty('bldg', 'fill-extrusion-opacity', p.bop ?? BASE_COLORS[theme].bldgOpacity)
}

function buildStyle(theme: Theme, bg: Proto['bg']): StyleSpecification {
  const B = BASE_COLORS[theme]
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'land', type: 'background', paint: { 'background-color': B.land } }],
  }
  if (VWORLD_KEY && bg === 'vworld') {
    const layer = theme === 'dark' ? 'midnight' : 'white'
    style.sources.vworld = {
      type: 'raster',
      tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${layer}/{z}/{y}/{x}.png`],
      tileSize: 256,
      minzoom: 6,
      maxzoom: 18,
      attribution: '배경지도 © 브이월드(국토교통부)',
    }
    style.layers.push({ id: 'vworld', type: 'raster', source: 'vworld' })
  }
  return style
}

/** 고른 칸이 패널 밖 보이는 곳에 있게 — 처음 연 공유 주소면 가까이 당겨서 */
function focusCell(map: MLMap, h3: string, first: boolean) {
  const [lat, lng] = cellToLatLng(h3)
  if (first) {
    map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13.5) })
    return
  }
  const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding()
  const p = map.project([lng, lat])
  const { clientWidth: w, clientHeight: h } = map.getContainer()
  const inside = p.x >= left && p.x <= w - right && p.y >= top && p.y <= h - bottom
  if (!inside) map.easeTo({ center: [lng, lat], duration: reducedMotion() ? 0 : 600 })
}

export default function MapView({ data, classes, mode, hatch, theme, view, selected, onSelect, proto = PROTO_DEFAULT, goTo = null, fade = null, find = null, picking = false, onPick, sheet = 0.44 }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const camRef = useRef<Cam | null>(null) // 테마가 바뀌어 지도를 다시 만들 때 보던 자리를 잇는다
  const firstSel = useRef(true)
  const prevSel = useRef<number | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const pickRef = useRef({ picking, onPick })
  pickRef.current = { picking, onPick }
  const sheetRef = useRef(sheet)
  sheetRef.current = sheet
  const [gen, setGen] = useState(0) // 지도를 새로 만들 때마다 — 표시(마커)를 다시 붙인다
  const marks = useRef<{ cands: Marker[]; base: Marker | null }>({ cands: [], base: null })
  const look = useRef({ proto, classes, mode, hatch, selected, find }) // 건물 층이 늦게 붙을 때 · 지도를 다시 만들 때 지금 설정을 읽는다
  look.current = { proto, classes, mode, hatch, selected, find }

  // 지도 만들기 — 테마가 바뀌면 다시 만든다
  useEffect(() => {
    if (!box.current) return
    const B = BASE_COLORS[theme]
    let alive = true // 건물 안내를 받기 전에 지도가 지워질 수 있다
    const map = new MLMap({
      container: box.current,
      style: buildStyle(theme, proto.bg),
      ...(camRef.current ?? { center: SEOUL, zoom: narrow() ? 9.4 : 10.15, ...camera(view) }),
      minZoom: 9,
      maxZoom: 17.5,
      maxBounds: [[126.45, 37.25], [127.5, 37.85]],
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    map.setPadding(viewPadding(sheetRef.current, box.current.clientHeight))
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')
    mapRef.current = map

    map.on('moveend', () => {
      const c = map.getCenter()
      camRef.current = { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
    })

    map.on('load', () => {
      map.addImage('hatch', hatchImage(B.hatch), { pixelRatio: 2 })
      map.addSource('bounds', { type: 'geojson', data: data.bounds as unknown as FeatureCollection })
      map.addSource('cells', {
        type: 'geojson',
        data: cellFeatures(data.cells.h3) as FeatureCollection,
        attribution: '자료: 소상공인 상가정보 · 서울시 상권분석서비스 · 수도권 생활이동 · SGIS · 칸 H3',
      })
      map.addLayer({
        id: 'cells-fill', type: 'fill', source: 'cells',
        paint: {
          'fill-color': fillColor(mode, theme),
          // 추정하지 않는 칸은 칠하지 않고(0) 아래 빗금 층이 보이게 · 후보 찾기에서 조건 밖인 칸은 옅게
          'fill-opacity': ['case', NONE, 0, FADED, 0.22, FILL_OP],
        },
      })
      map.addLayer({
        id: 'cells-none', type: 'fill', source: 'cells',
        paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['case', NONE, look.current.hatch ? 1 : 0, 0] },
      })
      map.addLayer({
        id: 'cells-line', type: 'line', source: 'cells', minzoom: 13,
        paint: { 'line-color': theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)', 'line-width': 0.6 },
      })
      map.addLayer({
        id: 'gu-line', type: 'line', source: 'bounds', filter: ['==', ['get', 'kind'], 'gu'],
        paint: { 'line-color': B.gu, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 13, 1.2], 'line-opacity': 0.75 },
      })
      map.addLayer({
        id: 'seoul-line', type: 'line', source: 'bounds', filter: ['==', ['get', 'kind'], 'seoul'],
        paint: { 'line-color': B.seoul, 'line-width': 1.4 },
      })
      // 후보 찾기 — 정한 시간 경계선. 이동 시간은 OpenStreetMap 길로 냈다(ODbL) — 이 층이 보일 때만 출처에 나온다
      map.addSource('iso', { type: 'geojson', data: look.current.find?.iso ?? EMPTY_FC, attribution: '길 © OpenStreetMap contributors' })
      map.addLayer({
        id: 'iso-line', type: 'line', source: 'iso',
        layout: { visibility: look.current.find ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': B.iso, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 14, 2.6], 'line-opacity': 0.9 },
      })
      // 후보 번호 기둥 (W7.5 — 높이 같음, 번호는 지도 위 표시로)
      map.addSource('cand', { type: 'geojson', data: candFeatures(data.cells.h3, look.current.find?.cands ?? []) })
      map.addLayer({
        id: 'cand-pillar', type: 'fill-extrusion', source: 'cand',
        paint: { 'fill-extrusion-color': B.cand, 'fill-extrusion-height': PILLAR_HEIGHT * 0.6, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.42 },
      })
      // 기둥 — 고른 칸을 세운다 (W7.5). 고른 칸 하나만 든 따로 된 자료에 그린다:
      // 모든 칸에 높이 0으로 두면 납작한 면이 서울 전체를 기둥 색(0.4)으로 덮어 칸 색이 틀어진다(11-03 동네 보기 칩 점검에서 찾음)
      map.addSource('sel', { type: 'geojson', data: selFeature(data.cells.h3, look.current.selected) })
      map.addLayer({
        id: 'cells-pillar', type: 'fill-extrusion', source: 'sel',
        paint: {
          'fill-extrusion-color': B.pillar,
          'fill-extrusion-height': PILLAR_HEIGHT,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.4,
        },
      })
      map.addLayer({
        id: 'cells-sel', type: 'line', source: 'cells',
        paint: {
          'line-color': B.select,
          'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0],
        },
      })
      // 3D 건물 — 줌 14부터(폰 15), 반투명, 고른 칸 테두리 아래 (W7.5). 기본은 바닥 칸 색으로 물들인다(11-02 정함 — PROTO_DEFAULT). 높이 h(m)는 pipeline/bldg_tiles.py가 넣었다
      void loadBldgMeta().then((m) => {
        if (!m || !alive) return
        map.addSource('bldg', {
          type: 'vector',
          // 절대 주소로 — new URL()은 {z}/{x}/{y}의 중괄호를 %7B로 바꿔 버려 쓰지 않는다
          tiles: [`${window.location.origin}${import.meta.env.BASE_URL}${m.path}`],
          minzoom: m.minzoom,
          maxzoom: m.maxzoom,
          attribution: `건물: 국토교통부 GIS건물통합정보(${m.as_of})`,
        })
        map.addLayer({
          id: 'bldg', type: 'fill-extrusion', source: 'bldg', 'source-layer': m.layer, minzoom: narrow() ? 15 : 14,
          paint: {
            'fill-extrusion-color': B.bldg,
            'fill-extrusion-height': ['get', 'h'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': B.bldgOpacity,
          },
        }, 'cells-pillar')
        styleBldg(map, look.current.proto, look.current.classes, look.current.mode, theme)
      })
      map.on('click', 'cells-fill', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        const { picking: pk, onPick: op } = pickRef.current
        if (pk && op && f) op(Number(f.id))
        else onSelectRef.current(f ? Number(f.id) : null)
      })
      map.on('mouseenter', 'cells-fill', () => { map.getCanvas().style.cursor = pickRef.current.picking ? 'crosshair' : 'pointer' })
      map.on('mouseleave', 'cells-fill', () => { map.getCanvas().style.cursor = pickRef.current.picking ? 'crosshair' : '' })
      map.once('idle', () => {
        // 폰에서는 출처 상자를 접어 둔다 (ⓘ를 누르면 펼쳐진다)
        if (narrow()) map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      })
      // 시험(Playwright)이 칸 위치를 화면 좌표로 바꿀 때 쓴다
      window.__jeomji = { map, cellCount: data.cells.h3.length }
      setGen((g) => g + 1)
    })
    return () => {
      alive = false
      prevSel.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, proto.bg])

  // 건물 표현·진하기 (시안 비교)와 물들이기 색
  useEffect(() => {
    const map = mapRef.current
    if (map) styleBldg(map, proto, classes, mode, theme)
  }, [proto, classes, mode, theme])

  // 정한 곳으로 날아가기 (시안 비교의 '가 보기')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !goTo) return
    map.flyTo({ center: goTo.at, zoom: 15.6, pitch: narrow() ? 40 : 55, bearing: -20, duration: reducedMotion() ? 0 : 1600 })
  }, [goTo])

  // 색 단계 → feature-state
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource('cells')) return
      map.setPaintProperty('cells-fill', 'fill-color', fillColor(mode, theme))
      map.setPaintProperty('cells-none', 'fill-opacity', ['case', NONE, hatch ? 1 : 0, 0])
      const n = data.cells.h3.length
      for (let i = 0; i < n; i++) map.setFeatureState({ source: 'cells', id: i }, { c: classes ? classes[i] : -1, f: fade ? fade[i] : 0 })
    }
    if (map.getSource('cells')) apply()
    else map.once('load', apply)
  }, [classes, fade, mode, hatch, theme, data])

  // 후보 찾기 — 경계선 · 번호 기둥 · 번호 표시 · 기준점 (지도를 다시 만들면 gen이 바뀌어 다시 붙인다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('iso')) return
    const B = BASE_COLORS[theme]
    ;(map.getSource('iso') as GeoJSONSource).setData(find?.iso ?? EMPTY_FC)
    map.setLayoutProperty('iso-line', 'visibility', find ? 'visible' : 'none')
    ;(map.getSource('cand') as GeoJSONSource).setData(candFeatures(data.cells.h3, find?.cands ?? []))
    for (const m of marks.current.cands) m.remove()
    marks.current.cands = []
    marks.current.base?.remove()
    marks.current.base = null
    if (!find) return
    find.cands.forEach((i, n) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'cand-no'
      el.textContent = String(n + 1)
      el.dataset.i = String(i)
      el.setAttribute('aria-label', `후보 ${n + 1}`)
      el.style.setProperty('--cand', B.cand)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectRef.current(i)
      })
      const [lat, lng] = cellToLatLng(data.cells.h3[i])
      marks.current.cands.push(new Marker({ element: el }).setLngLat([lng, lat]).addTo(map))
    })
    if (find.base != null) {
      // 마름모는 안쪽 요소를 돌린다 — 표시 요소 자체의 transform은 MapLibre가 자리 잡는 데 쓴다
      const el = document.createElement('div')
      el.className = 'base-pt'
      el.title = '기준점'
      el.appendChild(document.createElement('i'))
      const [lat, lng] = cellToLatLng(data.cells.h3[find.base])
      marks.current.base = new Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
    }
  }, [find, gen, theme, data])

  // 고른 후보 번호를 진하게
  useEffect(() => {
    for (const m of marks.current.cands) m.getElement().classList.toggle('on', Number(m.getElement().dataset.i) === selected)
  }, [selected, find, gen])

  // 기준점·가는 법·시간이 바뀌면 정한 시간 안이 다 보이게 (조건만 바뀌면 그대로)
  useEffect(() => {
    const map = mapRef.current
    const b = find?.bounds
    if (!map || !b || !find) return
    map.fitBounds(b, { padding: 24, maxZoom: 14.5, duration: reducedMotion() ? 0 : 700 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find?.fitKey, gen])

  // 폰 아래 시트 높이가 바뀌면 지도 여백도
  useEffect(() => {
    const map = mapRef.current
    if (map) map.setPadding(viewPadding(sheet, map.getContainer().clientHeight))
  }, [sheet, gen])

  // 지도에서 찍기 — 십자 모양 손끝
  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [picking, gen])

  // 고른 칸 테두리와 위치
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource('cells')) return
      if (prevSel.current != null) map.setFeatureState({ source: 'cells', id: prevSel.current }, { sel: false })
      ;(map.getSource('sel') as GeoJSONSource | undefined)?.setData(selFeature(data.cells.h3, selected))
      if (selected != null) {
        map.setFeatureState({ source: 'cells', id: selected }, { sel: true })
        if (selected !== prevSel.current) focusCell(map, data.cells.h3[selected], firstSel.current)
      }
      prevSel.current = selected
      firstSel.current = false
    }
    if (map.getSource('cells')) apply()
    else map.once('load', apply)
  }, [selected, theme, data])

  // 3D ↔ 위에서
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ ...camera(view), duration: reducedMotion() ? 0 : 800 })
  }, [view])

  // 창 크기가 바뀌면 지도 크기와 패널 여백을 다시 맞춘다
  useEffect(() => {
    const onResize = () => {
      const map = mapRef.current
      if (!map) return
      map.resize()
      map.setPadding(viewPadding(sheetRef.current, map.getContainer().clientHeight))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return <div ref={box} className="map" role="region" aria-label="서울 지도 — 칸을 누르면 그 자리 숫자가 나옵니다" />
}

// 시험용 고리 — 지도와 칸 수
declare global {
  interface Window {
    __jeomji?: { map: MLMap; cellCount: number }
  }
}
