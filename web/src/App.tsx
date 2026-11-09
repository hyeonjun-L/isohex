import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultSort, sortKeys, type SortKey } from './core/candidates'
import { BE_SKIP, CHECK_DEFAULT, type CheckOver, applyInputs, beFor, isExample, readCheck, rowOf, writeCheck } from './core/check'
import { makeSide, readCmp } from './core/compare'
import { BOX_MAX, type BoxSales, boxRows, readBox, writeBox } from './core/box'
import type { CardInput } from './core/card'
import { dataUrl, loadBase, loadJSON, type BaseData } from './core/data'
import { FIND_DEFAULT, MODE_NM, findHead, findWhy, readFind, writeFind, type FindState } from './core/find'
import { type KindIndex, type KindsData, kindIndex } from './core/kinds'
import { type Show, chipsFor, parseShow, pickShow } from './core/layers'
import { type UnmData, UN_GROUP, isUn, unDefaults, unInside, unIntro, unSide } from './core/unm'
import type { TravelClient } from './core/travel/client'
import MapView, { PROTO_DEFAULT, type Proto, type View } from './map/MapView'
import Panel from './ui/Panel'
import KindPicker, { type PickMode } from './ui/KindPicker'
import ComparePanel from './ui/ComparePanel'
import UnComparePanel from './ui/UnComparePanel'
import BoxPanel from './ui/BoxPanel'
import ProtoPanel from './ui/ProtoPanel'
import ShowBar from './ui/ShowBar'
import FindPanel from './ui/FindPanel'
import CheckPanel from './ui/CheckPanel'
import Home from './ui/Home'
import Tour, { TOUR_STEPS } from './ui/Tour'
import { SHEET_FRAC, type Sheet, type Tab } from './ui/Panel'
import { cellToLatLng } from 'h3-js'
import { cardInput, useCard, useCardData } from './ui/useCard'
import { useBe, useCheckBase, useCheckRows } from './ui/useCheck'
import { useFind } from './ui/useFind'
import { useLayer } from './ui/useLayer'
import { timeText } from './core/travel/times'
import type { Theme } from './map/palette'

// 주소(URL)에 상태를 둔다 — 새로고침·공유해도 같은 화면 (마스터플랜 W7.4)
function readURL() {
  const q = new URLSearchParams(location.search)
  const bop = Number(q.get('bop'))
  const proto: Proto = {
    bldg: (['gray', 'tint', 'off'] as const).find((b) => b === q.get('bldg')) ?? PROTO_DEFAULT.bldg,
    bop: bop > 0 && bop <= 1 ? bop : PROTO_DEFAULT.bop,
    bg: q.get('bg') === 'none' ? 'none' : 'vworld',
  }
  // kind = 상가정보 소분류 코드(업종 247). 예전 주소의 ind(매출 수준 업종)는 그 업종의 첫 코드로 바꿔 읽는다
  // show = 지도에 칠할 지표 — 그 업종의 기본(매출 수준 → 새 가게 → 같은 업종)과 다를 때만 남는다
  // mode=find = 후보 찾기 (기준점 · 가는 법 · 시간 · 조건은 core/find.ts readFind)
  // chk=1 = 고른 칸의 손익 점검 (매물 숫자 in · inx는 core/check.ts readCheck, 견줄 업종을 바꿨으면 bei)
  // cmp=A_B = 업종 둘 견주기(고른 순서), kind는 지금 지도에 칠하는 쪽 — 둘 중 하나여야 한다. 무인 유형(UN-…)은 무인끼리만
  // box=h3_h3… = 비교함에 담은 자리(5곳까지, 모든 화면에서 남는다) · mode=box = 비교함 화면
  // 처음 화면 — 주소에 아무것도 없을 때(또는 mode=home). 동네 보기는 다른 것이 없으면 mode=map을 남긴다
  const m = q.get('mode')
  const tab: Tab = m === 'find' ? 'find' : m === 'box' ? 'box' : m === 'home' || (!m && !q.toString()) ? 'home' : 'map'
  let cmp = readCmp(q.get('cmp'))
  let kind = q.get('kind')
  if (cmp && kind && !cmp.includes(kind)) cmp = null
  if (cmp && !kind) kind = cmp[0]
  return { kind, cmp, ind: q.get('ind'), show: parseShow(q.get('show')), cell: q.get('cell'), view: (q.get('view') === 'top' ? 'top' : '3d') as View, protoOn: q.get('proto') === '1', proto, tab, q }
}

function useTheme(): Theme {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(mq?.matches ?? false)
  useEffect(() => {
    if (!mq) return
    const f = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [mq])
  return dark ? 'dark' : 'light'
}

const EMPTY: BaseData = { ver: '', manifest: { ver: '', made: '', snapshot: '', cells: 0, sources: [], excluded: [] }, cells: { h3: [], dong: [], n300: [] }, dongs: [], industries: [], bounds: { type: 'FeatureCollection', features: [] } }

export default function App() {
  const theme = useTheme()
  const init = useMemo(readURL, [])
  const [data, setData] = useState<BaseData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(init.kind)
  const [kinds, setKinds] = useState<{ d: KindsData; ix: KindIndex; period: string; fresh: Map<string, number>; unm: UnmData['meta'] | null } | null>(null)
  const [picking, setPicking] = useState<PickMode | null>(null)
  const [pickGroup, setPickGroup] = useState<string | null>(null)
  const [pair, setPair] = useState<[string, string] | null>(init.cmp)
  const [box, setBox] = useState<number[]>([])
  const [want, setWant] = useState<Show | null>(init.show)
  const [view, setView] = useState<View>(init.view)
  const [selected, setSelected] = useState<number | null>(null)
  const [proto, setProto] = useState<Proto>(init.proto)
  const [goTo, setGoTo] = useState<{ at: [number, number]; n: number } | null>(null)
  const [tab, setTab] = useState<Tab>(init.tab)
  // 폰 시트 — 처음 화면 · 비교함 · 손익 점검 링크는 크게, 나머지는 반
  const [sheet, setSheet] = useState<Sheet>(init.tab === 'home' || init.tab === 'box' || (init.cell && init.q.get('chk') === '1') ? 'full' : 'half')
  const [tour, setTour] = useState(0)
  const [fs, setFs] = useState<FindState>({ from: null, ...FIND_DEFAULT })
  const [fromLabel, setFromLabel] = useState<string | null>(null)
  const [pickBase, setPickBase] = useState(false)
  // 손익 점검 — 매물 숫자는 칸을 옮겨도 그대로 둔다(같은 매물 조건으로 여러 자리를 견줘 보게)
  const [checking, setChecking] = useState(init.q.get('chk') === '1')
  const [ci, setCi] = useState<CheckOver>(() => readCheck(init.q))
  const [bei, setBei] = useState<string | null>(init.q.get('bei'))

  useEffect(() => {
    loadBase()
      .then((d) => {
        setData(d)
        const idx = new Map(d.cells.h3.map((h, i) => [h, i]))
        setFs(readFind(init.q, (h) => idx.get(h) ?? -1))
        const bx = readBox(init.q.get('box'), (h) => idx.get(h) ?? -1)
        setBox(bx)
        if (init.tab === 'box' && !bx.length) setTab('map')
        if (init.cell) {
          const i = d.cells.h3.indexOf(init.cell)
          if (i >= 0) setSelected(i)
        }
        return Promise.all([
          loadJSON<KindsData>(d.ver, 'kinds/index.json'),
          loadJSON<{ meta: { period: string }; ind: { k: string; n: number }[] }>(d.ver, 'entry/index.json'),
          loadJSON<UnmData>(d.ver, 'unm/index.json').catch(() => null), // 무인매장 묶음 — 없는 판이면 업종 247만
        ]).then(([kd, en, unm]) => {
          const ix = kindIndex(kd, d.industries, en.ind, unm)
          setKinds({ d: kd, ix, period: en.meta.period, fresh: new Map(en.ind.map((e) => [e.k, e.n])), unm: unm?.meta ?? null })
          if (init.cmp && (!init.cmp.every((c) => ix.byCode.has(c)) || isUn(init.cmp[0]) !== isUn(init.cmp[1]))) setPair(null)
          if (init.ind && !init.kind) setKind(d.industries.find((x) => x.k === init.ind)?.codes[0] ?? null)
          else if (init.kind && !ix.byCode.has(init.kind)) setKind(null)
        })
      })
      .catch((e: unknown) => setErr(String(e)))
  }, [init])

  // 첫 화면 찾기 — 업종 247 + 무인 6종
  const kindsAll = useMemo(() => (kinds ? { meta: kinds.d.meta, kinds: kinds.ix.all } : null), [kinds])
  // 지도에 칠할 지표 — 업종마다 볼 수 있는 것이 다르다 (core/layers.ts)
  const kindRow = kind && kinds ? kinds.ix.byCode.get(kind) ?? null : null
  const depth = kindRow && kinds ? kinds.ix.depth(kindRow.c) : null
  const chips = useMemo(() => chipsFor(kindRow?.nm ?? null, depth), [kindRow, depth?.pot, depth?.entry]) // eslint-disable-line react-hooks/exhaustive-deps
  const show = pickShow(want, chips)
  const industry = data?.industries.find((x) => x.k === depth?.pot) ?? null
  const unType = kindRow && kinds ? kinds.ix.un.get(kindRow.c) ?? null : null
  const { layer, busy, err: layerErr } = useLayer(data, { show, kind: kindRow, un: unType, pot: industry, poi: kinds?.d.meta.poi ?? '', period: kinds?.period ?? '' })
  const cardData = useCardData(data ?? EMPTY, kinds?.ix ?? null, kind, !!data && (selected != null || tab === 'box'))
  const card = useCard(cardData, data ?? EMPTY, kinds?.ix ?? null, kind, data ? selected : null)

  // 비교함 — 담은 곳마다 카드와 같은 입력으로 줄을 만든다. 이 동네 가게당 월매출은 손익 자료(be/)에서
  const boxOn = tab === 'box' && box.length > 0
  const { base: beBase } = useCheckBase(data ?? EMPTY, !!data && boxOn && !!kindRow && !unType)
  const beInd = beBase && kindRow ? beFor(kindRow.c, beBase.inds) : null
  const { rows: beRows } = useCheckRows(data?.ver ?? '', boxOn && beInd ? beInd.k : null)
  const rows = useMemo(() => {
    if (!boxOn || !data) return null
    const ins = box.map((i) => cardInput(i, cardData, data, kinds?.ix ?? null, kind))
    if (ins.some((x) => !x)) return null
    let sales: (BoxSales | null)[] | null | 'none' = null
    if (kindRow && beBase && !unType) {
      if (!beInd) sales = 'none'
      else if (beRows) {
        sales = box.map((i) => {
          const si = beBase.c2s[i], di = beBase.c2d[i]
          const s = si >= 0 ? rowOf(beRows.S.get(si)) : null
          const d = di >= 0 ? rowOf(beRows.D.get(di)) : null
          return s ? { v: s.sales, where: `상권 ${beBase.sang.nm[si]}`, n: s.n } : d ? { v: d.sales, where: `행정동 ${beBase.dong.nm[di]}`, n: d.n } : null
        })
      }
    }
    return boxRows(ins as CardInput[], sales)
  }, [boxOn, box, data, cardData, kinds, kind, kindRow, unType, beBase, beInd, beRows])
  const boxLook = useMemo(() => {
    if (!boxOn || !data) return null
    const ll = box.map((i) => cellToLatLng(data.cells.h3[i]))
    const lat = ll.map((x) => x[0]), lng = ll.map((x) => x[1]), e = 0.006
    return {
      iso: null,
      base: null,
      cands: box,
      bounds: [[Math.min(...lng) - e, Math.min(...lat) - e], [Math.max(...lng) + e, Math.max(...lat) + e]] as [[number, number], [number, number]],
      fitKey: `box:${box.join('.')}`,
      label: '비교함',
    }
  }, [boxOn, box, data])
  const panelW = boxOn ? Math.max(360, Math.min(210 + box.length * 150, window.innerWidth - 440)) : 360
  const toggleBox = (i: number) => setBox((b) => (b.includes(i) ? b.filter((x) => x !== i) : b.length < BOX_MAX ? [...b, i] : b))

  // 후보 찾기 — 순서는 고른 것이 이 업종에 있으면 그것, 아니면 기본(매출 수준이 있으면 그것, 없으면 주민 순)
  const sortDef = defaultSort(!!industry)
  const sort: SortKey = fs.sort && sortKeys(!!industry).includes(fs.sort) ? fs.sort : sortDef
  const find = useFind(data, tab === 'find', kindRow, unType, industry?.k ?? null, fs, sort, fromLabel)
  const setFind = (p: Partial<FindState>) => setFs((s) => ({ ...s, ...p, ...(p.sort ? { sort: p.sort === sortDef ? null : p.sort } : {}) }))
  // 업종을 바꾸면 같은 업종 상한과 순서는 그 업종 기본으로 (단계가 업종마다 다르다)
  const prevKind = useRef(kind)
  useEffect(() => {
    if (prevKind.current === kind) return
    prevKind.current = kind
    setFs((s) => ({ ...s, comp: -1, sort: null }))
    setBei(null)
  }, [kind])
  // 업종 견주기 — 지도에 칠하는 업종이 둘 중 하나가 아니게 되면(머리줄에서 다른 업종을 고르면) 끝낸다
  useEffect(() => {
    if (pair && (!kind || !pair.includes(kind))) setPair(null)
  }, [kind, pair])
  const be = useBe(data?.ver ?? '', !!picking || !!pair)
  const beCodes = useMemo(() => (be ? new Set(be.ind.flatMap((d) => d.codes).filter((c) => !BE_SKIP.has(c))) : null), [be])
  const sides = useMemo(() => {
    if (!pair || !kinds || !be || !data) return null
    const [a, b] = pair.map((c) => kinds.ix.byCode.get(c))
    if (!a || !b || isUn(a.c)) return null
    return [a, b].map((k) => makeSide(k, kinds.ix.depth(k.c).pot, data.industries, be.ind, kinds.fresh))
  }, [pair, kinds, be, data])
  // 무인 둘 견주기 — 매출 · 창업비는 정보공개서 브랜드 값 (core/unm.ts)
  const unSides = useMemo(() => {
    if (!pair || !kinds || !be) return null
    const [a, b] = pair.map((c) => kinds.ix.un.get(c))
    if (!a || !b) return null
    return [a, b].map((u) => unSide(u, kinds.ix.byCode, be.ind))
  }, [pair, kinds, be])
  const pairKinds = pair && kinds ? pair.map((c) => kinds.ix.byCode.get(c)).filter((k) => !!k).map((k) => ({ c: k!.c, nm: k!.nm })) : null
  // 손익 점검 숫자 — 바꾼 것만 들고 있고, 나머지는 업종의 예시 값 (무인 유형은 면적 · 초기 투자 · 층이 브랜드 값)
  const chkDef = useMemo(() => (unType ? unDefaults(unType) : CHECK_DEFAULT), [unType])
  const inp = useMemo(() => ({ ...chkDef, ...ci }), [chkDef, ci])
  // 고른 칸이 풀리면 손익 점검도 닫는다 (처음 열 때 주소의 chk=1은 칸을 고를 때까지 기다린다)
  const prevSel = useRef(selected)
  useEffect(() => {
    if (prevSel.current != null && selected == null) setChecking(false)
    prevSel.current = selected
  }, [selected])
  const ctx = useMemo(() => {
    if (tab !== 'find' || selected == null || !find.times) return null
    if (!find.result || !find.query || !find.base || !kindRow) return { head: `${MODE_NM[fs.by]} ${timeText(find.times[selected])}`, why: '' }
    return { head: findHead(selected, find.result, find.query.times, fs.by), why: findWhy(selected, find.base.grid, find.query, find.result, kindRow.nm, fs.by) }
  }, [tab, selected, find.times, find.result, find.query, find.base, kindRow, fs.by])

  // 화면 옮기기 — 처음 화면은 폰 시트를 크게, 나머지는 반
  const go = (t: Tab) => {
    setTab(t)
    setSelected(null)
    setPickBase(false)
    setChecking(false)
    if (t === 'home') setPair(null)
    if (t === 'box') setView('top') // 비교함은 위에서 보기 + 번호 (W7.5 카메라)
    setSheet(t === 'home' || t === 'box' ? 'full' : 'half')
  }
  // 업종 고르기 — 하나(머리줄 · 패널) · 둘(첫 화면 ①) · 견줄 업종(동네 보기 '다른 업종과 견주기')
  const onPickOne = (c: string | null) => {
    setPicking(null)
    setPickGroup(null)
    if (picking === 'vs') {
      if (c && kind) setPair([kind, c])
      return
    }
    setKind(c)
    if (tab === 'home') go('map')
  }
  const onPickTwo = (a: string, b: string | null) => {
    setPicking(null)
    setPickGroup(null)
    setKind(a)
    setPair(b ? [a, b] : null)
    go('map')
  }
  const openCheck = () => {
    setChecking(true)
    setSheet('full')
  }
  const flyTo = (cell: number) => {
    const [lat, lng] = cellToLatLng(data!.cells.h3[cell])
    setGoTo((g) => ({ at: [lng, lat], n: (g?.n ?? 0) + 1 }))
  }
  // 예시로 보기 — 카페 · 후보 찾기(시청역 · 자동차 30분) → 1번 후보 카드 → 끝
  const startExample = () => {
    setKind('I21201')
    setFs({ from: null, ...FIND_DEFAULT })
    setFromLabel(null)
    go('find')
    setTour(1)
  }
  const tourNext = () => {
    if (tour === 1 && find.result?.list[0] != null) setSelected(find.result.list[0])
    if (tour === 2) setSelected(null)
    setTour(tour >= TOUR_STEPS.length ? 0 : tour + 1)
  }

  // 시안 비교판(?proto=1)에서만 — 이동 시간 일꾼을 시험(Playwright)이 부를 수 있게 둔다. 처음 부를 때 그래프(2.6MB)를 받는다
  useEffect(() => {
    if (!data || !init.protoOn) return
    let client: TravelClient | null = null
    window.__jeomjiTravel = async () => {
      const { TravelClient } = await import('./core/travel/client')
      client ??= new TravelClient(new URL(dataUrl(data.ver, 'graph/mv.json'), window.location.href).href)
      return client
    }
    return () => {
      client?.terminate()
      delete window.__jeomjiTravel
    }
  }, [data, init.protoOn])

  useEffect(() => {
    if (!data) return
    const q = new URLSearchParams()
    if (kind) q.set('kind', kind)
    if (tab === 'find') writeFind(q, fs, data.cells.h3)
    else if (tab === 'map' && kinds && show !== pickShow(null, chips)) q.set('show', show)
    if (tab === 'map' && pair) q.set('cmp', pair.join('_'))
    writeBox(q, box, data.cells.h3)
    if (tab === 'box') q.set('mode', 'box')
    if (selected != null) q.set('cell', data.cells.h3[selected])
    if (checking && selected != null) {
      q.set('chk', '1')
      writeCheck(q, ci)
      if (bei) q.set('bei', bei)
    }
    if (view === 'top') q.set('view', 'top')
    // 시안 비교 설정도 주소에 남긴다 — 고른 조합을 그대로 공유할 수 있게
    if (init.protoOn) q.set('proto', '1')
    if (proto.bldg !== PROTO_DEFAULT.bldg) q.set('bldg', proto.bldg)
    if (proto.bop !== PROTO_DEFAULT.bop && proto.bop != null) q.set('bop', String(proto.bop))
    if (proto.bg !== PROTO_DEFAULT.bg) q.set('bg', proto.bg)
    // 처음 화면은 주소가 비어 있을 때 — 다른 것이 남으면 mode=home, 동네 보기가 비면 mode=map
    if (tab === 'home' && q.toString()) q.set('mode', 'home')
    if (tab === 'map' && !q.toString()) q.set('mode', 'map')
    const s = q.toString()
    history.replaceState(null, '', s ? `?${s}` : location.pathname)
  }, [data, kind, kinds, show, chips, selected, view, proto, init.protoOn, tab, fs, checking, ci, bei, pair, box])

  if (err) return <div className="fatal" role="alert">자료를 읽지 못했습니다: {err}</div>
  if (!data) return <div className="loading" aria-busy="true">불러오는 중…</div>

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => { go('home'); setTour(0) }} aria-label="점지 — 처음 화면으로" data-testid="brand">
          <span className="logo" aria-hidden="true">⬡</span>
          <span className="name">점지</span>
          <span className="badge">시험판</span>
        </button>
        <button className="pick-btn" onClick={() => setPicking('one')} disabled={!kinds} aria-haspopup="dialog" data-testid="kind-btn">
          <span className="hint">업종</span> <strong>{kindRow?.nm ?? '고르기'}</strong> <span aria-hidden="true">▾</span>
        </button>
        <button
          className="toggle"
          aria-pressed={view === 'top'}
          onClick={() => setView(view === 'top' ? '3d' : 'top')}
        >
          {view === 'top' ? '3D로 보기' : '위에서 보기'}
        </button>
      </header>
      <main className="stage">
        <MapView
          data={data}
          classes={tab === 'find' ? find.classes : layer?.classes ?? null}
          mode={tab === 'find' ? 'time' : layer?.show ?? 'store'}
          hatch={tab === 'map' && layer?.legend.none?.look === 'hatch'}
          theme={theme}
          view={view}
          selected={selected}
          onSelect={setSelected}
          proto={proto}
          goTo={goTo}
          fade={tab === 'find' ? find.fade : null}
          find={tab === 'find' ? find.look : boxLook}
          picking={tab === 'find' && pickBase}
          onPick={(i) => { setFind({ from: i }); setFromLabel(null); setPickBase(false); setSelected(null) }}
          sheet={SHEET_FRAC[sheet]}
          panelW={panelW}
        />
        {tour > 0 && tab === 'find' && (
          <Tour step={tour} ready={!!find.result} onNext={tourNext} onEnd={() => { setTour(0); setSelected(null) }} />
        )}
        {tab === 'map' && (
          <ShowBar
            chips={chips}
            show={show}
            busy={busy}
            err={layerErr}
            onPick={setWant}
            pair={(sides || unSides) && pairKinds?.length === 2 ? pairKinds : null}
            active={kind}
            onActive={setKind}
          />
        )}
        {init.protoOn && (
          <ProtoPanel proto={proto} onChange={setProto} onGo={(at) => setGoTo((g) => ({ at, n: (g?.n ?? 0) + 1 }))} />
        )}
        {picking && kinds && (
          <KindPicker
            ix={kinds.ix}
            current={kind}
            mode={picking}
            initGroup={pickGroup}
            beCodes={beCodes}
            onPick={onPickOne}
            onTwo={onPickTwo}
            onClose={() => { setPicking(null); setPickGroup(null) }}
          />
        )}
        <Panel
          data={data}
          industry={industry}
          kind={kindRow}
          unIntro={unType && kindRow && kinds ? unIntro(unType, kindRow, kinds.ix.byCode) : null}
          card={card}
          show={layer?.show ?? null}
          legend={layer?.legend ?? null}
          theme={theme}
          selected={selected}
          onClear={() => setSelected(null)}
          tab={tab}
          onTab={(t) => { go(t); setTour(0) }}
          sheet={sheet}
          onSheet={setSheet}
          ctx={ctx}
          onVs={kindRow && kinds ? () => setPicking('vs') : null}
          cmp={tab !== 'map' || !pair ? null : sides && be && kinds ? (
            <ComparePanel
              a={sides[0]}
              b={sides[1]}
              meta={{ poi: kinds.d.meta.poi, period: kinds.period, year: be.meta.year }}
              inside={sides.flatMap((x) => unInside(x.k, [...kinds.ix.un.values()]).map((u) => ({ kind: x.k.nm, un: u.nm })))}
              onEnd={() => setPair(null)}
              onFind={(c) => { setKind(c); go('find') }}
            />
          ) : unSides && be && kinds?.unm ? (
            <UnComparePanel
              a={unSides[0]}
              b={unSides[1]}
              card={be.meta.card}
              meta={{ ftc: kinds.unm.ftc, list: kinds.unm.list }}
              onEnd={() => setPair(null)}
              onFind={(c) => { setKind(c); go('find') }}
            />
          ) : (
            <section className="kcmp" aria-busy="true"><p className="hint">두 업종을 견줄 자료를 받는 중이에요…</p></section>
          )}
          onCheck={openCheck}
          boxN={box.length}
          width={panelW}
          boxBtn={selected != null ? { boxed: box.includes(selected), full: box.length >= BOX_MAX, onBox: () => toggleBox(selected) } : null}
          box={
            <BoxPanel
              box={box}
              heads={box.map((i) => {
                const [dg, gu] = data.dongs[data.cells.dong[i]].split('|')
                return { title: dg, sub: gu }
              })}
              rows={rows}
              kindNm={kindRow?.nm ?? null}
              onCard={setSelected}
              onRemove={toggleBox}
              onClear={() => setBox([])}
              onPickKind={() => setPicking('one')}
              onMap={() => go('map')}
            />
          }
          check={checking && selected != null ? (
            <CheckPanel
              data={data}
              cell={selected}
              kind={kindRow}
              un={unType && kinds ? { u: unType, byCode: kinds.ix.byCode } : null}
              inp={inp}
              example={isExample(ci)}
              onInp={(p) => setCi((c) => applyInputs(c, p, chkDef))}
              onReset={() => setCi({})}
              bei={bei}
              onBei={setBei}
              onBack={() => setChecking(false)}
              onPickKind={() => setPicking('one')}
            />
          ) : null}
          onFindHere={() => {
            if (selected == null) return
            setFind({ from: selected })
            setFromLabel(null)
            go('find')
          }}
          home={
            <Home
              data={data}
              kinds={kindsAll}
              onKind={(c) => { setKind(c); go('map') }}
              onPlace={(p, chk) => { go('map'); setSelected(p.cell); flyTo(p.cell); if (chk) openCheck() }}
              onPickKind={() => setPicking('two')}
              onUnm={kinds?.ix.groups.has(UN_GROUP) ? () => { setPickGroup(UN_GROUP); setPicking('two') } : null}
              onFind={() => go('find')}
              onExample={startExample}
            />
          }
          find={
            <FindPanel
              data={data}
              kind={kindRow}
              pot={industry}
              s={fs}
              sort={sort}
              f={find}
              theme={theme}
              picking={pickBase}
              onChange={setFind}
              onBase={(cell, label) => { setFind({ from: cell }); setFromLabel(label); setPickBase(false); setSelected(null) }}
              onPicking={setPickBase}
              onPickKind={() => setPicking('one')}
              onSelect={setSelected}
            />
          }
        />
      </main>
    </div>
  )
}

declare global {
  interface Window {
    /** 시안 비교판에서만 — 이동 시간 일꾼 (시험용) */
    __jeomjiTravel?: () => Promise<TravelClient>
  }
}
