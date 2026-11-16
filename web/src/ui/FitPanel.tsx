import type { FitModel } from '../core/fit'
import ShareButton from './ShareButton'

// 이 자리에 맞는 업종 — 자리 카드에서 연다. 줄을 누르면 그 업종으로 자리 카드가 바뀐다 (core/fit.ts)

interface Props {
  title: string
  model: FitModel | null
  err: boolean
  line: string | null
  onBack: () => void
  onKind: (code: string) => void
}

export default function FitPanel({ title, model, err, line, onBack, onKind }: Props) {
  return (
    <section className="card fit" aria-label="이 자리에 맞는 업종" data-testid="fit">
      <div className="card-head">
        <div>
          <h2>이 자리에 맞는 업종</h2>
          <div className="sub">{title}</div>
        </div>
        <button className="ghost" onClick={onBack} aria-label="자리 카드로" data-testid="fit-back">← 자리 카드</button>
      </div>
      {err ? (
        <p className="caution" role="alert">자료를 받지 못했어요 — 새로고침해 주세요.</p>
      ) : !model ? (
        <p className="hint" aria-busy="true">업종마다 이 자리 값을 모으는 중이에요…</p>
      ) : (
        <>
          <p className="acc-intro">
            업종마다 <strong>이 자리가 그 업종 칸들 가운데 어디쯤인지</strong> 순서대로예요. 업종끼리 매출 금액을 견준 것이 아니에요 — 위에 있을수록 그 업종에게 좋은 편인 자리예요.
          </p>
          {model.rows.length ? (
            <ol className="fit-list">
              {model.rows.map((r, j) => (
                <li key={r.k}>
                  <button onClick={() => onKind(r.code)} data-testid={`fit-row-${j + 1}`} aria-label={`${r.nm} 자리 카드로`}>
                    <span className="fit-nm"><strong>{r.nm}</strong> <span className="hint">{r.nearText} · {r.strength}</span></span>
                    <span className="fit-v"><strong>{r.upText}</strong> <span className="hint">{r.level}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="caution">가게가 드문 곳이라 업종별 매출 수준을 추정하지 않아요.</p>
          )}
          {model.rows.length > 0 && model.none.length > 0 && (
            <p className="note" data-testid="fit-none">이 자리에서 추정하지 않는 업종(주변 가게가 그 업종이 배운 상권보다 적음) {model.none.length}개 — {model.none.join(' · ')}</p>
          )}
          <p className="note">'상위 3%'는 그 업종을 칠한 서울 칸 100곳 중 3번째쯤이라는 뜻이에요. 같은 업종이 많으면 손님을 나눠 가져요. 추정값이라 줄을 눌러 자리 카드의 '얼마나 믿을 수 있나'를 함께 보세요.</p>
          <div className="card-acts">
            <ShareButton text={line} testid="fit-share" />
          </div>
        </>
      )}
    </section>
  )
}
