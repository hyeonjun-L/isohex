import { useEffect, useMemo, useState } from 'react'
import { dataUrl, loadBase, loadIndustry, loadJSON, type BaseData } from './core/data'
import { type KindIndex, type KindsData, kindIndex } from './core/kinds'
import type { TravelClient } from './core/travel/client'
import { levelClass, storeClass, toPct } from './core/level'
import MapView, { PROTO_DEFAULT, type Mode, type Proto, type View } from './map/MapView'
import Panel from './ui/Panel'
import KindPicker from './ui/KindPicker'
import ProtoPanel from './ui/ProtoPanel'
import { useCard } from './ui/useCard'
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
  return { kind: q.get('kind'), ind: q.get('ind'), cell: q.get('cell'), view: (q.get('view') === 'top' ? 'top' : '3d') as View, protoOn: q.get('proto') === '1', proto }
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
  const [kinds, setKinds] = useState<{ d: KindsData; ix: KindIndex } | null>(null)
  const [picking, setPicking] = useState(false)
  const [values, setValues] = useState<(number | null)[] | null>(null)
  const [view, setView] = useState<View>(init.view)
  const [selected, setSelected] = useState<number | null>(null)
  const [proto, setProto] = useState<Proto>(init.proto)
  const [goTo, setGoTo] = useState<{ at: [number, number]; n: number } | null>(null)

  useEffect(() => {
    loadBase()
      .then((d) => {
        setData(d)
        if (init.cell) {
          const i = d.cells.h3.indexOf(init.cell)
          if (i >= 0) setSelected(i)
        }
        return Promise.all([loadJSON<KindsData>(d.ver, 'kinds/index.json'), loadJSON<{ ind: { k: string }[] }>(d.ver, 'entry/index.json')]).then(([kd, en]) => {
          const ix = kindIndex(kd, d.industries, en.ind)
          setKinds({ d: kd, ix })
          if (init.ind && !init.kind) setKind(d.industries.find((x) => x.k === init.ind)?.codes[0] ?? null)
          else if (init.kind && !ix.byCode.has(init.kind)) setKind(null)
        })
      })
      .catch((e: unknown) => setErr(String(e)))
  }, [init])

  // 고른 업종이 매출 수준을 칠하는 업종이면 그 값으로 칠한다 (아니면 가게가 모인 정도)
  const ind = kind && kinds ? kinds.ix.depth(kind).pot : null
  const kindRow = kind && kinds ? kinds.ix.byCode.get(kind) ?? null : null
  const card = useCard(data ?? EMPTY, kinds?.ix ?? null, kind, data ? selected : null)

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
    if (!data || !ind) {
      setValues(null)
      return
    }
    let live = true
    loadIndustry(data.ver, ind)
      .then((v) => { if (live) setValues(v) })
      .catch((e: unknown) => setErr(String(e)))
    return () => { live = false }
  }, [data, ind])

  useEffect(() => {
    if (!data) return
    const q = new URLSearchParams()
    if (kind) q.set('kind', kind)
    if (selected != null) q.set('cell', data.cells.h3[selected])
    if (view === 'top') q.set('view', 'top')
    // 시안 비교 설정도 주소에 남긴다 — 고른 조합을 그대로 공유할 수 있게
    if (init.protoOn) q.set('proto', '1')
    if (proto.bldg !== PROTO_DEFAULT.bldg) q.set('bldg', proto.bldg)
    if (proto.bop !== PROTO_DEFAULT.bop && proto.bop != null) q.set('bop', String(proto.bop))
    if (proto.bg !== PROTO_DEFAULT.bg) q.set('bg', proto.bg)
    const s = q.toString()
    history.replaceState(null, '', s ? `?${s}` : location.pathname)
  }, [data, kind, selected, view, proto, init.protoOn])

  const industry = data?.industries.find((x) => x.k === ind) ?? null
  const mode: Mode = industry && values ? 'level' : 'store'
  const classes = useMemo(() => {
    if (!data) return null
    const n = data.cells.h3.length
    const out = new Int8Array(n)
    if (mode === 'level' && values) for (let i = 0; i < n; i++) out[i] = levelClass(toPct(values[i]))
    else for (let i = 0; i < n; i++) out[i] = storeClass(data.cells.n300[i])
    return out
  }, [data, mode, values])

  if (err) return <div className="fatal" role="alert">자료를 읽지 못했습니다: {err}</div>
  if (!data) return <div className="loading" aria-busy="true">불러오는 중…</div>

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">⬡</span>
          <span className="name">점지</span>
          <span className="badge">시험판</span>
        </div>
        <button className="pick-btn" onClick={() => setPicking(true)} disabled={!kinds} aria-haspopup="dialog" data-testid="kind-btn">
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
          classes={classes}
          mode={mode}
          theme={theme}
          view={view}
          selected={selected}
          onSelect={setSelected}
          proto={proto}
          goTo={goTo}
        />
        {init.protoOn && (
          <ProtoPanel proto={proto} onChange={setProto} onGo={(at) => setGoTo((g) => ({ at, n: (g?.n ?? 0) + 1 }))} />
        )}
        {picking && kinds && (
          <KindPicker
            ix={kinds.ix}
            kinds={kinds.d.kinds}
            current={kind}
            onPick={(c) => { setKind(c); setPicking(false) }}
            onClose={() => setPicking(false)}
          />
        )}
        <Panel
          data={data}
          industry={mode === 'level' ? industry : null}
          kind={kindRow}
          card={card}
          mode={mode}
          theme={theme}
          selected={selected}
          onClear={() => setSelected(null)}
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
