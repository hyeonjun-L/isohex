/// <reference types="node" />
// 이 동네 손님은(be/mix/) · 카드 링크(places/bdong.json) — 2026-11-20 전체 검토 3번 · 4번
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { type MixRows, type RecBase, type RecRows, buildCard, mixAt, recAt } from '../src/core/card'
import { type BeInd, type BeMeta, beFor } from '../src/core/check'
import { type KindsData, kindIndex, sameKind } from '../src/core/kinds'
import { type BdongData, bdongAt, listingUrl, outLinks, roadviewUrl } from '../src/core/links'
import { type MixFile, mixRow, mixSeoul, mixView } from '../src/core/mix'
import { type SiteData, siteCuts } from '../src/core/site'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const beAll = read<{ meta: BeMeta; ind: BeInd[] }>('be/index.json')
const pl = read<{ sang: { nm: string[] }; dong: { nm: string[] } }>('be/places.json')
const cl = read<{ c2s: number[]; c2d: number[] }>('be/cells.json')
const bdong = read<BdongData>('places/bdong.json')
const N = cells.h3.length
const recBase: RecBase = { c2s: cl.c2s, c2d: cl.c2d, sangNm: pl.sang.nm, dongNm: pl.dong.nm, qs: beAll.meta.qs, year: beAll.meta.year }
const at = (lat: number, lng: number) => cells.h3.indexOf(latLngToCell(lat, lng, 9))
const rowsOf = (k: string) => {
  const r = read<{ S: number[][]; D: number[][] }>(`be/ind/${k}.json`), m = read<MixFile>(`be/mix/${k}.json`), bi = beAll.ind.find((b) => b.k === k)!
  const rec: RecRows = { ind: bi, S: new Map(r.S.map((x) => [x[0], x])), D: new Map(r.D.map((x) => [x[0], x])) }
  const mix: MixRows = { year: m.year, seoul: m.seoul, S: new Map(m.S.map((x) => [x[0], x])), D: new Map(m.D.map((x) => [x[0], x])) }
  return { rec, mix, m }
}

describe('손님 구성 자료 (be/mix/)', () => {
  it('업종마다 손익 행과 같은 지역 · 몫의 합은 100 언저리 · 서울 값', () => {
    expect(beAll.ind).toHaveLength(60)
    for (const d of beAll.ind) {
      const { m } = rowsOf(d.k), r = read<{ S: number[][]; D: number[][] }>(`be/ind/${d.k}.json`)
      expect(m.k).toBe(d.k)
      expect(m.year).toBe(2025)
      expect(m.S.map((x) => x[0]).sort((a, b) => a - b), d.nm).toEqual(r.S.map((x) => x[0]).sort((a, b) => a - b))
      expect(m.D.map((x) => x[0]).sort((a, b) => a - b), d.nm).toEqual(r.D.map((x) => x[0]).sort((a, b) => a - b))
      for (const x of [...m.S, ...m.D]) {
        expect(x, d.nm).toHaveLength(19)
        const t = x.slice(2, 8).reduce((a, b) => a + b, 0), g = x.slice(9, 15).reduce((a, b) => a + b, 0)
        expect(t, `${d.nm} 시간대`).toBeGreaterThanOrEqual(97)
        expect(t, `${d.nm} 시간대`).toBeLessThanOrEqual(103)
        expect(g, `${d.nm} 연령대`).toBeGreaterThanOrEqual(97)
        expect(g, `${d.nm} 연령대`).toBeLessThanOrEqual(103)
        for (const v of [x[1], x[8]]) expect(v >= 0 && v <= 100, d.nm).toBe(true)
        expect(x[15] >= 0 && x[16] >= 0 && x[17] > 0, d.nm).toBe(true)
        expect(x[18] >= -1 && x[18] <= 100, d.nm).toBe(true)
      }
      expect(m.seoul, d.nm).toHaveLength(17)
    }
  })

  it('망리단길 카페 — 주말 · 오후 · 여성 · 20대가 서울 카페보다 많다 (2026-11-20 찍어 본 값)', () => {
    const { rec, mix } = rowsOf('CS100010')
    const i = at(37.5556, 126.9048)
    const r = recAt(i, recBase, rec)!
    expect(r.where).toBe('망리단길')
    const m = mixAt(i, recBase, mix, r.level)!
    const v = mixView(m.row, m.seoul, '카페', r.level, r.where, m.year)
    expect(v.where).toBe('상권 망리단길 · 2025년')
    expect(v.sum).toMatch(/^주말 4\d% · (오후\(14~17시\)|점심\(11~14시\)) · 20 · 30대 \d\d%$/)
    const line = (k: string) => v.lines.find((l) => l.key === k)!
    expect(line('weekend').note).toMatch(/^서울 카페 2\d%보다 주말에 더 팔려요$/)
    // 많이 파는 때 — 값은 '오후 33%'처럼 짧게, 시간은 덧말 맨 앞
    expect(line('time').value).toMatch(/^(오후|점심) \d\d%$/)
    expect(line('time').note).toMatch(/^(14~17시|11~14시) · 다음은 (오후\(14~17시\)|점심\(11~14시\)|저녁\(17~21시\)) \d\d%/)
    expect(line('sex').note).toMatch(/^서울 카페 5\d%보다 여성이 많아요$/)
    expect(line('age').note).toMatch(/^서울 카페보다 20대가 많아요 \(\d\d% · 서울 2\d%\)$/)
    expect(line('churn').value).toMatch(/^새로 연 곳 \d+ · 닫은 곳 \d+$/)
    expect(line('churn').note).toMatch(/^평균 가게 1\d\d곳, 100곳당 연 곳 \d+ · 닫은 곳 \d+ \(서울 카페 1\d · 1\d\)$/)
    expect(line('churn').note).not.toContain('—') // 줄은 '값 — 말'로 보이므로 말 안에 줄표를 또 넣지 않는다
    expect(line('fr').note).toMatch(/^서울 카페 2\d%보다 적어요$/)
    expect(v.time.here).toHaveLength(6)
    expect(v.caveat).toContain('카드 주인 기준')
  })

  it('말 — 비슷하면 \'도 ○%예요\', 받침에 맞는 조사, 가게가 적으면 100곳당으로 바꾸지 않는다', () => {
    const s = mixSeoul([30, 1, 10, 30, 30, 25, 4, 50, 2, 20, 30, 20, 18, 10, 12.5, 14.4, 20])
    const v = mixView(mixRow([0, 31, 1, 10, 30, 30, 25, 4, 52, 2, 20, 30, 20, 18, 10, 1, 0, 25, -1]), s, '미용실', '행정동', '망원1동', 2025)
    const line = (k: string) => v.lines.find((l) => l.key === k)
    expect(line('weekend')!.note).toBe('서울 미용실도 30%예요')
    expect(line('sex')!.note).toBe('서울 미용실도 50%예요')
    expect(line('age')!.note).toBe('나이 구성은 서울 미용실과 비슷해요')
    expect(line('churn')!.note).toBe('평균 가게 3곳이라 100곳당으로 바꾸지 않아요') // 평균 2.5곳
    expect(line('fr')).toBeUndefined() // 프랜차이즈를 모르면 줄이 없다
    expect(v.caveat).toContain('가게 3곳의 값이라')
    const ok = mixView(mixRow([0, 31, 1, 10, 30, 30, 25, 4, 52, 2, 20, 30, 20, 18, 10, 2, 1, 80, 0]), s, '카페', '상권', '어딘가', 2025)
    expect(ok.lines.find((l) => l.key === 'churn')!.note).toBe('평균 가게 8곳, 100곳당 연 곳 25 · 닫은 곳 13 (서울 카페 13 · 14)')
    // 60대 이상이 많은 곳 — '이' 조사, 붙어 있지 않은 두 나이는 하나만
    const old = mixView(mixRow([0, 20, 1, 30, 30, 20, 15, 4, 40, 0, 2, 5, 10, 33, 50, 0, 0, 100, 0]), s, '약국', '상권', '어딘가', 2025)
    expect(old.lines.find((l) => l.key === 'age')!.note).toBe('서울 약국보다 60대 이상이 많아요 (50% · 서울 10%)')
    expect(old.sum).toBe('주말 20% · 아침(6~11시) · 50 · 60대 이상 83%')
    const apart = mixView(mixRow([0, 20, 1, 30, 30, 20, 15, 4, 40, 0, 40, 5, 30, 15, 10, 0, 0, 100, 0]), null, '약국', '상권', '어딘가', 2025)
    expect(apart.sum).toBe('주말 20% · 아침(6~11시) · 20대 40%')
    expect(apart.lines.every((l) => l.key === 'time' || l.key === 'churn' || l.note === '')).toBe(true) // 서울 값이 없으면 견주는 말이 없다
  })
})

describe('카드 링크', () => {
  it('주소 형식 — 2026-11-20에 열어 본 그대로', () => {
    expect(listingUrl('마포구', '망원동')).toBe('https://realty.daangn.com/map/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C/%EB%A7%88%ED%8F%AC%EA%B5%AC/%EB%A7%9D%EC%9B%90%EB%8F%99/%EC%83%81%EA%B0%80')
    expect(listingUrl('성동구', '성수동1가')).toBe('https://realty.daangn.com/map/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C/%EC%84%B1%EB%8F%99%EA%B5%AC/%EC%84%B1%EC%88%98%EB%8F%991%EA%B0%80/%EC%83%81%EA%B0%80')
    expect(roadviewUrl(37.5208, 127.023)).toBe('https://map.kakao.com/link/roadview/37.520800,127.023000')
    expect(outLinks(37.5, 127, null).map((l) => l.key)).toEqual(['roadview']) // 법정동을 모르면 매물 링크는 뺀다
    expect(outLinks(37.5, 127, { nm: '망원동', gu: '마포구' }).map((l) => [l.key, l.label, l.sub])).toEqual([
      ['listing', '망원동 상가 매물', '당근부동산'],
      ['roadview', '이 칸 거리 보기', '카카오맵 로드뷰'],
    ])
  })

  it('칸 → 법정동 — 모든 칸에 하나, 칸의 자치구와 거의 같다', () => {
    expect(bdong.c).toHaveLength(N)
    let same = 0
    for (let i = 0; i < N; i++) {
      const b = bdongAt(bdong, i)!
      expect(b.nm).toMatch(/(동|가|로)(\d가)?$|동\d가$|\d동$/)
      if (b.gu === dongs[cells.dong[i]].split('|')[1]) same++
    }
    expect(same / N).toBeGreaterThan(0.95)
    expect(bdongAt(bdong, at(37.5556, 126.9048))).toEqual({ nm: '망원동', gu: '마포구' })
    expect(bdongAt(bdong, at(37.5208, 127.023))).toEqual({ nm: '신사동', gu: '강남구' })
    expect(bdongAt(bdong, at(37.5444, 127.0557))?.nm).toMatch(/^성수동[12]가$/)
    expect(bdongAt(null, 0)).toBeNull()
  })
})

describe('자리 카드에 붙는다', () => {
  const site = read<SiteData>('grid/site.json'), nb = read<number[]>('grid/nb.json'), kinds = read<KindsData>('kinds/index.json')
  const ind = read<{ k: string; codes: string[]; paint: boolean }[]>('ind/index.json')
  const kix = kindIndex(kinds, ind, read<{ ind: { k: string }[] }>('entry/index.json').ind)
  const cuts = siteCuts(cells.n300, site.tilt), n300Sorted = Float64Array.from(cells.n300).sort()
  const card = (i: number, code: string) => {
    const bi = beFor(code, beAll.ind)!, { rec, mix } = rowsOf(bi.k), sk = sameKind(read<number[]>(`kinds/cnt/${code}.json`), nb, N)
    const r = recAt(i, recBase, rec)
    return buildCard({
      i, dongKey: dongs[cells.dong[i]], n: N, n300: cells.n300[i], n300Sorted, site, cuts, station: null, reb: null,
      kind: { k: kix.byCode.get(code)!, depth: kix.depth(code), s12Sorted: kix.s12Sorted }, pot: null,
      same: { own: sk.own[i], near: sk.near[i], nearSorted: Float64Array.from(sk.near).sort() },
      rec: r, mix: r ? mixAt(i, recBase, mix, r.level) : null, at: { lat: 37.5556, lng: 126.9048, bd: bdongAt(bdong, i) },
    })
  }

  it('카페 — 손님 구성과 링크 둘', () => {
    const c = card(at(37.5556, 126.9048), 'I21201')
    expect(c.mix!.where).toBe('상권 망리단길 · 2025년')
    expect(c.links.map((l) => l.key)).toEqual(['listing', 'roadview'])
    expect(c.links[0].label).toBe('망원동 상가 매물')
  })

  it('여러 업종을 묶은 서울시 업종(국/탕/찌개류 → 한식음식점)은 그 이름으로 견주고 묶음이라고 말한다', () => {
    const p = rowsOf('CS100001')
    let i = -1
    for (let q = 0; q < N && i < 0; q++) if (recAt(q, recBase, p.rec)?.level === '상권') i = q
    const c = card(i, 'I20102')
    expect(c.mix!.where).toMatch(/ · 서울시 '한식음식점' 업종\(상가정보 \d+개 묶음\) 값$/)
    expect(c.mix!.lines.find((l) => l.key === 'weekend')!.note).toMatch(/^서울 '한식음식점'/)
  })

  it('업종 없이도 링크는 있다 · 칸 좌표가 없으면 링크도 없다', () => {
    const i = at(37.5556, 126.9048)
    const base = { i, dongKey: dongs[cells.dong[i]], n: N, n300: cells.n300[i], n300Sorted, site, cuts, station: null, reb: null }
    expect(buildCard({ ...base, at: { lat: 37.5556, lng: 126.9048, bd: bdongAt(bdong, i) } }).links).toHaveLength(2)
    expect(buildCard(base).links).toEqual([])
    expect(buildCard(base).mix).toBeNull()
  })
})
