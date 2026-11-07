import type { CSSProperties } from 'react'
import type { BoxRow } from '../core/box'
import { BOX_MAX } from '../core/box'

// 비교함 (마스터플랜 W7.4 '비교함' · 와이어프레임 D3) — 담은 자리 최대 5곳을 같은 줄로 나란히, 줄마다 가장 높은·낮은 값을 글자로.
// 지도는 위에서 보기 + 번호. 값은 지금 고른 업종으로 읽는다(core/box.ts)

interface Props {
  /** 담은 칸 — 담은 순서가 번호 */
  box: number[]
  heads: { title: string; sub: string }[]
  /** 받는 중이면 null */
  rows: BoxRow[] | null
  kindNm: string | null
  onCard: (i: number) => void
  onRemove: (i: number) => void
  onClear: () => void
  onPickKind: () => void
  onMap: () => void
}

export default function BoxPanel({ box, heads, rows, kindNm, onCard, onRemove, onClear, onPickKind, onMap }: Props) {
  const n = box.length
  if (!n) {
    return (
      <section className="box" aria-label="비교함" data-testid="box">
        <h2>비교함</h2>
        <p className="hint">담은 자리가 없어요. 지도에서 칸을 눌러 자리 카드의 [비교함에 담기]로 {BOX_MAX}곳까지 담아 나란히 견줘요.</p>
        <button className="btn2" onClick={onMap}>동네 보기로</button>
      </section>
    )
  }
  return (
    <section className="box" aria-label="비교함" data-testid="box">
      <div className="card-head">
        <div>
          <h2 data-testid="box-title">비교함 — {kindNm ? `${kindNm} 자리` : '자리'} {n}곳</h2>
          <div className="sub">최대 {BOX_MAX}곳 · 줄마다 가장 높은 값과 낮은 값에 표시</div>
        </div>
        <button className="ghost" onClick={onClear} data-testid="box-clear">모두 빼기</button>
      </div>
      {!kindNm && (
        <div className="need-kind">
          <p>업종을 고르면 매출 수준 · 이 동네 가게당 월매출 · 같은 업종 수 · 생존도 견줘요.</p>
          <button className="btn2" onClick={onPickKind}>업종 고르기</button>
        </div>
      )}
      {!rows ? (
        <p className="hint" aria-busy="true">자리 값을 받는 중이에요…</p>
      ) : (
        <div className="box-scroll">
          <table className="box-tab" data-testid="box-table" style={{ '--n': n } as CSSProperties}>
            <thead>
              <tr>
                <th scope="col"><span className="sr">항목</span></th>
                {heads.map((h, j) => (
                  <th scope="col" key={box[j]}>
                    <span className="box-no" aria-hidden="true">{j + 1}</span>
                    <span className="box-h">{h.title}<span className="hint cell-sub">{h.sub}</span></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid={`box-${r.key}`}>
                  <th scope="row">{r.label}{r.hint && <span className="hint cell-sub">{r.hint}</span>}</th>
                  {r.span ? (
                    <td colSpan={n}>{r.span}</td>
                  ) : (
                    r.cells!.map((c, j) => (
                      <td key={box[j]} className={c.none ? 'none' : undefined}>
                        {c.v}
                        {c.mark && <span className="mark-tag">{c.mark}</span>}
                        {c.sub && <span className="hint cell-sub">{c.sub}</span>}
                      </td>
                    ))
                  )}
                </tr>
              ))}
              <tr className="box-acts">
                <th scope="row"><span className="sr">할 일</span></th>
                {box.map((i, j) => (
                  <td key={i}>
                    <button className="btn2" onClick={() => onCard(i)} aria-label={`${j + 1} ${heads[j].title} 자리 카드`}>자리 카드</button>
                    <button className="btn2" onClick={() => onRemove(i)} aria-label={`${j + 1} ${heads[j].title} 빼기`} data-testid={`box-remove-${j + 1}`}>빼기</button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="note">높은 값이 늘 좋은 건 아니에요 — 같은 업종이 많으면 손님을 나눠 갖고, 가게가 많은 곳은 임대료도 높아요. 매출 수준과 가게당 월매출은 추정값이에요.</p>
    </section>
  )
}
