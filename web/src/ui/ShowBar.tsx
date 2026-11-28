import { type ReactNode, useEffect, useState } from 'react'
import type { Chip, Show } from '../core/layers'
import { IcoCheck } from './icons'

// 동네 보기 지표 칩 — 지도 위 한 줄 (마스터플랜 W7.4 '동네 보기' · 화면 다시 잡기 11-25). 맨 앞은 업종 칩(lead, App이 준다).
// 이 업종에 없는 지표는 흐리게 두되 누를 수 있다 — 누르면 왜 없는지 말한다(숨기면 '어디 갔지?'가 된다)
// 쌓는 틀(.map-top)은 App이 둔다 — 칩 줄 · 알림 · 예시 안내가 차례로 쌓인다. 업종 둘 견주기의 [A 지도 | B 지도]는 8단계부터 시트 안(ui/KindSeg)

interface Props {
  /** 칩 줄 맨 앞 — 업종 칩 */
  lead?: ReactNode
  chips: Chip[]
  show: Show
  busy: boolean
  err: string | null
  onPick: (s: Show) => void
}

export default function ShowBar({ lead = null, chips, show, busy, err, onPick }: Props) {
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note])
  useEffect(() => setNote(null), [chips])

  const msg = err ? '지도 자료를 받지 못했어요 — 새로고침해 주세요' : note
  return (
    <>
      <div className="show-chips" role="group" aria-label="지도에 칠할 것" aria-busy={busy || undefined}>
        {lead}
        {chips.map((c) => (
          <button
            key={c.s}
            className="show-chip"
            aria-pressed={c.s === show}
            aria-disabled={!c.ok || undefined}
            title={c.why ?? undefined}
            data-testid={`show-${c.s}`}
            onClick={() => (c.ok ? onPick(c.s) : setNote(c.why))}
          >
            {c.s === show && <IcoCheck size={16} />}
            {c.nm}
          </button>
        ))}
      </div>
      {msg && <p className="show-note" role="status">{msg}</p>}
    </>
  )
}
