import { Component, type ReactNode } from 'react'

// 지도 자리에서 받는 오류 (화면 다시 잡기 S17 · 9단계) — 지도를 만들다 던진 오류(WebGL2를 못 여는 기기 · 지도 코드를 못 받음)가
// 앱 전체를 비우지 않게 여기서 잡아 App에 알린다. App은 무슨 일인지 알리는 쪽(ui/StateViews StatePage)을 연다
interface Props {
  onFail: (e: Error) => void
  children: ReactNode
}

export default class MapBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: Error) {
    this.props.onFail(e)
  }
  render() {
    return this.state.failed ? <div className="map map-wait" /> : this.props.children
  }
}
