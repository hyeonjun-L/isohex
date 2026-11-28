import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { BeVal } from '../core/breakeven'
import {
  BE_SKIP, CAP_TEXT, type CheckInputs, beFor, calcText, costRate, fitText, haeyo, leadText, needText, noBeText, rentCheck, rentText, rowOf, runCheck, shareEasy, signedWon, vatHint, verdictEasy, won,
} from '../core/check'
import type { BaseData } from '../core/data'
import { pct } from '../core/format'
import { type Kind, survText } from '../core/kinds'
import { placeName } from '../core/places'
import { FLOORS, type FloorKey } from '../core/rent'
import { type UnType, aboveText, closeText, runUn, unLead, unSide } from '../core/unm'
import BrandBars from './BrandBars'
import CheckChart from './CheckChart'
import ShareButton from './ShareButton'
import { IcoDown, IcoInfo, IcoLeft, IcoOk, IcoUp, IcoWarn } from './icons'
import { useCheckBase, useCheckRows } from './useCheck'

// 손익 점검 (마스터플랜 W7.4 '손익 점검' · 와이어프레임 ③ 매물 점검 · T3 "33㎡, 월세 150만 원이면 남을까" · 화면 다시 잡기 S19 · S08)
// 결과 먼저 — 본전 매출 상자(30px + 판정 한 줄 + 무엇과 견줬나) → 막대(본전 ↔ 이 동네 평균) → 매물 숫자 넷(면적 · 월세 · 보증금 · 관리비) + 자세히
// → 견줄 업종 → 이 동네 같은 업종 가게의 월매출 → 매출이 평균의 60 · 80 · 100 · 120%일 때 월 손익 → 월세 수준(부동산원 조사 상권) → 생존
// → 계산 풀이 → 공유(맨 아래). 본전 매출 상자가 화면 밖이고 매물 숫자가 보이면(입력하는 동안) 아래에 결과 줄 — [결과 보기]로 올라간다.
// 계산은 core/breakeven.ts(옛 뷰어와 같은 값), 업종 대응 · 입력 · 쉬운 말은 core/check.ts.
// 무인 유형(무인매장 묶음)은 본전 매출을 가맹 브랜드 가운데 값과 견주고, 이 동네 매출은 참고로만 보인다(core/unm.ts — 예전 뷰어 beRenderUn)

interface Props {
  data: BaseData
  cell: number
  kind: Kind | null
  /** 무인 유형이면 — 유형 자료와 업종 찾기(생존을 빌려 올 업종) */
  un: { u: UnType; byCode: ReadonlyMap<string, Kind> } | null
  /** 지금 숫자(예시 값 + 바꾼 것) · 아직 예시 값 그대로인가 */
  inp: CheckInputs
  example: boolean
  onInp: (p: Partial<CheckInputs>) => void
  onReset: () => void
  /** 견줄 서울시 업종을 직접 고른 것 (없으면 업종 대응표) */
  bei: string | null
  onBei: (k: string | null) => void
  onBack: () => void
  onPickKind: () => void
}

/** 숫자 칸 — 지우는 중에도 0으로 바뀌지 않게 글자로 들고 있다가, 숫자가 되면 넘긴다 */
function NumField({ label, unit, value, onValue, step, min = 0, hint, testid }: {
  label: string; unit: string; value: number; onValue: (v: number) => void; step: number; min?: number; hint?: string; testid?: string
}) {
  const [s, setS] = useState(String(value))
  useEffect(() => {
    setS((cur) => (Number(cur) === value && cur !== '' ? cur : String(value)))
  }, [value])
  return (
    <label className="num">
      <span className="num-l">{label}</span>
      <span className="num-in">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={s}
          onChange={(e) => {
            const t = e.target.value
            setS(t)
            const v = Number(t)
            if (t !== '' && Number.isFinite(v) && v >= min) onValue(v)
          }}
          onBlur={() => {
            const v = Number(s)
            if (s === '' || !Number.isFinite(v) || v < min) {
              setS(String(min))
              onValue(min)
            }
          }}
          data-testid={testid}
        />
        <span className="unit">{unit}</span>
      </span>
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

const n = (x: number) => x.toLocaleString('ko-KR')

export default function CheckPanel({ data, cell, kind, un, inp, example, onInp, onReset, bei, onBei, onBack, onPickKind }: Props) {
  const { base, err } = useCheckBase(data)
  // 무인 유형 — 견줄 것은 브랜드 값, 이 동네 매출(cs 업종 — 무인 · 유인 함께)은 참고
  const side = un && base ? unSide(un.u, un.byCode, base.inds) : null
  // 무인 빨래방의 '세탁소'처럼 맞지 않는 짝(BE_SKIP — W7.15)은 참고로도 보이지 않는다
  const cs = un && base && un.u.cs && !un.u.surv.some((c) => BE_SKIP.has(c)) ? base.inds.find((d) => d.k === un.u.cs) ?? null : null
  const mapped = base && kind && !un ? beFor(kind.c, base.inds) : null
  const ind = un ? null : base ? (bei ? base.inds.find((d) => d.k === bei) ?? mapped : mapped) : null
  const { rows, err: rowErr } = useCheckRows(data.ver, (ind ?? cs)?.k ?? null)
  const ures = side && base ? runUn(side, base.meta.card, inp) : null
  const vOf = ind ?? side
  // 주소의 bei가 없는 업종이면 풀어 둔다
  useEffect(() => {
    if (base && bei && !base.inds.some((x) => x.k === bei)) onBei(null)
  }, [base, bei, onBei])

  const si = base ? base.c2s[cell] : -1
  const di = base ? base.c2d[cell] : -1
  const s: BeVal | null = rows && si >= 0 ? rowOf(rows.S.get(si)) : null
  const d: BeVal | null = rows && di >= 0 ? rowOf(rows.D.get(di)) : null
  const res = ind && base && rows ? runCheck(ind, base.meta, inp, s, d) : null
  const prim = res?.ref.level === '상권' ? s : res?.ref.level === '행정동' ? d : null
  const q = ind ? ind.q.map((v) => v / 10) : []
  const qc = cs ? cs.q.map((v) => v / 10) : []
  const ri = base ? base.reb.cell[cell] : -1
  const rb = base && ri >= 0 ? base.reb.rents[ri] : null
  const rc = rentCheck(inp, rb)
  const dongNm = placeName(data.dongs[data.cells.dong[cell]])
  const where = base ? `${dongNm} · ${si >= 0 ? `${base.sang.se[si]} '${base.sang.nm[si]}'` : '상권 밖'}` : dongNm
  const groups = base
    ? ['외식', '서비스', '소매'].map((g) => ({ g, l: base.inds.filter((x) => x.grp === g).sort((a, b) => a.nm.localeCompare(b.nm, 'ko')) }))
    : []
  const fail = err ?? rowErr

  // 결과 — 업종(서울시 상권분석)과 무인 유형(가맹 브랜드)이 같은 꼴: 본전 · 판정 · 무엇과 견줬나 · 공유 글
  const out = ind && res ? { S: res.S, R: res.R, word: res.ref.word, lead: leadText(res, ind), of: res.ref.level === '서울' ? '서울 가운데 값의' : '진입 뒤 평균의', nm: kind?.nm ?? '' }
    : side && ures ? { S: ures.S, R: ures.R, word: '가맹점 평균', lead: unLead(ures, side.u), of: '가맹점 평균의', nm: side.u.nm }
    : null
  const ok = !!out && Number.isFinite(out.S)
  const verdict = out ? verdictEasy(out.R, out.word) : ''

  // 입력하는 동안 결과 줄 — 본전 매출 상자가 화면 밖이고 매물 숫자가 보일 때 (S08)
  const boxRef = useRef<HTMLDivElement>(null)
  const inRef = useRef<HTMLFieldSetElement>(null)
  const [boxOut, setBoxOut] = useState(false)
  const [inSeen, setInSeen] = useState(false)
  useEffect(() => {
    const box = boxRef.current, inputs = inRef.current
    if (!ok || !box || !inputs || typeof IntersectionObserver === 'undefined') {
      setBoxOut(false)
      return
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.target === box) setBoxOut(!e.isIntersecting)
          else setInSeen(e.isIntersecting)
        }
      },
      { root: box.closest('.panel-body') },
    )
    io.observe(box)
    io.observe(inputs)
    return () => io.disconnect()
  }, [ok])

  // [결과 보기] — 상자로 올라가고, 줄이 사라져도 초점은 상자에 남는다(키보드로 이어 읽기)
  const toBox = () => {
    const box = boxRef.current
    if (!box) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    box.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
    box.focus({ preventScroll: true })
  }

  const which = (kind && base && !un) ? (
    <div className="chk-which">
      <label className="chk-sel">
        <span className="chk-l">견줄 업종</span>
        <span className="sel-in">
          <select value={ind?.k ?? ''} onChange={(e) => onBei(!e.target.value || e.target.value === mapped?.k ? null : e.target.value)} data-testid="check-bei">
            {!ind && <option value="">고르세요</option>}
            {groups.map(({ g, l }) => (
              <optgroup key={g} label={g}>
                {l.map((x) => <option key={x.k} value={x.k}>{x.nm}{x.k === mapped?.k ? ` (${kind.nm})` : ''}</option>)}
              </optgroup>
            ))}
          </select>
          <IcoDown size={18} />
        </span>
      </label>
      <p className="hint" data-testid="check-fit">{ind ? fitText(ind, kind.nm) : noBeText(kind.nm, kind.c)}</p>
    </div>
  ) : un && base ? (
    <div className="chk-which">
      <span className="chk-l">견줄 매출</span>
      <p className="hint" data-testid="check-fit">
        {un.u.nm} 가맹 브랜드 {un.u.brands.length > 1 ? `${un.u.brands.length}곳의 가맹점 평균 월매출(브랜드 가운데 값 ${won(un.u.money.sales[0])})` : `한 곳(${un.u.brands[0]?.nm ?? '—'})의 가맹점 평균 월매출(${won(un.u.money.sales[0])})`}과 견줘요 — 공정거래위원회 가맹사업 정보공개서
      </p>
    </div>
  ) : null

  /** 이름 · 덧말(왼쪽)과 값(오른쪽) 줄 — 이 동네 같은 업종 가게의 월매출 */
  const row = (key: string, label: ReactNode, sub: ReactNode, value: string) => (
    <div className="krow" key={key}>
      <div className="krow-l">
        <div className="krow-label">{label}</div>
        {sub && <div className="krow-sub">{sub}</div>}
      </div>
      <div className="krow-v">{value}</div>
    </div>
  )
  const profits = (ps: { f: number; X: number; P: number }[], of: string, word: string) => (
    <>
      <h3 className="chk-h">매출이 이만큼이면 — 한 달에 남는 돈 <span className="hint">대표 본인 몫 포함</span></h3>
      <table className="chk-tab" data-testid="check-profits">
        <thead>
          <tr><th scope="col">{of}</th><th scope="col" className="r">월 매출</th><th scope="col" className="r">남는 돈</th></tr>
        </thead>
        <tbody>
          {ps.map((p) => (
            <tr key={p.f} className={[p.P < 0 ? 'neg' : '', p.f === 1 ? 'mid' : ''].filter(Boolean).join(' ') || undefined}>
              <td>{Math.round(p.f * 100)}%</td><td className="r">{won(p.X)}</td><td className="r">{signedWon(p.P)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="knote"><IcoWarn size={16} /><span>새 가게가 첫해부터 {word}만큼 판다는 보장은 없어요 — 60~80% 줄도 같이 보세요.</span></p>
    </>
  )

  return (
    <section className="check" aria-label="손익 점검" data-testid="check">
      <div className="card-head">
        <div>
          <h2>손익 점검</h2>
          <div className="sub" data-testid="check-where">{where}</div>
        </div>
        <button className="btn-quiet chk-back" onClick={onBack} data-testid="check-back"><IcoLeft size={18} />자리 카드</button>
      </div>

      {!kind && (
        <div className="need-kind">
          <p>업종을 고르면 그 업종 가게들이 이 동네에서 올리는 매출과 견줘요. 월세 수준은 업종 없이도 아래에서 볼 수 있어요.</p>
          <button className="btn2" onClick={onPickKind}>업종 고르기</button>
        </div>
      )}
      {/* 견줄 업종이 아직 없으면 그것부터 — 고르면 결과가 맨 위에 서고 이 칸은 매물 숫자 아래로 간다 */}
      {kind && !un && !ind && which}

      {fail && <p className="caution" role="alert">자료를 받지 못했어요 — {fail}</p>}
      {ind && !res && !fail && <p className="hint" aria-busy="true">이 업종 매출을 받는 중이에요…</p>}

      {out && (
        <div className="chk-res" aria-live="polite" data-testid="check-res">
          {!ok ? (
            <p className="caution">원가율 · 기타 변동비 · 카드 수수료를 더하면 매출의 100%가 넘어 본전이 나지 않아요. 비율을 확인해 주세요.</p>
          ) : (
            <>
              <div className="chk-box" ref={boxRef} tabIndex={-1}>
                <div className="chk-big">
                  <span className="chk-big-l">본전 매출 <span className="hint">(손익분기)</span></span>
                  <strong data-testid="check-S">월 {won(out.S)}</strong>
                  <span className="hint">이만큼 팔면 비용을 다 내고 0원이 남아요</span>
                </div>
                <div className="chk-verdict" data-testid="check-verdict">
                  <p className="cv-head">{out.R >= 1 ? <IcoWarn size={18} /> : out.R < 0.85 ? <IcoOk size={18} /> : <IcoInfo size={18} />}<strong>{verdict}</strong></p>
                  <p className="cv-lead">{out.lead}</p>
                </div>
              </div>
              {ind && res && (
                <>
                  <CheckChart q={q} S={res.S} refV={res.ref.ref} refLabel={res.ref.level === '서울' ? '서울 가운데 값' : '이 동네 진입 뒤 평균'} nm={ind.nm} />
                  <p className="chk-p">{needText(res, prim?.tx ?? null)}</p>
                  <p className="knote">{ind.cap === 'ok' ? <IcoInfo size={16} /> : <IcoWarn size={16} />}<span>{CAP_TEXT[ind.cap]} — {haeyo(ind.capnote)}</span></p>
                </>
              )}
              {side && ures && (
                <>
                  <p className="chk-p" data-testid="check-above">{aboveText(ures, side.u)}</p>
                  <p className="knote">
                    <IcoWarn size={16} />
                    <span>가맹본부가 정보공개서에 낸 브랜드 평균 — 평균이라 잘되는 가게 쪽으로 끌려 올라가 있고, 같은 브랜드에 유인 가게가 섞였을 수 있어요.
                      정보공개서 매출은 보통 부가세를 뺀 값이라 카드 결제 금액으로 치면 10%쯤 더 커요. 브랜드 없이 연 무인 가게의 매출은 볼 수 없어요. 브랜드마다 {side.u.money.year}년 값이에요.</span>
                  </p>
                  <h3 className="chk-h">{side.u.nm} 가맹 브랜드 — 가맹점 평균 월매출</h3>
                  <BrandBars u={side.u} S={ures.S} />
                </>
              )}
            </>
          )}
        </div>
      )}

      <fieldset className="step chk-inputs" ref={inRef}>
        <legend>매물 숫자</legend>
        <p className="knote"><IcoInfo size={16} /><span data-testid="check-example">
          {!example ? '바꾼 숫자는 주소에 남아요 — 링크로 그대로 나눌 수 있어요.'
            : un ? `처음 숫자는 ${un.u.nm} 기본값이에요 — 면적 · 초기 투자${un.u.floor !== '1' ? ' · 층' : ''}은 가맹 브랜드 가운데 값, 인건비 0. 월세 · 관리비 · 기타 고정비는 보고 있는 매물 숫자로 바꾸세요.`
            : '처음 숫자는 예시예요 — 보고 있는 매물의 숫자로 바꾸세요.'}
        </span></p>
        <div className="num-grid">
          <NumField label="면적" unit="㎡" value={inp.area} step={1} onValue={(v) => onInp({ area: v })} hint={inp.area > 0 ? `약 ${(inp.area / 3.3058).toFixed(1)}평 · 전용 + 공용` : '전용 + 공용 — 월세 견주기에 써요'} testid="in-area" />
          <NumField label="월세" unit="만 원" value={inp.rent} step={10} onValue={(v) => onInp({ rent: v })} hint="부가세 빼고" testid="in-rent" />
          <NumField label="보증금" unit="만 원" value={inp.dep} step={100} onValue={(v) => onInp({ dep: v })} hint="월세 견주기에만 써요" testid="in-dep" />
          <NumField label="관리비" unit="만 원" value={inp.mgmt} step={5} onValue={(v) => onInp({ mgmt: v })} testid="in-mgmt" />
        </div>
        <details className="acc more">
          <summary>
            <span className="acc-t">
              <span className="acc-title">자세히</span>
              <span className="acc-sum">인건비 · 기타 고정비 · 투자 · 원가율 · 층</span>
            </span>
            <IcoDown size={20} />
          </summary>
          <div className="num-grid">
            <NumField label="직원 인건비" unit="만 원" value={inp.labor} step={10} onValue={(v) => onInp({ labor: v })} hint="대표 본인 몫은 빼요 — 남는 돈이 본인 몫" testid="in-labor" />
            <NumField label="기타 고정비" unit="만 원" value={inp.other} step={5} onValue={(v) => onInp({ other: v })} hint="공과금 · 통신 · 보험 · 소모품" />
            <NumField label="초기 투자" unit="만 원" value={inp.inv} step={100} onValue={(v) => onInp({ inv: v })} hint="인테리어 · 설비 · 가맹비 (보증금은 빼요)" />
            <NumField label="투자 회수 기간" unit="개월" value={inp.months} step={1} min={1} onValue={(v) => onInp({ months: v })} />
            {vOf ? (
              <NumField label="원가율" unit="%" value={costRate(inp, vOf)} step={0.1} onValue={(v) => onInp({ cost: Math.min(v, 99) })} hint={side ? side.vsrc : haeyo(ind!.vsrc)} testid="in-cost" />
            ) : (
              <div className="num"><span className="num-l">원가율</span><span className="hint">견줄 업종을 고르면 그 업종 예시 값이 들어가요</span></div>
            )}
            <NumField label="기타 변동비" unit="%" value={inp.other2} step={0.1} onValue={(v) => onInp({ other2: Math.min(v, 99) })} hint={`배달앱 수수료 · 로열티처럼 매출에 따라 늘어나는 비용. ${vOf ? vatHint(costRate(inp, vOf)) : ''}`} />
            <label className="num">
              <span className="num-l">층</span>
              <span className="sel-in">
                <select value={inp.floor} onChange={(e) => onInp({ floor: e.target.value as FloorKey })} data-testid="in-floor">
                  {(['1', '2', '3', '-1'] as FloorKey[]).map((k) => <option key={k} value={k}>{FLOORS[k].nm}</option>)}
                </select>
                <IcoDown size={18} />
              </span>
              <span className="hint">월세 견주기에만 써요</span>
            </label>
          </div>
        </details>
        {!example && <button className="btn2" onClick={onReset} data-testid="check-reset">예시 값으로 되돌리기</button>}
      </fieldset>

      {/* 견줄 업종 — 매물 숫자 아래 (S19) */}
      {(ind || un) && which}

      {ind && res && ok && (
        <>
          <h3 className="chk-h">이 동네 같은 업종 가게의 월매출</h3>
          <p className="chk-hsub hint">가게당 · 카드 결제로 만든 추정 · {base!.meta.year}년</p>
          <div className="krows chk-rows" data-testid="check-cmp">
            {s && row('s', `상권 ${base!.sang.nm[si]}`, `${n(s.n)}곳`, won(s.sales))}
            {d && row('d', `행정동 ${base!.dong.nm[di]}`, `${n(d.n)}곳`, won(d.sales))}
            {prim && row('me', '내가 들어간 뒤', `${n(prim.n)}곳 → ${n(prim.n + 1)}곳, 가게당 ${pct(res.ref.dil, 1)}`, won(res.ref.ref))}
            {row('q', <>서울 &apos;{ind.nm}&apos; 상권별 가운데 값</>, `가운데 절반 ${won(q[2])}~${won(q[4])}`, won(q[3]))}
          </div>
          {!prim && <p className="knote"><IcoInfo size={16} /><span>이 자리 둘레 상권 · 행정동에는 &apos;{ind.nm}&apos; 매출이 공개되지 않았어요(같은 업종이 적으면 비공개). 그래서 서울 가운데 값과 견줘요.</span></p>}
          {s && d && <p className="knote"><IcoInfo size={16} /><span>좁은 쪽인 상권 값으로 견줘요. 같은 자리라도 상권 값과 행정동 값은 꽤 다를 수 있어요.</span></p>}
          <p className="chk-p">{shareEasy(ind, res.share)}</p>
          {profits(res.profits, res.ref.level === '서울' ? '서울 가운데 값의' : '진입 뒤 평균의', res.ref.word)}
        </>
      )}
      {side && ures && ok && (
        <>
          {cs && (
            <>
              <h3 className="chk-h">참고 — 이 동네 &apos;{cs.nm}&apos; 가게의 월매출</h3>
              <p className="chk-hsub hint">가게당 · 무인 · 유인 함께 · {base!.meta.year}년</p>
              <div className="krows chk-rows" data-testid="check-cmp">
                {s && row('s', `상권 ${base!.sang.nm[si]}`, `${n(s.n)}곳`, won(s.sales))}
                {d && row('d', `행정동 ${base!.dong.nm[di]}`, `${n(d.n)}곳`, won(d.sales))}
                {row('q', <>서울 &apos;{cs.nm}&apos; 상권별 가운데 값</>, `가운데 절반 ${won(qc[2])}~${won(qc[4])}`, won(qc[3]))}
              </div>
              <p className="knote"><IcoInfo size={16} /><span>상권 매출은 그 업종 가게 전체의 카드 결제로 만든 추정이라 유인 가게가 대부분이에요. 위 판단은 브랜드 값으로 했어요.</span></p>
            </>
          )}
          {profits(ures.profits, '가맹점 평균의', '가맹점 평균')}
        </>
      )}

      <h3 className="chk-h">월세 수준</h3>
      {inp.area <= 0 ? <p className="knote"><IcoInfo size={16} /><span>면적을 넣으면 한국부동산원 조사 상권 값과 견줘요.</span></p>
        : !rb ? <p className="chk-p" data-testid="check-rent">이 자리는 한국부동산원 조사 상권(서울 72곳) 밖이라 견줄 임대료가 없어요.</p>
        : rc ? <p className="chk-p" data-testid="check-rent">{rentText(rc, inp.dep)}</p>
        : <p className="chk-p" data-testid="check-rent">이 조사 상권({rb.n})에는 1층 임대료 값이 없어 견주지 못해요.</p>}
      {rc && inp.floor !== '1' && <p className="knote"><IcoInfo size={16} /><span>{rc.floorNm} 값은 {rc.own ? '이 상권의' : '서울 중대형 상가'} 층별 효용비율 {Math.round(rc.ratio * 1000) / 10}(1층 = 100)로 바꿨어요.</span></p>}
      {rc && <p className="knote"><IcoInfo size={16} /><span>부동산원 값은 상업용부동산 임대동향조사 표본이고, 면적은 전용 + 공용 기준이에요. 같은 상권 안에서도 골목 · 층 · 간판에 따라 차이가 커요.</span></p>}

      {kind && (
        <div className="krows chk-surv">
          {un
            ? row('surv', '이 업종 새 가게의 1년 생존', `${un.byCode.get(un.u.surv[0])?.nm ?? kind.nm} 업종, 서울 전체 값이에요 — 무인만 따로 세지 않았어요`, survText(kind))
            : row('surv', '이 업종 새 가게의 1년 생존', `${kind.nm}, 서울 전체 값이에요 — 이 자리 값이 아니에요`, survText(kind))}
          {un && <p className="knote"><IcoInfo size={16} /><span>{closeText(un.u)}</span></p>}
        </div>
      )}

      {ok && out && (
        <details className="acc">
          <summary>
            <span className="acc-t">
              <span className="acc-title">계산 풀이 · 읽을 때 알아 둘 것</span>
              <span className="acc-sum">본전 매출 = 고정비 ÷ (1 − 원가율 − 기타 변동비 − 카드 수수료)</span>
            </span>
            <IcoDown size={20} />
          </summary>
          <div className="acc-body">
            {side && ures ? (
              <>
                <p className="acc-intro">{calcText(ures, inp, costRate(inp, side))}.</p>
                <p className="acc-intro">카드 수수료는 연매출 구간별 우대수수료율(신용카드)이에요. 보증금은 돌려받는 돈이라 고정비에 넣지 않아요. 초기 투자 기본값은 창업비에서 돌려받는 가맹 보증금을 뺀 값이에요.</p>
                <p className="acc-intro">견준 매출은 가맹본부가 정보공개서에 낸 가맹점 평균 월매출의 브랜드 가운데 값이에요 — 매출을 낸 가맹점이 30곳 이상인 브랜드만 썼어요.</p>
              </>
            ) : ind && res ? (
              <>
                <p className="acc-intro">{calcText(res, inp, costRate(inp, ind))}.</p>
                <p className="acc-intro">카드 수수료는 연매출 구간별 우대수수료율(신용카드)이에요. 보증금은 돌려받는 돈이라 고정비에 넣지 않아요.</p>
                <p className="acc-intro">견준 매출은 기존 가게들의 평균이고, 서울시 상권분석의 카드 결제로 만든 추정({base!.meta.year}년)이에요. 현금 · 계좌이체 · 배달앱 결제는 빠졌을 수 있어요.</p>
              </>
            ) : null}
            <p className="acc-intro">부가세 · 소득세 · 대출 이자는 빠져 있어요 — 이자는 기타 고정비에 더하면 돼요.</p>
          </div>
        </details>
      )}

      {/* 공유 — 맨 아래 (S19) */}
      {ok && out && (
        <div className="card-acts chk-share">
          <ShareButton text={`${dongNm} ${out.nm} 손익 — ${out.lead} ${verdict}.`} label="이 점검 공유" testid="check-share" />
        </div>
      )}

      {/* 입력하는 동안 결과 줄 (S08) */}
      {ok && out && boxOut && inSeen && (
        <div className="chk-bar" data-testid="check-bar">
          <span className="cb-t">
            <span className="cb-s">본전 매출 · {out.of} {Math.round(out.R * 100)}%</span>
            <strong>월 {won(out.S)}{verdict.includes(' — ') ? ` — ${verdict.split(' — ')[1]}` : ''}</strong>
          </span>
          <button className="cb-go" onClick={toBox} data-testid="check-bar-go">
            결과 보기<IcoUp size={18} />
          </button>
        </div>
      )}
    </section>
  )
}
