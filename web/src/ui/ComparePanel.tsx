import type { ReactNode } from 'react'
import Fold from './Fold'
import ShareButton from './ShareButton'
import { IcoInfo, IcoLeft, IcoPin } from './icons'
import { type Cell, type Side, compareRows, diffThree, quarterText } from '../core/compare'

// 업종 둘 견주기 (마스터플랜 W7.4 '업종 고르기' · 와이어프레임 T1b · 과제 T1 "카페와 빵집 중 뭐가 나을까 — 2분 안에 차이 셋" · 화면 다시 잡기 S20)
// 동네 보기 패널 첫머리에 선다. 머리 아래 [A 지도 | B 지도](ui/KindSeg)가 칠하는 업종을 바꾸고, 칸을 누르면 그 업종으로 자리 카드 · 손익 점검이 나온다.
// 차이 셋은 17px 문장(굵은 머리 + 숫자 — 덧말), 숫자 열 가지 표는 '자세히' 접는 줄 안. 글자와 숫자는 core/compare.ts

interface Props {
  a: Side
  b: Side
  meta: { poi: string; period: string; year: number }
  /** 업종 안에 든 무인 유형 — '카페에는 무인 카페도 들어 있어요' (와이어프레임 T1b) */
  inside: { kind: string; un: string }[]
  /** [A 지도 | B 지도] — 머리 바로 아래 */
  seg?: ReactNode
  onEnd: () => void
  onFind: (code: string) => void
}

/** 표 칸 — 단위(원 · 곳)는 숫자에 붙이고, 범위는 '~' 뒤에서만 줄을 바꾼다 */
export const tidy = (v: string) => v.replace(/ (원|곳)/g, '\u00a0$1').replace(/~/g, '~\u200b')

export function CellView({ c }: { c: Cell }) {
  const v = tidy(c.v)
  return (
    <>
      {c.strong ? <b>{v}</b> : v}
      {c.sub && <span className="hint cell-sub">{c.sub}</span>}
    </>
  )
}

const K_COUNT = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한', '열두']
/** 10 → '열 가지' — 접는 줄 요약('숫자 열 가지를 나란히') */
export const countText = (n: number) => `${K_COUNT[n - 1] ?? n} 가지`

/** 견주기 머리 — 이름 vs 이름 · 덧말 · [← 견주기 끝] */
export function CmpHead({ title, sub, onEnd }: { title: string; sub: string; onEnd: () => void }) {
  return (
    <div className="card-head">
      <div>
        <h2 data-testid="cmp-title">{title}</h2>
        <div className="sub">{sub}</div>
      </div>
      <button className="btn-quiet btn-back" onClick={onEnd} data-testid="cmp-end"><IcoLeft size={18} />견주기 끝</button>
    </div>
  )
}

/** 차이 셋 — 번호 동그라미 + 굵은 머리(17px) + 숫자 — 덧말(15px). 화면 읽기는 머리와 숫자 사이를 ' — '로 */
export function DiffThree({ diffs }: { diffs: { key: string; head: string; text: string; sub?: string | null }[] }) {
  return (
    <section className="diff3" aria-labelledby="diff3-h">
      <h3 id="diff3-h">차이 셋</h3>
      <ol>
        {diffs.map((d, i) => (
          <li key={d.key} data-testid={`diff-${d.key}`}>
            <span className="no" aria-hidden="true">{i + 1}</span>
            <span className="d-t">
              <strong className="d-h">{d.head}</strong>
              <span className="sr"> — </span>
              <span className="d-s">{d.text}{d.sub ? ` — ${d.sub}` : ''}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** 자세히 — 숫자 표(항목 · A · B)를 접는 줄 안에 */
export function CmpTable({ a, b, rows }: { a: string; b: string; rows: { key: string; label: string; hint?: string | null; a: Cell; b: Cell }[] }) {
  return (
    <Fold title="자세히" sum={`숫자 ${countText(rows.length)}를 나란히`} testid="cmp-more">
      <div className="cmp-scroll">
        <table className="cmp-tab" data-testid="cmp-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">{a}</th>
              <th scope="col">{b}</th>
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
    </Fold>
  )
}

/** 자리 찾기 둘 + 공유 */
export function CmpActs({ a, b, share, onFind }: { a: { c: string; nm: string }; b: { c: string; nm: string }; share: string; onFind: (code: string) => void }) {
  return (
    <div className="cmp-acts">
      <button className="btn2" onClick={() => onFind(a.c)} data-testid="cmp-find-a"><IcoPin size={18} />{a.nm} 자리 찾기</button>
      <button className="btn2" onClick={() => onFind(b.c)}><IcoPin size={18} />{b.nm} 자리 찾기</button>
      <ShareButton text={share} label="공유" testid="cmp-share" />
    </div>
  )
}

export default function ComparePanel({ a, b, meta, inside, seg = null, onEnd, onFind }: Props) {
  const diffs = diffThree(a, b)
  const rows = compareRows(a, b, meta)
  return (
    <section className="kcmp" aria-label="업종 견주기" data-testid="compare">
      <CmpHead title={`${a.k.nm} vs ${b.k.nm}`} sub={`서울 · 가게 수 ${quarterText(meta.poi)} · 매출 ${meta.year}년`} onEnd={onEnd} />
      {seg}
      <DiffThree diffs={diffs} />
      <p className="knote"><IcoInfo size={16} /><span>가게당 매출은 &apos;가게가 있는 상권들의 가운데 값&apos;이에요(카드 결제로 만든 추정). 같은 업종 안에서도 자리와 가게에 따라 차이가 커요.</span></p>
      {inside.map((x) => (
        <p key={x.un} className="knote" data-testid="cmp-inside">
          <IcoInfo size={16} /><span>{x.kind}에는 {x.un}도 들어 있어요 — 상가정보는 무인 가게를 따로 나누지 않아요. 무인만 보려면 업종 고르기의 &apos;무인매장&apos;에서 골라요.</span>
        </p>
      ))}

      <CmpTable a={a.k.nm} b={b.k.nm} rows={rows} />

      <p className="knote"><IcoInfo size={16} /><span>칸을 누르면 그 업종으로 자리 카드가 나오고, 매물이 있으면 카드에서 [손익 따져보기].</span></p>
      <CmpActs a={{ c: a.k.c, nm: a.k.nm }} b={{ c: b.k.c, nm: b.k.nm }} share={`${a.k.nm} vs ${b.k.nm} — ${diffs.map((d) => d.head).join(' · ')}`} onFind={onFind} />
      <p className="note">출처: 소상공인 상가정보 {quarterText(meta.poi)} · 서울시 상권분석서비스 추정매출({meta.year}년 네 분기) · 생존은 상가정보 분기 자료를 가게 단위로 이어 셈</p>
    </section>
  )
}
