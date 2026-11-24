import { type RefObject, useEffect, useState } from 'react'

/** 폰 — 아래 시트가 지도 아래쪽을 지금 얼마나 덮나(px)와 지도 틀 높이. 데스크톱(패널이 옆에 선다)은 null.
 *  끄는 동안 · 높이가 바뀌는 동안에는 CSS 변수 --sheet-h만 따라가고(범례 · 출처 자리가 시트 위에 붙어 움직인다), 멈추면 값을 낸다
 *  — 지도 여백(setPadding은 화면을 옮긴다)과 범례를 감출지는 멈춘 뒤 한 번만 바뀐다. ready = 두 틀이 그려졌나 */
export function useSheetSize(on: boolean, sheet: RefObject<HTMLElement | null>, stage: RefObject<HTMLElement | null>, ready: boolean): { sheet: number; stage: number } | null {
  const [size, setSize] = useState<{ sheet: number; stage: number } | null>(null)
  useEffect(() => {
    const p = sheet.current, s = stage.current
    if (!on || !ready || !p || !s || typeof ResizeObserver === 'undefined') {
      setSize(null)
      s?.style.removeProperty('--sheet-h')
      return
    }
    let t = 0
    let first = true
    const check = () => {
      const r = s.getBoundingClientRect()
      const v = { sheet: Math.max(0, Math.round(r.bottom - p.getBoundingClientRect().top)), stage: Math.round(r.height) }
      s.style.setProperty('--sheet-h', `${v.sheet}px`)
      window.clearTimeout(t)
      if (first) setSize(v)
      else t = window.setTimeout(() => setSize((o) => (o && o.sheet === v.sheet && o.stage === v.stage ? o : v)), 140)
      first = false
    }
    const ro = new ResizeObserver(check)
    ro.observe(p)
    ro.observe(s)
    check()
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
      s.style.removeProperty('--sheet-h')
    }
  }, [on, ready, sheet, stage])
  return size
}
