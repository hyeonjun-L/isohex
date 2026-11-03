import type { CardModel } from '../core/card'
import type { BaseData, Industry } from '../core/data'
import type { Kind } from '../core/kinds'
import { LEVEL_LABELS, STORE_LABELS } from '../core/level'
import PlaceCard from './PlaceCard'
import { BASE_COLORS, LEVEL_COLORS, STORE_COLORS, rgbaCss, type Theme } from '../map/palette'
import type { Mode } from '../map/MapView'

interface Props {
  data: BaseData
  industry: Industry | null
  /** 고른 업종 (상가정보 소분류) */
  kind: Kind | null
  card: CardModel | null
  mode: Mode
  theme: Theme
  selected: number | null
  onClear: () => void
}

function Legend({ mode, theme }: { mode: Mode; theme: Theme }) {
  const cols = mode === 'level' ? LEVEL_COLORS[theme] : STORE_COLORS[theme]
  const labels = mode === 'level' ? LEVEL_LABELS : STORE_LABELS
  return (
    <div className="legend" aria-label="범례">
      <div className="legend-title">{mode === 'level' ? '매출 수준(추정) — 서울 이 업종 평균 상권 대비' : '가게가 모인 정도 — 반경 300m 가게 수'}</div>
      <ul>
        {labels.map((l, i) => (
          <li key={l}>
            <span className="sw" style={{ background: cols[i] }} aria-hidden="true" />
            {l}
          </li>
        ))}
        {mode === 'level' && (
          <li>
            <span
              className="sw sw-none"
              style={{
                backgroundColor: BASE_COLORS[theme].land,
                backgroundImage: `repeating-linear-gradient(135deg, ${rgbaCss(BASE_COLORS[theme].hatch)} 0 1px, transparent 1px 4px)`,
              }}
              aria-hidden="true"
            />
            추정하지 않음 (가게가 드문 곳)
          </li>
        )}
      </ul>
    </div>
  )
}

export default function Panel({ data, industry, kind, card, mode, theme, selected, onClear }: Props) {
  const sel = selected != null
  return (
    <aside className="panel" aria-live="polite">
      {!sel && (
        <section className="intro">
          <h2>{kind ? kind.nm : '서울 칸 지도 (시험판)'}</h2>
          {kind ? (
            <p>
              서울 {kind.nm} {kind.n.toLocaleString('ko-KR')}곳 · 새 가게 1년 생존 {kind.s12 ? `${Math.round(kind.s12[0] * 100)}%` : '—'}.{' '}
              {industry ? `지도는 ${industry.nm} 매출 수준(추정)입니다.` : '이 업종은 자리별 매출 수준을 추정하지 않아 지도는 가게가 모인 정도입니다.'} 칸을 누르면 그 자리 카드가 나옵니다.
            </p>
          ) : (
            <p>
              서울을 육각 칸 {data.cells.h3.length.toLocaleString('ko-KR')}개로 나눠 칠했습니다. 업종을 고르기 전에는 가게가 모인 정도를 보여 줍니다. 칸을 누르면 그 자리 카드가 나옵니다.
            </p>
          )}
          {industry?.note && <p className="caution" data-testid="ind-note">{industry.note}</p>}
        </section>
      )}
      {sel && (card ? <PlaceCard card={card} onClose={onClear} /> : <section className="card" aria-busy="true"><p className="hint">자리 카드를 불러오는 중…</p></section>)}
      <Legend mode={mode} theme={theme} />
      <footer className="panel-foot">
        자료 판 <code>{data.ver}</code> · 매출 수준 모형 {data.manifest.made}
        {data.manifest.sales ? ` (매출 ${data.manifest.sales} · 가게 수 상가정보 ${data.manifest.snapshot})` : ''} · 행정동 임대시세는 아직 넣지 않았습니다
      </footer>
    </aside>
  )
}
