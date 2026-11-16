/// <reference types="node" />
// 이 자리에 맞는 업종(거꾸로 찾기) — 한 파일로 묶은 값이 업종 파일과 같은지, 줄 세우기가 맞는지 (마스터플랜 W7.16 권함 9)
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { fracAbove } from '../src/core/candidates'
import type { Industry } from '../src/core/data'
import { FIT_NONE, type FitRaw, decodeFit, fitLine, fitRows } from '../src/core/fit'
import { sameKind } from '../src/core/kinds'
import { levelText } from '../src/core/level'
import { shareText } from '../src/ui/ShareButton'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const index = read<Industry[]>('ind/index.json')
const cells = read<{ h3: string[] }>('cells.json')
const nb = read<number[]>('grid/nb.json')
const fit = decodeFit(read<FitRaw>('ind/all.json'))
const N = cells.h3.length
const at = (lat: number, lng: number) => cells.h3.indexOf(latLngToCell(lat, lng, 9))

describe('한 파일로 묶은 자료', () => {
  it('칠하는 업종 모두 — 칸 값이 업종 파일(ind/<업종>.json)과 같다', () => {
    expect(fit.k).toEqual(index.filter((d) => d.paint).map((d) => d.k))
    expect(fit.n).toBe(N)
    fit.k.forEach((k, j) => {
      const v = read<{ v: (number | null)[] }>(`ind/${k}.json`).v
      for (let i = 0; i < N; i++) if ((v[i] ?? FIT_NONE) !== fit.v[j * N + i]) throw new Error(`${k} 칸 ${i}: ${v[i]} ≠ ${fit.v[j * N + i]}`)
      expect(fit.sorted[j].length).toBe(v.filter((x) => x != null).length)
    })
  })

  it('같은 업종 가게 수 = 그 업종 상가 코드들의 이 칸 + 둘레 합 (255에서 자름)', () => {
    for (const nm of ['카페', '한식', '세탁소']) {
      const d = index.find((x) => x.nm === nm)!, j = fit.k.indexOf(d.k)
      const near = new Int32Array(N)
      for (const c of d.codes) sameKind(read<number[]>(`kinds/cnt/${c}.json`), nb, N).near.forEach((x, i) => { near[i] += x })
      for (let i = 0; i < N; i++) if (Math.min(255, near[i]) !== fit.near[j * N + i]) throw new Error(`${nm} 칸 ${i}`)
    }
  })
})

describe('줄 세우기', () => {
  const i = at(37.5208, 127.023) // 가로수길(신사동)
  const m = fitRows(fit, index, i)

  it('상위 몫이 작은 순 — 줄마다 그 업종 파일로 다시 센 값과 같다', () => {
    expect(m.rows.length + m.none.length).toBe(fit.k.length)
    expect(m.rows.length).toBeGreaterThan(20)
    for (let r = 1; r < m.rows.length; r++) expect(m.rows[r].up).toBeGreaterThanOrEqual(m.rows[r - 1].up)
    for (const r of m.rows.slice(0, 5)) {
      const d = index.find((x) => x.k === r.k)!
      const v = read<{ v: (number | null)[] }>(`ind/${r.k}.json`).v
      const sorted = Float64Array.from(v.filter((x): x is number => x != null)).sort()
      expect(r.up).toBe(fracAbove(sorted, v[i]!))
      expect(r.level).toBe(levelText(v[i]! / 10))
      expect(r.code).toBe(d.codes[0])
      expect(r.upText).toMatch(/^상위 \d+%$/)
      expect(r.nearText).toMatch(/^같은 업종 (없음|\d+곳|255곳 이상)$/)
      expect(r.strength).toMatch(/^모형의 힘 (보통|약함|아주 약함)$/)
    }
    expect(fitLine('신사동', m)).toBe(`신사동 이 자리에 맞는 업종: ${m.rows.slice(0, 3).map((r) => `${r.nm}(${r.upText})`).join(' · ')}`)
  })

  it('가게가 드문 칸 — 추정하지 않는 업종으로 빠진다', () => {
    let sparse = -1
    for (let c = 0; c < N && sparse < 0; c++) if (fit.k.every((_, j) => fit.v[j * N + c] === FIT_NONE)) sparse = c
    const s = fitRows(fit, index, sparse)
    expect(s.rows).toEqual([])
    expect(s.none).toHaveLength(fit.k.length)
    expect(fitLine('어느 동', s)).toContain('추정하지 않아요')
  })

  it('공유 글 — 문장 + 주소', () => {
    expect(shareText('신사동 — 번화가예요', 'https://x/?cell=1')).toBe('신사동 — 번화가예요\nhttps://x/?cell=1')
    expect(shareText(null, 'https://x/')).toBe('https://x/')
  })
})
