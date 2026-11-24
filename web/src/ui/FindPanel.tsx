import { useMemo, useState } from 'react'
import { SORT_NM, type SortKey, resUp, sortKeys } from '../core/candidates'
import type { BaseData, Industry } from '../core/data'
import {
  MIN_MIN, MIN_STEP, MODE_NM, PER_HOURS, PER_NM, SPACING_TEXT, bandText, compText, exampleNote, funnelRows, methodText, needKindText, shortText, sortText, type FindState,
} from '../core/find'
import { comma, josa, rankText } from '../core/format'
import type { Kind } from '../core/kinds'
import { levelText } from '../core/level'
import { merc } from '../core/grid'
import { type PlaceEntry, findPlace, nearestStation, pickCell, placeName } from '../core/places'
import { distText } from '../core/card'
import { MAX_MIN, timeText, type Mode, type Period } from '../core/travel/times'
import type { FindOut } from './useFind'
import { ADDR_ON, addrNote, useAddress } from './useAddress'

// 후보 찾기 패널 (마스터플랜 W7.4 '후보 찾기', 와이어프레임 ② 자리 찾기) —
// ① 기준점(동·역 찾기 · 지도에서 찍기 · 지금 위치)과 업종 ② 가는 법 · 시간대 · 시간 ③ 조건(비슷한 자리 · 같은 업종 상한 · 순서) → 깔때기 + 후보 20곳.
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
      <label className="search">
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
      {kind && <li><span className="sw-no" aria-hidden="true">1</span>후보 (뽑힌 순서)</li>}
      <li><span className="sw-base" aria-hidden="true" />기준점</li>
    </>
  )
}

export default function FindPanel({ data, kind, pot, s, sort, f, picking, onChange, onBase, onPicking, onPickKind, onSelect }: Props) {
  const [geoMsg, setGeoMsg] = useState<string | null>(null)
  const st = f.result?.stat
  const likeOn = !!(s.like && f.kind?.band)
  // 같은 업종 상한 — 이 업종 단계 + 주소에서 온 값(단계에 없으면 끼워 넣는다)
  const opts = f.kind?.opts ?? [-1, 0]
  const compList = opts.includes(s.comp) ? opts : [...opts, s.comp].sort((a, b) => a - b)
  const optSummary = kind ? [likeOn ? `${kind.nm} 자리와 비슷한 곳` : '자리 조건 없음', `같은 업종 ${compText(s.comp)}`, SORT_NM[sort]].join(' · ') : ''

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

  const keyText = (i: number): string => {
    const q = f.query!, cw = q.cntw[i]
    if (sort === 'pot') {
      const v = q.pot?.[i]
      return `${pot?.nm ?? ''} 매출 수준 ${v == null ? '추정 안 함' : levelText(v / 10)}`
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

  return (
    <section className="find" aria-label="후보 찾기" data-testid="find">
      {kind && st && f.query && f.result && f.result.list.length > 0 && (
        <button className="btn2 to-list" onClick={() => document.querySelector('[data-testid="cand-list"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-testid="to-list">
          후보 {f.result.list.length}곳 보기 ↓ <span className="hint">{f.fromLabel} · {MODE_NM[s.by]} {s.min}분 안</span>
        </button>
      )}
      {!kind && (
        <div className="need-kind">
          <p>{needKindText()}</p>
          <button className="btn2" onClick={onPickKind}>업종 고르기</button>
        </div>
      )}

      <fieldset className="step">
        <legend>① 기준점 — 집이나 일터</legend>
        <BaseSearch f={f} h3={data.cells.h3} onBase={onBase} />
        <div className="row">
          <button className="btn2" aria-pressed={picking} onClick={() => onPicking(!picking)} data-testid="pick-btn">
            {picking ? '찍는 중 — 취소' : '지도에서 찍기'}
          </button>
          <button className="btn2" onClick={here}>지금 위치</button>
        </div>
        {picking && <p className="hint">지도에서 기준점으로 쓸 칸을 누르세요.</p>}
        {geoMsg && <p className="hint" role="status">{geoMsg}</p>}
        <p className="base-now" data-testid="base-now">{f.example ? exampleNote(f.fromLabel) : <>기준점: <strong>{f.fromLabel}</strong></>}</p>
      </fieldset>

      <fieldset className="step">
        <legend>② 가는 법 · 시간</legend>
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
          <span>걸리는 시간</span>
          <input type="range" min={MIN_MIN} max={MAX_MIN} step={MIN_STEP} value={s.min} onChange={(e) => onChange({ min: Number(e.target.value) })} data-testid="min" />
          <output>{s.min}분 안</output>
        </label>
      </fieldset>

      <details className="acc opts">
        <summary>
          <span>
            ③ 조건 <span className="hint opts-sum" data-testid="opts-sum">{optSummary}</span>
          </span>
        </summary>
      <fieldset className="step" disabled={!kind}>
        <legend className="sr">조건</legend>
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
      </details>

      {f.err && <p className="caution" role="alert">계산하지 못했어요: {f.err}</p>}
      {f.busy && <p className="hint" aria-busy="true" data-testid="find-busy">{f.busy}</p>}

      {kind && st && f.query && (
        <>
          <dl className="funnel" data-testid="funnel">
            {funnelRows(st, s, kind.nm, likeOn, sort).map((r) => (
              <div key={r.k} className={r.last ? 'fr last' : 'fr'}>
                <dt>{r.k}</dt>
                <dd>{r.v}</dd>
              </div>
            ))}
          </dl>
          {shortText(st) && <p className="caution">{shortText(st)}</p>}
          <ol className="cand-list" aria-label="후보" data-testid="cand-list">
            {f.result!.list.map((i, n) => (
              <li key={i}>
                <button className="cand-row" onClick={() => onSelect(i)}>
                  <span className="no" aria-hidden="true">{n + 1}</span>
                  <span className="cr-main">
                    <span className="cr-top">
                      <span className="pl">{placeName(data.dongs[data.cells.dong[i]])}</span>
                      <span className="tm">{MODE_NM[s.by]} {timeText(f.query!.times[i])}</span>
                    </span>
                    <span className="cr-key">{keyText(i)}</span>
                    <span className="hint">{subText(i)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {kind && f.query && (
        <details className="acc">
          <summary>왜 이 칸들인가</summary>
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
