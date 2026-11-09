import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { type BaseData, loadJSON } from '../core/data'
import type { Kind, KindsData } from '../core/kinds'
import { type PlaceEntry, type PlaceIndex, type StationData, buildPlaceIndex, placeGrid } from '../core/places'
import { QUICK_KINDS, bestHit, searchAll } from '../core/search'

// 첫 화면 (마스터플랜 W7.4 '첫 화면') — 질문 셋 + 찾기(동·역·업종) + 바로 가기(자주 보는 업종 지도) + '예시로 보기'.
// 들고 온 질문에서 시작한다: ① 어떤 업종이 나을까 ② 내 주변 어디가 나을까 ③ 이 자리 괜찮을까(찾은 곳의 손익 점검으로 바로).
// 지도는 뒤에서 서울 개관(업종 전에는 가게가 모인 정도). ①은 업종 둘 고르기(견주기), 바로 가기의 '무인매장 6종'은 그 묶음 카드(T1m)로 연다

interface Props {
  data: BaseData
  kinds: KindsData | null
  onKind: (code: string) => void
  /** check — ③ '이 자리 괜찮을까'에서 찾은 곳이면 손익 점검까지 연다 */
  onPlace: (p: PlaceEntry, check: boolean) => void
  onPickKind: () => void
  /** 바로 가기 '무인매장 6종' — 무인 유형 자료가 없는 판이면 null */
  onUnm: (() => void) | null
  onFind: () => void
  onExample: () => void
}

function usePlaces(data: BaseData): PlaceIndex | null {
  const [idx, setIdx] = useState<PlaceIndex | null>(null)
  useEffect(() => {
    let live = true
    loadJSON<StationData>(data.ver, 'places/stations.json')
      .then((st) => live && setIdx(buildPlaceIndex(placeGrid(data.cells), data.dongs, st)))
      .catch(() => live && setIdx(buildPlaceIndex(placeGrid(data.cells), data.dongs, null)))
    return () => { live = false }
  }, [data])
  return idx
}

function Search({ kinds, places, onKind, onPlace, box }: { kinds: KindsData | null; places: PlaceIndex | null; onKind: (k: Kind) => void; onPlace: (p: PlaceEntry) => void; box: RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState('')
  const r = useMemo(() => searchAll(q, kinds, places), [q, kinds, places])
  const pick = () => {
    const h = bestHit(q, r)
    if (!h) return
    if (h.kind === 'kind') onKind(h.k)
    else onPlace(h.p)
  }
  return (
    <div className="home-search">
      <label className="search">
        <span className="sr">동 · 역 · 업종 이름으로 찾기</span>
        <input ref={box} type="search" value={q} placeholder="동 · 역 · 업종 — 망원동, 강남역, 카페…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') pick() }} data-testid="home-search" />
      </label>
      {q.trim() && (
        <div className="hits" role="group" aria-label="찾은 것">
          {r.kinds.map((k) => (
            <button key={k.c} className="hit" onClick={() => onKind(k)}>
              <span className="hit-tag">업종</span> {k.nm} <span className="hint">서울 {k.n.toLocaleString('ko-KR')}곳</span>
            </button>
          ))}
          {r.places.map((p) => (
            <button key={p.label} className="hit" onClick={() => onPlace(p)}>
              <span className="hit-tag hit-tag-2">{p.kind === 'st' ? '역' : '동'}</span> {p.label}
            </button>
          ))}
          {!r.kinds.length && !r.places.length && <p className="hint empty">맞는 곳이나 업종이 없어요 — 주소(지번·도로명) 찾기는 아직 없어 동이나 역 이름으로 찾아 주세요</p>}
        </div>
      )}
    </div>
  )
}

export default function Home({ data, kinds, onKind, onPlace, onPickKind, onUnm, onFind, onExample }: Props) {
  const places = usePlaces(data)
  const box = useRef<HTMLInputElement | null>(null)
  const [q3, setQ3] = useState(false)
  const byCode = useMemo(() => new Map((kinds?.kinds ?? []).map((k) => [k.c, k])), [kinds])
  const quick = QUICK_KINDS.map((c) => byCode.get(c)).filter((k): k is Kind => !!k)
  return (
    <section className="home" aria-label="처음 화면" data-testid="home">
      <div>
        <h2 className="home-title">가게 자리, 어디서부터 볼까요?</h2>
        <p className="hint home-sub">서울을 육각 칸 {data.cells.h3.length.toLocaleString('ko-KR')}개로 나눠 공공데이터로 칠했어요. 시험판이에요.</p>
      </div>
      <Search kinds={kinds} places={places} onKind={(k) => onKind(k.c)} onPlace={(p) => onPlace(p, q3)} box={box} />
      {q3 && <p className="hint" role="status" data-testid="q3-hint">매물이 있는 동이나 역 이름을 넣으면 그 자리 손익 점검이 열려요.</p>}
      <ol className="questions" aria-label="질문 셋">
        <li>
          <button className="q-card" onClick={onPickKind} data-testid="q-kind">
            <span className="q-no" aria-hidden="true">1</span>
            <span className="q-text">
              <strong>어떤 업종이 나을까?</strong>
              <span className="hint">둘을 골라 견주면 가게당 매출 · 경쟁 가게 수 · 생존의 차이를 말해 줘요. 하나만 고르면 그 업종 지도</span>
            </span>
          </button>
        </li>
        <li>
          <button className="q-card" onClick={onFind} data-testid="q-find">
            <span className="q-no" aria-hidden="true">2</span>
            <span className="q-text">
              <strong>내 주변 어디가 나을까?</strong>
              <span className="hint">집이나 일터에서 정한 시간 안, 그 업종 가게가 있는 자리와 비슷한 곳 20곳</span>
            </span>
          </button>
        </li>
        <li>
          <button className="q-card" onClick={() => { box.current?.focus(); setQ3(true) }} data-testid="q-place">
            <span className="q-no" aria-hidden="true">3</span>
            <span className="q-text">
              <strong>이 자리 괜찮을까?</strong>
              <span className="hint">동이나 역으로 찾아 매물 면적 · 월세를 넣으면 본전 매출을 내고 이 동네 같은 업종 가게 매출과 견줘요</span>
            </span>
          </button>
        </li>
      </ol>
      <button className="btn-ex" onClick={onExample} data-testid="example">
        <strong>예시로 보기</strong>
        <span className="hint">시청역에서 차로 30분 안 카페 자리 — 눌러서 한 번에</span>
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
    </section>
  )
}
