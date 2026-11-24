import { useEffect, useMemo, useState, type RefObject } from 'react'
import { ADDR_ON, addrNote, useAddress } from './useAddress'
import type { BaseData } from '../core/data'
import type { Kind, KindsData } from '../core/kinds'
import type { PlaceEntry, PlaceIndex } from '../core/places'
import { bestHit, searchAll } from '../core/search'
import { loadPlaces } from './loadPlaces'
import { IcoBox, IcoHex, IcoRight, IcoSearch } from './icons'

// 떠 있는 찾기 칸 (화면 다시 잡기 11-25 — 머리줄 대신). ⬡ 처음 화면 · 찾기(주소 · 동 · 역 · 상권 · 업종) · 비교함 단추(담은 수).
// 폰은 지도 위 맨 위에 떠 있고, 데스크톱은 왼쪽 패널 맨 위에 선다. 찾은 것은 칸 아래 카드 — 줄마다 동 · 역 · 상권 · 업종 · 주소 꼬리표.
// 곳 목록(역 · 상권 · 법정동 이름)은 처음 찾을 때 받는다

interface Props {
  data: BaseData
  kinds: KindsData | null
  onKind: (code: string) => void
  onPlace: (p: { cell: number }) => void
  onHome: () => void
  /** 비교함 단추 — 담은 곳이 없거나 비교함 화면이면 null(감춘다) */
  box: { n: number; onOpen: () => void } | null
  /** 처음 화면 ③ '이 자리 괜찮을까'를 누른 뒤 — 찾기 칸 아래 안내 한 줄(고르면 손익 점검까지 연다) */
  hint: string | null
  onHintEnd: () => void
  inputRef: RefObject<HTMLInputElement | null>
}

const PLACE_TAG: Record<PlaceEntry['kind'], string> = { dong: '동', st: '역', bdong: '동', sang: '상권' }

function usePlaces(data: BaseData, on: boolean): PlaceIndex | null {
  const [idx, setIdx] = useState<PlaceIndex | null>(null)
  useEffect(() => {
    if (!on || idx) return
    let live = true
    loadPlaces(data).then((ix) => live && setIdx(ix)).catch(() => {})
    return () => { live = false }
  }, [data, on, idx])
  return idx
}

/** '망원1동 (마포구)' → 이름 · 덧말. 괄호가 없으면 덧말 없음 */
function split(label: string): [string, string | null] {
  const m = /^(.*?) \((.*)\)$/.exec(label)
  return m ? [m[1], m[2]] : [label, null]
}

export default function SearchBar({ data, kinds, onKind, onPlace, onHome, box, hint, onHintEnd, inputRef }: Props) {
  const [q, setQ] = useState('')
  const [want, setWant] = useState(false)
  const places = usePlaces(data, want || !!hint)
  const r = useMemo(() => searchAll(q, kinds, places), [q, kinds, places])
  const addr = useAddress(q, data.cells.h3)
  const note = addrNote(addr.state)
  const open = !!q.trim()
  const done = () => {
    setQ('')
    inputRef.current?.blur()
  }
  const kind = (k: Kind) => {
    done()
    onKind(k.c)
  }
  const place = (p: { cell: number }) => {
    done()
    onPlace(p)
  }
  const pick = () => {
    const h = bestHit(q, r)
    if (!h) {
      if (addr.hits[0]) place(addr.hits[0]) // 동 · 역 · 업종에 없으면 찾은 첫 주소
      return
    }
    if (h.kind === 'kind') kind(h.k)
    else place(h.p)
  }
  return (
    <div className={`search-bar${open ? ' open' : ''}`}>
      {/* 찾는 동안 지도를 어둡게 — 누르면 찾기를 닫는다 (폰) */}
      {open && <div className="search-scrim" onClick={() => setQ('')} aria-hidden="true" />}
      <div className="search-box">
        <button className="icon-btn" onClick={onHome} aria-label="점지 — 처음 화면으로" data-testid="brand">
          <IcoHex />
        </button>
        <label className="search-field">
          <span className="sr">{ADDR_ON ? '주소 · 동 · 역 · 상권 · 업종 이름으로 찾기' : '동 · 역 · 상권 · 업종 이름으로 찾기'}</span>
          <IcoSearch size={18} />
          <input
            ref={inputRef}
            type="search"
            value={q}
            enterKeyHint="search"
            data-addr={ADDR_ON ? 'on' : 'off'}
            placeholder={ADDR_ON ? '주소 · 동네 · 역 · 업종 찾기' : '동네 · 역 · 업종 찾기'}
            onFocus={() => setWant(true)}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pick()
              if (e.key === 'Escape') {
                setQ('')
                onHintEnd()
              }
            }}
            onBlur={() => { if (!q.trim()) onHintEnd() }}
            data-testid="home-search"
          />
        </label>
        {box && (
          <button className="icon-btn box-btn" onClick={box.onOpen} aria-label={`비교함 — ${box.n}곳`} data-testid="tab-box">
            <IcoBox />
            <span className="badge-n" aria-hidden="true">{box.n}</span>
          </button>
        )}
      </div>
      {!open && hint && <p className="search-hint" role="status" data-testid="q3-hint">{hint}</p>}
      {open && (
        <section className="hits" aria-label="찾은 것" data-testid="search-hits">
          <ul>
            {r.kinds.map((k) => (
              <li key={k.c}>
                <button className="hit" onClick={() => kind(k)}>
                  <span className="hit-tag">업종</span> <span className="hit-nm">{k.nm}</span> <span className="hit-sub">서울 {k.n.toLocaleString('ko-KR')}곳</span>
                  <IcoRight size={18} />
                </button>
              </li>
            ))}
            {r.places.map((p) => {
              const [nm, sub] = split(p.label)
              return (
                <li key={p.label}>
                  <button className="hit" onClick={() => place(p)} aria-label={`${PLACE_TAG[p.kind]} ${p.label}`}>
                    <span className="hit-tag">{PLACE_TAG[p.kind]}</span> <span className="hit-nm">{nm}</span> {sub && <span className="hit-sub">{sub}</span>}
                    <IcoRight size={18} />
                  </button>
                </li>
              )
            })}
            {addr.hits.map((a) => (
              <li key={a.label}>
                <button className="hit" onClick={() => place(a)} data-testid="hit-addr">
                  <span className="hit-tag">주소</span> <span className="hit-nm">{a.label}</span> {a.sub && <span className="hit-sub">{a.sub}</span>}
                  <IcoRight size={18} />
                </button>
              </li>
            ))}
          </ul>
          {note && <p className="hint empty" role="status" data-testid="addr-note">{note}</p>}
          {addr.hits.length > 0 && <p className="hint empty">주소는 브이월드(국토교통부) 주소 검색으로 찾아요 — 그 건물이 든 칸으로 가요</p>}
          {!r.kinds.length && !r.places.length && !addr.hits.length && !note && <p className="hint empty">{ADDR_ON ? '맞는 곳이나 업종이 없어요 — 주소는 번호까지(망원로 23 · 망원동 395-1), 아니면 동 · 역 · 상권 이름으로 찾아 주세요' : '맞는 곳이나 업종이 없어요 — 주소(지번·도로명) 찾기는 아직 없어 동 · 역 · 상권 이름으로 찾아 주세요'}</p>}
        </section>
      )}
    </div>
  )
}
