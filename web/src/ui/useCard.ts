import { useEffect, useMemo, useState } from 'react'
import { type CardInput, type CardModel, buildCard } from '../core/card'
import { type BaseData, loadJSON } from '../core/data'
import { type KindIndex, sameKind } from '../core/kinds'
import { type PlaceIndex, type StationData, buildPlaceIndex, nearestStation, placeGrid } from '../core/places'
import { type IndCells, type PotIndex, potIndex } from '../core/potential'
import { type SiteCuts, type SiteData, siteCuts } from '../core/site'
import { listWhen } from '../core/unm'
import { loadUnCells } from './unCells'

// 자리 카드 · 비교함에 드는 자료 — 칸을 처음 고르거나 비교함을 열 때 받는다 (자리 성격 · 이웃 · 역 · 부동산원 · 손익의 결제 포착 판정),
// 업종을 고르면 그 업종의 칸 가게 수와 매출 수준 자료를 더 받는다(무인 유형은 후보 자료의 같은 업종 · 명단의 무인). 계산은 core/card.ts · core/box.ts

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
  /** 무인 유형 — 명단의 무인 가게(이 칸 · 이 칸 + 둘레) · 명단에서 찾은 수 · 명단 시점 */
  un: { own: Int32Array; near: Int32Array; nearSorted: Float64Array; found: number; when: string } | null
}

export interface CardData {
  base: Base | null
  part: KindPart | null
}

/** 카드 자료 — want가 처음 참일 때 칸 공통 자료를, 업종이 있으면 그 업종 자료를 받는다 */
export function useCardData(data: BaseData, kinds: KindIndex | null, kind: string | null, want: boolean): CardData {
  const ver = data.ver
  const [base, setBase] = useState<Base | null>(null)
  const [part, setPart] = useState<KindPart | null>(null)

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
    const pk = kinds.depth(kind).pot, u = kinds.un.get(kind) ?? null
    Promise.all([u ? loadUnCells(ver, u) : loadJSON<number[]>(ver, `kinds/cnt/${kind}.json`), pk ? loadJSON<IndCells>(ver, `ind/${pk}.json`) : Promise.resolve(null)])
      .then(([x, cells]) => {
        if (!live) return
        const n = data.cells.h3.length
        const { own, near } = sameKind(Array.isArray(x) ? x : x.cnt, base.nb, n)
        let un: KindPart['un'] = null
        if (!Array.isArray(x)) {
          const m = sameKind(x.un, base.nb, n)
          un = { own: m.own, near: m.near, nearSorted: Float64Array.from(m.near).sort(), found: x.t.found, when: listWhen(x.list) }
        }
        setPart({ code: kind, own, near, nearSorted: Float64Array.from(near).sort(), pot: pk && cells ? { k: pk, cells, ix: potIndex(cells) } : null, un })
      })
      .catch(() => {})
    return () => { live = false }
  }, [base, kind, kinds, ver, data, part])

  return useMemo(() => ({ base, part }), [base, part])
}

/** 칸 하나의 카드 입력 — 자료를 받는 중이면 null */
export function cardInput(i: number, d: CardData, data: BaseData, kinds: KindIndex | null, kind: string | null): CardInput | null {
  const { base, part } = d
  if (!base) return null
  const k = kind && kinds ? kinds.byCode.get(kind) ?? null : null
  if (k && part?.code !== k.c) return null // 업종 자료를 받는 중
  const r = base.reb.cell[i]
  const m = part?.pot ? data.industries.find((x) => x.k === part.pot!.k) : null
  const u = k && kinds ? kinds.un.get(k.c) ?? null : null
  return {
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
    un: u && part?.un ? { u, own: part.un.own[i], near: part.un.near[i], nearSorted: part.un.nearSorted, found: part.un.found, when: part.un.when, survNm: kinds!.byCode.get(u.surv[0])?.nm ?? null } : null,
  }
}

/** 고른 칸의 자리 카드 */
export function useCard(d: CardData, data: BaseData, kinds: KindIndex | null, kind: string | null, selected: number | null): CardModel | null {
  return useMemo(() => {
    if (selected == null) return null
    const input = cardInput(selected, d, data, kinds, kind)
    return input ? buildCard(input) : null
  }, [selected, d, data, kinds, kind])
}
