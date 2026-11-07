import { useEffect, useState } from 'react'
import type { BeVal } from '../core/breakeven'
import {
  CAP_TEXT, type CheckInputs, beFor, calcText, costRate, fitText, haeyo, isExample, leadText, needText, noBeText, rentCheck, rentText, rowOf, runCheck, shareEasy, signedWon, vatHint, verdictEasy, won,
} from '../core/check'
import type { BaseData } from '../core/data'
import { pct } from '../core/format'
import { type Kind, survText } from '../core/kinds'
import { placeName } from '../core/places'
import { FLOORS, type FloorKey } from '../core/rent'
import CheckChart from './CheckChart'
import { useCheckBase, useCheckRows } from './useCheck'

// 손익 점검 (마스터플랜 W7.4 '손익 점검' · 와이어프레임 ③ 매물 점검 · T3 "33㎡, 월세 150만 원이면 남을까")
// 꼭 넣을 넷(면적 · 월세 · 보증금 · 관리비) + 자세히 → 본전 매출과 결과 문장 + 막대(본전 ↔ 이 동네 평균)
// + 매출이 평균의 60 · 80 · 100 · 120%일 때 월 손익 + 월세 수준(부동산원 조사 상권) + 생존.
// 계산은 core/breakeven.ts(옛 뷰어와 같은 값), 업종 대응 · 입력 · 쉬운 말은 core/check.ts

interface Props {
  data: BaseData
  cell: number
  kind: Kind | null
  inp: CheckInputs
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

export default function CheckPanel({ data, cell, kind, inp, onInp, onReset, bei, onBei, onBack, onPickKind }: Props) {
  const { base, err } = useCheckBase(data)
  const mapped = base && kind ? beFor(kind.c, base.inds) : null
  const ind = base ? (bei ? base.inds.find((d) => d.k === bei) ?? mapped : mapped) : null
  const { rows, err: rowErr } = useCheckRows(data.ver, ind?.k ?? null)
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
  const ri = base ? base.reb.cell[cell] : -1
  const rb = base && ri >= 0 ? base.reb.rents[ri] : null
  const rc = rentCheck(inp, rb)
  const example = isExample(inp)
  const dongNm = placeName(data.dongs[data.cells.dong[cell]])
  const where = base ? `${dongNm} · ${si >= 0 ? `${base.sang.se[si]} '${base.sang.nm[si]}'` : '상권 밖'}` : dongNm
  const groups = base
    ? ['외식', '서비스', '소매'].map((g) => ({ g, l: base.inds.filter((x) => x.grp === g).sort((a, b) => a.nm.localeCompare(b.nm, 'ko')) }))
    : []
  const fail = err ?? rowErr

  return (
    <section className="check" aria-label="손익 점검" data-testid="check">
      <div className="card-head">
        <div>
          <h2>손익 점검</h2>
          <div className="sub" data-testid="check-where">{where}</div>
        </div>
        <button className="ghost" onClick={onBack} data-testid="check-back">← 자리 카드</button>
      </div>

      {!kind && (
        <div className="need-kind">
          <p>업종을 고르면 그 업종 가게들이 이 동네에서 올리는 매출과 견줘요. 월세 수준은 업종 없이도 아래에서 볼 수 있어요.</p>
          <button className="btn2" onClick={onPickKind}>업종 고르기</button>
        </div>
      )}
      {kind && base && (
        <div className="chk-which">
          <p className="hint" data-testid="check-fit">{ind ? fitText(ind, kind.nm) : noBeText(kind.nm, kind.c)}</p>
          <label className="sel">
            <span>견줄 업종</span>
            <select value={ind?.k ?? ''} onChange={(e) => onBei(!e.target.value || e.target.value === mapped?.k ? null : e.target.value)} data-testid="check-bei">
              {!ind && <option value="">고르세요</option>}
              {groups.map(({ g, l }) => (
                <optgroup key={g} label={g}>
                  {l.map((x) => <option key={x.k} value={x.k}>{x.nm}{x.k === mapped?.k ? ` (${kind.nm})` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      )}

      <fieldset className="step">
        <legend>매물 숫자</legend>
        <p className="hint" data-testid="check-example">{example ? '처음 숫자는 예시예요 — 보고 있는 매물의 숫자로 바꾸세요.' : '바꾼 숫자는 주소에 남아요 — 링크로 그대로 나눌 수 있어요.'}</p>
        <div className="num-grid">
          <NumField label="면적 (전용 + 공용)" unit="㎡" value={inp.area} step={1} onValue={(v) => onInp({ area: v })} hint={inp.area > 0 ? `약 ${(inp.area / 3.3058).toFixed(1)}평` : '월세 견주기에 써요'} testid="in-area" />
          <NumField label="월세" unit="만 원" value={inp.rent} step={10} onValue={(v) => onInp({ rent: v })} testid="in-rent" />
          <NumField label="보증금" unit="만 원" value={inp.dep} step={100} onValue={(v) => onInp({ dep: v })} hint="월세 견주기에만 써요" testid="in-dep" />
          <NumField label="관리비" unit="만 원" value={inp.mgmt} step={5} onValue={(v) => onInp({ mgmt: v })} testid="in-mgmt" />
        </div>
        <details className="acc more">
          <summary>자세히 — 인건비 · 기타 고정비 · 투자 · 원가율 · 층</summary>
          <div className="num-grid">
            <NumField label="직원 인건비" unit="만 원" value={inp.labor} step={10} onValue={(v) => onInp({ labor: v })} hint="대표 본인 몫은 빼요 — 남는 돈이 본인 몫" testid="in-labor" />
            <NumField label="기타 고정비" unit="만 원" value={inp.other} step={5} onValue={(v) => onInp({ other: v })} hint="공과금 · 통신 · 보험 · 소모품" />
            <NumField label="초기 투자" unit="만 원" value={inp.inv} step={100} onValue={(v) => onInp({ inv: v })} hint="인테리어 · 설비 · 가맹비 (보증금은 빼요)" />
            <NumField label="투자 회수 기간" unit="개월" value={inp.months} step={1} min={1} onValue={(v) => onInp({ months: v })} />
            {ind ? (
              <NumField label="원가율" unit="%" value={costRate(inp, ind)} step={0.1} onValue={(v) => onInp({ cost: Math.min(v, 99) })} hint={haeyo(ind.vsrc)} testid="in-cost" />
            ) : (
              <div className="num"><span className="num-l">원가율</span><span className="hint">견줄 업종을 고르면 그 업종 예시 값이 들어가요</span></div>
            )}
            <NumField label="기타 변동비" unit="%" value={inp.other2} step={0.1} onValue={(v) => onInp({ other2: Math.min(v, 99) })} hint={`배달앱 수수료 · 로열티처럼 매출에 따라 늘어나는 비용. ${ind ? vatHint(costRate(inp, ind)) : ''}`} />
            <label className="num">
              <span className="num-l">층</span>
              <select value={inp.floor} onChange={(e) => onInp({ floor: e.target.value as FloorKey })} data-testid="in-floor">
                {(['1', '2', '3', '-1'] as FloorKey[]).map((k) => <option key={k} value={k}>{FLOORS[k].nm}</option>)}
              </select>
              <span className="hint">월세 견주기에만 써요</span>
            </label>
          </div>
        </details>
        {!example && <button className="btn2" onClick={onReset} data-testid="check-reset">예시 값으로 되돌리기</button>}
      </fieldset>

      {fail && <p className="caution" role="alert">자료를 받지 못했어요 — {fail}</p>}
      {ind && !res && !fail && <p className="hint" aria-busy="true">이 업종 매출을 받는 중이에요…</p>}

      {ind && res && (
        <div className="chk-res" aria-live="polite" data-testid="check-res">
          {!Number.isFinite(res.S) ? (
            <p className="caution">원가율 · 기타 변동비 · 카드 수수료를 더하면 매출의 100%가 넘어 본전이 나지 않아요. 비율을 확인해 주세요.</p>
          ) : (
            <>
              <div className="chk-big">
                <span className="chk-big-l">본전 매출 <span className="hint">(손익분기)</span></span>
                <strong data-testid="check-S">월 {won(res.S)}</strong>
                <span className="hint">이만큼 팔면 비용을 다 내고 0원이 남아요</span>
              </div>
              <p className="oneline" data-testid="check-verdict">{leadText(res, ind)} <strong>{verdictEasy(res.R, res.ref.word)}.</strong></p>
              <CheckChart q={q} S={res.S} refV={res.ref.ref} refLabel={res.ref.level === '서울' ? '서울 가운데 값' : '이 동네 진입 뒤 평균'} nm={ind.nm} />
              <p className="note">{needText(res, prim?.tx ?? null)}</p>
              <p className="note"><span className={`cap cap-${ind.cap}`}>{CAP_TEXT[ind.cap]}</span> {haeyo(ind.capnote)}</p>

              <h3>이 동네 같은 업종 가게의 월매출 <span className="hint">가게당 · 카드 결제로 만든 추정 · {base!.meta.year}년</span></h3>
              <dl className="cmp" data-testid="check-cmp">
                {s && <div><dt>상권 {base!.sang.nm[si]} · {n(s.n)}곳</dt><dd>{won(s.sales)}</dd></div>}
                {d && <div><dt>행정동 {base!.dong.nm[di]} · {n(d.n)}곳</dt><dd>{won(d.sales)}</dd></div>}
                {prim && (
                  <div className="cmp-me"><dt>내가 들어간 뒤 — {n(prim.n)}곳 → {n(prim.n + 1)}곳, 가게당 {pct(res.ref.dil, 1)}</dt><dd>{won(res.ref.ref)}</dd></div>
                )}
                <div><dt>서울 &apos;{ind.nm}&apos; 상권별 가운데 값 <span className="hint">(가운데 절반 {won(q[2])}~{won(q[4])})</span></dt><dd>{won(q[3])}</dd></div>
              </dl>
              {!prim && <p className="note">이 자리 둘레 상권 · 행정동에는 &apos;{ind.nm}&apos; 매출이 공개되지 않았어요(같은 업종이 적으면 비공개). 그래서 서울 가운데 값과 견줘요.</p>}
              {s && d && <p className="note">좁은 쪽인 상권 값으로 견줘요. 같은 자리라도 상권 값과 행정동 값은 꽤 다를 수 있어요.</p>}
              <p className="note">{shareEasy(ind, res.share)}</p>

              <h3>매출이 이만큼이면 — 한 달에 남는 돈 <span className="hint">대표 본인 몫 포함</span></h3>
              <table className="chk-tab" data-testid="check-profits">
                <thead>
                  <tr><th scope="col">{res.ref.level === '서울' ? '서울 가운데 값의' : '진입 뒤 평균의'}</th><th scope="col" className="r">월 매출</th><th scope="col" className="r">남는 돈</th></tr>
                </thead>
                <tbody>
                  {res.profits.map((p) => (
                    <tr key={p.f} className={p.P < 0 ? 'neg' : undefined}>
                      <td>{Math.round(p.f * 100)}%</td><td className="r">{won(p.X)}</td><td className="r">{signedWon(p.P)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">새 가게가 첫해부터 {res.ref.word}만큼 판다는 보장은 없어요 — 60~80% 줄도 같이 보세요.</p>
            </>
          )}
        </div>
      )}

      <h3>월세 수준</h3>
      {inp.area <= 0 ? <p className="note">면적을 넣으면 한국부동산원 조사 상권 값과 견줘요.</p>
        : !rb ? <p className="note" data-testid="check-rent">이 자리는 한국부동산원 조사 상권(서울 72곳) 밖이라 견줄 임대료가 없어요.</p>
        : rc ? <p className="chk-rent" data-testid="check-rent">{rentText(rc, inp.dep)}</p>
        : <p className="note" data-testid="check-rent">이 조사 상권({rb.n})에는 1층 임대료 값이 없어 견주지 못해요.</p>}
      {rc && inp.floor !== '1' && <p className="note">{rc.floorNm} 값은 {rc.own ? '이 상권의' : '서울 중대형 상가'} 층별 효용비율 {Math.round(rc.ratio * 1000) / 10}(1층 = 100)로 바꿨어요.</p>}
      {rc && <p className="note">부동산원 값은 상업용부동산 임대동향조사 표본이고, 면적은 전용 + 공용 기준이에요. 같은 상권 안에서도 골목 · 층 · 간판에 따라 차이가 커요.</p>}

      {kind && (
        <>
          <h3>이 업종 새 가게의 1년 생존</h3>
          <p className="chk-surv">{survText(kind)} <span className="hint">— {kind.nm}, 서울 전체 값이에요(이 자리 값이 아니에요)</span></p>
        </>
      )}

      {ind && res && Number.isFinite(res.S) && (
        <details className="acc">
          <summary>계산 풀이 · 읽을 때 알아 둘 것</summary>
          <p className="acc-intro">본전 매출 = 고정비 ÷ (1 − 원가율 − 기타 변동비 − 카드 수수료). {calcText(res, inp, costRate(inp, ind))}.</p>
          <p className="acc-intro">카드 수수료는 연매출 구간별 우대수수료율(신용카드)이에요. 보증금은 돌려받는 돈이라 고정비에 넣지 않아요.</p>
          <p className="acc-intro">견준 매출은 기존 가게들의 평균이고, 서울시 상권분석의 카드 결제로 만든 추정({base!.meta.year}년)이에요. 현금 · 계좌이체 · 배달앱 결제는 빠졌을 수 있어요.</p>
          <p className="acc-intro">부가세 · 소득세 · 대출 이자는 빠져 있어요 — 이자는 기타 고정비에 더하면 돼요.</p>
        </details>
      )}
    </section>
  )
}
