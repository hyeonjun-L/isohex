import { type CSSProperties, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { defaultSort, sortKeys, type SortKey } from './core/candidates'
import { BE_SKIP, CHECK_DEFAULT, type CheckOver, applyInputs, beFor, isExample, readCheck, rowOf, writeCheck } from './core/check'
import { makeSide, readCmp } from './core/compare'
import { BOX_MAX, type BoxSales, boxRows, readBox, writeBox } from './core/box'
import type { CardInput } from './core/card'
import { dataUrl, loadBase, loadJSON, type BaseData } from './core/data'
import { type FitData, type FitRaw, decodeFit, fitLine, fitRows } from './core/fit'
import { FIND_DEFAULT, MODE_NM, PER_NM, findHead, findWhy, readFind, timeLegend, timeTicks, writeFind, type FindState } from './core/find'
import { type KindIndex, type KindsData, kindIndex } from './core/kinds'
import { type Show, chipsFor, parseShow, pickShow } from './core/layers'
import { type UnmData, UN_GROUP, isUn, unDefaults, unInside, unIntro, unSide, unDoor } from './core/unm'
import type { TravelClient } from './core/travel/client'
import { PROTO_DEFAULT, type Proto, type View } from './map/proto'

// 지도(라이브러리 1MB)는 첫 화면 글자가 뜬 뒤에 받는다
const MapView = lazy(() => import('./map/MapView'))
import Panel from './ui/Panel'
import KindPicker, { type PickMode } from './ui/KindPicker'
import ComparePanel from './ui/ComparePanel'
import UnComparePanel from './ui/UnComparePanel'
import BoxPanel from './ui/BoxPanel'
import ProtoPanel from './ui/ProtoPanel'
import ShowBar from './ui/ShowBar'
import MapLegend, { type MapLegendSpec } from './ui/MapLegend'
import FindPanel, { FindKeys } from './ui/FindPanel'
import CheckPanel from './ui/CheckPanel'
import FitPanel from './ui/FitPanel'
import Home from './ui/Home'
import Tour, { TOUR_STEPS } from './ui/Tour'
import { SHEET_FRAC, type Sheet, type Tab } from './ui/Panel'
import { cellToLatLng } from 'h3-js'
import { cardInput, useCard, useCardData } from './ui/useCard'
import { useBe, useCheckBase, useCheckRows } from './ui/useCheck'
import { useFind } from './ui/useFind'
import { useLayer } from './ui/useLayer'
import { useNarrow } from './ui/useNarrow'
import { timeText } from './core/travel/times'
import { MAP_COLORS, type Theme } from './map/palette'

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
  // unm=1 = 무인매장 묶음으로 바로 들어오는 문(처음 화면 + 업종 고르기 '무인매장') — 열고 나면 pick=two&grp=unm으로 바뀐다
  const unm = q.get('unm') === '1'
  const tab: Tab = m === 'find' ? 'find' : m === 'box' ? 'box' : m === 'home' || (!m && (!q.toString() || unm)) ? 'home' : 'map'
  // pick = 업종 고르기 창(one 하나 · two 둘 골라 견주기 · vs 견줄 업종), grp=unm이면 묶음 '무인매장'을 펼친다
  const pk = q.get('pick')
  const pick: PickMode | null = unm ? 'two' : pk === 'one' || pk === 'two' || pk === 'vs' ? pk : null
  const grp = unm || q.get('grp') === 'unm' ? UN_GROUP : null
  let cmp = readCmp(q.get('cmp'))
  let kind = q.get('kind')
  if (cmp && kind && !cmp.includes(kind)) cmp = null
  if (cmp && !kind) kind = cmp[0]
  return { kind, cmp, ind: q.get('ind'), show: parseShow(q.get('show')), cell: q.get('cell'), view: (q.get('view') === 'top' ? 'top' : '3d') as View, protoOn: q.get('proto') === '1', proto, tab, q, pick: pick === 'vs' && !kind ? null : pick, grp }
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
  const [picking, setPicking] = useState<PickMode | null>(init.pick)
  const [pickGroup, setPickGroup] = useState<string | null>(init.pick ? init.grp : null)
  const [pair, setPair] = useState<[string, string] | null>(init.cmp)
  const [box, setBox] = useState<number[]>([])
  const [want, setWant] = useState<Show | null>(init.show)
  const [view, setView] = useState<View>(init.view)
  const [selected, setSelected] = useState<number | null>(null)
  const [proto, setProto] = useState<Proto>(init.proto)
  const [goTo, setGoTo] = useState<{ at: [number, number]; n: number } | null>(null)
  const [tab, setTab] = useState<Tab>(init.tab)
  // 폰 시트 — 처음 화면 · 비교함 · 손익 점검 링크는 크게, 나머지는 반
  const [sheet, setSheet] = useState<Sheet>(init.tab === 'home' || init.tab === 'box' || (init.cell && (init.q.get('chk') === '1' || init.q.get('fit') === '1')) ? 'full' : 'half')
  const [tour, setTour] = useState(0)
  // 지도 위 범례 — 데스크톱의 처음 화면 · 동네 보기는 편 채(단계마다 쉬운 말), 폰과 후보 찾기 · 비교함은 한 줄 막대로 시작한다.
  // 제목 줄을 누른 뒤로는 고른 대로(null = 아직 안 누름)
  const narrow = useNarrow()
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null)
  const [fs, setFs] = useState<FindState>({ from: null, ...FIND_DEFAULT })
  const [fromLabel, setFromLabel] = useState<string | null>(null)
  const [pickBase, setPickBase] = useState(false)
  // 손익 점검 — 매물 숫자는 칸을 옮겨도 그대로 둔다(같은 매물 조건으로 여러 자리를 견줘 보게)
  const [checking, setChecking] = useState(init.q.get('chk') === '1')
  const [ci, setCi] = useState<CheckOver>(() => readCheck(init.q))
  const [bei, setBei] = useState<string | null>(init.q.get('bei'))
  // 이 자리에 맞는 업종(거꾸로 찾기) — 고른 칸에서 연다. 자료(ind/all.json)는 처음 열 때 받는다
  const [fitting, setFitting] = useState(init.q.get('fit') === '1' && init.q.get('chk') !== '1')
  const [fitData, setFitData] = useState<FitData | null>(null)
  const [fitErr, setFitErr] = useState(false)
  // 뒤로 가기 — 화면이 바뀔 때(탭 · 자리 카드 · 손익 점검 · 맞는 업종)는 방문 기록을 남기고, 값만 바뀔 때는 덮어쓴다 (W7.16 쓰임새 1)
  const lastScreen = useRef<string | null>(null)
  const lastPick = useRef(false)
  const beforePick = useRef<string | null>(null)
  const waitBack = useRef(false)
  const [histTick, setHistTick] = useState(0)
  const popped = useRef(false)

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
    if (prevSel.current != null && selected == null) {
      setChecking(false)
      setFitting(false)
    }
    prevSel.current = selected
  }, [selected])
  const ctx = useMemo(() => {
    if (tab !== 'find' || selected == null || !find.times) return null
    if (!find.result || !find.query || !find.base || !kindRow) return { head: `${MODE_NM[fs.by]} ${timeText(find.times[selected])}`, why: '' }
    return { head: findHead(selected, find.result, find.query.times, fs.by), why: findWhy(selected, find.base.grid, find.query, find.result, kindRow.nm, fs.by) }
  }, [tab, selected, find.times, find.result, find.query, find.base, kindRow, fs.by])

  // 지도 위 범례 — 지금 지도에 칠한 것의 색 단계. 후보 찾기는 시간 띠, 나머지는 고른 지표(처음 화면 · 비교함에서도 보인다)
  const legend = useMemo((): MapLegendSpec | null => {
    if (tab === 'find') {
      if (!find.look) return null
      const cols = MAP_COLORS.time[theme]
      return {
        title: `기준점에서 ${MODE_NM[fs.by]}로 걸리는 시간${fs.by !== 'walk' ? ` · ${PER_NM[fs.at]}` : ''}`,
        sub: null,
        items: timeLegend(fs.min).map((it) => ({ label: it.label, color: cols[it.c] })),
        none: null,
        ...timeTicks(fs.min),
        mid: null,
      }
    }
    if (!layer) return null
    const cols = MAP_COLORS[layer.show][theme]
    const { words, ...lg } = layer.legend
    return { ...lg, items: lg.items.map((it) => ({ label: it.label, color: cols[it.c] })), ends: words ? [words.lo, words.hi] : null, mid: words?.mid ?? null }
  }, [tab, find.look, fs.by, fs.at, fs.min, layer, theme])
  // 후보 찾기 · 비교함은 후보 · 담은 곳을 화면에 맞춰 보여 주므로 왼쪽 위 모서리에도 번호가 온다 — 범례를 접어 덜 가리게
  const legendIsOpen = legendOpen ?? (!narrow && (tab === 'map' || tab === 'home'))
  // 업종 둘 견주기 — 지도 위에 칠할 업종 바꾸기 [A | B] 줄이 선다
  const segOn = tab === 'map' && !!(sides || unSides) && pairKinds?.length === 2
  // 지도 위쪽을 덮는 것의 높이 — 폰은 칩 줄(52) + 한 줄 범례(68), 견줄 때는 [A | B] 줄(48)이 더. 데스크톱은 범례가 왼쪽 위 모서리뿐이라
  // 맞춰 보는 화면(후보 찾기 · 비교함)에서만 한 줄 범례만큼 비운다. 고른 칸 · 맞춰 보는 범위가 그 아래에 온다 (MapView viewPadding)
  const mapTop = narrow ? (segOn ? 168 : 120) : tab === 'find' || tab === 'box' ? 88 : 12

  // 화면 옮기기 — 처음 화면은 폰 시트를 크게, 나머지는 반
  const go = (t: Tab) => {
    setTab(t)
    setSelected(null)
    setPickBase(false)
    setChecking(false)
    setFitting(false)
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
    setFitting(false)
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
    if (fitting && !checking && selected != null) q.set('fit', '1')
    if (picking) {
      q.set('pick', picking)
      if (pickGroup === UN_GROUP) q.set('grp', 'unm')
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
    const url = s ? `?${s}` : location.pathname
    const screen = `${tab}|${selected != null ? 'cell' : ''}|${selected != null && checking ? 'chk' : ''}|${selected != null && fitting && !checking ? 'fit' : ''}|${picking ? 'pick' : ''}`
    if (waitBack.current) return // 창을 닫으며 뒤로 가는 중 — popstate가 오면 다시 쓴다
    // 업종 고르기 창은 열 때만 기록을 남긴다. 고르거나 닫으면 — 창을 열기 전 화면 그대로면 그 기록으로 돌아가 주소만 고치고,
    // 화면이 바뀌었으면(첫 화면에서 골라 동네 보기로) 창의 기록을 덮어쓴다. 어느 쪽이든 뒤로 가도 창이 다시 뜨지 않는다
    const closingPick = !popped.current && lastPick.current && !picking
    if (closingPick && screen === beforePick.current) {
      lastScreen.current = screen
      lastPick.current = false
      waitBack.current = true
      setTimeout(() => { if (waitBack.current) { waitBack.current = false; setHistTick((n) => n + 1) } }, 600) // popstate가 오지 않을 때
      history.back()
      return
    }
    const push = !popped.current && lastScreen.current != null && lastScreen.current !== screen && !closingPick
    if (picking && !lastPick.current) beforePick.current = lastScreen.current
    popped.current = false
    lastScreen.current = screen
    lastPick.current = !!picking
    if (push) history.pushState(null, '', url)
    else history.replaceState(null, '', url)
  }, [data, kind, kinds, show, chips, selected, view, proto, init.protoOn, tab, fs, checking, fitting, ci, bei, pair, box, picking, pickGroup, histTick])

  // 뒤로 · 앞으로 — 주소에서 상태를 다시 읽는다 (업종 고르기 창 · 예시로 보기는 닫는다)
  useEffect(() => {
    if (!data) return
    const idx = new Map(data.cells.h3.map((h, i) => [h, i]))
    const look = (h: string) => idx.get(h) ?? -1
    const onPop = () => {
      if (waitBack.current) { // 업종 고르기 창을 닫으며 돌아온 것 — 상태는 그대로 두고 주소만 다시 쓴다
        waitBack.current = false
        setHistTick((n) => n + 1)
        return
      }
      const u = readURL()
      const c = u.cell ? look(u.cell) : -1
      const chk = u.q.get('chk') === '1' && c >= 0
      popped.current = true
      setPicking(u.pick)
      setPickGroup(u.pick ? u.grp : null)
      setTour(0)
      setPickBase(false)
      setKind(u.kind && (!kinds || kinds.ix.byCode.has(u.kind)) ? u.kind : null)
      setPair(u.cmp)
      setWant(u.show)
      setView(u.view)
      setTab(u.tab)
      setSelected(c >= 0 ? c : null)
      setChecking(chk)
      setFitting(u.q.get('fit') === '1' && c >= 0 && !chk)
      setCi(readCheck(u.q))
      setBei(u.q.get('bei'))
      setFs(readFind(u.q, look))
      setBox(readBox(u.q.get('box'), look))
      setSheet(u.tab === 'home' || u.tab === 'box' || chk ? 'full' : 'half')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [data, kinds])

  // 맞는 업종 자료 — 처음 열 때 한 번
  useEffect(() => {
    if (!data || !fitting || fitData) return
    let live = true
    setFitErr(false)
    loadJSON<FitRaw>(data.ver, 'ind/all.json').then((r) => live && setFitData(decodeFit(r))).catch(() => live && setFitErr(true))
    return () => { live = false }
  }, [data, fitting, fitData])
  const fitModel = useMemo(() => (data && fitData && fitting && selected != null ? fitRows(fitData, data.industries, selected) : null), [data, fitData, fitting, selected])

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
        <Suspense fallback={<div className="map map-wait" aria-busy="true" />}>
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
          top={mapTop}
        />
        </Suspense>
        {/* 지도 왼쪽 위에 차례로 쌓는다 — 예시 안내 · 칠할 것 고르는 칩 · 범례 (데스크톱은 패널 오른쪽) */}
        <div className="map-top" style={{ '--pw': `${panelW}px` } as CSSProperties}>
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
              pair={segOn ? pairKinds : null}
              active={kind}
              onActive={setKind}
            />
          )}
          {legend && (
            <MapLegend
              spec={legend}
              theme={theme}
              open={legendIsOpen}
              onToggle={() => setLegendOpen(!legendIsOpen)}
              extra={tab === 'find' ? <FindKeys min={fs.min} kind={!!kindRow} fade={MAP_COLORS.time[theme][1]} /> : null}
            />
          )}
        </div>
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
          onFit={selected != null ? () => { setChecking(false); setFitting(true); setSheet('full') } : null}
          fit={fitting && !checking && selected != null ? (
            <FitPanel
              title={data.dongs[data.cells.dong[selected]].split('|').join(' · ')}
              model={fitModel}
              err={fitErr}
              line={fitModel ? fitLine(data.dongs[data.cells.dong[selected]].split('|')[0], fitModel) : null}
              onBack={() => setFitting(false)}
              onKind={(c) => { setKind(c); setPair(null); setFitting(false) }}
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
              unDoor={kinds && kinds.ix.un.size ? unDoor([...kinds.ix.un.values()]) : null}
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
