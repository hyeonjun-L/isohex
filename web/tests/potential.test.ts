/// <reference types="node" />
// 매출 수준 풀기 — 내보낸 재료 배수(m)·끝값 맞춤(clamp)이 매출 수준과 맞물리는지, 문장이 예전 뷰어(viewer/template.html)와 같은지 본다.
// 모형 v3 (2026-11-16, 마스터플랜 W7.16) — 재료에 '주변 가게 구성'이 더해져 무리가 다섯, 칠하는 업종이 23 → 34개가 됐다.
//   예전 뷰어는 재료 넷(v2)만 안다 → 앞의 넷(이름 · 끝값 맞춤 글)이 예전 뷰어와 같은지 보고, 다섯째는 여기서 따로 본다.
//   배수 다섯의 곱 = 매출 수준은 내보낼 때(pipeline/export_web.py, 칸마다 0.0005 안)와 아래 시험이 본다
// v2 판 기록 — 재료 배수가 예전 뷰어 compute()·cellInfo의 식과 같은 값인 것은 진짜 옛 자료(viewer_data.json의 접근성)로 한 번 견줬다
// (2026-11-02, 칠하는 23개 업종 98,322칸 — 배수·끝값 맞춤·칠함·min300 모두 같음, 마스터플랜 P3). 그 자료는 저장소에 없다.
// v3 내보내기는 같은 코드에 무리만 더한 것이고, v2 자료를 넣으면 v2 판(v2-20261025-182e0f86)이 바이트까지 그대로 나온다
// v3.1 (2026-11-20) — 재료를 곱한 값도 학습한 상권의 범위(index.json span) 끝값으로 맞춘다. 그런 칸은 clamp 비트 1024 · 2048이 서고 배수의 곱이 값과 다르다
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as P from '../src/core/potential'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const index = read<{ k: string; nm: string; paint: boolean; cells: number; min300?: number; span?: [number, number]; nj?: number; base?: number }[]>('ind/index.json')
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
  it('칠하는 업종마다 배수 다섯 · 끝값 맞춤 · 가게 수 하한', () => {
    expect(painted.length).toBe(34)
    expect(index.filter((d) => !d.paint).map((d) => d.nm).sort()).toEqual(['PC방', '골프연습장', '자동차 정비'])
    expect(P.NF).toBe(5)
    for (const d of painted) {
      const f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
      expect(f.g, d.nm).toBe(P.NF)
      expect(f.m.length, d.nm).toBe(d.cells * P.NF)
      expect(d.min300, d.nm).toBeGreaterThan(0)
      for (let k = 0; k < f.clamp.length; k += 2) {
        expect(f.v[f.clamp[k]], `${d.nm} 끝값 칸은 칠한 칸`).not.toBeNull()
        expect(f.clamp[k + 1] & ~0xfff, d.nm).toBe(0) // 낮아서 5비트 + 높아서 5비트 + 곱한 값이 낮아서 · 높아서
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

  it('배수 다섯을 곱하면 매출 수준 — 반올림만큼만 다르다 (곱한 값을 끝값으로 맞춘 칸은 그 끝값)', () => {
    let n = 0, cut = 0
    for (const d of painted) {
      const f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
      let nj = 0
      for (let i = 0; i < f.v.length; i++) {
        const e = P.explainCell(f, ix, i)
        if (!e) continue
        const ms = e.factors.map((x) => x.x * 100)
        const prod = ms.reduce((a, m) => (a * m) / 100, 1), want = 1 + e.pct / 100
        const tol = ms.reduce((a, m) => a + 0.5 / m, 0) * 1.01 + 0.0006 / want
        // 값은 언제나 학습한 상권의 범위 안 (0.1%p 반올림만큼)
        expect(want * 100, `${d.nm} 칸 ${i}`).toBeGreaterThanOrEqual(d.span![0] - 0.6)
        expect(want * 100, `${d.nm} 칸 ${i}`).toBeLessThanOrEqual(d.span![1] + 0.6)
        if (e.joint) {
          // 끝값으로 맞춘 칸 — 값은 범위의 끝, 배수의 곱은 그 바깥
          nj++
          expect(Math.abs(want * 100 - d.span![e.joint === 'high' ? 1 : 0]), `${d.nm} 칸 ${i}`).toBeLessThanOrEqual(0.6)
          if (e.joint === 'high') expect(prod / want, `${d.nm} 칸 ${i}`).toBeGreaterThan(1 - tol)
          else expect(prod / want, `${d.nm} 칸 ${i}`).toBeLessThan(1 + tol)
        } else expect(Math.abs(prod / want - 1), `${d.nm} 칸 ${i}`).toBeLessThanOrEqual(tol)
        n++
      }
      expect(nj, d.nm).toBe(d.nj)
      cut += nj
    }
    expect(n).toBeGreaterThan(140000)
    // 끝값으로 맞춘 값은 전체의 3% 안팎 (2026-11-20 검토: 142,634개 중 4,239개)
    expect(cut / n).toBeGreaterThan(0.02)
    expect(cut / n).toBeLessThan(0.04)
  })

  it('곱한 값의 끝값 맞춤 — 카페 가장 진한 칸은 15.1배가 아니라 배운 상권의 최대 6.5배', () => {
    const d = painted.find((x) => x.nm === '카페')!, f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
    expect(d.span).toEqual([25, 647])
    expect(d.base).toBeGreaterThan(3500) // 평균적인 상권의 가게당 월매출 — 400만 원 안팎(천 원)
    expect(d.base).toBeLessThan(4500)
    let top = -1, best = 0
    for (let i = 0; i < f.v.length; i++) {
      const e = P.explainCell(f, ix, i)
      if (!e) continue
      const prod = e.factors.reduce((a, x) => a * x.x, 1)
      if (prod > best) best = prod, top = i
    }
    const e = P.explainCell(f, ix, top)!
    expect(best).toBeGreaterThan(14) // 자르기 전 곱은 15배 안팎
    expect(e.joint).toBe('high')
    expect(e.pct).toBeCloseTo(547, 0)
    expect(Math.max(...f.v.filter((v): v is number => v != null))).toBe(Math.round((d.span![1] - 100) * 10) + 1) // 547.1%
  })

  it('끝값 맞춤 — 다섯째 무리(주변 가게 구성)에 걸린 칸이 있고 글이 나온다', () => {
    const d = painted.find((x) => x.nm === '카페')!, f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
    let low = 0, high = 0
    for (let k = 0; k < f.clamp.length; k += 2) {
      const e = P.explainCell(f, ix, f.clamp[k])!
      expect(e.clamped.length + (e.joint ? 1 : 0)).toBeGreaterThan(0)
      if (f.clamp[k + 1] & (1 << 4)) low++, expect(e.clamped).toContain(P.CLAMP_LOW[4])
      if (f.clamp[k + 1] & (32 << 4)) high++, expect(e.clamped).toContain(P.CLAMP_HIGH[4])
    }
    expect(low).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(0)
    expect(f.clamp.length / 2 / d.cells).toBeLessThan(0.1) // 카페는 칠한 칸의 6% 안팎
  })
})

describe('매출 수준 풀기 — 예전 뷰어와 같은 문장', () => {
  it('재료 이름 · 끝값 맞춤 설명 (점포 → 가게)', () => {
    // 앞의 넷은 예전 뷰어와 같은 말, 다섯째는 v3에서 새로
    expect(P.FACTOR_NM.slice(0, 4)).toEqual(O.FEAT_SHORT.map(toGa))
    expect(P.FACTOR_NM[4]).toBe('주변 가게 구성')
    const LOW = [...O.FEAT_LOW.map(toGa), P.CLAMP_LOW[4]], HIGH = [...O.FEAT_HIGH.map(toGa), P.CLAMP_HIGH[4]]
    expect(LOW[4]).toBe('주변 가게 구성 중 일부가 학습한 상권보다 적음')
    expect(HIGH[4]).toBe('주변 가게 구성 중 일부가 학습한 상권보다 많음')
    for (let c = 0; c < 1024; c++) {
      const want: string[] = []
      for (let j = 0; j < 5; j++) {
        if (c & (1 << j)) want.push(LOW[j])
        if (c & (32 << j)) want.push(HIGH[j])
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
      { j: 4, name: '주변 가게 구성', x: 0.7 },
    ]
    expect(P.byInfluence(f).map((x) => x.name)).toEqual(['주변 가게', '주변 가게 구성', '출근·등교', '거주', '기타 도착'])
    expect(P.byInfluence([{ j: 0, name: 'a', x: 0.5 }, { j: 1, name: 'b', x: 2 }]).map((x) => x.j)).toEqual([0, 1])
  })

  it('칠하지 않는 칸은 풀지 않는다', () => {
    const d = painted[0], f = read<P.IndCells>(`ind/${d.k}.json`), ix = P.potIndex(f)
    const i = f.v.findIndex((v) => v == null)
    expect(P.explainCell(f, ix, i)).toBeNull()
    expect(() => P.potIndex({ ...f, m: f.m.slice(4) })).toThrow()
    expect(() => P.potIndex({ ...f, g: undefined })).toThrow(/무리 수/) // v2 판 자료(무리 넷)는 읽지 않는다
  })
})
