import type { BaseData, Industry } from '../core/data'
import { splitDong } from '../core/data'
import { LEVEL_LABELS, STORE_LABELS, levelClass, levelText, strength, toPct } from '../core/level'
import { BASE_COLORS, LEVEL_COLORS, STORE_COLORS, rgbaCss, type Theme } from '../map/palette'
import type { Mode } from '../map/MapView'

interface Props {
  data: BaseData
  industry: Industry | null
  values: (number | null)[] | null
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

export default function Panel({ data, industry, values, mode, theme, selected, onClear }: Props) {
  const sel = selected != null
  const place = sel ? splitDong(data.dongs[data.cells.dong[selected]]) : null
  const pct = sel && values ? toPct(values[selected]) : null
  const n300 = sel ? data.cells.n300[selected] : null

  return (
    <aside className="panel" aria-live="polite">
      {!sel && (
        <section className="intro">
          <h2>서울 칸 지도 (시험판)</h2>
          <p>
            서울을 육각 칸 {data.cells.h3.length.toLocaleString('ko-KR')}개로 나눠 칠했습니다. {industry ? `지금은 ${industry.nm} 매출 수준(추정)입니다.` : '업종을 고르기 전에는 가게가 모인 정도를 보여 줍니다.'} 칸을 누르면 그 자리 숫자가 나옵니다.
          </p>
          {industry?.note && <p className="caution" data-testid="ind-note">{industry.note}</p>}
        </section>
      )}
      {sel && place && (
        <section className="card" aria-label="고른 칸">
          <div className="card-head">
            <div>
              <h2>{place.dong}</h2>
              <div className="sub">{place.gu}</div>
            </div>
            <button className="ghost" onClick={onClear} aria-label="고른 칸 지우기">닫기</button>
          </div>
          <dl className="facts">
            {industry && (
              <div className="fact">
                <dt>{industry.nm} 매출 수준(추정)</dt>
                <dd>
                  <strong data-testid="level">{levelText(pct)}</strong>
                  {pct != null && <span className="hint"> · 서울 이 업종 평균 상권보다</span>}
                  {pct != null && (
                    <span className="chip" style={{ background: LEVEL_COLORS[theme][levelClass(pct)] }} aria-hidden="true" />
                  )}
                </dd>
                {pct == null && <dd className="hint">가게가 드문 곳이라 모형이 본 적 없는 자리입니다</dd>}
                <dd className="hint" data-testid="strength">
                  모형의 힘 {strength(industry.rho)} · 처음 보는 구에서 상권 매출 순서를 맞힌 정도 {industry.rho.toFixed(2)} (1이면 완벽, 0이면 운)
                </dd>
              </div>
            )}
            <div className="fact">
              <dt>반경 300m 가게 수</dt>
              <dd><strong data-testid="n300">{n300?.toLocaleString('ko-KR')}곳</strong> <span className="hint">(상가정보 {data.manifest.snapshot})</span></dd>
            </div>
          </dl>
          {industry?.note && <p className="caution" data-testid="ind-note">{industry.note}</p>}
          <p className="note">추정값입니다 — 실제 매출이 아니며, 상권 단위로 배운 관계를 칸에 옮긴 것입니다.</p>
        </section>
      )}
      <Legend mode={mode} theme={theme} />
      <footer className="panel-foot">
        자료 판 <code>{data.ver}</code> · 매출 수준 모형 {data.manifest.made}
        {data.manifest.sales ? ` (매출 ${data.manifest.sales} · 가게 수 상가정보 ${data.manifest.snapshot})` : ''} · 행정동 임대시세는 아직 넣지 않았습니다
      </footer>
    </aside>
  )
}
