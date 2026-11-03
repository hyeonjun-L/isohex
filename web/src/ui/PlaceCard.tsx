import { useState } from 'react'
import { type CardModel, PICK_HINT } from '../core/card'

// 자리 카드 화면 — core/card.ts가 만든 글자와 위치를 그린다 (와이어프레임 T2e·T2f).
// 손익 따져보기 · 비교함 · 여기서 후보 찾기는 그 화면을 만들 때 단추를 붙인다

interface Props {
  card: CardModel
  onClose: () => void
}

export default function PlaceCard({ card, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }
  const num = card.n300.match(/^(반경 300m 가게 )([\d,]+곳)(.*)$/)
  return (
    <section className="card" aria-label="고른 칸">
      <div className="card-head">
        <div>
          <h2>{card.title}</h2>
          <div className="sub" data-testid="card-sub">{card.sub}</div>
        </div>
        <button className="ghost" onClick={onClose} aria-label="고른 칸 지우기">닫기</button>
      </div>
      <p className="oneline" data-testid="oneline">{card.line}</p>
      {card.facts.length ? (
        <dl className="facts4">
          {card.facts.map((f) => (
            <div key={f.key} className={`f4${f.none ? ' f4-none' : ''}`} data-testid={`fact-${f.key}`}>
              <dt>{f.label}</dt>
              <dd className="f4-v" data-testid={f.key === 'pot' ? 'level' : undefined}>{f.value}</dd>
              <dd className="hint">{f.sub}</dd>
              <dd className="pos" aria-hidden="true">{f.pos != null && <i style={{ left: `${Math.round(f.pos * 100)}%` }} />}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="hint pick-hint">{PICK_HINT}</p>
      )}
      <p className="note">
        {num ? (
          <>
            {num[1]}<strong data-testid="n300">{num[2]}</strong>{num[3]}
          </>
        ) : card.n300}
        {card.facts.some((f) => f.pos != null) && ' · 막대는 서울 안 위치, 오른쪽일수록 높음'}
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
        <button className="btn2" onClick={copy}>{copied ? '복사했어요' : '링크 복사'}</button>
      </div>
      <p className="note">추정값이에요 — 실제 매출이 아니라, 상권 단위로 배운 관계를 칸에 옮긴 것입니다.</p>
    </section>
  )
}
