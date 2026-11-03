import { useEffect, useMemo, useState } from 'react'
import { type CardInput, type CardModel, buildCard } from '../core/card'
import { type BaseData, loadJSON } from '../core/data'
import { type KindIndex, sameKind } from '../core/kinds'
import { type PlaceIndex, type StationData, buildPlaceIndex, nearestStation, placeGrid } from '../core/places'
import { type IndCells, type PotIndex, potIndex } from '../core/potential'
import { type SiteCuts, type SiteData, siteCuts } from '../core/site'

// 자리 카드에 드는 자료 — 칸을 처음 고를 때 받는다 (자리 성격 · 이웃 · 역 · 부동산원 · 손익의 결제 포착 판정),
// 업종을 고르면 그 업종의 칸 가게 수와 매출 수준 자료를 더 받는다. 계산은 core/card.ts

interface Reb {
  rents: { n: string; v: Record<string, number | null> }[]
  cell: number[]
}
interface BeCap {
  k: string
  cap: 'ok' | 'low' | 'unk'
  capnote: string
}

interface Base {
  site: SiteData
  nb: number[]
  cuts: SiteCuts
  n300Sorted: Float64Array
  places: PlaceIndex
  xy: { x: ArrayLike<number>; y: ArrayLike<number> }
  reb: Reb
  rebSorted: Float64Array
  be: BeCap[]
}

interface KindPart {
  code: string
  own: Int32Array
  near: Int32Array
  nearSorted: Float64Array
  pot: { k: string; cells: IndCells; ix: PotIndex } | null
}

export function useCard(data: BaseData, kinds: KindIndex | null, kind: string | null, selected: number | null): CardModel | null {
  const ver = data.ver
  const [base, setBase] = useState<Base | null>(null)
  const [part, setPart] = useState<KindPart | null>(null)
  const want = selected != null

  useEffect(() => {
    if (!want || base) return
    let live = true
    Promise.all([
      loadJSON<SiteData>(ver, 'grid/site.json'),
      loadJSON<number[]>(ver, 'grid/nb.json'),
      loadJSON<StationData>(ver, 'places/stations.json'),
      loadJSON<Reb>(ver, 'reb/index.json'),
      loadJSON<{ ind: BeCap[] }>(ver, 'be/index.json'),
    ]).then(([site, nb, st, reb, be]) => {
      if (!live) return
      const g = placeGrid(data.cells)
      setBase({
        site,
        nb,
        cuts: siteCuts(data.cells.n300, site.tilt),
        n300Sorted: Float64Array.from(data.cells.n300).sort(),
        places: buildPlaceIndex(g, data.dongs, st),
        xy: g,
        reb,
        rebSorted: Float64Array.from(reb.rents.map((r) => r.v['대표1층']).filter((v): v is number => v != null)).sort(),
        be: be.ind,
      })
    }).catch(() => {})
    return () => { live = false }
  }, [want, base, ver, data])

  useEffect(() => {
    if (!base || !kind || !kinds) {
      setPart(null)
      return
    }
    if (part?.code === kind) return
    let live = true
    const pk = kinds.depth(kind).pot
    Promise.all([loadJSON<number[]>(ver, `kinds/cnt/${kind}.json`), pk ? loadJSON<IndCells>(ver, `ind/${pk}.json`) : Promise.resolve(null)])
      .then(([cnt, cells]) => {
        if (!live) return
        const n = data.cells.h3.length
        const { own, near } = sameKind(cnt, base.nb, n)
        setPart({ code: kind, own, near, nearSorted: Float64Array.from(near).sort(), pot: pk && cells ? { k: pk, cells, ix: potIndex(cells) } : null })
      })
      .catch(() => {})
    return () => { live = false }
  }, [base, kind, kinds, ver, data, part])

  return useMemo(() => {
    if (selected == null || !base) return null
    const i = selected
    const k = kind && kinds ? kinds.byCode.get(kind) ?? null : null
    if (k && part?.code !== k.c) return null // 업종 자료를 받는 중
    const r = base.reb.cell[i]
    const m = part?.pot ? data.industries.find((x) => x.k === part.pot!.k) : null
    const input: CardInput = {
      i,
      dongKey: data.dongs[data.cells.dong[i]],
      n: data.cells.h3.length,
      n300: data.cells.n300[i],
      n300Sorted: base.n300Sorted,
      site: base.site,
      cuts: base.cuts,
      station: nearestStation(base.places, base.xy.x[i], base.xy.y[i]),
      reb: r >= 0 ? { name: base.reb.rents[r].n, v: base.reb.rents[r].v['대표1층'] ?? null, sorted: base.rebSorted } : null,
      kind: k && kinds ? { k, depth: kinds.depth(k.c), s12Sorted: kinds.s12Sorted } : null,
      same: k && part ? { own: part.own[i], near: part.near[i], nearSorted: part.nearSorted } : null,
      pot: m && part?.pot ? { nm: m.nm, rho: m.rho, note: m.note, cells: part.pot.cells, ix: part.pot.ix, cap: base.be.find((b) => b.k === m.k) ?? null } : null,
    }
    return buildCard(input)
  }, [selected, base, kind, kinds, part, data])
}
