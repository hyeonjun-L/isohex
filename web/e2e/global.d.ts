// 앱이 window.__jeomji로 내놓는 시험용 고리 (src/map/MapView.tsx)
import type { Map } from 'maplibre-gl'

declare global {
  interface Window {
    __jeomji?: { map: Map; cellCount: number }
  }
}
export {}
