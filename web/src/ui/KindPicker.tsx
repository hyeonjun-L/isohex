import { useEffect, useMemo, useRef, useState } from 'react'
import { josa } from '../core/format'
import { type Kind, type KindIndex, matchKinds } from '../core/kinds'
import { UN_GROUP, isUn, unCard } from '../core/unm'
import { IcoCheck, IcoClose, IcoSearch } from './icons'

// 업종 고르기 — 상가정보 소분류 247개를 이름이나 묶음(대분류)으로 찾는다 (마스터플랜 W7.4 '업종 고르기', 와이어프레임 T1a).
// 업종마다 볼 수 있는 깊이를 표시한다 — 자리별 매출 수준(칠하는 업종) · 새 가게(개업 48업종) · 손익(가게당 매출, 서울시 업종에 이어진 96업종).
// 찾기는 일상 낱말도 받는다('커피' → 카페 — core/alias.ts). '전체' 목록은 볼 것이 많은 업종 먼저: 매출 수준 지도 → 손익 · 새 가게 · 무인 → 나머지, 그 안에서 가게 많은 순
//   (가게 수만으로 줄 세우면 부동산 중개 · 경영 컨설팅처럼 볼 것이 없는 업종이 맨 위에 온다 — 2026-11-20)
// 묶음 '무인매장'은 무인 6종 카드(와이어프레임 T1m — 흐름 · 가맹점 월매출 · 창업비 · 생존). 무인은 무인끼리만 견준다(매출 자료가 다르다)
// 모드: one 하나 고르기(머리줄) · two 둘 골라 견주기(첫 화면 ① '어떤 업종이 나을까') · vs 지금 업종과 견줄 업종 하나
// 화면 다시 잡기 S02 · S16(8단계): 머리(22px + 덧말) · 둥근 × · 찾기 칸(돋보기) · 묶음 칩 한 줄(옆으로 밀기) · 줄 60px(이름 17px · 서울 N곳,
// 아래 13px로 볼 수 있는 것 '매출 수준 · 새 가게 · 손익') · 무인 카드(숫자 셋 17px) · 둘 고르기는 아래 한 줄 'N개 골랐어요 — A · B' + [견주기]

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
  const grps = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.focus(), [])
  // 고른 묶음 칩이 줄 밖이면 보이게 — 처음 화면 '무인매장 6종'으로 열면 줄 맨 끝이다
  useEffect(() => {
    grps.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [g])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])

  const found = useMemo(() => (q.trim() ? matchKinds({ meta: { poi: '', s12: '' }, kinds: ix.all }, q, 60) : null), [q, ix])
  const list = useMemo(() => {
    // 볼 것이 많은 업종 먼저 — 0 매출 수준 지도 · 1 손익이나 새 가게 지도 · 무인 유형 · 2 나머지
    const tier = (k: Kind) => {
      const d = ix.depth(k.c)
      return d.pot ? 0 : d.un || d.entry || beCodes?.has(k.c) ? 1 : 2
    }
    let l = found ? found.kinds : g === ALL ? [...ix.all].sort((a, b) => tier(a) - tier(b) || b.n - a.n) : ix.groups.get(g) ?? []
    if (unOnly) l = l.filter((k) => isUn(k.c))
    if (noUn) l = l.filter((k) => !isUn(k.c))
    return mode === 'vs' ? l.filter((k) => k.c !== current) : l
  }, [found, g, ix, mode, current, unOnly, noUn, beCodes])
  // 업종 이름이 아니라 일상 낱말로 찾았을 때 — 맨 앞 결과가 걸러지지 않고 남아 있을 때만 알린다
  const via = found?.via && list[0] && list[0] === found.kinds[0] ? found.via : null
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

  /** 줄 — 이름 · 서울 N곳, 아래에 이 업종으로 볼 수 있는 것(매출 수준 · 새 가게 · 무인 가게 · 손익) */
  const rowBody = (k: Kind) => {
    const d = ix.depth(k.c)
    const can = [d.pot && '매출 수준', d.entry && '새 가게', d.un && '무인 가게', (d.un || beCodes?.has(k.c)) && '손익'].filter(Boolean).join(' · ')
    return (
      <span className="kr-t">
        <span className="kr-top">
          <span className="kind-nm">{k.nm}</span>
          <span className="kind-n">{d.un ? '서울 명단' : '서울'} {k.n.toLocaleString('ko-KR')}곳</span>
        </span>
        {can && <span className="kr-sub">{can}</span>}
      </span>
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
          <div className="sh-t">
            <h2>{TITLE[mode]}</h2>
            {mode === 'two' && <p className="pick-lead">둘을 골라 견줘 보세요 — 가게당 매출 · 경쟁 가게 수 · 생존의 차이를 말해 줘요(무인매장은 매출 · 창업비 · 흐름). 하나만 고르면 그 업종 지도로 가요.</p>}
            {mode === 'vs' && current && <p className="pick-lead">{josa(nm(current), '과', '와')} 견줄 {unOnly ? '무인 유형' : '업종'}을 하나 고르세요.{unOnly ? ' 무인매장은 무인매장끼리 견줘요.' : ''}</p>}
          </div>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="닫기"><IcoClose size={20} /></button>
        </div>
        <label className="search pick-search">
          <IcoSearch size={20} />
          <span className="sr">업종 이름</span>
          <input
            ref={box}
            type="search"
            value={q}
            placeholder={unOnly ? '무인 유형 — 빨래방, 카페…' : '업종 — 커피, 빵집, 술집, 미용실…'}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enter() }}
          />
        </label>
        {!q.trim() && !unOnly && (
          <div className="pick-grps" role="group" aria-label="묶음" ref={grps}>
            {groups.map((x) => (
              <button key={x} className="show-chip" aria-pressed={g === x} onClick={() => setG(x)}>{g === x && <IcoCheck size={16} />}{x}</button>
            ))}
          </div>
        )}
        {cards ? (
          <p className="tag-key" data-testid="un-lead">
            가맹 브랜드 정보공개서가 있는 무인 6종이에요. 월매출은 가맹점 평균, 창업비는 점포 임차를 뺀 값 — 둘 다 브랜드 가운데 값이에요. 1년 생존은 그 유형이 주로 실린 업종 값이에요.
          </p>
        ) : (
          <p className="tag-key">{!q.trim() && g === ALL ? '볼 것이 많은 업종이 앞에 있어요. ' : ''}줄 아래 글은 이 업종으로 볼 수 있는 것 — 매출 수준 지도 · 새 가게 지도 · 무인 가게 지도 · 손익(본전 계산)</p>
        )}
        {via && <p className="hint alias-note" role="status" data-testid="alias-note">&lsquo;{via}&rsquo;{josa(via, '은', '는').slice(via.length)} 업종 이름이 아니에요 — 그런 가게가 주로 실려 있는 업종을 보여 드려요(상가정보 분류).</p>}
        <ul className={cards ? 'un-cards' : 'kind-list'} aria-label="업종 목록" data-testid={cards ? 'un-cards' : undefined}>
          {mode === 'one' && current && !cards && (
            <li>
              <button className="kind-row kind-none" onClick={() => onPick(null)}>
                <span className="kr-t"><span className="kr-top"><span className="kind-nm">업종 없이 보기</span></span><span className="kr-sub">가게가 모인 정도</span></span>
              </button>
            </li>
          )}
          {list.map((k) => (
            <li key={k.c}>
              {mode === 'two' ? (
                <label className={cards ? 'un-card un-chk' : 'kind-row kind-chk'}>
                  <input type="checkbox" checked={sel.includes(k.c)} onChange={() => toggle(k.c)} />
                  {cards ? unBody(k) : rowBody(k)}
                </label>
              ) : (
                <button className={cards ? 'un-card' : 'kind-row'} aria-current={k.c === current ? 'true' : undefined} onClick={() => onPick(k.c)}>
                  {cards ? unBody(k) : rowBody(k)}
                  {k.c === current && !cards && <IcoCheck size={20} />}
                </button>
              )}
            </li>
          ))}
          {!list.length && <li className="hint empty">맞는 업종이 없어요</li>}
        </ul>
        {mode === 'two' && (
          <div className="sheet-foot" data-testid="pick-foot">
            {/* 고른 것은 아래 한 줄에 — 빼려면 그 줄(카드)을 다시 누른다 (화면 다시 잡기 S16) */}
            <div className="pf-t" aria-live="polite">
              <span className="pf-sel">{sel.length ? <><b>{sel.length}개</b> 골랐어요 — {sel.map(nm).join(' · ')}</> : '업종을 골라 주세요'}</span>
              <span className="pf-hint" role="status">
                {warn === 'full' ? '둘까지 고를 수 있어요 — 하나를 빼고 고르세요'
                  : warn === 'mix' ? '무인매장은 무인매장끼리 견줘요 — 하나를 빼고 고르세요'
                  : sel.length === 1 ? '하나 더 고르면 견줘요' : ''}
              </span>
            </div>
            <button className="btn-primary pf-go" disabled={!sel.length} onClick={() => onTwo(sel[0], sel[1] ?? null)} data-testid="pick-go">
              {sel.length === 1 ? '지도 보기' : '견주기'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
