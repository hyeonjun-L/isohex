import { useEffect, useMemo, useRef, useState } from 'react'
import { type Kind, type KindIndex, findKinds } from '../core/kinds'

// 업종 고르기 — 상가정보 소분류 247개를 이름이나 묶음(대분류)으로 찾는다 (마스터플랜 W7.4 '업종 고르기', 와이어프레임 T1a).
// 업종마다 볼 수 있는 깊이를 표시한다 — 자리별 매출 수준(칠하는 업종) · 새 가게(개업 48업종). 묶음 칩의 '무인매장'은 화면을 따로 만들 때

interface Props {
  ix: KindIndex
  kinds: Kind[]
  current: string | null
  onPick: (code: string | null) => void
  onClose: () => void
}

const ALL = '전체'

export default function KindPicker({ ix, kinds, current, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const [g, setG] = useState(ALL)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => box.current?.focus(), [])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])

  const list = useMemo(() => {
    if (q.trim()) return findKinds({ meta: { poi: '', s12: '' }, kinds }, q, 60)
    if (g === ALL) return [...kinds].sort((a, b) => b.n - a.n)
    return ix.groups.get(g) ?? []
  }, [q, g, ix, kinds])

  return (
    <div className="sheet-back" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="업종 고르기" onClick={(e) => e.stopPropagation()} data-testid="kind-picker">
        <div className="sheet-head">
          <h2>업종 고르기</h2>
          <button className="ghost" onClick={onClose}>닫기</button>
        </div>
        <label className="search">
          <span className="sr">업종 이름</span>
          <input
            ref={box}
            type="search"
            value={q}
            placeholder="업종 이름 — 카페, 빨래방, 편의점…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) onPick(list[0].c) }}
          />
        </label>
        {!q.trim() && (
          <div className="chips" role="group" aria-label="묶음">
            {[ALL, ...ix.groups.keys()].map((x) => (
              <button key={x} className="chip-btn" aria-pressed={g === x} onClick={() => setG(x)}>{x}</button>
            ))}
          </div>
        )}
        <ul className="kind-list" aria-label="업종 목록">
          {current && (
            <li>
              <button className="kind-row kind-none" onClick={() => onPick(null)}>업종 없이 보기 <span className="hint">— 가게가 모인 정도</span></button>
            </li>
          )}
          {list.map((k) => {
            const d = ix.depth(k.c)
            return (
              <li key={k.c}>
                <button className="kind-row" aria-current={k.c === current ? 'true' : undefined} onClick={() => onPick(k.c)}>
                  <span className="kind-nm">{k.nm}</span>
                  <span className="hint">서울 {k.n.toLocaleString('ko-KR')}곳</span>
                  {d.pot && <span className="tag">매출 수준</span>}
                  {d.entry && <span className="tag tag-2">새 가게</span>}
                </button>
              </li>
            )
          })}
          {!list.length && <li className="hint empty">맞는 업종이 없어요</li>}
        </ul>
      </section>
    </div>
  )
}
