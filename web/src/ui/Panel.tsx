import type { ReactNode } from 'react'
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
  card: CardModel | null
  /** 지금 지도에 칠한 지표와 범례 */
  show: Show | null
  legend: LegendSpec | null
  theme: Theme
  selected: number | null
  onClear: () => void
  /** 동네 보기 · 후보 찾기 */
  tab: 'map' | 'find'
  onTab: (t: 'map' | 'find') => void
  /** 후보 찾기 패널 */
  find: ReactNode
  /** 후보 찾기에서 고른 칸의 머리와 '왜' */
  ctx: { head: string; why: string } | null
  /** 동네 보기 카드의 '여기서 후보 찾기' */
  onFindHere: (() => void) | null
}

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

export default function Panel({ data, industry, kind, card, show, legend, theme, selected, onClear, tab, onTab, find, ctx, onFindHere }: Props) {
  const sel = selected != null
  const cardView = card ? (
    <PlaceCard card={card} onClose={onClear} ctx={tab === 'find' ? ctx : null} onFindHere={tab === 'map' ? onFindHere : null} />
  ) : (
    <section className="card" aria-busy="true"><p className="hint">자리 카드를 불러오는 중…</p></section>
  )
  return (
    <aside className="panel">
      <div className="tabs" role="tablist" aria-label="보기">
        <button role="tab" aria-selected={tab === 'map'} onClick={() => onTab('map')} data-testid="tab-map">동네 보기</button>
        <button role="tab" aria-selected={tab === 'find'} onClick={() => onTab('find')} data-testid="tab-find">후보 찾기</button>
      </div>
      {tab === 'find' ? (sel ? cardView : find) : (
      <div className="tab-body" aria-live="polite">
      {!sel && (
        <section className="intro">
          <h2>{kind ? kind.nm : '서울 칸 지도 (시험판)'}</h2>
          {kind ? (
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
        </section>
      )}
      {sel && cardView}
      {show && legend && <Legend show={show} legend={legend} theme={theme} />}
      </div>
      )}
      <footer className="panel-foot">
        자료 판 <code>{data.ver}</code> · 매출 수준 모형 {data.manifest.made}
        {data.manifest.sales ? ` (매출 ${data.manifest.sales} · 가게 수 상가정보 ${data.manifest.snapshot})` : ''} · 행정동 임대시세는 아직 넣지 않았습니다
      </footer>
    </aside>
  )
}
