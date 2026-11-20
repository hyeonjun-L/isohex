/// <reference types="node" />
// 자리 카드 — 이 동네 가게당 월매출(서울시 추정매출)을 맨 앞에, 곱한 값의 끝값 맞춤 (2026-11-20 전체 검토 2번 · 5번)
// 추정 비율만 보이면 좋게 읽혔다: '평균 상권보다 30% 높음'의 평균 상권은 가게 수로 센 서울 가운데 값보다 낮고, 값이 있는 상권 넷 중 하나는 추정과 반대쪽이었다
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { type CardInput, type RecBase, type RecRows, buildCard, ratioText, recAt } from '../src/core/card'
import { type BeInd, type BeMeta, beFor, won } from '../src/core/check'
import { type KindsData, kindIndex, sameKind } from '../src/core/kinds'
import { levelText } from '../src/core/level'
import { type IndCells, explainCell, potIndex } from '../src/core/potential'
import { type SiteData, siteCuts } from '../src/core/site'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; n300: number[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const site = read<SiteData>('grid/site.json')
const nb = read<number[]>('grid/nb.json')
const kinds = read<KindsData>('kinds/index.json')
const ind = read<{ k: string; nm: string; codes: string[]; paint: boolean; rho: number; hit?: [number, number]; note?: string; span?: [number, number]; base?: number }[]>('ind/index.json')
const beAll = read<{ meta: BeMeta; ind: BeInd[] }>('be/index.json')
const pl = read<{ sang: { nm: string[] }; dong: { nm: string[] } }>('be/places.json')
const cl = read<{ c2s: number[]; c2d: number[] }>('be/cells.json')
const N = cells.h3.length
const kix = kindIndex(kinds, ind, read<{ ind: { k: string }[] }>('entry/index.json').ind)
const cuts = siteCuts(cells.n300, site.tilt)
const n300Sorted = Float64Array.from(cells.n300).sort()
const recBase: RecBase = { c2s: cl.c2s, c2d: cl.c2d, sangNm: pl.sang.nm, dongNm: pl.dong.nm, qs: beAll.meta.qs, year: beAll.meta.year }

const cache = new Map<string, { sk: ReturnType<typeof sameKind>; nearSorted: Float64Array; pot: CardInput['pot']; rows: RecRows | null }>()
function part(code: string) {
  let p = cache.get(code)
  if (!p) {
    const depth = kix.depth(code)
    const sk = sameKind(read<number[]>(`kinds/cnt/${code}.json`), nb, N)
    let pot: CardInput['pot'] = null
    if (depth.pot) {
      const m = ind.find((x) => x.k === depth.pot)!, f = read<IndCells>(`ind/${m.k}.json`)
      pot = { nm: m.nm, rho: m.rho, hit: m.hit, note: m.note, cells: f, ix: potIndex(f), cap: beAll.ind.find((b) => b.k === m.k) ?? null, span: m.span ?? null, base: m.base ?? null }
    }
    const bi = beFor(code, beAll.ind)
    const r = bi ? read<{ S: number[][]; D: number[][] }>(`be/ind/${bi.k}.json`) : null
    p = { sk, nearSorted: Float64Array.from(sk.near).sort(), pot, rows: bi && r ? { ind: bi, S: new Map(r.S.map((x) => [x[0], x])), D: new Map(r.D.map((x) => [x[0], x])) } : null }
    cache.set(code, p)
  }
  return p
}
/** ui/useCard.ts cardInput과 같은 조립 — 무인 유형만 뺐다 */
function input(i: number, code: string): CardInput {
  const p = part(code)
  return {
    i, dongKey: dongs[cells.dong[i]], n: N, n300: cells.n300[i], n300Sorted, site, cuts, station: null, reb: null,
    kind: { k: kix.byCode.get(code)!, depth: kix.depth(code), s12Sorted: kix.s12Sorted },
    pot: p.pot, same: { own: p.sk.own[i], near: p.sk.near[i], nearSorted: p.nearSorted },
    rec: p.rows ? recAt(i, recBase, p.rows) : null,
  }
}
const at = (lat: number, lng: number) => cells.h3.indexOf(latLngToCell(lat, lng, 9))
const CAFE = 'I21201'

describe('이 동네 가게당 월매출이 맨 앞', () => {
  it('가로수길 카페 — 상권 값이 첫 숫자, 추정 비율은 그 다음', () => {
    const i = at(37.5208, 127.023)
    const inp = input(i, CAFE), c = buildCard(inp), rec = inp.rec!
    expect(rec.level).toBe('상권')
    expect(rec.where).toBe('가로수길')
    expect(c.facts.map((f) => f.key)).toEqual(['rec', 'pot', 'rent', 'same', 'surv'])
    const f = c.facts[0]
    expect(f.wide).toBe(true)
    expect(f.label).toBe('카페 가게당 월매출 (이 동네 · 카드 결제 기준)')
    expect(f.value).toBe(won(rec.v))
    expect(f.value).toMatch(/^[\d,]+만 원$/)
    expect(f.sub).toMatch(/^상권 가로수길 [\d,]+곳 평균 · 2025년 · 서울 가운데 값 [\d,]+만 원$/)
    expect(f.pos).toBeGreaterThanOrEqual(0)
    expect(f.pos).toBeLessThanOrEqual(1)
    // 한 줄 요약 — 자리 성격 → 이 동네 매출 → 추정. 금액이 앞에 있으면 기준 금액(평균 상권)은 되풀이하지 않는다
    const a = c.line.indexOf('카페는 이 동네에서 가게당 월'), b = c.line.indexOf('카페 매출 수준은 서울 평균 상권')
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(c.line).toContain(`가게당 월 ${won(rec.v)}쯤 팔아요 (상권 가로수길 ${rec.n.toLocaleString('ko-KR')}곳 평균 · 카드 결제 기준)`)
    expect(c.line).not.toContain('서울 평균 상권(가게당')
    expect(c.trust.some((t) => t.title === '이 동네 가게당 월매출은' && t.text.includes("'커피-음료' 추정매출(2025년)"))).toBe(true)
    expect(c.foot).toContain('둘 다 실제 매출 그대로가 아니에요')
    // '왜 이 값인가'에는 기준 금액을 적는다
    expect(c.why!.intro).toMatch(/기준\(×1\.00\)인 서울 평균 상권은 가게당 월 4\d\d만 원쯤이에요\.$/)
  })

  it('상권 밖이면 행정동 값 — 그렇다고 말한다. 둘 다 없으면 추정이 첫 숫자고 기준 금액을 함께 말한다', () => {
    const p = part(CAFE), f = p.pot!.cells
    let dong = -1, none = -1
    for (let i = 0; i < N && (dong < 0 || none < 0); i++) {
      if (f.v[i] == null) continue
      const r = recAt(i, recBase, p.rows!)
      if (r?.level === '행정동' && dong < 0) dong = i
      if (!r && none < 0) none = i
    }
    expect(dong).toBeGreaterThanOrEqual(0)
    const c1 = buildCard(input(dong, CAFE))
    expect(c1.facts[0].key).toBe('rec')
    expect(c1.facts[0].sub).toMatch(/^행정동 \S+ [\d,]+곳 평균/)
    expect(c1.trust.find((t) => t.title === '이 동네 가게당 월매출은')!.text).toContain('상권 밖이라 행정동 평균')
    // 카페는 칠한 칸 거의 모두에 값이 있다 — 없는 칸이 있으면 추정이 앞이고 '평균 상권(가게당 월 …쯤)'을 말한다
    if (none >= 0) {
      const c2 = buildCard(input(none, CAFE))
      expect(c2.facts[0].key).toBe('pot')
      expect(c2.line).toMatch(/카페 매출 수준은 서울 평균 상권\(가게당 월 4\d\d만 원쯤\)/)
      expect(c2.foot).toContain('추정값이에요')
      expect(c2.cmp).toBeNull()
    }
    // 값이 있는 칸의 몫 — 카페는 칠한 칸의 95% 넘게 (검토: 99%)
    let has = 0, all = 0
    for (let i = 0; i < N; i++) if (f.v[i] != null) all++, has += recAt(i, recBase, p.rows!) ? 1 : 0
    expect(has / all).toBeGreaterThan(0.95)
  })

  it('둘을 같은 잣대로 견준 한 줄은 늘 보이고, 반대쪽이면 따로 알린다', () => {
    const p = part(CAFE), f = p.pot!.cells, base = p.pot!.base! / 10
    let opp = 0, far = 0, sang = 0, shown = -1
    for (let i = 0; i < N; i++) {
      const e = explainCell(f, p.pot!.ix, i), r = e ? recAt(i, recBase, p.rows!) : null
      if (!e || !r || r.level !== '상권') continue
      sang++
      const rr = r.v / base, er = 1 + e.pct / 100
      if (Math.max(rr / er, er / rr) >= 2) far++
      if ((rr >= 1.1 && er <= 0.9) || (rr <= 0.9 && er >= 1.1)) {
        opp++
        if (shown < 0) shown = i
      }
    }
    // 상권 값이 있는 카페 칸 — 다섯에 하나는 반대쪽, 절반 가까이는 2배 넘게 벌어진다 (2026-11-20 점검: 22% · 49%)
    expect(opp / sang).toBeGreaterThan(0.15)
    expect(opp / sang).toBeLessThan(0.3)
    expect(far / sang).toBeGreaterThan(0.4)
    expect(far / sang).toBeLessThan(0.6)
    const c = buildCard(input(shown, CAFE)), t = c.trust.find((x) => x.title === '이 동네 값과 추정이 반대로 말해요')!
    expect(t.mark).toBe('!')
    expect(t.text).toMatch(/^서울 평균 상권과 견주면 이 동네 값은 (높은데|낮은데)\([\d.]+배\) 추정은 (높아요|낮아요)\([\d.]+배\)\./)
    expect(t.text).toContain('다르면 이 동네 값을 먼저 보세요')
    expect(c.cmp).toMatch(/^서울 평균 상권\(가게당 월 4\d\d만 원\)을 1로 보면 이 동네 값 [\d.]+배 · 추정 [\d.]+배$/)
    // 가로수길 — 한 줄은 있고(이 동네 값 2.2배 · 추정 1.4배), 같은 쪽이라 따로 알리지는 않는다
    const g = buildCard(input(at(37.5208, 127.023), CAFE))
    expect(g.cmp).toMatch(/이 동네 값 2\.\d배 · 추정 1\.\d배$/)
    expect(g.trust.some((x) => x.title === '이 동네 값과 추정이 반대로 말해요')).toBe(false)
    expect(ratioText(0.72)).toBe('0.7배')
    expect(ratioText(12.4)).toBe('12배')
    expect(ratioText(0.01)).toBe('0.1배 미만')
  })

  it('매출 수준이 없는 업종도 이 동네 값은 보인다 (PC방) · 견줄 서울시 업종이 없으면 없다 (부동산 중개)', () => {
    const pc = part('R10406')
    expect(pc.pot).toBeNull()
    let i = -1
    for (let q = 0; q < N && i < 0; q++) if (recAt(q, recBase, pc.rows!)?.level === '상권') i = q
    const c = buildCard(input(i, 'R10406'))
    expect(c.facts.map((f) => f.key)).toEqual(['rec', 'pot', 'rent', 'same', 'surv'])
    expect(c.facts[1].none).toBe(true)
    expect(c.line).toMatch(/PC방은 이 동네에서 가게당 월 .+쯤 팔아요 .+ PC방은 자리별 매출 수준을 추정하지 않아요/)
    expect(c.foot).toContain('서울시가 카드 결제로 만든 추정매출이에요')
    expect(c.cmp).toBeNull() // 추정이 없으면 견줄 것이 없다
    expect(part('L10203').rows).toBeNull()
    expect(buildCard(input(at(37.5208, 127.023), 'L10203')).facts.map((f) => f.key)).toEqual(['pot', 'rent', 'same', 'surv'])
    // 셀프 빨래방은 서울시 '세탁소' 매출과 견주지 않는다 (W7.15)
    expect(part('S20902').rows).toBeNull()
  })

  it('카드 매출이 낮게 잡히는 업종(치킨)은 그 말을 한 번만', () => {
    const p = part('I21006')
    let i = -1
    for (let q = 0; q < N && i < 0; q++) if (p.pot!.cells.v[q] != null && recAt(q, recBase, p.rows!)) i = q
    const c = buildCard(input(i, 'I21006'))
    expect(c.trust.filter((t) => t.title === '카드 결제로 만든 추정매출')).toHaveLength(1)
  })

  it('여러 업종을 묶은 서울시 업종(한식)은 묶은 값이라고 말한다', () => {
    const p = part('I20102') // 국/탕/찌개류 → 서울시 '한식음식점'
    expect(p.rows!.ind.codes.length).toBeGreaterThan(1)
    let i = -1
    for (let q = 0; q < N && i < 0; q++) if (recAt(q, recBase, p.rows!)) i = q
    const c = buildCard(input(i, 'I20102'))
    expect(c.facts[0].label).toBe('국/탕/찌개류 가게당 월매출 (이 동네 · 카드 결제 기준)')
    expect(c.trust.find((t) => t.title === '이 동네 가게당 월매출은')!.text).toMatch(/'한식음식점' 추정매출\(2025년\).+상가정보 업종 \d+개를 묶은 값이에요\./)
  })
})

describe('곱한 값의 끝값 맞춤이 카드에 보인다', () => {
  it('카페 가장 진한 칸 — 곱하면 15배 안팎, 카드에는 배운 끝값 6.5배', () => {
    const p = part(CAFE), f = p.pot!.cells
    let top = -1, best = 0
    for (let i = 0; i < N; i++) {
      const e = explainCell(f, p.pot!.ix, i)
      if (!e) continue
      const prod = e.factors.reduce((a, x) => a * x.x, 1)
      if (prod > best) best = prod, top = i
    }
    const c = buildCard(input(top, CAFE))
    expect(c.facts.find((x) => x.key === 'pot')!.value).toBe('6.5배')
    expect(c.why!.total).toMatch(/^×1[45]\.\d\d$/)
    expect(c.why!.note).toMatch(/^카드에는 '6\.5배' — 다섯을 곱한 값\(×1[45]\.\d\d\)이 모형이 배운 상권의 가장 높은 값\(×6\.47\)을 넘어, 그 끝값으로 말해요$/)
    const t = c.trust.find((x) => x.title === '학습한 범위 밖')!
    expect(t.text).toContain('재료를 곱한 값이 학습한 상권보다 높음')
    expect(levelText(547.1)).toBe('6.5배')
  })

  it('끝값으로 맞추지 않은 칸은 예전 글 그대로', () => {
    const c = buildCard(input(at(37.5208, 127.023), CAFE))
    expect(c.why!.note).toMatch(/다섯 배수를 곱한 값을 10% 단위로 둥글게 말해요$/)
  })
})
