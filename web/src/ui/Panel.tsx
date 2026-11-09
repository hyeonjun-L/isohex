import type { CSSProperties, ReactNode } from 'react'
import type { CardModel } from '../core/card'
import type { BaseData, Industry } from '../core/data'
import type { Kind } from '../core/kinds'
import type { LegendSpec, Show } from '../core/layers'
import PlaceCard from './PlaceCard'
import { BASE_COLORS, SHOW_COLORS, rgbaCss, type Theme } from '../map/palette'

interface Props {
  data: BaseData
  /** 매출 수준을 칠하는 업종 (고른 업종에 있으면) */
  industry: Industry | null
  /** 고른 업종 (상가정보 소분류) */
  kind: Kind | null
  /** 무인 유형이면 첫머리 문장 (core/unm.ts unIntro) */
  unIntro: string | null
  card: CardModel | null
  /** 지금 지도에 칠한 지표와 범례 */
  show: Show | null
  legend: LegendSpec | null
  theme: Theme
  selected: number | null
  onClear: () => void
  /** 처음 화면 · 동네 보기 · 후보 찾기 */
  tab: Tab
  onTab: (t: Exclude<Tab, 'home'>) => void
  /** 처음 화면 · 후보 찾기 패널 */
  home: ReactNode
  find: ReactNode
  /** 폰 아래 시트 높이 */
  sheet: Sheet
  onSheet: (s: Sheet) => void
  /** 후보 찾기에서 고른 칸의 머리와 '왜' */
  ctx: { head: string; why: string } | null
  /** 동네 보기 카드의 '여기서 후보 찾기' */
  onFindHere: (() => void) | null
  /** 카드의 '손익 따져보기' — 열면 카드 자리에 손익 점검(check)이 선다 */
  onCheck: () => void
  check: ReactNode | null
  /** 동네 보기 — 업종 둘 견주기(있으면 첫머리 안내 대신) · '다른 업종과 견주기' */
  cmp: ReactNode | null
  onVs: (() => void) | null
  /** 비교함 — 담은 곳 수(0이면 탭을 감춘다) · 화면 · 카드의 담기 단추 */
  boxN: number
  box: ReactNode
  boxBtn: { boxed: boolean; full: boolean; onBox: () => void } | null
  /** 데스크톱 패널 너비(px) — 비교함은 넓다 */
  width: number
}

export type Tab = 'home' | 'map' | 'find' | 'box'
export type Sheet = 'peek' | 'half' | 'full'
/** 시트가 덮는 지도 높이 몫 — styles.css의 시트 높이와 맞춘다 */
export const SHEET_FRAC: Record<Sheet, number> = { peek: 0.22, half: 0.44, full: 0.86 }
const SHEET_NEXT: Record<Sheet, Sheet> = { half: 'full', full: 'peek', peek: 'half' }
const SHEET_NM: Record<Sheet, string> = { half: '패널 크게', full: '지도 크게', peek: '패널 반만' }

function Legend({ show, legend, theme }: { show: Show; legend: LegendSpec; theme: Theme }) {
  const cols = SHOW_COLORS[show][theme]
  const B = BASE_COLORS[theme]
  return (
    <div className="legend" aria-label="범례" data-testid="legend">
      <div className="legend-title" data-testid="legend-title">{legend.title}</div>
      {legend.sub && <div className="legend-sub">{legend.sub}</div>}
      <ul>
        {legend.items.map((it) => (
          <li key={it.label}>
            <span className="sw" style={{ background: cols[it.c] }} aria-hidden="true" />
            {it.label}
          </li>
        ))}
        {legend.none && (
          <li>
            <span
              className="sw sw-none"
              style={{
                backgroundColor: B.land,
                backgroundImage: legend.none.look === 'hatch' ? `repeating-linear-gradient(135deg, ${rgbaCss(B.hatch)} 0 1px, transparent 1px 4px)` : undefined,
              }}
              aria-hidden="true"
            />
            {legend.none.label}
          </li>
        )}
      </ul>
    </div>
  )
}

export default function Panel({ data, industry, kind, unIntro, card, show, legend, theme, selected, onClear, tab, onTab, home, find, ctx, onFindHere, onCheck, check, cmp, onVs, boxN, box, boxBtn, width, sheet, onSheet }: Props) {
  const sel = selected != null
  const cardView = check ?? (card ? (
    <PlaceCard card={card} onClose={onClear} ctx={tab === 'find' ? ctx : null} onFindHere={tab === 'map' ? onFindHere : null} onCheck={onCheck} box={boxBtn} back={tab === 'box' ? '← 비교함' : null} />
  ) : (
    <section className="card" aria-busy="true"><p className="hint">자리 카드를 불러오는 중…</p></section>
  ))
  return (
    <aside className={`panel sheet-${sheet}${tab === 'box' ? ' panel-box' : ''}`} style={{ '--pw': `${width}px` } as CSSProperties}>
      {/* 폰에서만 보인다 — 누를 때마다 크게 → 지도 크게(살짝) → 반 */}
      <button className="sheet-handle" onClick={() => onSheet(SHEET_NEXT[sheet])} aria-label={SHEET_NM[sheet]} data-testid="sheet-handle">
        <i aria-hidden="true" />
      </button>
      <div className="tabs" role="tablist" aria-label="보기">
        <button role="tab" aria-selected={tab === 'map'} onClick={() => onTab('map')} data-testid="tab-map">동네 보기</button>
        <button role="tab" aria-selected={tab === 'find'} onClick={() => onTab('find')} data-testid="tab-find">후보 찾기</button>
        {(boxN > 0 || tab === 'box') && (
          <button role="tab" aria-selected={tab === 'box'} onClick={() => onTab('box')} data-testid="tab-box">비교함 <span className="tab-n">{boxN}</span></button>
        )}
      </div>
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
      {show && legend && !(sel && check) && <Legend show={show} legend={legend} theme={theme} />}
      </div>
      )}
      <footer className="panel-foot">
        자료 판 <code>{data.ver}</code> · 매출 수준 모형 {data.manifest.made}
        {data.manifest.sales ? ` (매출 ${data.manifest.sales} · 가게 수 상가정보 ${data.manifest.snapshot})` : ''} · 행정동 임대시세는 아직 넣지 않았습니다
      </footer>
    </aside>
  )
}
