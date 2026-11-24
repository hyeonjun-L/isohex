import { useEffect, useMemo, useState } from 'react'

/** 폰 너비인가 — styles.css의 `max-width: 639px`와 같은 기준. 창 크기가 바뀌면 따라 바뀐다 */
export function useNarrow(): boolean {
  const mq = useMemo(() => window.matchMedia?.('(max-width: 639px)') ?? null, [])
  const [narrow, setNarrow] = useState(mq?.matches ?? false)
  useEffect(() => {
    if (!mq) return
    const f = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [mq])
  return narrow
}
