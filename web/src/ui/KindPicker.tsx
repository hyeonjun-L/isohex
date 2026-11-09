import { useEffect, useMemo, useRef, useState } from 'react'
import { josa } from '../core/format'
import { type Kind, type KindIndex, findKinds } from '../core/kinds'
import { UN_GROUP, isUn, unCard } from '../core/unm'

// 업종 고르기 — 상가정보 소분류 247개를 이름이나 묶음(대분류)으로 찾는다 (마스터플랜 W7.4 '업종 고르기', 와이어프레임 T1a).
// 업종마다 볼 수 있는 깊이를 표시한다 — 자리별 매출 수준(칠하는 업종) · 새 가게(개업 48업종) · 손익(가게당 매출, 서울시 업종에 이어진 96업종).
// 묶음 '무인매장'은 무인 6종 카드(와이어프레임 T1m — 흐름 · 가맹점 월매출 · 창업비 · 생존). 무인은 무인끼리만 견준다(매출 자료가 다르다)
// 모드: one 하나 고르기(머리줄) · two 둘 골라 견주기(첫 화면 ① '어떤 업종이 나을까') · vs 지금 업종과 견줄 업종 하나

export type PickMode = 'one' | 'two' | 'vs'

interface Props {
  ix: KindIndex
  current: string | null
  mode: PickMode
  /** 처음 펼칠 묶음 (첫 화면 '무인매장 6종') */
  initGroup?: string | null
  /** 가게당 매출(손익)을 견줄 수 있는 업종 — be/index.json을 받기 전에는 null */
  beCodes: ReadonlySet<string> | null
  /** one · vs */
  onPick: (code: string | null) => void
  /** two — 둘이면 견주기, 하나면 그 업종 지도 */
  onTwo: (a: string, b: string | null) => void
  onClose: () => void
}

const ALL = '전체'
const TITLE: Record<PickMode, string> = { one: '업종 고르기', two: '어떤 업종이 나을까?', vs: '견줄 업종 고르기' }

export default function KindPicker({ ix, current, mode, initGroup = null, beCodes, onPick, onTwo, onClose }: Props) {
  // 견줄 업종 — 무인 유형은 무인끼리, 업종 247은 업종끼리
  const unOnly = mode === 'vs' && isUn(current)
  const noUn = mode === 'vs' && !isUn(current)
  const [q, setQ] = useState('')
  const [g, setG] = useState(unOnly ? UN_GROUP : initGroup && ix.groups.has(initGroup) ? initGroup : ALL)
  const [sel, setSel] = useState<string[]>([])
  const [warn, setWarn] = useState<'full' | 'mix' | null>(null)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => box.current?.focus(), [])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])

  const list = useMemo(() => {
    let l = q.trim() ? findKinds({ meta: { poi: '', s12: '' }, kinds: ix.all }, q, 60) : g === ALL ? [...ix.all].sort((a, b) => b.n - a.n) : ix.groups.get(g) ?? []
    if (unOnly) l = l.filter((k) => isUn(k.c))
    if (noUn) l = l.filter((k) => !isUn(k.c))
    return mode === 'vs' ? l.filter((k) => k.c !== current) : l
  }, [q, g, ix, mode, current, unOnly, noUn])
  const cards = !q.trim() && g === UN_GROUP

  const nm = (c: string) => ix.byCode.get(c)?.nm ?? c
  const toggle = (c: string) => {
    if (sel.includes(c)) {
      setSel(sel.filter((x) => x !== c))
      setWarn(null)
    } else if (sel.length >= 2) setWarn('full')
    else if (sel.length === 1 && isUn(sel[0]) !== isUn(c)) setWarn('mix')
    else {
      setSel([...sel, c])
      setWarn(null)
    }
  }
  const enter = () => {
    if (!list[0]) return
    if (mode === 'two') toggle(list[0].c)
    else onPick(list[0].c)
  }

  const tags = (k: Kind) => {
    const d = ix.depth(k.c)
    return (
      <>
        <span className="hint kind-n">{d.un ? '서울 명단' : '서울'} {k.n.toLocaleString('ko-KR')}곳</span>
        {d.pot && <span className="tag">매출 수준</span>}
        {d.entry && <span className="tag tag-2">새 가게</span>}
        {d.un && <span className="tag tag-un">무인 가게</span>}
        {(d.un || beCodes?.has(k.c)) && <span className="tag tag-2">손익</span>}
      </>
    )
  }

  /** 무인 유형 카드 (T1m) — 흐름 · 가맹점 월매출 · 창업비 · 1년 생존 */
  const unBody = (k: Kind) => {
    const u = ix.un.get(k.c)
    if (!u) return <span className="kind-nm">{k.nm}</span>
    const c = unCard(u, k, ix.byCode)
    return (
      <span className="un-body">
        <span className="un-head">
          <span className="kind-nm">{k.nm}</span>
          <span className={`trend trend-${c.trend}`}>{c.trendText}</span>
        </span>
        <span className="un-nums">
          <span><span className="hint">월매출</span><b>{c.sales}</b></span>
          <span><span className="hint">창업비</span><b>{c.open}</b></span>
          <span><span className="hint">1년 생존</span><b>{c.surv}</b></span>
        </span>
        <span className="hint un-foot">{c.foot}</span>
      </span>
    )
  }

  const groups = [ALL, ...ix.groups.keys()].filter((x) => !(noUn && x === UN_GROUP))

  return (
    <div className="sheet-back" onClick={onClose}>
      <section className={`sheet picker picker-${mode}`} role="dialog" aria-modal="true" aria-label={TITLE[mode]} onClick={(e) => e.stopPropagation()} data-testid="kind-picker">
        <div className="sheet-head">
          <h2>{TITLE[mode]}</h2>
          <button className="ghost" onClick={onClose}>닫기</button>
        </div>
        {mode === 'two' && <p className="hint pick-lead">둘을 골라 견줘 보세요 — 가게당 매출 · 경쟁 가게 수 · 생존의 차이를 말해 줘요(무인매장은 매출 · 창업비 · 흐름). 하나만 고르면 그 업종 지도로 가요.</p>}
        {mode === 'vs' && current && <p className="hint pick-lead">{josa(nm(current), '과', '와')} 견줄 {unOnly ? '무인 유형' : '업종'}을 하나 고르세요.{unOnly ? ' 무인매장은 무인매장끼리 견줘요.' : ''}</p>}
        <label className="search">
          <span className="sr">업종 이름</span>
          <input
            ref={box}
            type="search"
            value={q}
            placeholder={unOnly ? '무인 유형 — 빨래방, 카페…' : '업종 이름 — 카페, 빨래방, 무인…'}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enter() }}
          />
        </label>
        {!q.trim() && !unOnly && (
          <div className="chips" role="group" aria-label="묶음">
            {groups.map((x) => (
              <button key={x} className={`chip-btn${x === UN_GROUP ? ' chip-un' : ''}`} aria-pressed={g === x} onClick={() => setG(x)}>{x}</button>
            ))}
          </div>
        )}
        {cards ? (
          <p className="hint tag-key" data-testid="un-lead">
            가맹 브랜드 정보공개서가 있는 무인 6종이에요. 월매출은 가맹점 평균, 창업비는 점포 임차를 뺀 값 — 둘 다 브랜드 가운데 값이에요. 1년 생존은 그 유형이 주로 실린 업종 값이에요.
          </p>
        ) : (
          <p className="hint tag-key">표시 — <b>매출 수준</b> 자리별 매출 수준 지도 · <b>새 가게</b> 최근 새 가게 지도 · <b>무인 가게</b> 무인 가게 지도 · <b>손익</b> 매출과 견줘 본전 계산</p>
        )}
        <ul className={cards ? 'un-cards' : 'kind-list'} aria-label="업종 목록" data-testid={cards ? 'un-cards' : undefined}>
          {mode === 'one' && current && !cards && (
            <li>
              <button className="kind-row kind-none" onClick={() => onPick(null)}>업종 없이 보기 <span className="hint">— 가게가 모인 정도</span></button>
            </li>
          )}
          {list.map((k) => (
            <li key={k.c}>
              {mode === 'two' ? (
                <label className={cards ? 'un-card un-chk' : 'kind-row kind-chk'}>
                  <input type="checkbox" checked={sel.includes(k.c)} onChange={() => toggle(k.c)} />
                  {cards ? unBody(k) : (
                    <>
                      <span className="kind-nm">{k.nm}</span>
                      {tags(k)}
                    </>
                  )}
                </label>
              ) : (
                <button className={cards ? 'un-card' : 'kind-row'} aria-current={k.c === current ? 'true' : undefined} onClick={() => onPick(k.c)}>
                  {cards ? unBody(k) : (
                    <>
                      <span className="kind-nm">{k.nm}</span>
                      {tags(k)}
                    </>
                  )}
                </button>
              )}
            </li>
          ))}
          {!list.length && <li className="hint empty">맞는 업종이 없어요</li>}
        </ul>
        {mode === 'two' && (
          <div className="sheet-foot" data-testid="pick-foot">
            <div className="sel-chips" aria-live="polite">
              {sel.map((c) => (
                <button key={c} className="chip-btn sel-chip" onClick={() => toggle(c)} aria-label={`${nm(c)} 빼기`}>{nm(c)} <span aria-hidden="true">✕</span></button>
              ))}
              <span className="hint" role="status">
                {warn === 'full' ? '둘까지 고를 수 있어요 — 하나를 빼고 고르세요'
                  : warn === 'mix' ? '무인매장은 무인매장끼리 견줘요 — 하나를 빼고 고르세요'
                  : sel.length === 0 ? '업종을 골라 주세요' : sel.length === 1 ? '하나 더 고르면 견줘요' : ''}
              </span>
            </div>
            <button className="btn2 btn-ink" disabled={!sel.length} onClick={() => onTwo(sel[0], sel[1] ?? null)} data-testid="pick-go">
              {sel.length === 2 ? `${nm(sel[0])} · ${nm(sel[1])} 견주기` : sel.length === 1 ? `${nm(sel[0])} 지도 보기` : '견주기'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
