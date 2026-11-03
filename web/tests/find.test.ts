/// <reference types="node" />
// 후보 찾기 화면 규칙 — 업종마다 '비슷한 자리' 범위가 p24와 같은 셈인지, 상한 고르기 · 주소 상태 · 깔때기 · '왜' 글자 (마스터플랜 W7.4 '후보 찾기', §5.18)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type CandData, candGrid, findCandidates, fromSparse, nbSum } from '../src/core/candidates'
import {
  BAND_MIN, FIND_DEFAULT, bandPass, bandText, compOptions, compText, findHead, findWhy, funnelRows, kindBand, readFind, shortText, timeLegend, tripText, writeFind,
} from '../src/core/find'
import type { KindsData } from '../src/core/kinds'
import type { SiteData } from '../src/core/site'
import { buildGraphs, type MvData } from '../src/core/travel/graph'
import { travelTimes } from '../src/core/travel/times'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[]; dong: number[] }>('cells.json')
const site = read<SiteData>('grid/site.json')
const nb = read<number[]>('grid/nb.json')
const cd = read<CandData>('cand/index.json')
const kinds = read<KindsData>('kinds/index.json')
const N = cells.h3.length
const cnt = (code: string) => fromSparse(read<number[]>(`kinds/cnt/${code}.json`), N)
const tiltSorted = Float64Array.from(site.tilt).sort()

describe('비슷한 자리 — 업종 가게가 있는 칸의 가운데 80%', () => {
  it('p24와 같은 셈 — 무인 6종의 명단 가게 수를 넣으면 cand/index.json 범위가 나온다', () => {
    for (const t of cd.types) {
      const b = kindBand(fromSparse(cd.un[t.t], N), cells.n300, site.tilt)!
      expect(b.n300, t.t).toEqual(t.band.n300)
      expect([b.tilt[0], b.tilt[2]], t.t).toEqual([t.band.tilt[0], t.band.tilt[2]])
      // 가운데 값은 반올림 끝자리가 갈릴 수 있다(p24는 접근성 차를 소수로, 웹은 ×1000 정수로) — 거르기에는 10·90%만 쓴다
      expect(Math.abs(b.tilt[1] - t.band.tilt[1]), t.t).toBeLessThanOrEqual(0.001)
      // 통과 몫은 경계값과 같은 칸(주택가 정도가 범위 끝과 같은 칸)에서 갈린다 — p24는 소수 차, 웹은 정수 ÷ 1000이라 경계 칸이 들어온다(열 칸 안쪽)
      expect(Math.abs(bandPass(b, cells.n300, site.tilt) - t.pass), t.t).toBeLessThan(0.002)
    }
  })

  it('카페 전체(상가정보 2026Q2) — 무인 카페보다 번화한 쪽', () => {
    const b = kindBand(cnt('I21201'), cells.n300, site.tilt)!
    expect(b).toEqual({ n300: [204, 638, 1646], tilt: [0.453, 0.966, 1.301] })
    expect(Math.round(bandPass(b, cells.n300, site.tilt) * 1000)).toBe(307)
    const [t1, t2] = bandText(b, '카페', 22718, tiltSorted, 0.307)
    expect(t1).toMatch(/^카페 22,718곳이 지금 있는 칸의 가운데 80% — 반경 300m 가게 204~1,646곳, 주택가 정도는 서울 칸 가운데 회사·학교 쪽 끝 \d+%와 주택가 쪽 끝 \d+%를 뺀 사이예요\.$/)
    expect(t2).toBe('두 범위에 다 드는 칸만 남겨요 — 서울 칸의 31%.')
  })

  it(`가게가 ${BAND_MIN}곳보다 적은 업종은 범위를 내지 않는다`, () => {
    const few = kinds.kinds.filter((k) => k.n < BAND_MIN)
    expect(few.length).toBeGreaterThan(0)
    for (const k of few) expect(kindBand(cnt(k.c), cells.n300, site.tilt), k.c).toBeNull()
  })
})

describe('같은 업종 상한 · 주소 · 글자', () => {
  it('상한은 같은 업종 지도 단계에 맞춘다', () => {
    const near = (c: string) => nbSum(cnt(c), nb)
    expect(compOptions(near('I21201'))).toEqual([-1, 0, 7, 19, 29, 59]) // 카페 1~7 · 8~19 · 20~29 · 30~59 · 60곳 이상
    expect(compOptions(near('S20902'))).toEqual([-1, 0, 1, 2, 3, 4]) // 셀프 빨래방
    expect([-1, 0, 5].map(compText)).toEqual(['제한 없음', '없는 곳만', '5곳 이하'])
  })

  it('주소 — 기본은 쓰지 않고, 모르는 값은 기본으로', () => {
    const idx = new Map(cells.h3.map((h, i) => [h, i]))
    const of = (h: string) => idx.get(h) ?? -1
    const q = new URLSearchParams()
    writeFind(q, { from: 6570, ...FIND_DEFAULT }, cells.h3)
    expect(q.toString()).toBe(`mode=find&from=${cells.h3[6570]}`)
    expect(readFind(q, of)).toEqual({ from: 6570, ...FIND_DEFAULT })
    const s = { from: 10, by: 'pt', at: 'am', min: 45, like: false, comp: 7, sort: 'few' } as const
    const q2 = new URLSearchParams()
    writeFind(q2, s, cells.h3)
    expect(readFind(q2, of)).toEqual(s)
    expect(readFind(new URLSearchParams('mode=find&from=xx&by=bike&at=night&min=33&comp=-5&sort=pay&like=1'), of)).toEqual({ from: null, ...FIND_DEFAULT })
    // 도보는 시간대를 남기지 않는다
    const q3 = new URLSearchParams()
    writeFind(q3, { ...s, by: 'walk' }, cells.h3)
    expect(q3.has('at')).toBe(false)
  })

  it('시간 띠 범례 — 정한 시간까지', () => {
    expect(timeLegend(30).map((x) => x.label)).toEqual(['10분 안', '10~20분', '20~30분'])
    expect(timeLegend(25).map((x) => x.label)).toEqual(['10분 안', '10~20분', '20~25분'])
    expect(timeLegend(10).map((x) => x.label)).toEqual(['10분 안'])
    expect(timeLegend(60).map((x) => [x.label, x.c])).toEqual([['10분 안', 0], ['10~20분', 1], ['20~30분', 2], ['30~45분', 3], ['45~60분', 4]])
    expect(tripText({ by: 'walk', at: 'pm', min: 20 })).toBe('도보 20분')
    expect(tripText({ by: 'pt', at: 'am', min: 45 })).toBe('대중교통 45분 · 출근')
  })
})

describe('시청에서 자동차 30분 · 카페 (와이어프레임 깔때기)', () => {
  const G = buildGraphs(read<MvData>('graph/mv.json'))
  const T = travelTimes(G, 'car', 6570, 'day') // 6570 = 서울시청(소공동)
  const grid = candGrid(cells, site, nb)
  const c = cnt('I21201'), cntw = nbSum(c, nb)
  const band = kindBand(c, cells.n300, site.tilt)!

  it('30분 안 3,378칸 → 비슷한 자리 → 20곳', () => {
    const q = { times: T, min: 30, site: band, comp: -1, cntw, sort: 'res' as const }
    const r = findCandidates(grid, q)
    expect(r.stat.reach).toBe(3378)
    expect(r.stat.prof).toBeGreaterThan(500)
    expect(r.stat.picked).toBe(20)
    expect(shortText(r.stat)).toBeNull()
    const rows = funnelRows(r.stat, { by: 'car', min: 30, comp: -1 }, '카페', true, 'res')
    expect(rows.map((x) => x.k)).toEqual(['자동차 30분 안에 닿는 칸', '그중 카페 자리와 비슷한 칸', '주민이 많은 순으로 뽑은 후보'])
    expect(rows[0].v).toBe('3,378칸')
    expect(rows[2]).toEqual({ k: '주민이 많은 순으로 뽑은 후보', v: '20곳', last: true })
    // 후보는 모두 세 조건을 맞고, '왜'가 순번을 말한다
    for (const i of r.list) {
      expect(r.pass[i] & 7).toBe(7)
      expect(findWhy(i, grid, q, r, '카페', 'car')).toBe(`조건에 맞아 주민이 많은 순으로 ${r.rank[i]}번째예요`)
      expect(findHead(i, r, T, 'car')).toMatch(new RegExp(`^후보 ${r.rank[i]} · 자동차 \\d+분$`))
    }
    // 30분 밖 칸
    const far = Array.from(T).findIndex((t) => t > 1800)
    expect(findWhy(far, grid, q, r, '카페', 'car')).toMatch(/^조건 밖 — 자동차 30분 밖이에요 \(/)
  })

  it('같은 업종 상한과 깔때기', () => {
    const q = { times: T, min: 30, site: band, comp: 7, cntw, sort: 'few' as const }
    const r = findCandidates(grid, q)
    expect(r.stat.comp).toBeLessThanOrEqual(r.stat.prof)
    const rows = funnelRows(r.stat, { by: 'car', min: 30, comp: 7 }, '카페', true, 'few')
    expect(rows[2].k).toBe('그중 같은 업종이 7곳 이하인 칸')
    for (const i of r.list) expect(cntw[i]).toBeLessThanOrEqual(7)
    const out = Array.from(cntw).findIndex((v, i) => v > 7 && T[i] <= 1800 && (r.pass[i] & 3) === 3)
    expect(findWhy(out, grid, q, r, '카페', 'car')).toBe(`조건 밖 — 같은 업종이 이 칸 + 둘레에 ${cntw[out]}곳 — 정한 상한(7곳 이하)보다 많아요`)
  })
})
