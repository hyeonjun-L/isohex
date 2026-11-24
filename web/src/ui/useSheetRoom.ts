import { type RefObject, useEffect, useState } from 'react'

/** 폰 — 지도 위 범례의 위 끝에서 아래 시트의 위 끝까지 남은 높이(px). 데스크톱(패널이 옆에 선다)은 null.
 *  시트를 크게 펴면 범례가 설 자리가 없어진다 — 접힌 범례는 감추고, 편 범례는 그 높이까지만 보이고 안에서 넘겨 보게 하는 데 쓴다(ui/MapLegend).
 *  범례 높이가 아니라 위 끝만 재므로, 범례를 감추거나 줄여도 값이 바뀌지 않는다(되먹임 없음).
 *  ready = 지도 화면이 그려졌나(자료를 받기 전에는 두 틀이 아직 없다) */
export function useSheetRoom(on: boolean, stack: RefObject<HTMLElement | null>, sheet: RefObject<HTMLElement | null>, ready: boolean): number | null {
  const [room, setRoom] = useState<number | null>(null)
  useEffect(() => {
    const s = stack.current, p = sheet.current
    if (!on || !ready || !s || !p || typeof ResizeObserver === 'undefined') {
      setRoom(null)
      return
    }
    const check = () => {
      const lg = s.querySelector('.map-legend')
      setRoom(lg ? Math.round(p.getBoundingClientRect().top - lg.getBoundingClientRect().top) - 6 : null)
    }
    // 시트 높이(살짝 · 반 · 크게, 내용 길이) · 쌓음 높이(칩 줄이 생기고 사라짐, 범례가 뜸)가 바뀔 때마다 다시 잰다
    const ro = new ResizeObserver(check)
    ro.observe(s)
    ro.observe(p)
    window.addEventListener('resize', check)
    check()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [on, ready, stack, sheet])
  return room
}
