import { type CSSProperties, type ReactNode, type RefObject, useRef } from 'react'
import type { CardModel } from '../core/card'
import type { BaseData, Industry } from '../core/data'
import type { Kind } from '../core/kinds'
import type { Show } from '../core/layers'
import { scoreLines } from '../core/score'
import PlaceCard from './PlaceCard'
import { type Sheet, useSheetDrag } from './useSheetDrag'
import type { Theme } from '../map/palette'

interface Props {
  data: BaseData
  /** 매출 수준을 칠하는 업종 (고른 업종에 있으면) */
  industry: Industry | null
  /** 고른 업종 (상가정보 소분류) */
  kind: Kind | null
  /** 무인 유형이면 첫머리 문장 (core/unm.ts unIntro) */
  unIntro: string | null
  card: CardModel | null
  /** 지금 지도에 칠한 지표 — 범례는 지도 위에 있다(ui/MapLegend) */
  show: Show | null
  selected: number | null
  onClear: () => void
  /** 처음 화면 · 동네 보기 · 후보 찾기 · 비교함 — 갈래 바꾸기는 탭 대신 ⬡ · 비교함 단추 · 후보 찾기 띠의 × (App) */
  tab: Tab
  /** 처음 화면 · 후보 찾기 패널 */
  home: ReactNode
  find: ReactNode
  /** 폰 아래 시트 높이 — 살짝 · 반 · 크게 (ui/useSheetDrag) */
  sheet: Sheet
  onSheet: (s: Sheet) => void
  /** 폰이면 시트를 끌 수 있다 */
  narrow: boolean
  /** 데스크톱 패널 맨 위 — 찾기 칸(후보 찾기면 조건 띠도). 폰은 지도 위에 떠 있어 null */
  head?: ReactNode
  /** 후보 찾기에서 고른 칸의 머리와 '왜' */
  ctx: { head: string; why: string } | null
  /** 동네 보기 카드의 '여기서 후보 찾기' */
  onFindHere: (() => void) | null
  /** 카드의 '손익 따져보기' — 열면 카드 자리에 손익 점검(check)이 선다 */
  onCheck: () => void
  check: ReactNode | null
  /** 이 자리에 맞는 업종 — 열면 카드 자리에 선다 (손익 점검이 먼저) */
  fit: ReactNode | null
  onFit: (() => void) | null
  /** 동네 보기 — 업종 둘 견주기(있으면 첫머리 안내 대신) · '다른 업종과 견주기' */
  cmp: ReactNode | null
  onVs: (() => void) | null
  /** 비교함 — 화면 · 카드의 담기 단추 */
  box: ReactNode
  boxBtn: { boxed: boolean; full: boolean; onBox: () => void } | null
  /** 데스크톱 패널 너비(px) — 비교함은 넓다 */
  width: number
  /** 패널 바깥 틀 — 폰에서 시트가 덮는 높이를 잰다 (ui/useSheetSize) */
  asideRef: RefObject<HTMLElement | null>
  /** 카드 추정 막대의 칸 색 — 지도와 같은 색 */
  theme?: Theme
}

export type Tab = 'home' | 'map' | 'find' | 'box'
export type { Sheet }
const SHEET_NEXT: Record<Sheet, Sheet> = { half: 'full', full: 'peek', peek: 'half' }
const SHEET_NM: Record<Sheet, string> = { half: '패널 크게', full: '지도 크게', peek: '패널 반만' }

/** 매출 수준 지도를 볼 때 패널 아래 — '이 지도, 얼마나 맞나요?' (성적표: 이 업종 · 다음 해 · 칠하는 업종 전체 · 읽는 법) */
function ScoreNote({ industry, model }: { industry: Industry; model: BaseData['manifest']['model'] }) {
  const lines = scoreLines(industry, model)
  if (!lines.length) return null
  return (
    <details className="acc score" data-testid="score">
      <summary>이 지도, 얼마나 맞나요?</summary>
      <ul className="trust">
        {lines.map((l) => (
          <li key={l.key} data-testid={`score-${l.key}`}>
            <span><strong>{l.head}</strong> — {l.text}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function Panel({ data, industry, kind, unIntro, card, show, selected, onClear, tab, home, find, ctx, onFindHere, onCheck, check, fit, onFit, cmp, onVs, box, boxBtn, width, sheet, onSheet, narrow, head = null, asideRef, theme = 'light' }: Props) {
  const sel = selected != null
  const bodyRef = useRef<HTMLDivElement>(null)
  const drag = useSheetDrag(narrow, asideRef, bodyRef, sheet, onSheet)
  const cardView = check ?? fit ?? (card ? (
    <PlaceCard card={card} onClose={onClear} ctx={tab === 'find' ? ctx : null} onFindHere={tab === 'map' ? onFindHere : null} onCheck={onCheck} onFit={onFit} box={boxBtn} back={tab === 'box' ? '← 비교함' : null} theme={theme} />
  ) : (
    <section className="card" aria-busy="true"><p className="hint">자리 카드를 불러오는 중…</p></section>
  ))
  return (
    <aside ref={asideRef} className={`panel sheet-${sheet}${tab === 'box' ? ' panel-box' : ''}`} style={{ '--pw': `${width}px` } as CSSProperties}>
      {/* 폰에서만 보인다 — 끌어서 높이를 바꾸고, 누를 때마다 크게 → 지도 크게(살짝) → 반 */}
      <button
        className="sheet-handle"
        onClick={() => drag.tapped() && onSheet(SHEET_NEXT[sheet])}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        aria-label={`${SHEET_NM[sheet]} — 끌거나 누르세요`}
        data-testid="sheet-handle"
      >
        <i aria-hidden="true" />
      </button>
      {head && <div className="panel-head">{head}</div>}
      <div className="panel-body" ref={bodyRef}>
      {tab === 'home' ? home : tab === 'find' ? (sel ? cardView : find) : tab === 'box' ? (sel ? cardView : box) : (
      <div className="tab-body" aria-live="polite">
      {!sel && cmp}
      {!sel && !cmp && (
        <section className="intro">
          <h2>{kind ? kind.nm : '서울 칸 지도 (시험판)'}</h2>
          {kind && unIntro ? (
            <p data-testid="un-intro">{unIntro} 지도 위 단추로 칠할 것을 바꿔 보세요. 칸을 누르면 그 자리 카드가 나옵니다.</p>
          ) : kind ? (
            <p>
              서울 {kind.nm} {kind.n.toLocaleString('ko-KR')}곳 · 새 가게 1년 생존 {kind.s12 ? `${Math.round(kind.s12[0] * 100)}%` : '—'}.{' '}
              {industry ? '' : '이 업종은 자리별 매출 수준을 추정하지 않아요. '}
              지도 위 단추로 칠할 것을 바꿔 보세요. 칸을 누르면 그 자리 카드가 나옵니다.
            </p>
          ) : (
            <p>
              서울을 육각 칸 {data.cells.h3.length.toLocaleString('ko-KR')}개로 나눠 칠했습니다. 업종을 고르면 매출 수준 · 새 가게 · 같은 업종도 칠해 볼 수 있어요. 칸을 누르면 그 자리 카드가 나옵니다.
            </p>
          )}
          {show === 'pot' && industry?.note && <p className="caution" data-testid="ind-note">{industry.note}</p>}
          {kind && onVs && <button className="btn2 vs-btn" onClick={onVs} data-testid="vs-open">{unIntro ? '다른 무인 유형과 견주기' : '다른 업종과 견주기'}</button>}
        </section>
      )}
      {sel && cardView}
      {show === 'pot' && industry && !sel && <ScoreNote industry={industry} model={data.manifest.model} />}
      </div>
      )}
      <footer className="panel-foot">
        자료 판 <code>{data.ver}</code> · 매출 수준 모형 {data.manifest.made}
        {data.manifest.sales ? ` (매출 ${data.manifest.sales} · 가게 수 상가정보 ${data.manifest.snapshot})` : ''} · 행정동 임대시세는 아직 넣지 않았습니다
      </footer>
      </div>
    </aside>
  )
}
