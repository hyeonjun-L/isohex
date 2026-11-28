import { type CSSProperties, type ReactNode, type RefObject, useRef, useState } from 'react'
import type { CardModel } from '../core/card'
import type { BaseData, Industry } from '../core/data'
import type { Kind } from '../core/kinds'
import type { Show } from '../core/layers'
import { josa } from '../core/format'
import { scoreLines, tenOf } from '../core/score'
import Fold from './Fold'
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
  /** 견주는 동안 자리 카드 위에 서는 [A 지도 | B 지도] (견주기 화면에서는 ComparePanel 안에 있다) */
  seg?: ReactNode
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
type ScoreLine = ReturnType<typeof scoreLines>[number]

/** 성적표 줄 — 이 업종 · 다음 해 · 칠하는 업종 전체 · 읽는 법 */
function ScoreList({ lines }: { lines: ScoreLine[] }) {
  return (
    <ul className="trust">
      {lines.map((l) => (
        <li key={l.key} data-testid={`score-${l.key}`}>
          <span><strong>{l.head}</strong> — {l.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** 업종 견주기 아래 — 접는 줄로, 요약은 이 업종의 맞힘 한 줄 (동네 보기에서는 안내 아래 조용한 단추로 연다) */
function ScoreNote({ lines, sum }: { lines: ScoreLine[]; sum: string | null }) {
  if (!lines.length) return null
  return (
    <Fold title="이 지도, 얼마나 맞나요?" sum={sum} testid="score" className="score">
      <ScoreList lines={lines} />
    </Fold>
  )
}

export default function Panel({ data, industry, kind, unIntro, card, show, selected, onClear, tab, home, find, ctx, onFindHere, onCheck, check, fit, onFit, cmp, seg = null, onVs, box, boxBtn, width, sheet, onSheet, narrow, head = null, asideRef, theme = 'light' }: Props) {
  const sel = selected != null
  const bodyRef = useRef<HTMLDivElement>(null)
  // 이 지도, 얼마나 맞나요? — 매출 수준을 칠할 때만. 동네 보기에서 열면 폰 시트를 반으로 올려 내용이 보이게
  const score = show === 'pot' && industry ? scoreLines(industry, data.manifest.model) : []
  const scoreSum = industry?.hit ? `${josa(industry.nm, '은', '는')} 높다고 본 상권 ${tenOf(industry.hit[0])}이 실제로 많이 팔았어요` : null
  const [scoreOpen, setScoreOpen] = useState(false)
  const toggleScore = () => {
    if (!scoreOpen && narrow && sheet === 'peek') onSheet('half')
    setScoreOpen(!scoreOpen)
  }
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
          {/* 동네 보기 — 폰은 시트 '살짝'(214px)에 이름 · 가게 수 · 안내 두 줄 · 단추 줄이 다 든다 (화면 다시 잡기 S05) */}
          <div className="intro-head">
            <h2>{kind ? kind.nm : '서울 칸 지도 (시험판)'}</h2>
            {kind && !unIntro && <span className="intro-n">서울 {kind.n.toLocaleString('ko-KR')}곳</span>}
          </div>
          {kind && unIntro ? (
            <p data-testid="un-intro">{unIntro} 칸을 누르면 그 자리 카드가 나와요.</p>
          ) : kind ? (
            <p>
              {industry ? '' : '이 업종은 자리별 매출 수준을 추정하지 않아요. '}
              칸을 누르면 그 자리 카드가 나와요.
              {kind.s12 ? ` 새 가게 1년 생존은 ${Math.round(kind.s12[0] * 100)}%예요(서울 ${kind.nm}).` : ''}
            </p>
          ) : (
            <p>
              서울을 육각 칸 {data.cells.h3.length.toLocaleString('ko-KR')}개로 나눠 칠했습니다. 업종을 고르면 매출 수준 · 새 가게 · 같은 업종도 칠해 볼 수 있어요. 칸을 누르면 그 자리 카드가 나옵니다.
            </p>
          )}
          {show === 'pot' && industry?.note && <p className="caution" data-testid="ind-note">{industry.note}</p>}
          {((kind && onVs) || score.length > 0) && (
            <div className="intro-acts">
              {kind && onVs && <button className="btn2 vs-btn" onClick={onVs} data-testid="vs-open">{unIntro ? '다른 무인 유형과 견주기' : '다른 업종과 견주기'}</button>}
              {score.length > 0 && (
                <button className="btn-quiet" onClick={toggleScore} aria-expanded={scoreOpen} aria-controls="score-body" data-testid="score-open">
                  이 지도, 얼마나 맞나요?
                </button>
              )}
            </div>
          )}
          {score.length > 0 && scoreOpen && (
            <div className="score-body" id="score-body" data-testid="score">
              <ScoreList lines={score} />
            </div>
          )}
        </section>
      )}
      {sel && seg}
      {sel && cardView}
      {!sel && cmp && <ScoreNote lines={score} sum={scoreSum} />}
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
