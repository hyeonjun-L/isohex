/// <reference types="node" />
// 예전 뷰어(viewer/template.html)의 글자 함수를 그 파일에서 꺼내 돌리고, src/core/format.ts가 같은 글자를 내는지 견준다.
// 기준값을 따로 적어 두지 않고 옛 함수를 바로 쓴다 — 옛 뜻을 바꾸지 않았다는 것을 가장 곧게 보이는 방법
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as F from '../src/core/format'

const SRC = readFileSync(new URL('../../viewer/template.html', import.meta.url), 'utf8').split('\n')

/** 'function 이름(' 줄부터 중괄호가 닫힐 때까지 */
function grab(name: string): string {
  const i = SRC.findIndex((l) => l.startsWith(`function ${name}(`))
  if (i < 0) throw new Error(`옛 뷰어에 ${name}이 없다`)
  let depth = 0
  const out: string[] = []
  for (let j = i; j < SRC.length; j++) {
    const line = SRC[j].replace(/\/\/[^"']*$/, '') // 줄 끝 주석은 빼고 센다
    out.push(SRC[j])
    for (const ch of line) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth === 0) break
  }
  return out.join('\n')
}

const NAMES = ['fmtPct', 'fmtX', 'comma', 'josa', 'f2', 'pc10', 'drvText', 'man', 'sman', 'pct', 'pctTxt', 'pctU', 'cRankTxt', 'cMin'] as const
const ctx: Record<string, unknown> = {}
vm.createContext(ctx)
vm.runInContext(NAMES.map(grab).join('\n') + `\nthis.O = { ${NAMES.join(', ')} }`, ctx)
const O = ctx.O as Record<(typeof NAMES)[number], (...a: unknown[]) => unknown>

// 같은 씨앗이면 같은 수 — 시험이 매번 같은 값을 본다
function rand(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
const r = rand(20261101)
const ratios = [0, -0, 0.0995, 0.09949, 0.09951, -0.0995, 0.125, 0.005, 0.0049, 0.1, 0.0999, 0.5, 0.505, 0.995, 1.5, -0.4, 2.5e-3, ...Array.from({ length: 300 }, () => (r() - 0.4) * 3)]
const amounts = [0, 0.49, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 1234.5, -9876, 1234567, 1234.5678, ...Array.from({ length: 300 }, () => Math.round((r() - 0.3) * 1e6) / 100)]
const secs = [0, 1, 59.9, 60, 60.0000000001, 1799.99, 1800, 3601, Infinity, ...Array.from({ length: 200 }, () => r() * 4000)]
const words = ['카페', '빵집', '세탁소', '편의점', '한식', 'PC방', '호프·주점', '노래방', 'A', '값']

describe('글자 함수 — 옛 뷰어와 같은 글자', () => {
  it('비율', () => {
    for (const v of ratios) {
      expect(F.fmtPct(v), `fmtPct(${v})`).toBe(O.fmtPct(v))
      expect(F.pctTxt(Math.abs(v)), `pctTxt(${v})`).toBe(O.pctTxt(Math.abs(v)))
      expect(F.pctU(Math.abs(v)), `pctU(${v})`).toBe(O.pctU(Math.abs(v)))
      expect(F.pct(v), `pct(${v})`).toBe(O.pct(v))
      for (const d of [0, 1, 2]) expect(F.pct(v, d), `pct(${v},${d})`).toBe(O.pct(v, d))
      expect(F.f2(v), `f2(${v})`).toBe(O.f2(v))
      expect(F.fmtX(v / 3), `fmtX(${v / 3})`).toBe(O.fmtX(v / 3))
      expect(F.drvText(v), `drvText(${v})`).toBe(O.drvText(0, v))
      expect(F.pc10(v), `pc10(${v})`).toBe(O.pc10(v))
      const up = Math.min(1, Math.abs(v) / 3)
      expect(F.rankText(up), `rankText(${up})`).toBe(O.cRankTxt(up))
    }
  })
  it('돈·수', () => {
    for (const x of amounts) {
      expect(F.comma(x), `comma(${x})`).toBe(O.comma(x))
      expect(F.man(x), `man(${x})`).toBe(O.man(x))
      expect(F.sman(x), `sman(${x})`).toBe(O.sman(x))
    }
  })
  it('시간', () => {
    for (const t of secs) expect(F.minutes(t), `minutes(${t})`).toBe(O.cMin(t))
  })
  it('조사', () => {
    for (const w of words) for (const [a, b] of [['이', '가'], ['을', '를'], ['은', '는'], ['과', '와']]) {
      expect(F.josa(w, a, b)).toBe(O.josa(w, a, b))
    }
  })
  it('알려진 값', () => {
    expect(F.fmtPct(0.125)).toBe('+13%')
    expect(F.fmtPct(-0.034)).toBe('−3.4%')
    expect(F.man(1234.5)).toBe('1,235만')
    expect(F.sman(-2.4)).toBe('−2만')
    expect(F.minutes(59.9)).toBe('1분')
    expect(F.josa('카페', '이', '가')).toBe('카페가')
    expect(F.josa('빵집', '이', '가')).toBe('빵집이')
  })
})
