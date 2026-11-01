/// <reference types="node" />
// 개업 창 — 옛 뷰어의 computeE·ebinOf를 viewer/template.html에서 꺼내, 내보낸 자료(entry · grid/nb)로 48개 업종 모두 같은 값인지 본다
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { entryBin, entryTotals, entryWindow, openRate, type EntryCells } from '../src/core/entry'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const nb = read<number[]>('grid/nb.json')
const index = read<{ ind: { k: string; nm: string; n: number; stock: number }[] }>('entry/index.json')
const N = nb.length / 6

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
const ctx: Record<string, unknown> = {
  N, EN: { meta: { nb } }, NB6: nb, EEDGE: [1, 2, 4, 7, 13],
  EO: new Int32Array(N), ER: new Int32Array(N), EK: new Int32Array(N), EOW: new Int32Array(N), EKW: new Int32Array(N), ECLS: new Int8Array(N),
}
vm.createContext(ctx)
vm.runInContext([grab('ebinOf'), grab('computeE')].join('\n') + '\nthis.O={ebinOf,computeE}', ctx)
const O = ctx.O as { ebinOf: (v: number) => number; computeE: (d: EntryCells) => void }

describe('개업 창 — 옛 뷰어와 같은 값', () => {
  it('색 단계', () => {
    for (const v of [0, 0.5, 1, 1.9, 2, 3, 4, 6, 7, 12, 13, 50, 1000]) expect(entryBin(v)).toBe(O.ebinOf(v))
  })
  it(`업종 ${index.ind.length}개 — 칸마다 새 가게·이웃 합·가게 수·색 단계`, () => {
    expect(index.ind.length).toBe(48)
    for (const d of index.ind) {
      const e = read<EntryCells>(`entry/${d.k}.json`)
      const w = entryWindow(e, nb, N)
      O.computeE(e)
      expect(Array.from(w.o), d.nm).toEqual(Array.from(ctx.EO as Int32Array))
      expect(Array.from(w.rep)).toEqual(Array.from(ctx.ER as Int32Array))
      expect(Array.from(w.k)).toEqual(Array.from(ctx.EK as Int32Array))
      expect(Array.from(w.ow)).toEqual(Array.from(ctx.EOW as Int32Array))
      expect(Array.from(w.kw)).toEqual(Array.from(ctx.EKW as Int32Array))
      expect(Array.from(w.cls)).toEqual(Array.from(ctx.ECLS as Int8Array))
      // 격자 안 새 가게 합은 요약의 개업 수를 넘지 않는다(격자 밖 0.07%는 뺐다)
      expect(entryTotals(w.o).total).toBeLessThanOrEqual(d.n)
    }
  })
  it('개업 비율은 이웃 포함 가게 5곳부터', () => {
    expect(openRate(3, 4)).toBeNull()
    expect(openRate(3, 5)).toBeCloseTo(0.6, 12)
  })
})
