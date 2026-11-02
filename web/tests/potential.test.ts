/// <reference types="node" />
// 매출 수준 풀기 — 내보낸 재료 배수(m)·끝값 맞춤(clamp)이 매출 수준과 맞물리는지, 문장이 예전 뷰어(viewer/template.html)와 같은지 본다.
// 재료 배수가 예전 뷰어 compute()·cellInfo의 식과 같은 값인 것은 진짜 옛 자료(viewer_data.json의 접근성)로 한 번 견줬다
// (2026-11-02, 칠하는 23개 업종 98,322칸 — 배수·끝값 맞춤·칠함·min300 모두 같음, 마스터플랜 P3). 그 자료는 저장소에 없다
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as P from '../src/core/potential'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const index = read<{ k: string; nm: string; paint: boolean; cells: number; min300?: number }[]>('ind/index.json')
const cells = read<{ n300: number[] }>('cells.json')
const painted = index.filter((d) => d.paint)

const SRC = readFileSync(new URL('../../viewer/template.html', import.meta.url), 'utf8').split('\n')
function grab(name: string): string {
  const i = SRC.findIndex((l) => l.startsWith(`function ${name}(`))
  if (i < 0) throw new Error(`옛 뷰어에 ${name}이 없다`)
  let depth = 0
  const out: string[] = []
  for (let j = i; j < SRC.length; j++) {
    out.push(SRC[j])
    for (const ch of SRC[j].replace(/\/\/[^"']*$/, '')) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth === 0) break
  }
  return out.join('\n')
}
const line = (s: string) => SRC.find((l) => l.startsWith(s))!
const ctx: Record<string, unknown> = { sortedDom: new Float64Array(0) }
vm.createContext(ctx)
vm.runInContext([line('var FEAT_SHORT='), line('var FEAT_LOW='), line('var FEAT_HIGH='), grab('upperShare'), grab('fmtX'), grab('comma')].join('\n') +
  '\nthis.O = { upperShare: upperShare, fmtX: fmtX, comma: comma, FEAT_SHORT: FEAT_SHORT, FEAT_LOW: FEAT_LOW, FEAT_HIGH: FEAT_HIGH }', ctx)
const O = ctx.O as { upperShare(v: number): number; fmtX(l: number): string; comma(n: number): string; FEAT_SHORT: string[]; FEAT_LOW: string[]; FEAT_HIGH: string[] }
const toGa = (s: string) => s.replace(/점포/g, '가게')

describe('매출 수준 풀기 — 내보낸 자료', () => {
  it('칠하는 업종마다 배수 넷 · 끝값 맞춤 · 가게 수 하한', () => {
    expect(painted.length).toBe(23)
    for (const d of painted) {
      const f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
      expect(f.m.length, d.nm).toBe(d.cells * 4)
      expect(d.min300, d.nm).toBeGreaterThan(0)
      for (let k = 0; k < f.clamp.length; k += 2) {
        expect(f.v[f.clamp[k]], `${d.nm} 끝값 칸은 칠한 칸`).not.toBeNull()
        expect(f.clamp[k + 1] & ~0xff, d.nm).toBe(0)
        expect(f.clamp[k + 1], d.nm).toBeGreaterThan(0)
      }
      // 칠하지 않는 칸은 반경 300m 가게가 하한보다 적은 곳 — 하한은 반올림한 값이라 그 언저리는 둘 다 있다
      let below = 0
      for (let i = 0; i < f.v.length; i++) if (f.v[i] == null && cells.n300[i] < d.min300!) below++
      const unpainted = f.v.filter((v) => v == null).length
      expect(below / unpainted, d.nm).toBeGreaterThan(0.95)
      expect(ix.sorted.length).toBe(d.cells)
    }
  })

  it('배수 넷을 곱하면 매출 수준 — 반올림만큼만 다르다', () => {
    let n = 0
    for (const d of painted) {
      const f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
      for (let i = 0; i < f.v.length; i++) {
        const e = P.explainCell(f, ix, i)
        if (!e) continue
        const ms = e.factors.map((x) => x.x * 100)
        const prod = ms.reduce((a, m) => (a * m) / 100, 1), want = 1 + e.pct / 100
        const tol = ms.reduce((a, m) => a + 0.5 / m, 0) * 1.01 + 0.0006 / want
        expect(Math.abs(prod / want - 1), `${d.nm} 칸 ${i}`).toBeLessThanOrEqual(tol)
        n++
      }
    }
    expect(n).toBeGreaterThan(90000)
  })
})

describe('매출 수준 풀기 — 예전 뷰어와 같은 문장', () => {
  it('재료 이름 · 끝값 맞춤 설명 (점포 → 가게)', () => {
    expect([...P.FACTOR_NM]).toEqual(O.FEAT_SHORT.map(toGa))
    for (let c = 0; c < 256; c++) {
      const want: string[] = []
      for (let j = 0; j < 4; j++) {
        if (c & (1 << j)) want.push(toGa(O.FEAT_LOW[j]))
        if (c & (16 << j)) want.push(toGa(O.FEAT_HIGH[j]))
      }
      expect(P.clampText(c)).toEqual(want)
    }
  })

  it('칠한 칸 중 상위 몫 — 예전 upperShare', () => {
    const d = painted.find((x) => x.nm === '카페') ?? painted[0]
    const f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
    ctx.sortedDom = ix.sorted
    for (let i = 0; i < f.v.length; i += 3) {
      const e = P.explainCell(f, ix, i)
      if (!e) {
        expect(f.v[i]).toBeNull()
        continue
      }
      expect(e.up).toBe(O.upperShare(f.v[i]!))
      expect(P.upText(e.up)).toBe(`칠한 칸 중 상위 ${Math.max(1, Math.round(O.upperShare(f.v[i]!) * 100))}%`)
    }
  })

  it('배수 글자 · 가게가 드문 곳 안내', () => {
    for (const x of [0.07, 0.45, 0.7, 0.99, 1, 1.01, 1.04, 1.29, 1.62, 3.93, 12.5]) expect(P.times(x)).toBe(O.fmtX(Math.log(x)))
    expect(P.sparseText('카페', 12, 36)).toBe(toGa(`가게가 드문 곳 — 반경 300m 점포 ${O.comma(12)}곳. 카페 매출이 공개된 상권은 모두 약 ${O.comma(36)}곳 이상이었습니다.`))
    expect(P.sparseText('카페', 1234, 1500)).toContain('1,234곳')
  })

  it('영향이 큰 재료부터', () => {
    const f: P.Factor[] = [
      { j: 0, name: '거주', x: 1.12 },
      { j: 1, name: '출근·등교', x: 1.29 },
      { j: 2, name: '기타 도착', x: 1.04 },
      { j: 3, name: '주변 가게', x: 1.62 },
    ]
    expect(P.byInfluence(f).map((x) => x.name)).toEqual(['주변 가게', '출근·등교', '거주', '기타 도착'])
    expect(P.byInfluence([{ j: 0, name: 'a', x: 0.5 }, { j: 1, name: 'b', x: 2 }]).map((x) => x.j)).toEqual([0, 1])
  })

  it('칠하지 않는 칸은 풀지 않는다', () => {
    const d = painted[0], f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
    const i = f.v.findIndex((v) => v == null)
    expect(P.explainCell(f, ix, i)).toBeNull()
    expect(() => P.potIndex({ ...f, m: f.m.slice(4) })).toThrow()
  })
})
