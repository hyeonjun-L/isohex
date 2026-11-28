import type { CSSProperties } from 'react'
import { IcoClose, IcoWarn } from './icons'
import type { BoxCell, BoxRow } from '../core/box'
import { BOX_MAX } from '../core/box'
import ShareButton from './ShareButton'

// 비교함 (마스터플랜 W7.4 '비교함' · 와이어프레임 D3 · 화면 다시 잡기 S21 · W04) — 담은 자리 최대 5곳을 같은 줄로 나란히, 줄마다 가장 높은·낮은 값을 글자로.
// 지도는 위에서 보기 + 번호. 값은 지금 고른 업종으로 읽는다(core/box.ts).
// 폰은 옆으로 밀지 않게 항목마다 세 곳을 세로로(번호 · 값 · 표시 · 덧말), 모든 곳이 같은 값이면 한 줄('모두 번화가'). 데스크톱은 표(10단계에서 패널을 표 폭으로)

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
  /** 폰 — 표 대신 항목마다 세로 목록 */
  narrow?: boolean
}

/** 머리 꼬리표 — 기록(이 동네 가게당 월매출) · 추정(매출 수준). 자리 카드와 같은 말 */
const TAG: Record<string, { cls: string; nm: string }> = { sales: { cls: 'ktag ktag-rec', nm: '기록' }, pot: { cls: 'ktag ktag-est', nm: '추정' } }
/** 값 — 가까운 역은 '망원역 250m'처럼 이름과 거리를 한 덩이로 */
const cellV = (r: BoxRow, c: BoxCell) => (r.key === 'station' && !c.none && c.sub ? `${c.v} ${c.sub}` : c.v)
const cellSub = (r: BoxRow, c: BoxCell) => (r.key === 'station' && !c.none ? null : c.sub)

/** 폰 — 모든 곳이 같은 값이면 한 줄(이름 · 덧말 | 값): 자리 성격이 모두 같을 때('모두 번화가') · 생존(업종 값). 아니면 null */
function oneLine(r: BoxRow, heads: { title: string }[]): [string, string | undefined] | null {
  const c0 = r.cells?.[0]
  if (r.cells && c0 && r.cells.length > 1 && r.cells.every((c) => !c.none && !c.mark && !c.sub && c.v === c0.v)) return [`모두 ${c0.v}`, heads.map((h) => h.title).join(' · ')]
  if (r.span && r.key === 'surv') {
    const [v, sub] = r.span.split(' — ')
    return [v, sub]
  }
  return null
}

/** 폰 — 항목 하나: 머리(꼬리표 · 이름 · 덧말) + 곳마다 한 줄. 모든 곳이 같으면 한 줄 */
function BoxList({ r, heads }: { r: BoxRow; heads: { title: string; sub: string }[] }) {
  const tag = r.cells || r.key === 'pot' ? TAG[r.key] : undefined
  const label = tag?.nm === '추정' ? r.label.replace(/ \(추정\)$/, '') : r.label
  const one = oneLine(r, heads)
  if (one) {
    const [v, sub] = one
    return (
      <div className="krow box-one" data-testid={`box-${r.key}`}>
        <div className="krow-l">
          <div className="krow-label">{label}</div>
          {sub && <div className="krow-sub">{sub}</div>}
        </div>
        <div className="krow-v">{v}</div>
      </div>
    )
  }
  return (
    <section className="box-sec" data-testid={`box-${r.key}`}>
      <h3>{tag && <span className={tag.cls}>{tag.nm}</span>}{label}</h3>
      {r.hint && <p className="box-hint">{r.hint}</p>}
      {r.span ? (
        <p className="box-span">{r.span}</p>
      ) : (
        <ol className="box-cells">
          {r.cells!.map((c, j) => (
            <li key={j} className={`box-cell${c.none ? ' none' : ''}`}>
              <span className="box-n" aria-hidden="true">{j + 1}</span>
              <span className="bc-t">
                <span className="bc-v"><span className="sr">{heads[j]?.title ?? j + 1}: </span>{cellV(r, c)}{c.mark && <span className="mark-tag">{c.mark}</span>}</span>
                {cellSub(r, c) && <span className="bc-s">{cellSub(r, c)}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}


export default function BoxPanel({ box, heads, rows, kindNm, onCard, onRemove, onClear, onPickKind, onMap, narrow = false }: Props) {
  const n = box.length
  if (!n) {
    return (
      <section className="box" aria-label="비교함" data-testid="box">
        <h2>비교함</h2>
        <p className="hint">담은 자리가 없어요. 지도에서 칸을 눌러 자리 카드의 [비교함에 담기]로 {BOX_MAX}곳까지 담아 나란히 견줘요.</p>
        <button className="btn2" onClick={onMap} data-testid="tab-map">동네 보기로</button>
      </section>
    )
  }
  const note = '높은 값이 늘 좋은 건 아니에요 — 같은 업종이 많으면 손님을 나눠 갖고, 가게가 많은 곳은 임대료도 높아요. 매출 수준과 가게당 월매출은 추정값이에요.'
  return (
    <section className="box" aria-label="비교함" data-testid="box">
      <div className="card-head">
        <div>
          <h2 data-testid="box-title">비교함 — {kindNm ? `${kindNm} 자리` : '자리'} {n}곳</h2>
          <div className="sub">최대 {BOX_MAX}곳 · 줄마다 가장 높은 값과 낮은 값에 표시</div>
        </div>
        {/* 비교함 닫기 — 탭 대신 (화면 다시 잡기 11-25) */}
        <button className="icon-btn close-btn" onClick={onMap} aria-label="비교함 닫기 — 동네 보기로" data-testid="tab-map"><IcoClose size={20} /></button>
      </div>
      <div className="card-acts box-acts-top">
        <button className="btn2" onClick={onClear} data-testid="box-clear">모두 빼기</button>
        <ShareButton text={`비교함 — ${kindNm ? `${kindNm} 자리` : '자리'} ${n}곳: ${heads.map((h) => h.title).join(' · ')}`} label="공유" testid="box-share" />
      </div>
      {narrow && (
        // 폰 — 담은 곳 목록: 번호 · 이름 · [자리 카드] · 빼기(×)
        <ol className="box-places">
          {box.map((i, j) => (
            <li key={i}>
              <span className="box-no" aria-hidden="true">{j + 1}</span>
              <span className="bp-t"><b>{heads[j].title}</b> <span className="bp-gu">{heads[j].sub}</span></span>
              <button className="btn-text" onClick={() => onCard(i)} aria-label={`${j + 1} ${heads[j].title} 자리 카드`}>자리 카드</button>
              <button className="icon-btn close-btn" onClick={() => onRemove(i)} aria-label={`${j + 1} ${heads[j].title} 빼기`} data-testid={`box-remove-${j + 1}`}><IcoClose size={20} /></button>
            </li>
          ))}
        </ol>
      )}
      {!kindNm && (
        <div className="need-kind">
          <p>업종을 고르면 매출 수준 · 이 동네 가게당 월매출 · 같은 업종 수 · 생존도 견줘요.</p>
          <button className="btn2" onClick={onPickKind}>업종 고르기</button>
        </div>
      )}
      {!rows ? (
        <p className="hint" aria-busy="true">자리 값을 받는 중이에요…</p>
      ) : narrow ? (
        // 한 줄로 끝나는 항목(모두 같은 값)은 맨 아래에 모은다 (S21)
        <div className="box-list" data-testid="box-table">
          {[...rows.filter((r) => !oneLine(r, heads)), ...rows.filter((r) => oneLine(r, heads))].map((r) => <BoxList key={r.key} r={r} heads={heads} />)}
        </div>
      ) : (
        <div className="box-scroll">
          <table className="box-tab" data-testid="box-table" style={{ '--n': n } as CSSProperties}>
            <thead>
              <tr>
                <th scope="col">항목</th>
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
                      <td key={box[j]} className={`box-cell${c.none ? ' none' : ''}`}>
                        <span className="bc-v">{c.v}</span>
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
      <p className="knote"><IcoWarn size={16} /><span>{note}</span></p>
    </section>
  )
}
