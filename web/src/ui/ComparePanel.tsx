import { type Cell, type Side, compareRows, diffThree, quarterText } from '../core/compare'

// 업종 둘 견주기 (마스터플랜 W7.4 '업종 고르기' · 와이어프레임 T1b · 과제 T1 "카페와 빵집 중 뭐가 나을까 — 2분 안에 차이 셋")
// 동네 보기 패널 첫머리에 선다. 지도 위 [A | B]가 칠하는 업종을 바꾸고, 칸을 누르면 그 업종으로 자리 카드 · 손익 점검이 나온다.
// 글자와 숫자는 core/compare.ts

interface Props {
  a: Side
  b: Side
  meta: { poi: string; period: string; year: number }
  onEnd: () => void
  onFind: (code: string) => void
}

/** 표 칸 — 단위(원 · 곳)는 숫자에 붙이고, 범위는 '~' 뒤에서만 줄을 바꾼다 */
const tidy = (v: string) => v.replace(/ (원|곳)/g, '\u00a0$1').replace(/~/g, '~\u200b')

function CellView({ c }: { c: Cell }) {
  const v = tidy(c.v)
  return (
    <>
      {c.strong ? <b>{v}</b> : v}
      {c.sub && <span className="hint cell-sub">{c.sub}</span>}
    </>
  )
}

export default function ComparePanel({ a, b, meta, onEnd, onFind }: Props) {
  const diffs = diffThree(a, b)
  const rows = compareRows(a, b, meta)
  return (
    <section className="kcmp" aria-label="업종 견주기" data-testid="compare">
      <div className="card-head">
        <div>
          <h2 data-testid="cmp-title">{a.k.nm} vs {b.k.nm}</h2>
          <div className="sub">서울 · 가게 수 {quarterText(meta.poi)} · 매출 {meta.year}년</div>
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
        <p className="note">가게당 매출은 &apos;가게가 있는 상권들의 가운데 값&apos;이에요(카드 결제로 만든 추정). 같은 업종 안에서도 자리와 가게에 따라 차이가 커요.</p>
      </section>

      <h3>자세히</h3>
      <div className="cmp-scroll">
        <table className="cmp-tab" data-testid="cmp-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr">항목</span></th>
              <th scope="col">{a.k.nm}</th>
              <th scope="col">{b.k.nm}</th>
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

      <p className="note">지도 위 [{a.k.nm} | {b.k.nm}]로 칠하는 업종을 바꿔요. 칸을 누르면 그 업종으로 자리 카드가 나오고, 매물이 있으면 카드에서 [손익 따져보기].</p>
      <div className="cmp-acts">
        <button className="btn2" onClick={() => onFind(a.k.c)} data-testid="cmp-find-a">{a.k.nm} 자리 찾기</button>
        <button className="btn2" onClick={() => onFind(b.k.c)}>{b.k.nm} 자리 찾기</button>
      </div>
      <p className="note">출처: 소상공인 상가정보 {quarterText(meta.poi)} · 서울시 상권분석서비스 추정매출({meta.year}년 네 분기) · 생존은 상가정보 분기 자료를 가게 단위로 이어 셈</p>
    </section>
  )
}
