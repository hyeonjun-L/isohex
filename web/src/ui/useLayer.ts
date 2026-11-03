import { useEffect, useState } from 'react'
import { type BaseData, type Industry, loadIndustry, loadJSON } from '../core/data'
import { type EntryCells, entryWindow } from '../core/entry'
import { type Kind, sameKind } from '../core/kinds'
import { type Layer, type Show, entryLayer, potLayer, rentLayer, sameLayer, storeLayer } from '../core/layers'

// 동네 보기 지표 하나를 칸 색 번호와 범례로 — 필요한 자료만 받는다(받은 것은 core/data.ts가 기억해 두어 자리 카드와 함께 쓴다).
// 새 지표를 받는 동안에는 앞 지표를 그대로 둔다 — 색과 범례가 언제나 같은 지표를 말하게

interface Reb {
  rents: { n: string; v: Record<string, number | null> }[]
  cell: number[]
}

export interface LayerWant {
  show: Show
  /** 고른 업종 — 같은 업종 · 새 가게 */
  kind: Kind | null
  /** 매출 수준을 칠하는 업종 */
  pot: Industry | null
  /** 상가정보 기준 분기('2026Q2') · 새 가게 기간('2025Q1~Q2') */
  poi: string
  period: string
}

function poiText(q: string): string {
  const m = q.match(/^(\d{4})Q([1-4])$/)
  return m ? `${m[1]}년 ${m[2]}분기` : q
}

async function build(data: BaseData, w: LayerWant): Promise<Layer> {
  const ver = data.ver, n = data.cells.h3.length
  switch (w.show) {
    case 'pot':
      if (!w.pot) break
      return potLayer(await loadIndustry(ver, w.pot.k), w.pot.nm)
    case 'same': {
      if (!w.kind) break
      const [nb, cnt] = await Promise.all([loadJSON<number[]>(ver, 'grid/nb.json'), loadJSON<number[]>(ver, `kinds/cnt/${w.kind.c}.json`)])
      return sameLayer(sameKind(cnt, nb, n).near, w.kind.nm, poiText(w.poi))
    }
    case 'entry': {
      if (!w.kind) break
      const [nb, d] = await Promise.all([loadJSON<number[]>(ver, 'grid/nb.json'), loadJSON<EntryCells>(ver, `entry/${w.kind.c}.json`)])
      return entryLayer(entryWindow(d, nb, n).ow, w.kind.nm, w.period)
    }
    case 'rent': {
      const reb = await loadJSON<Reb>(ver, 'reb/index.json')
      return rentLayer(reb.cell, reb.rents)
    }
    case 'store':
      break
  }
  return storeLayer(data.cells.n300)
}

export function useLayer(data: BaseData | null, want: LayerWant): { layer: Layer | null; busy: boolean; err: string | null } {
  const [layer, setLayer] = useState<Layer | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const key = [want.show, want.kind?.c ?? '', want.pot?.k ?? ''].join('|')

  useEffect(() => {
    if (!data) return
    let live = true
    setBusy(true)
    setErr(null)
    build(data, want)
      .then((l) => { if (live) setLayer(l) })
      .catch((e: unknown) => { if (live) setErr(String(e)) })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
    // key가 바뀔 때만 다시 만든다 (want는 그릴 때마다 새 객체)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, key])

  return { layer, busy, err }
}
