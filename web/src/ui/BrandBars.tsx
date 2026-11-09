import { won } from '../core/check'
import { comma } from '../core/format'
import type { UnType } from '../core/unm'

// 무인 유형 손익 — 가맹 브랜드마다 가맹점 평균 월매출 막대와 본전 매출 눈금 (예전 뷰어 beBrandChart).
// 값은 글자로도 적는다 — 막대는 길이만 말하고, 본전을 넘는 브랜드 수는 위 문장(unm.ts aboveText)이 말한다

export default function BrandBars({ u, S }: { u: UnType; S: number }) {
  const bs = [...u.brands].sort((a, b) => b.sales - a.sales)
  const top = Math.max(Number.isFinite(S) ? S : 0, ...bs.map((b) => b.sales)) * 1.08
  const x = (v: number) => `${Math.min(100, (v / top) * 100).toFixed(1)}%`
  return (
    <div className="brand-bars" data-testid="brand-bars">
      <ul>
        {bs.map((b) => (
          <li key={b.nm}>
            <span className="bb-nm">
              {b.nm}
              <span className="hint">{b.basis} 가맹점 {comma(b.stores)}곳 평균 · {b.year}년</span>
            </span>
            <span className="bb-track" aria-hidden="true">
              <i style={{ width: x(b.sales) }} />
              {Number.isFinite(S) && <b className="bb-be" style={{ left: x(S) }} />}
            </span>
            <span className="bb-v">{won(b.sales)}</span>
          </li>
        ))}
      </ul>
      {Number.isFinite(S) && (
        <p className="hint bb-key"><span className="bb-key-be" aria-hidden="true" /> 세로 눈금이 본전 매출(월 {won(S)}) — 막대는 가맹점 평균 월매출</p>
      )}
    </div>
  )
}
