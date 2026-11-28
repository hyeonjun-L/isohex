import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { SORT_NM, type SortKey, resUp, sortKeys } from '../core/candidates'
import type { BaseData, Industry } from '../core/data'
import {
  MIN_MIN, MIN_STEP, MODE_NM, PER_HOURS, PER_NM, SPACING_TEXT, bandText, compText, exampleNote, funnelLine, funnelRows, methodText, needKindText, shortText, sortText, type FindState,
} from '../core/find'
import { comma, josa, rankText } from '../core/format'
import { IcoClose, IcoInfo, IcoPin, IcoSearch, IcoTarget } from './icons'
import type { Kind } from '../core/kinds'
import { levelText } from '../core/level'
import { merc } from '../core/grid'
import { type PlaceEntry, findPlace, nearestStation, pickCell } from '../core/places'
import { distText } from '../core/card'
import { MAX_MIN, timeText, type Mode, type Period } from '../core/travel/times'
import type { FindOut } from './useFind'
import { ADDR_ON, addrNote, useAddress } from './useAddress'

// 후보 찾기 패널 (마스터플랜 W7.4 '후보 찾기', 와이어프레임 ② 자리 찾기 · 화면 다시 잡기 S11 · S12 · S13) — 세 화면:
// · 목록(기본) — '후보 20곳' + 깔때기 한 줄 + 후보 줄들. 줄에 손을 올리거나 고르면 지도의 점이 번호 핀이 된다(onHover)
// · 조건(edit — 조건 띠의 [바꾸기]) — ① 기준점(동·역 찾기 · 지도에서 찍기 · 지금 위치) ② 가는 법 · 시간대 · 시간
//   ③ 조건(비슷한 자리 · 같은 업종 상한 · 순서), 아래 붙은 깔때기 한 줄 + [후보 20곳 보기]
// · 기준점 찍는 중(picking) — 맨 위 먹색 띠(FindStrip PickBanner)와 함께 시트 '살짝'
// 후보를 누르면 그 칸의 자리 카드(왜 후보인가가 맨 위에). 계산은 useFind → core/candidates.ts · core/find.ts

interface Props {
  data: BaseData
  kind: Kind | null
  /** 매출 수준을 칠하는 업종 (순서 '매출 수준 높은 순'에 쓴다) */
  pot: Industry | null
  s: FindState
  sort: SortKey
  f: FindOut
  picking: boolean
  onChange: (p: Partial<FindState>) => void
  onBase: (cell: number, label: string | null) => void
  onPicking: (on: boolean) => void
  onPickKind: () => void
  onSelect: (i: number) => void
  /** 조건 화면을 열었나 · 열고 닫기 */
  edit: boolean
  onEdit: (on: boolean) => void
  /** 조건 화면을 ③ 조건에서 연다(칩 줄의 같은 업종 · 순서 칩) */
  editAt?: 'opts' | null
  /** 후보 줄에 손을 올리거나 초점이 가면 그 후보 — 지도의 점을 번호 핀으로 */
  onHover: (i: number | null) => void
}

const MODES: Mode[] = ['car', 'pt', 'walk']
const PERS: Period[] = ['day', 'am', 'pm']

function BaseSearch({ f, h3, onBase }: { f: FindOut; h3: readonly string[]; onBase: Props['onBase'] }) {
  const [q, setQ] = useState('')
  const addr = useAddress(q, h3)
  const note = addrNote(addr.state)
  const hits = useMemo(() => {
    if (!f.base || !q.trim()) return []
    const r = findPlace(f.base.places, q)
    return r.e ? [r.e, ...r.alts] : []
  }, [f.base, q])
  const pick = (e: PlaceEntry) => {
    onBase(e.cell, e.label)
    setQ('')
  }
  return (
    <div className="base-search">
      <label className="search base-field">
        <IcoSearch size={20} />
        <span className="sr">{ADDR_ON ? '기준점 — 주소 · 동 · 역 · 상권 이름' : '기준점 — 동 · 역 · 상권 이름'}</span>
        <input
          type="search"
          value={q}
          placeholder={ADDR_ON ? '집 · 일터 주소나 동 · 역 — 망원로 23, 강남역…' : '동이나 역 이름 — 망원동, 강남역…'}
          disabled={!f.base}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key !== 'Enter') return; if (hits[0]) pick(hits[0]); else if (addr.hits[0]) { onBase(addr.hits[0].cell, addr.hits[0].label); setQ('') } }}
          data-testid="base-search"
        />
      </label>
      {q.trim() && (
        <ul className="hits" aria-label="찾은 곳">
          {hits.map((e) => (
            <li key={e.label}>
              <button className="hit" onClick={() => pick(e)}>{e.label}</button>
            </li>
          ))}
          {addr.hits.map((a) => (
            <li key={a.label}>
              <button className="hit" onClick={() => { onBase(a.cell, a.label); setQ('') }} data-testid="base-addr"><span className="hit-tag hit-tag-2">주소</span> {a.label}</button>
            </li>
          ))}
          {note && <li className="hint" role="status">{note}</li>}
          {!hits.length && !addr.hits.length && !note && <li className="hint">{ADDR_ON ? '맞는 곳이 없어요 — 주소는 번호까지(망원로 23), 아니면 동 · 역 · 상권 이름으로 찾아요' : '맞는 곳이 없어요 — 동 · 역 · 상권 이름으로 찾아요'}</li>}
        </ul>
      )}
    </div>
  )
}

/** 시간 띠 말고 지도에 그리는 것들 — 흐린 칸 · 경계선 · 후보 번호 · 기준점. 지도 위 범례(ui/MapLegend)를 편 목록 끝에 붙는다.
 *  (예전에는 이 패널 맨 아래에 범례가 있었다 — 3,000px 아래라 보이지 않아 지도 위로 옮겼다, 2026-11-24) */
export function FindKeys({ min, kind, fade }: { min: number; kind: boolean; fade: string }) {
  return (
    <>
      {kind && <li><span className="sw" style={{ background: fade, opacity: 0.3 }} aria-hidden="true" />흐린 칸 — 닿지만 조건 밖</li>}
      <li><span className="sw sw-line" aria-hidden="true" />{min}분 경계</li>
      {kind && <li><span className="sw-dot" aria-hidden="true" />후보 — 번호는 목록에</li>}
      <li><span className="sw-base" aria-hidden="true" />기준점</li>
    </>
  )
}

export default function FindPanel({ data, kind, pot, s, sort, f, picking, onChange, onBase, onPicking, onPickKind, onSelect, edit, onEdit, editAt = null, onHover }: Props) {
  const [geoMsg, setGeoMsg] = useState<string | null>(null)
  const optsRef = useRef<HTMLFieldSetElement>(null)
  const st = f.result?.stat
  const likeOn = !!(s.like && f.kind?.band)
  // 같은 업종 상한 — 이 업종 단계 + 주소에서 온 값(단계에 없으면 끼워 넣는다)
  const opts = f.kind?.opts ?? [-1, 0]
  const compList = opts.includes(s.comp) ? opts : [...opts, s.comp].sort((a, b) => a - b)
  const line = kind && st ? funnelLine(st, s, kind.nm, likeOn) : null
  const n = f.result?.list.length ?? 0

  // 칩 줄의 같은 업종 · 순서 칩으로 열면 ③ 조건이 보이게
  useEffect(() => {
    if (edit && editAt === 'opts') optsRef.current?.scrollIntoView({ block: 'start' })
  }, [edit, editAt])

  const here = () => {
    if (!navigator.geolocation || !f.base) {
      setGeoMsg('이 브라우저는 위치를 알려 주지 않아요')
      return
    }
    setGeoMsg('위치를 찾는 중이에요…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const [x, y] = merc(p.coords.latitude, p.coords.longitude)
        const c = pickCell(f.base!.grid, x, y)
        if (c == null) setGeoMsg('지금 위치가 서울 밖이에요 — 동이나 역 이름으로 찾아 주세요')
        else {
          setGeoMsg(null)
          onBase(c, '지금 위치')
        }
      },
      () => setGeoMsg('위치를 알 수 없어요 — 브라우저에서 위치 허용을 확인해 주세요'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  /** 줄의 둘째 줄 — 순서에 따라 매출 수준(추정) · 주민 · 같은 업종 */
  const keyNode = (i: number): ReactNode => {
    const q = f.query!, cw = q.cntw[i]
    if (sort === 'pot') {
      const v = q.pot?.[i], nm = pot && kind && pot.nm !== kind.nm ? `${pot.nm} ` : ''
      return v == null ? `${nm}매출 수준 추정 안 함` : <>{nm}매출 수준 {levelText(v / 10)}<small className="hint"> 추정</small></>
    }
    if (sort === 'res') return `주민 ${rankText(resUp(f.base!.grid, i))}`
    return `같은 업종 ${comma(cw)}곳`
  }
  const subText = (i: number): string => {
    const q = f.query!, g = f.base!.grid, parts = [`반경 300m 가게 ${comma(g.n300[i])}곳`]
    if (sort !== 'few' && sort !== 'near') parts.unshift(`같은 업종 ${comma(q.cntw[i])}곳`)
    if (sort === 'near' || sort === 'few') parts.unshift(`주민 ${rankText(resUp(g, i))}`)
    // 같은 동에 후보가 둘 이상일 수 있다 — 가까운 역으로 가린다
    const st = nearestStation(f.base!.places, g.x[i], g.y[i], 1000)
    if (st) parts.unshift(`${st.name}역 ${distText(st.m)}`)
    return parts.join(' · ')
  }

  const needKind = !kind && (
    <div className="need-kind">
      <p>{needKindText()}</p>
      <button className="btn2" onClick={onPickKind}>업종 고르기</button>
    </div>
  )
  const state = (
    <>
      {f.err && <p className="caution" role="alert">계산하지 못했어요: {f.err}</p>}
      {f.busy && <p className="hint" aria-busy="true" data-testid="find-busy">{f.busy}</p>}
    </>
  )

  // 기준점 찍는 중 — 시트 '살짝'에 두 줄 (S12)
  if (picking) {
    return (
      <section className="find find-pick" aria-label="후보 찾기" data-testid="find">
        <h2 className="fp-title">기준점 찍는 중</h2>
        <p className="fp-text">누른 칸이 기준점이 되고, 거기서 다시 {s.min}분 안 후보를 찾아요.</p>
      </section>
    )
  }

  // 조건 — 따로 연 시트 (S11)
  if (edit) {
    return (
      <section className="find find-edit" aria-label="후보 찾기 조건" data-testid="find">
        <div className="card-head">
          <div>
            <h2>후보 찾기 조건</h2>
            <div className="sub">바꾸면 바로 다시 찾아요</div>
          </div>
          <button className="icon-btn close-btn" onClick={() => onEdit(false)} aria-label="조건 닫기 — 후보 목록으로" data-testid="find-edit-close">
            <IcoClose size={20} />
          </button>
        </div>
        {needKind}

        <fieldset className="step">
          <legend><span className="step-no">1</span>기준점 — 집이나 일터</legend>
          <BaseSearch f={f} h3={data.cells.h3} onBase={onBase} />
          <div className="row">
            <button className="btn2" aria-pressed={picking} onClick={() => onPicking(true)} data-testid="pick-btn"><IcoPin size={18} />지도에서 찍기</button>
            <button className="btn2" onClick={here}><IcoTarget size={18} />지금 위치</button>
          </div>
          {geoMsg && <p className="hint" role="status">{geoMsg}</p>}
          <p className="knote base-now-row"><IcoInfo size={16} /><span className="base-now" data-testid="base-now">{f.example ? exampleNote(f.fromLabel) : <>기준점: <strong>{f.fromLabel}</strong></>}</span></p>
        </fieldset>

        <fieldset className="step">
          <legend><span className="step-no">2</span>가는 법 · 시간</legend>
          <div className="seg" role="group" aria-label="가는 법">
            {MODES.map((m) => (
              <button key={m} aria-pressed={s.by === m} onClick={() => onChange({ by: m })} data-testid={`by-${m}`}>{MODE_NM[m]}</button>
            ))}
          </div>
          {s.by !== 'walk' && (
            <div className="seg" role="group" aria-label="시간대">
              {PERS.map((p) => (
                <button key={p} aria-pressed={s.at === p} onClick={() => onChange({ at: p })} title={PER_HOURS[p]}>{PER_NM[p]}</button>
              ))}
            </div>
          )}
          <label className="range">
            <span className="range-top">
              <span>걸리는 시간</span>
              <output>{s.min}분 안</output>
            </span>
            <input type="range" min={MIN_MIN} max={MAX_MIN} step={MIN_STEP} value={s.min} onChange={(e) => onChange({ min: Number(e.target.value) })} data-testid="min" />
            <span className="range-ends hint" aria-hidden="true"><span>{MIN_MIN}분</span><span>{MAX_MIN}분</span></span>
          </label>
        </fieldset>

        <fieldset className="step" disabled={!kind} ref={optsRef}>
          <legend><span className="step-no">3</span>조건</legend>
          <label className="chk">
            <input type="checkbox" checked={s.like} disabled={!!kind && !!f.kind && !f.kind.band} onChange={(e) => onChange({ like: e.target.checked })} data-testid="like" />
            <span>
              {kind ? (f.kind?.src === 'list' ? `${josa(kind.nm, '이', '가')} 지금 있는 자리와 비슷한 곳만` : `${kind.nm} 가게가 지금 있는 자리와 비슷한 곳만`) : '그 업종 가게가 지금 있는 자리와 비슷한 곳만'}
              {kind && f.kind && !f.kind.band && <small className="hint"> — 가게가 적어 범위를 내지 않아요</small>}
            </span>
          </label>
          {kind && f.kind?.band && f.base && (
            <p className="hint band-text">{bandText(f.kind.band, kind.nm, f.kind.stores, f.base.tiltSorted, f.kind.pass, f.kind.src)[0]}</p>
          )}
          <label className="sel">
            <span>같은 업종 (이 칸 + 둘레)</span>
            <select value={s.comp} onChange={(e) => onChange({ comp: Number(e.target.value) })} data-testid="comp">
              {compList.map((c) => (
                <option key={c} value={c}>{compText(c)}</option>
              ))}
            </select>
          </label>
          <label className="sel">
            <span>순서</span>
            <select value={sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} data-testid="sort">
              {sortKeys(!!pot).map((k) => (
                <option key={k} value={k}>{SORT_NM[k]}</option>
              ))}
            </select>
          </label>
        </fieldset>
        {state}

        {/* 아래 붙은 깔때기 한 줄 + 보기 — 조건을 바꾸면 바로 다시 센다 */}
        <div className="find-go">
          {line && <p className="hint" data-testid="funnel-line">{line}</p>}
          {kind ? (
            <button className="btn-primary" onClick={() => onEdit(false)} disabled={!f.result} data-testid="find-go">후보 {n}곳 보기</button>
          ) : (
            <button className="btn-primary" onClick={onPickKind}>업종 고르기</button>
          )}
        </div>
      </section>
    )
  }

  // 목록 (S13)
  return (
    <section className="find" aria-label="후보 찾기" data-testid="find">
      {needKind}
      {state}
      {kind && st && f.query && f.result && (
        <>
          <div className="fl-head">
            <h2>후보 {n}곳</h2>
            <span className="hint">{kind.nm} · {SORT_NM[sort]}</span>
          </div>
          <p className="fl-funnel" data-testid="funnel-line">{line}</p>
          {shortText(st) && <p className="caution">{shortText(st)}</p>}
          <ol className="cand-list" aria-label="후보" data-testid="cand-list">
            {f.result.list.map((i, k) => {
              const [dong, gu] = data.dongs[data.cells.dong[i]].split('|')
              return (
                <li key={i}>
                  <button
                    className="cand-row"
                    onClick={() => { onHover(null); onSelect(i) }}
                    onMouseEnter={() => onHover(i)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(i)}
                    onBlur={() => onHover(null)}
                  >
                    <span className="no" aria-hidden="true">{k + 1}</span>
                    <span className="cr-main">
                      <span className="cr-top">
                        <span className="pl"><b>{dong}</b> <span className="pl-gu">{gu}</span></span>
                        <span className="tm">{MODE_NM[s.by]} {timeText(f.query!.times[i])}</span>
                      </span>
                      <span className="cr-key">{keyNode(i)}</span>
                      <span className="cr-sub">{subText(i)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {kind && f.query && st && (
        <details className="acc">
          <summary>왜 이 칸들인가</summary>
          <dl className="funnel" data-testid="funnel">
            {funnelRows(st, s, kind.nm, likeOn, sort).map((r) => (
              <div key={r.k} className={r.last ? 'fr last' : 'fr'}>
                <dt>{r.k}</dt>
                <dd>{r.v}</dd>
              </div>
            ))}
          </dl>
          {likeOn && f.kind?.band && f.base && bandText(f.kind.band, kind.nm, f.kind.stores, f.base.tiltSorted, f.kind.pass, f.kind.src).map((t) => <p key={t} className="acc-intro">{t}</p>)}
          <p className="acc-intro">{sortText(sort, pot?.nm ?? null)}</p>
          <p className="acc-intro">{SPACING_TEXT}</p>
          <p className="acc-intro">{methodText(s.by, s.at)}</p>
        </details>
      )}
      <p className="note">이동 시간 — 길 © OpenStreetMap contributors (ODbL) · 버스 서울시 교통정보센터(TOPIS) · 지하철 서울교통공사</p>
    </section>
  )
}
