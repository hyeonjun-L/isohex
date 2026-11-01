import { useEffect, useRef } from 'react'
import { Map as MLMap, NavigationControl, setWorkerUrl, type ExpressionSpecification, type MapLayerMouseEvent, type PaddingOptions, type StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToBoundary, cellToLatLng } from 'h3-js'
import { loadBldgMeta, type BaseData } from '../core/data'
import { BASE_COLORS, LEVEL_COLORS, STORE_COLORS, hatchImage, type Theme } from './palette'

setWorkerUrl(workerUrl)

export type Mode = 'level' | 'store'
export type View = '3d' | 'top'

interface Props {
  data: BaseData
  classes: Int8Array | null // 칸마다 색 단계(-1 = 추정하지 않음)
  mode: Mode
  theme: Theme
  view: View
  selected: number | null
  onSelect: (i: number | null) => void
}

type Cam = { center: [number, number]; zoom: number; pitch: number; bearing: number }

const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY as string | undefined
const SEOUL: [number, number] = [126.986, 37.5615]
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const narrow = () => window.innerWidth < 640
const NONE: ExpressionSpecification = ['==', ['coalesce', ['feature-state', 'c'], -1], -1]

function camera(view: View) {
  if (view === 'top') return { pitch: 0, bearing: 0 }
  return narrow() ? { pitch: 35, bearing: -15 } : { pitch: 45, bearing: -15 }
}

/** 패널에 가리지 않는 지도 영역 — 데스크톱은 왼쪽 패널(12 + 360 + 12), 폰은 아래 시트(최대 44vh). styles.css와 맞춘다 */
function viewPadding(): PaddingOptions {
  if (narrow()) return { top: 8, right: 8, left: 8, bottom: Math.round(window.innerHeight * 0.44) + 8 }
  return { top: 12, right: 12, bottom: 12, left: 384 }
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
  const cols = mode === 'level' ? LEVEL_COLORS[theme] : STORE_COLORS[theme]
  const pairs = cols.flatMap((c, i) => [i, c])
  return ['match', ['coalesce', ['feature-state', 'c'], -1], ...pairs, BASE_COLORS[theme].none] as unknown as ExpressionSpecification
}

function buildStyle(theme: Theme): StyleSpecification {
  const B = BASE_COLORS[theme]
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'land', type: 'background', paint: { 'background-color': B.land } }],
  }
  if (VWORLD_KEY) {
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

export default function MapView({ data, classes, mode, theme, view, selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const camRef = useRef<Cam | null>(null) // 테마가 바뀌어 지도를 다시 만들 때 보던 자리를 잇는다
  const firstSel = useRef(true)
  const prevSel = useRef<number | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // 지도 만들기 — 테마가 바뀌면 다시 만든다
  useEffect(() => {
    if (!box.current) return
    const B = BASE_COLORS[theme]
    let alive = true // 건물 안내를 받기 전에 지도가 지워질 수 있다
    const map = new MLMap({
      container: box.current,
      style: buildStyle(theme),
      ...(camRef.current ?? { center: SEOUL, zoom: narrow() ? 9.4 : 10.15, ...camera(view) }),
      minZoom: 9,
      maxZoom: 17.5,
      maxBounds: [[126.45, 37.25], [127.5, 37.85]],
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    map.setPadding(viewPadding())
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
          // 추정하지 않는 칸은 칠하지 않고(0) 아래 빗금 층이 보이게
          'fill-opacity': ['case', NONE, 0, VWORLD_KEY ? 0.74 : 0.86],
        },
      })
      map.addLayer({
        id: 'cells-none', type: 'fill', source: 'cells',
        paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['case', NONE, 1, 0] },
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
      map.addLayer({
        id: 'cells-sel', type: 'line', source: 'cells',
        paint: {
          'line-color': B.select,
          'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0],
        },
      })
      // 3D 건물 — 줌 14부터(폰 15), 반투명 회색, 고른 칸 테두리 아래 (W7.5). 높이 h(m)는 pipeline/bldg_tiles.py가 넣었다
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
        }, 'cells-sel')
      })
      map.on('click', 'cells-fill', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        onSelectRef.current(f ? Number(f.id) : null)
      })
      map.on('mouseenter', 'cells-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'cells-fill', () => { map.getCanvas().style.cursor = '' })
      map.once('idle', () => {
        // 폰에서는 출처 상자를 접어 둔다 (ⓘ를 누르면 펼쳐진다)
        if (narrow()) map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      })
      // 시험(Playwright)이 칸 위치를 화면 좌표로 바꿀 때 쓴다
      window.__jeomji = { map, cellCount: data.cells.h3.length }
    })
    return () => {
      alive = false
      prevSel.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme])

  // 색 단계 → feature-state
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource('cells')) return
      map.setPaintProperty('cells-fill', 'fill-color', fillColor(mode, theme))
      const n = data.cells.h3.length
      for (let i = 0; i < n; i++) map.setFeatureState({ source: 'cells', id: i }, { c: classes ? classes[i] : -1 })
    }
    if (map.getSource('cells')) apply()
    else map.once('load', apply)
  }, [classes, mode, theme, data])

  // 고른 칸 테두리와 위치
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource('cells')) return
      if (prevSel.current != null) map.setFeatureState({ source: 'cells', id: prevSel.current }, { sel: false })
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
      map.setPadding(viewPadding())
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
