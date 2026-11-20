import { useEffect, useMemo, useState } from 'react'
import { cellToLatLng } from 'h3-js'
import { type CardInput, type CardModel, type MixRows, buildCard, mixAt, recAt } from '../core/card'
import { type BeInd, type BeMeta, beFor } from '../core/check'
import { type BaseData, loadJSON } from '../core/data'
import { type KindIndex, sameKind } from '../core/kinds'
import { type PlaceIndex, type StationData, buildPlaceIndex, nearestStation, placeGrid } from '../core/places'
import { type BdongData, bdongAt } from '../core/links'
import type { MixFile } from '../core/mix'
import { type IndCells, type PotIndex, potIndex } from '../core/potential'
import { type SiteCuts, type SiteData, siteCuts } from '../core/site'
import { listWhen } from '../core/unm'
import { loadUnCells } from './unCells'

// 자리 카드 · 비교함에 드는 자료 — 칸을 처음 고르거나 비교함을 열 때 받는다 (자리 성격 · 이웃 · 역 · 부동산원 · 손익 업종 표 · 칸 → 상권·행정동),
// 업종을 고르면 그 업종의 칸 가게 수와 매출 수준 자료, 견줄 서울시 업종이 있으면 이 동네 매출 행(be/ind/)을 더 받는다
// (무인 유형은 후보 자료의 같은 업종 · 명단의 무인). 계산은 core/card.ts · core/box.ts

interface Reb {
  rents: { n: string; v: Record<string, number | null> }[]
  cell: number[]
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
  /** 손익 업종 표(be/index.json) · 분위 위치와 기준 연도 */
  be: BeInd[]
  beMeta: BeMeta
  /** 칸 → 서울시 상권 · 행정동 번호(없으면 −1)와 그 이름 — 이 동네 매출이 어느 상권 · 행정동 값인지 */
  c2s: number[]
  c2d: number[]
  sangNm: string[]
  dongNm: string[]
  /** 칸 → 법정동 — 카드의 '근처 상가 매물' 링크 (없는 판이면 null) */
  bdong: BdongData | null
}

interface KindPart {
  code: string
  own: Int32Array
  near: Int32Array
  nearSorted: Float64Array
  pot: { k: string; cells: IndCells; ix: PotIndex } | null
  /** 무인 유형 — 명단의 무인 가게(이 칸 · 이 칸 + 둘레) · 명단에서 찾은 수 · 명단 시점 */
  un: { own: Int32Array; near: Int32Array; nearSorted: Float64Array; found: number; when: string } | null
  /** 이 동네 매출 — 견줄 서울시 업종의 상권(S) · 행정동(D) 행. 견줄 업종이 없으면 null */
  rec: { ind: BeInd; S: Map<number, number[]>; D: Map<number, number[]> } | null
  /** 이 동네 손님 구성 — 같은 서울시 업종의 be/mix/ 행 (없는 판이거나 못 받으면 null) */
  mix: MixRows | null
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
      loadJSON<{ meta: BeMeta; ind: BeInd[] }>(ver, 'be/index.json'),
      // 아래 둘은 이 동네 매출에만 쓴다 — 못 받아도 카드는 그린다(그 숫자만 빠진다)
      loadJSON<{ sang: { nm: string[] }; dong: { nm: string[] } }>(ver, 'be/places.json').catch(() => null),
      loadJSON<{ c2s: number[]; c2d: number[] }>(ver, 'be/cells.json').catch(() => null),
      loadJSON<BdongData>(ver, 'places/bdong.json').catch(() => null),
    ]).then(([site, nb, st, reb, be, pl, cl, bd]) => {
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
        beMeta: be.meta,
        c2s: pl && cl ? cl.c2s : [],
        c2d: pl && cl ? cl.c2d : [],
        sangNm: pl?.sang.nm ?? [],
        dongNm: pl?.dong.nm ?? [],
        bdong: bd && bd.c.length === data.cells.h3.length ? bd : null,
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
    const bi = u ? null : beFor(kind, base.be)
    Promise.all([
      u ? loadUnCells(ver, u) : loadJSON<number[]>(ver, `kinds/cnt/${kind}.json`),
      pk ? loadJSON<IndCells>(ver, `ind/${pk}.json`) : Promise.resolve(null),
      // 이 동네 매출 행은 못 받아도 카드는 그린다(그 숫자만 빠진다)
      bi ? loadJSON<{ S: number[][]; D: number[][] }>(ver, `be/ind/${bi.k}.json`).catch(() => null) : Promise.resolve(null),
      bi ? loadJSON<MixFile>(ver, `be/mix/${bi.k}.json`).catch(() => null) : Promise.resolve(null),
    ])
      .then(([x, cells, rows, mx]) => {
        if (!live) return
        const n = data.cells.h3.length
        const { own, near } = sameKind(Array.isArray(x) ? x : x.cnt, base.nb, n)
        let un: KindPart['un'] = null
        if (!Array.isArray(x)) {
          const m = sameKind(x.un, base.nb, n)
          un = { own: m.own, near: m.near, nearSorted: Float64Array.from(m.near).sort(), found: x.t.found, when: listWhen(x.list) }
        }
        const rec = bi && rows ? { ind: bi, S: new Map(rows.S.map((r) => [r[0], r])), D: new Map(rows.D.map((r) => [r[0], r])) } : null
        const mix = mx ? { year: mx.year, seoul: mx.seoul, S: new Map(mx.S.map((r) => [r[0], r])), D: new Map(mx.D.map((r) => [r[0], r])) } : null
        setPart({ code: kind, own, near, nearSorted: Float64Array.from(near).sort(), pot: pk && cells ? { k: pk, cells, ix: potIndex(cells) } : null, un, rec, mix })
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
  const rec = part?.rec ? recAt(i, { c2s: base.c2s, c2d: base.c2d, sangNm: base.sangNm, dongNm: base.dongNm, qs: base.beMeta.qs, year: base.beMeta.year }, part.rec) : null
  const [lat, lng] = cellToLatLng(data.cells.h3[i])
  return {
    rec,
    mix: rec && part?.mix ? mixAt(i, base, part.mix, rec.level) : null,
    at: { lat, lng, bd: bdongAt(base.bdong, i) },
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
    pot: m && part?.pot ? { nm: m.nm, rho: m.rho, hit: m.hit ?? null, note: m.note, cells: part.pot.cells, ix: part.pot.ix, cap: base.be.find((b) => b.k === m.k) ?? null, span: m.span ?? null, base: m.base ?? null } : null,
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
