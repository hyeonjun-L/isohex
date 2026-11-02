// 앱이 window.__jeomji로 내놓는 시험용 고리 (src/map/MapView.tsx)
import type { Map } from 'maplibre-gl'

declare global {
  interface Window {
    __jeomji?: { map: Map; cellCount: number }
    /** 시안 비교판(?proto=1)에서만 — 이동 시간 일꾼 (src/App.tsx · src/core/travel/client.ts) */
    __jeomjiTravel?: () => Promise<{ ready: Promise<number>; times(mode: 'walk' | 'car' | 'pt', origin: number, period?: 'day' | 'am' | 'pm'): Promise<Float64Array> }>
  }
}
export {}
