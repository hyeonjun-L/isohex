import { type PointerEvent, type RefObject, useEffect, useRef } from 'react'

// 폰 아래 시트 끌기 (화면 다시 잡기 11-25 — 라이브러리 없이 pointer · touch 이벤트로).
// 손잡이는 어디서든 끈다. 시트 안 내용은 맨 위까지 올렸을 때 아래로 끌면 접고, 크게가 아닐 때 위로 끌면 편다 — 나머지는 그냥 넘겨 본다.
// 손을 떼면 가까운 높이(살짝 · 반 · 크게)로, 빠르게 튕기면 그쪽 다음 높이로. 손잡이를 누르기만 하면 지금처럼 돌아가며 바뀐다(Panel)

export type Sheet = 'peek' | 'half' | 'full'
/** 높이 셋 — 살짝 214px · 반 = 내용만큼(화면의 58%까지) · 크게 = 위 72px만 남긴다. styles.css의 .sheet-* 와 맞춘다 */
export const SHEET_PEEK = 214
export const SHEET_HALF = 0.58
export const SHEET_GAP = 72
const ORDER: Sheet[] = ['peek', 'half', 'full']
/** 튕김으로 보는 빠르기(px/ms) · 끌기로 보는 움직임(px) */
const FLICK = 0.45
const SLOP = 6

interface Drag {
  y0: number
  h0: number
  y: number
  t: number
  v: number
  moved: boolean
}

export function useSheetDrag(on: boolean, aside: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>, sheet: Sheet, onSheet: (s: Sheet) => void) {
  const st = useRef<Drag | null>(null)
  const skipClick = useRef(false)
  const now = useRef({ sheet, onSheet })
  now.current = { sheet, onSheet }

  // 지금 내용으로 본 세 높이 — 내용이 짧으면 반 · 크게가 내용 높이에서 멈춘다
  const levels = (): Record<Sheet, number> & { max: number } => {
    const a = aside.current!, b = body.current
    const H = a.parentElement?.clientHeight ?? window.innerHeight
    const natural = b ? a.offsetHeight - b.clientHeight + b.scrollHeight : a.scrollHeight
    return { peek: Math.min(SHEET_PEEK, natural), half: Math.min(natural, Math.round(H * SHEET_HALF)), full: Math.min(natural, H - SHEET_GAP), max: H - SHEET_GAP }
  }
  const start = (y: number) => {
    const a = aside.current
    if (!a) return
    st.current = { y0: y, h0: a.getBoundingClientRect().height, y, t: performance.now(), v: 0, moved: false }
  }
  const move = (y: number) => {
    const s = st.current, a = aside.current
    if (!s || !a) return
    const dy = s.y0 - y // 위로 = +
    if (!s.moved) {
      if (Math.abs(dy) < SLOP) return
      s.moved = true
      a.classList.add('dragging')
    }
    const t = performance.now()
    s.v = (s.y - y) / Math.max(1, t - s.t)
    s.y = y
    s.t = t
    const L = levels()
    a.style.maxHeight = `${Math.round(Math.max(72, Math.min(L.max, s.h0 + dy)))}px`
  }
  /** 끌었으면 true — 손을 뗀 높이 · 빠르기로 높이를 고른다 */
  const end = (): boolean => {
    const s = st.current, a = aside.current
    st.current = null
    if (!s || !a || !s.moved) return false
    const L = levels(), h = a.getBoundingClientRect().height
    let to: Sheet
    if (s.v > FLICK) to = ORDER.find((k) => L[k] > h + 8) ?? 'full'
    else if (s.v < -FLICK) to = [...ORDER].reverse().find((k) => L[k] < h - 8) ?? 'peek'
    else to = ORDER.reduce<Sheet>((best, k) => (Math.abs(L[k] - h) < Math.abs(L[best] - h) ? k : best), now.current.sheet)
    a.classList.remove('dragging')
    a.style.maxHeight = ''
    now.current.onSheet(to)
    return true
  }

  // 시트 안 내용 — 터치로만(마우스는 손잡이로). 위아래로 움직일 때만 가로채고, 옆으로 밀기(표 · 칩 · 막대 고르기)는 그대로 둔다
  useEffect(() => {
    const b = body.current
    if (!on || !b) return
    let mode: 'wait' | 'drag' | 'pass' | null = null
    let x0 = 0, y0 = 0
    const ts = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        mode = null
        return
      }
      mode = 'wait'
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
    }
    const tm = (e: TouchEvent) => {
      if (mode == null || mode === 'pass') return
      const x = e.touches[0].clientX, y = e.touches[0].clientY
      if (mode === 'wait') {
        const dx = x - x0, dy = y - y0
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        const top = b.scrollTop <= 0
        const pull = Math.abs(dy) > Math.abs(dx) && top && (dy > 0 || now.current.sheet !== 'full')
        if (!pull) {
          mode = 'pass'
          return
        }
        mode = 'drag'
        start(y0)
      }
      e.preventDefault()
      move(y)
    }
    const te = () => {
      if (mode === 'drag') end()
      mode = null
    }
    b.addEventListener('touchstart', ts, { passive: true })
    b.addEventListener('touchmove', tm, { passive: false })
    b.addEventListener('touchend', te)
    b.addEventListener('touchcancel', te)
    return () => {
      b.removeEventListener('touchstart', ts)
      b.removeEventListener('touchmove', tm)
      b.removeEventListener('touchend', te)
      b.removeEventListener('touchcancel', te)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, body, aside])

  // 손잡이 — 마우스 · 펜 · 손가락 모두 pointer로 (styles.css에서 touch-action: none)
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      skipClick.current = false // 끈 뒤 click이 오지 않았을 수도 있다(손가락) — 새로 누르면 잊는다
      e.currentTarget.setPointerCapture?.(e.pointerId)
      start(e.clientY)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (st.current) move(e.clientY)
    },
    onPointerUp: () => {
      if (end()) skipClick.current = true
    },
    onPointerCancel: () => {
      end()
    },
    /** 누르기만 했으면 true — 끌고 난 뒤의 click은 넘긴다 */
    tapped: (): boolean => {
      if (skipClick.current) {
        skipClick.current = false
        return false
      }
      return true
    },
  }
}
