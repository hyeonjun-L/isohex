import { useEffect, useMemo, useState } from 'react'
import { dataUrl, loadBase, loadJSON, type BaseData } from './core/data'
import { type KindIndex, type KindsData, kindIndex } from './core/kinds'
import { type Show, chipsFor, parseShow, pickShow } from './core/layers'
import type { TravelClient } from './core/travel/client'
import MapView, { PROTO_DEFAULT, type Proto, type View } from './map/MapView'
import Panel from './ui/Panel'
import KindPicker from './ui/KindPicker'
import ProtoPanel from './ui/ProtoPanel'
import ShowBar from './ui/ShowBar'
import { useCard } from './ui/useCard'
import { useLayer } from './ui/useLayer'
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
  return { kind: q.get('kind'), ind: q.get('ind'), show: parseShow(q.get('show')), cell: q.get('cell'), view: (q.get('view') === 'top' ? 'top' : '3d') as View, protoOn: q.get('proto') === '1', proto }
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
  const [kinds, setKinds] = useState<{ d: KindsData; ix: KindIndex; period: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [want, setWant] = useState<Show | null>(init.show)
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
        return Promise.all([loadJSON<KindsData>(d.ver, 'kinds/index.json'), loadJSON<{ meta: { period: string }; ind: { k: string }[] }>(d.ver, 'entry/index.json')]).then(([kd, en]) => {
          const ix = kindIndex(kd, d.industries, en.ind)
          setKinds({ d: kd, ix, period: en.meta.period })
          if (init.ind && !init.kind) setKind(d.industries.find((x) => x.k === init.ind)?.codes[0] ?? null)
          else if (init.kind && !ix.byCode.has(init.kind)) setKind(null)
        })
      })
      .catch((e: unknown) => setErr(String(e)))
  }, [init])

  // 지도에 칠할 지표 — 업종마다 볼 수 있는 것이 다르다 (core/layers.ts)
  const kindRow = kind && kinds ? kinds.ix.byCode.get(kind) ?? null : null
  const depth = kindRow && kinds ? kinds.ix.depth(kindRow.c) : null
  const chips = useMemo(() => chipsFor(kindRow?.nm ?? null, depth), [kindRow, depth?.pot, depth?.entry]) // eslint-disable-line react-hooks/exhaustive-deps
  const show = pickShow(want, chips)
  const industry = data?.industries.find((x) => x.k === depth?.pot) ?? null
  const { layer, busy, err: layerErr } = useLayer(data, { show, kind: kindRow, pot: industry, poi: kinds?.d.meta.poi ?? '', period: kinds?.period ?? '' })
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
    if (!data) return
    const q = new URLSearchParams()
    if (kind) q.set('kind', kind)
    if (kinds && show !== pickShow(null, chips)) q.set('show', show)
    if (selected != null) q.set('cell', data.cells.h3[selected])
    if (view === 'top') q.set('view', 'top')
    // 시안 비교 설정도 주소에 남긴다 — 고른 조합을 그대로 공유할 수 있게
    if (init.protoOn) q.set('proto', '1')
    if (proto.bldg !== PROTO_DEFAULT.bldg) q.set('bldg', proto.bldg)
    if (proto.bop !== PROTO_DEFAULT.bop && proto.bop != null) q.set('bop', String(proto.bop))
    if (proto.bg !== PROTO_DEFAULT.bg) q.set('bg', proto.bg)
    const s = q.toString()
    history.replaceState(null, '', s ? `?${s}` : location.pathname)
  }, [data, kind, kinds, show, chips, selected, view, proto, init.protoOn])

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
          classes={layer?.classes ?? null}
          mode={layer?.show ?? 'store'}
          hatch={layer?.legend.none?.look === 'hatch'}
          theme={theme}
          view={view}
          selected={selected}
          onSelect={setSelected}
          proto={proto}
          goTo={goTo}
        />
        <ShowBar chips={chips} show={show} busy={busy} err={layerErr} onPick={setWant} />
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
          industry={industry}
          kind={kindRow}
          card={card}
          show={layer?.show ?? null}
          legend={layer?.legend ?? null}
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
