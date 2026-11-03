/// <reference types="node" />
// 첫 화면 찾기 — 동 · 역 · 업종을 한 칸에서, 엔터는 무엇을 고르나 · 바로 가기 업종 (마스터플랜 W7.4 '첫 화면')
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type KindsData, kindIndex } from '../src/core/kinds'
import { buildPlaceIndex, placeGrid, type StationData } from '../src/core/places'
import { QUICK_KINDS, bestHit, searchAll } from '../src/core/search'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const kd = read<KindsData>('kinds/index.json')
const places = buildPlaceIndex(placeGrid(cells), dongs, read<StationData>('places/stations.json'))

describe('첫 화면 찾기', () => {
  it('업종 이름과 똑같으면 업종, 아니면 찾은 곳', () => {
    const r1 = searchAll('카페', kd, places)
    expect(r1.kinds[0].c).toBe('I21201')
    expect(bestHit('카페', r1)).toEqual({ kind: 'kind', k: r1.kinds[0] })
    const r2 = searchAll('망원1동', kd, places)
    expect(r2.places[0].label).toBe('망원1동 (마포구)')
    expect(bestHit('망원1동', r2)).toMatchObject({ kind: 'place', p: { label: '망원1동 (마포구)' } })
    const r3 = searchAll('강남역', kd, places)
    expect(r3.places[0].label).toMatch(/^강남역 \(/)
    // 곳이 없고 업종 앞부분만 맞으면 그 업종
    const r4 = searchAll('빨래', kd, places)
    expect(r4.places).toEqual([])
    expect(bestHit('빨래', r4)).toMatchObject({ kind: 'kind', k: { nm: '셀프 빨래방' } })
    expect(searchAll('  ', kd, places)).toEqual({ kinds: [], places: [] })
    expect(bestHit('없는말', searchAll('없는말', kd, places))).toBeNull()
  })

  it('바로 가기 업종은 모두 있고, 매출 수준이나 새 가게 지도가 있다', () => {
    const ix = kindIndex(kd, read<{ k: string; codes: string[]; paint: boolean }[]>('ind/index.json'), read<{ ind: { k: string }[] }>('entry/index.json').ind)
    for (const c of QUICK_KINDS) {
      expect(ix.byCode.has(c), c).toBe(true)
      const d = ix.depth(c)
      expect(!!d.pot || d.entry || c === 'S20902', c).toBe(true) // 셀프 빨래방은 같은 업종 지도로 (W7.15)
    }
  })
})
