import type { CardTable } from '../core/breakeven'
import { verdictEasy, won } from '../core/check'
import { type UnSide, UN_EX, listWhen, unDiffThree, unExample, unRows } from '../core/unm'
import { CellView } from './ComparePanel'

// 무인 둘 견주기 (마스터플랜 W7.4 '업종 고르기'의 무인매장 묶음 · 와이어프레임 T1n "무인 아이스크림 vs 무인 카페")
// 차이 셋(가맹점 매출 · 창업비 · 흐름) → 같은 예시 비용으로 낸 본전 매출 ↔ 가맹점 평균 → 자세히 표 → 자리 찾기.
// 매출 · 창업비는 정보공개서의 브랜드 가운데 값이라 업종 247의 견주기(서울시 상권분석)와 섞지 않는다. 글자와 숫자는 core/unm.ts

interface Props {
  a: UnSide
  b: UnSide
  card: CardTable
  meta: { ftc: string; list: string }
  onEnd: () => void
  onFind: (code: string) => void
}

export default function UnComparePanel({ a, b, card, meta, onEnd, onFind }: Props) {
  const diffs = unDiffThree(a, b)
  const rows = unRows(a, b)
  const ex = [a, b].map((s) => ({ s, e: unExample(s, card) }))
  const top = Math.max(...ex.flatMap(({ e }) => [e.S, e.ref].filter(Number.isFinite))) * 1.06
  const w = (v: number) => `${Math.min(100, (v / top) * 100).toFixed(1)}%`
  return (
    <section className="kcmp" aria-label="무인 유형 견주기" data-testid="compare">
      <div className="card-head">
        <div>
          <h2 data-testid="cmp-title">{a.u.nm} vs {b.u.nm}</h2>
          <div className="sub">가맹 브랜드 정보공개서 · 서울시 무인점포 명단 {listWhen(meta.list)}</div>
        </div>
        <button className="ghost" onClick={onEnd} data-testid="cmp-end">견주기 끝</button>
      </div>

      <section className="diff3" aria-labelledby="diff3-h">
        <h3 id="diff3-h">차이 셋</h3>
        <ol>
          {diffs.map((d, i) => (
            <li key={d.key} data-testid={`diff-${d.key}`}>
              <span className="no" aria-hidden="true">{i + 1}</span>
              <span>
                <strong>{d.head}</strong> — {d.text}.
                {d.sub && <span className="hint diff-sub">{d.sub}</span>}
              </span>
            </li>
          ))}
        </ol>
        <p className="note">가맹점 매출 · 창업비는 가맹본부가 정보공개서에 낸 브랜드 평균의 가운데 값이에요 — 잘되는 가게 쪽으로 끌려 올라가 있고, 브랜드 없이 연 무인 가게는 볼 수 없어요.</p>
      </section>

      <section className="un-ex" aria-labelledby="unex-h" data-testid="un-ex">
        <h3 id="unex-h">같은 예시 비용이면 — 본전 매출</h3>
        <p className="hint">월세 {UN_EX.rent} · 관리비 {UN_EX.mgmt} · 기타 고정비 {UN_EX.other}만 원, 인건비 0, 창업비(가맹 보증금 뺌)는 {UN_EX.months / 12}년에 나눠 넣었어요. 원가율은 유형마다 달라요.</p>
        {ex.map(({ s, e }) => (
          <div className="unex" key={s.u.k} data-testid={`unex-${s.u.k}`}>
            <div className="unex-nm">{s.u.nm}</div>
            <div className="unex-bars">
              <span className="unex-l">본전 매출</span>
              <span className="unex-track" aria-hidden="true"><i className="unex-be" style={{ width: Number.isFinite(e.S) ? w(e.S) : '100%' }} /></span>
              <span className="unex-v">{Number.isFinite(e.S) ? won(e.S) : '없음'}</span>
              <span className="unex-l">가맹점 평균</span>
              <span className="unex-track" aria-hidden="true"><i className="unex-ref" style={{ width: w(e.ref) }} /></span>
              <span className="unex-v">{won(e.ref)}</span>
            </div>
            {Number.isFinite(e.S) && <p className="unex-say">본전이 가맹점 평균의 {Math.round(e.R * 100)}% — {verdictEasy(e.R, '가맹점 평균')}.</p>}
          </div>
        ))}
        <p className="note">면적이 다르면 월세도 달라요 — 보고 있는 매물 숫자로는 지도에서 칸을 골라 자리 카드의 [손익 따져보기]에서 봐요.</p>
      </section>

      <h3>자세히</h3>
      <div className="cmp-scroll">
        <table className="cmp-tab" data-testid="cmp-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr">항목</span></th>
              <th scope="col">{a.u.nm}</th>
              <th scope="col">{b.u.nm}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`cmp-${r.key}`}>
                <th scope="row">{r.label}{r.hint && <span className="hint cell-sub">{r.hint}</span>}</th>
                <td><CellView c={r.a} /></td>
                <td><CellView c={r.b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note">지도 위 [{a.u.nm} | {b.u.nm}]로 칠하는 유형을 바꿔요. 지도는 무인 가게(명단에서 찾은 곳) · 같은 업종 · 1층 임대료로 봐요.</p>
      <div className="cmp-acts">
        <button className="btn2" onClick={() => onFind(a.u.k)} data-testid="cmp-find-a">{a.u.nm} 자리 찾기</button>
        <button className="btn2" onClick={() => onFind(b.u.k)}>{b.u.nm} 자리 찾기</button>
      </div>
      <p className="note">출처: {meta.ftc} · 서울시 무인점포 현황({listWhen(meta.list)}) · 생존은 상가정보 분기 자료를 가게 단위로 이어 셈</p>
    </section>
  )
}
