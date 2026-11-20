import { type CardModel, PICK_HINT } from '../core/card'
import { TIME_SHORT } from '../core/mix'
import ShareButton from './ShareButton'

// 자리 카드 화면 — core/card.ts가 만든 글자와 위치를 그린다 (와이어프레임 T2e·T2f).
// 단추: 손익 따져보기(손익 점검) · 비교함에 담기/빼기 · 여기서 후보 찾기(동네 보기에서) · 이 자리에 맞는 업종 · 공유
// 이 동네 손님은(요일 · 시간대 · 성별 · 나이 · 가게 드나듦)은 접어 두고 요약 한 줄만 · 링크(근처 상가 매물 · 거리 보기)는 새 창으로

interface Props {
  card: CardModel
  onClose: () => void
  /** 후보 찾기에서 연 카드 — 머리('후보 3 · 자동차 18분')와 왜 후보인가/빠졌나 */
  ctx?: { head: string; why: string } | null
  /** 동네 보기에서 — 이 칸을 기준점으로 후보 찾기 */
  onFindHere?: (() => void) | null
  /** 이 자리에서 매물 숫자로 손익 점검 */
  onCheck?: (() => void) | null
  /** 비교함 — 담았나 · 다 찼나(5곳) */
  box?: { boxed: boolean; full: boolean; onBox: () => void } | null
  /** 닫기 단추 글자를 바꿀 때 — 비교함에서 연 카드는 '← 비교함' */
  back?: string | null
  /** 이 자리에 맞는 업종(거꾸로 찾기) 열기 */
  onFit?: (() => void) | null
}

/** 시간대 막대 여섯 — 막대는 이 동네, 가는 선은 서울 같은 업종 */
function TimeBars({ here, seoul }: { here: number[]; seoul: number[] | null }) {
  const top = Math.max(...here, ...(seoul ?? []), 1) * 1.12 // 가장 높은 서울 선이 상자 위 끝에 걸려 잘리지 않게
  const say = here.map((v, j) => `${TIME_SHORT[j]} ${v}%${seoul ? `(서울 ${seoul[j]}%)` : ''}`).join(', ')
  return (
    <div className="tbars" role="img" aria-label={`시간대별 매출 몫 — ${say}`} data-testid="mix-bars">
      {here.map((v, j) => (
        <div key={j} className="tbar">
          <div className="tbar-box">
            <i className="tbar-v" style={{ height: `${(v / top) * 100}%` }} />
            {seoul && <i className="tbar-s" style={{ bottom: `${(seoul[j] / top) * 100}%` }} />}
          </div>
          <span className="tbar-n">{v}%</span>
          <span className="hint">{TIME_SHORT[j]}</span>
        </div>
      ))}
    </div>
  )
}

export default function PlaceCard({ card, onClose, ctx = null, onFindHere = null, onCheck = null, box = null, back = null, onFit = null }: Props) {
  const num = card.n300.match(/^(반경 300m 가게 )([\d,]+곳)(.*)$/)
  return (
    <section className="card" aria-label="고른 칸">
      <div className="card-head">
        <div>
          <h2>{card.title}</h2>
          <div className="sub" data-testid="card-sub">{card.sub}</div>
        </div>
        <button className="ghost" onClick={onClose} aria-label={back ? '비교함으로' : ctx ? '후보 목록으로' : '고른 칸 지우기'}>{back ?? (ctx ? '← 목록' : '닫기')}</button>
      </div>
      {ctx && (
        <div className="find-ctx" data-testid="find-ctx">
          <strong>{ctx.head}</strong>
          <p>{ctx.why}</p>
        </div>
      )}
      <p className="oneline" data-testid="oneline">{card.line}</p>
      {card.facts.length ? (
        <dl className="facts4">
          {card.facts.map((f) => (
            <div key={f.key} className={`f4${f.none ? ' f4-none' : ''}${f.wide ? ' f4-wide' : ''}`} data-testid={`fact-${f.key}`}>
              <dt>{f.label}</dt>
              <dd className="f4-v" data-testid={f.key === 'pot' ? 'level' : f.key === 'rec' ? 'rec' : undefined}>{f.value}</dd>
              <dd className="hint">{f.sub}</dd>
              <dd className="pos" aria-hidden="true">{f.pos != null && <i style={{ left: `${Math.round(f.pos * 100)}%` }} />}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="hint pick-hint">{PICK_HINT}</p>
      )}
      {card.cmp && <p className="cmp" data-testid="cmp">{card.cmp}</p>}
      {card.mix && (
        <details className="acc mix" data-testid="mix">
          <summary>
            <span className="mix-head">
              이 동네 손님은
              <span className="hint mix-sum" data-testid="mix-sum">{card.mix.sum}</span>
            </span>
          </summary>
          <p className="hint mix-where">{card.mix.where} · 카드 결제 기준</p>
          <dl className="mix-lines">
            {card.mix.lines.map((l) => (
              <div key={l.key} data-testid={`mix-${l.key}`}>
                <dt>{l.label}</dt>
                <dd><b>{l.value}</b>{l.note && <span className="hint"> — {l.note}</span>}</dd>
              </div>
            ))}
          </dl>
          <TimeBars here={card.mix.time.here} seoul={card.mix.time.seoul} />
          {card.mix.time.seoul && <p className="hint">막대는 이 동네, 가는 선은 서울 같은 업종이에요.</p>}
          <p className="hint">{card.mix.caveat}</p>
        </details>
      )}
      <p className="note">
        {num ? (
          <>
            {num[1]}<strong data-testid="n300">{num[2]}</strong>{num[3]}
          </>
        ) : card.n300}
        {card.facts.some((f) => f.pos != null) && ' · 막대는 서울 안 위치, 오른쪽일수록 높음'}
        {card.cmp && ' · 가게당 월매출은 지금 있는 가게들의 평균, 매출 수준은 자리로 본 추정이에요'}
      </p>
      {card.why && (
        <details className="acc">
          <summary>왜 이 값인가</summary>
          <p className="acc-intro">{card.why.intro}</p>
          <table className="why">
            <tbody>
              {card.why.rows.map((r) => (
                <tr key={r.text}>
                  <td>{r.text} <span className="hint">{r.side}</span></td>
                  <td className="x">{r.x}</td>
                </tr>
              ))}
              <tr className="why-total">
                <td>모두 곱하면</td>
                <td className="x">{card.why.total}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">{card.why.note}</p>
        </details>
      )}
      <details className="acc">
        <summary>얼마나 믿을 수 있나</summary>
        <ul className="trust">
          {card.trust.map((t) => (
            <li key={t.title} data-testid={t.title.startsWith('모형의 힘') ? 'strength' : undefined}>
              <span className={`mark${t.mark === '✓' ? ' mark-ok' : ''}`} aria-hidden="true">{t.mark}</span>
              <span><strong>{t.title}</strong> — {t.text}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="card-acts">
        {onCheck && <button className="btn2 btn-ink" onClick={onCheck} data-testid="check-open">손익 따져보기</button>}
        {box && (
          <button className="btn2" onClick={box.onBox} disabled={!box.boxed && box.full} data-testid="box-toggle">
            {box.boxed ? '비교함에서 빼기' : '비교함에 담기'}
          </button>
        )}
        {onFindHere && <button className="btn2" onClick={onFindHere} data-testid="find-here">여기서 후보 찾기</button>}
        {onFit && <button className="btn2" onClick={onFit} data-testid="fit-open">이 자리에 맞는 업종</button>}
        <ShareButton text={`${card.title} — ${card.line}`} testid="card-share" />
      </div>
      {card.links.length > 0 && (
        <div className="out-links" aria-label="다른 서비스에서 보기" data-testid="out-links">
          {card.links.map((l) => (
            <a key={l.key} className="out-link" href={l.href} target="_blank" rel="noopener noreferrer" data-testid={`link-${l.key}`}>
              {l.label} <span className="hint">{l.sub} ↗</span>
            </a>
          ))}
        </div>
      )}
      {box && !box.boxed && box.full && <p className="note" role="status">비교함이 찼어요(5곳) — 하나를 빼고 담으세요.</p>}
      <p className="note">{card.foot}</p>
    </section>
  )
}
