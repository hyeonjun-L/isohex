import { useMemo } from 'react'
import type { BaseData } from '../core/data'
import type { Kind, KindsData } from '../core/kinds'
import { QUICK_KINDS } from '../core/search'
import { IcoRight } from './icons'

// 첫 화면 (마스터플랜 W7.4 '첫 화면' · 화면 다시 잡기 11-25) — 시트 반에 질문 넷(64px 줄) + '예시로 보기' + 바로 가기(자주 보는 업종 지도).
// 들고 온 질문에서 시작한다: ① 내 주변 어디가 나을까 ② 어떤 업종이 나을까 ③ 이 자리 괜찮을까(지도 위 찾기 칸에서 찾은 곳의 손익 점검으로 바로) · 무인매장.
// 찾기는 지도 위 찾기 칸(ui/SearchBar)으로 옮겼다. 지도는 뒤에서 서울 개관(업종 전에는 가게가 모인 정도) — 칸을 누르면 그 자리 카드

interface Props {
  data: BaseData
  kinds: KindsData | null
  onKind: (code: string) => void
  /** ③ '이 자리 괜찮을까' — 찾기 칸으로 (고른 곳의 손익 점검까지 연다) */
  onPlaceQ: () => void
  onPickKind: () => void
  /** 바로 가기 '무인매장 6종' — 무인 유형 자료가 없는 판이면 null */
  onUnm: (() => void) | null
  /** 무인 · 소자본 문의 한 줄 (core/unm.ts unDoor) */
  unDoor: string | null
  onFind: () => void
  onExample: () => void
}

export default function Home({ data, kinds, onKind, onPlaceQ, onPickKind, onUnm, unDoor, onFind, onExample }: Props) {
  const byCode = useMemo(() => new Map((kinds?.kinds ?? []).map((k) => [k.c, k])), [kinds])
  const quick = QUICK_KINDS.map((c) => byCode.get(c)).filter((k): k is Kind => !!k)
  return (
    <section className="home" aria-label="처음 화면" data-testid="home">
      <div>
        <h2 className="home-title">가게 자리, 어디서부터 볼까요?</h2>
        <p className="hint home-sub">서울을 육각 칸 {data.cells.h3.length.toLocaleString('ko-KR')}개로 나눠 공공데이터로 칠했어요. 시험판이에요.</p>
      </div>
      <div className="q-rows">
        <ol className="questions" aria-label="질문 셋">
          <li>
            <button className="q-card q-main" onClick={onFind} data-testid="q-find">
              <span className="q-no" aria-hidden="true">1</span>
              <span className="q-text">
                <strong>내 주변 어디가 나을까?</strong>
                <span className="hint">집이나 일터에서 정한 시간 안, 그 업종 가게가 있는 자리와 비슷한 곳 20곳</span>
              </span>
              <IcoRight size={18} />
            </button>
          </li>
          <li>
            <button className="q-card" onClick={onPickKind} data-testid="q-kind">
              <span className="q-no" aria-hidden="true">2</span>
              <span className="q-text">
                <strong>어떤 업종이 나을까?</strong>
                <span className="hint">둘을 골라 견주면 가게당 매출 · 경쟁 가게 수 · 생존의 차이를 말해 줘요. 하나만 고르면 그 업종 지도</span>
              </span>
              <IcoRight size={18} />
            </button>
          </li>
          <li>
            <button className="q-card" onClick={onPlaceQ} data-testid="q-place">
              <span className="q-no" aria-hidden="true">3</span>
              <span className="q-text">
                <strong>이 자리 괜찮을까?</strong>
                <span className="hint">주소나 동 · 역으로 찾아 매물 면적 · 월세를 넣으면 본전 매출을 내고 이 동네 같은 업종 가게 매출과 견줘요</span>
              </span>
              <IcoRight size={18} />
            </button>
          </li>
        </ol>
        {onUnm && unDoor && (
          <button className="q-card q-un" onClick={onUnm} data-testid="home-unm">
            <span className="q-no" aria-hidden="true">무</span>
            <span className="q-text">
              <strong>무인매장 · 소자본으로 시작한다면</strong>
              <span className="hint">{unDoor}</span>
            </span>
            <IcoRight size={18} />
          </button>
        )}
      </div>
      <button className="btn-quiet btn-ex" onClick={onExample} data-testid="example">
        예시로 보기 — 시청역에서 차로 30분 안 카페 자리
      </button>
      {(quick.length > 0 || onUnm) && (
        <div className="quick">
          <div className="hint">바로 가기 — 무인매장 묶음 · 자주 보는 업종 지도</div>
          <div className="chips" role="group" aria-label="바로 가기">
            {onUnm && <button className="chip-btn chip-un" onClick={onUnm} data-testid="quick-unm">무인매장 6종</button>}
            {quick.map((k) => (
              <button key={k.c} className="chip-btn" onClick={() => onKind(k.c)}>{k.nm}</button>
            ))}
          </div>
        </div>
      )}
      <p className="home-foot hint">
        <a href="/about.html" data-testid="about-link">안내 · 자료 출처 · 문의</a> — 공공데이터로 만든 추정이에요. 계약 · 투자 판단의 근거가 아니에요.
      </p>
    </section>
  )
}
