import { useEffect, useMemo, useState } from 'react'
import { loadBase, loadIndustry, type BaseData } from './core/data'
import { levelClass, storeClass, toPct } from './core/level'
import MapView, { PROTO_DEFAULT, type Mode, type Proto, type View } from './map/MapView'
import Panel from './ui/Panel'
import ProtoPanel from './ui/ProtoPanel'
import type { Theme } from './map/palette'

// 주소(URL)에 상태를 둔다 — 새로고침·공유해도 같은 화면 (마스터플랜 W7.4)
function readURL() {
  const q = new URLSearchParams(location.search)
  const bop = Number(q.get('bop'))
  const proto: Proto = {
    bldg: q.get('bldg') === 'tint' ? 'tint' : q.get('bldg') === 'off' ? 'off' : PROTO_DEFAULT.bldg,
    bop: bop > 0 && bop <= 1 ? bop : null,
    bg: q.get('bg') === 'none' ? 'none' : 'vworld',
  }
  return { ind: q.get('ind'), cell: q.get('cell'), view: (q.get('view') === 'top' ? 'top' : '3d') as View, protoOn: q.get('proto') === '1', proto }
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

export default function App() {
  const theme = useTheme()
  const init = useMemo(readURL, [])
  const [data, setData] = useState<BaseData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ind, setInd] = useState<string | null>(init.ind)
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
        if (init.ind && !d.industries.some((x) => x.k === init.ind && x.paint)) setInd(null)
      })
      .catch((e: unknown) => setErr(String(e)))
  }, [init])

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
    if (ind) q.set('ind', ind)
    if (selected != null) q.set('cell', data.cells.h3[selected])
    if (view === 'top') q.set('view', 'top')
    // 시안 비교 설정도 주소에 남긴다 — 고른 조합을 그대로 공유할 수 있게
    if (init.protoOn) q.set('proto', '1')
    if (proto.bldg !== PROTO_DEFAULT.bldg) q.set('bldg', proto.bldg)
    if (proto.bop != null) q.set('bop', String(proto.bop))
    if (proto.bg !== PROTO_DEFAULT.bg) q.set('bg', proto.bg)
    const s = q.toString()
    history.replaceState(null, '', s ? `?${s}` : location.pathname)
  }, [data, ind, selected, view, proto, init.protoOn])

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

  const painted = useMemo(
    () => (data ? data.industries.filter((x) => x.paint).sort((a, b) => b.rho - a.rho) : []),
    [data],
  )

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
        <label className="pick">
          <span className="sr">업종</span>
          <select value={ind ?? ''} onChange={(e) => setInd(e.target.value || null)} aria-label="업종 고르기">
            <option value="">업종 전체 (가게 수)</option>
            {painted.map((x) => (
              <option key={x.k} value={x.k}>{x.nm}</option>
            ))}
          </select>
        </label>
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
        <Panel
          data={data}
          industry={mode === 'level' ? industry : null}
          values={values}
          mode={mode}
          theme={theme}
          selected={selected}
          onClear={() => setSelected(null)}
        />
      </main>
    </div>
  )
}
