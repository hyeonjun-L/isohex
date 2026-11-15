/// <reference types="node" />
// 맞힘 성적(성적표) — 내보낸 성적이 말이 되는지, 문장이 숫자와 맞는지 (마스터플랜 W7.16 '맞힘 성적을 쉬운 말로')
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Industry, Manifest } from '../src/core/data'
import { cardScore, scoreLines, spanText, tenOf } from '../src/core/score'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const index = read<Industry[]>('ind/index.json')
const model = read<Manifest>('manifest.json').model!
const painted = index.filter((d) => d.paint)

describe('내보낸 성적', () => {
  it('칠하는 업종마다 위 · 아래 몫과 배수 — 위가 아래보다 높고, 칠하지 않는 업종에는 없다', () => {
    expect(painted).toHaveLength(34)
    for (const d of painted) {
      expect(d.hit, d.nm).toHaveLength(2)
      const [top, bot] = d.hit!
      expect(top > 0 && top < 1 && bot > 0 && bot < 1, d.nm).toBe(true)
      expect(top, d.nm).toBeGreaterThan(bot) // 순서를 맞히는 업종만 칠한다
      expect(d.lift, d.nm).toBeGreaterThan(1)
      expect(d.ny, d.nm).toHaveLength(2)
    }
    for (const d of index.filter((x) => !x.paint)) expect(d.hit, d.nm).toBeUndefined()
  })

  it('전체 줄 = 칠하는 업종의 가운데 값', () => {
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }
    expect(model.score!.ind).toBe(painted.length)
    expect(model.score!.top).toBeCloseTo(med(painted.map((d) => d.hit![0])), 2)
    expect(model.score!.bot).toBeCloseTo(med(painted.map((d) => d.hit![1])), 2)
    expect(model.next_year!.top).toBeCloseTo(med(painted.map((d) => d.ny![0])), 2)
    expect(model.next_year).toMatchObject({ train: '2025Q1~2025Q4', test: '2026Q1~2026Q2', bh_pass: 33, of: 37 })
    // 한 해 앞 자료로 배운 모형도 이듬해에 운(0.5)보다 뚜렷이 낫다
    expect(model.next_year!.top).toBeGreaterThan(0.6)
    expect(model.next_year!.bot).toBeLessThan(0.4)
  })
})

describe('문장', () => {
  it('10곳 중 몇 곳 · 기간', () => {
    expect([0.802, 0.222, 0.689, 0.32, 0.5, 0.04, 0.96, 1.2, -1].map(tenOf)).toEqual(['10곳 중 8곳', '10곳 중 2곳', '10곳 중 7곳', '10곳 중 3곳', '10곳 중 5곳', '10곳 중 0곳', '10곳 중 10곳', '10곳 중 10곳', '10곳 중 0곳'])
    expect(['2025Q1~2025Q4', '2026Q1~2026Q2', '2025Q3~2025Q4', '2025Q3~2026Q2', '그 밖'].map(spanText)).toEqual(['2025년', '2026년 상반기', '2025년 하반기', '2025년 3분기~2026년 2분기', '그 밖'])
  })

  it('자리 카드 첫 줄 — 성적이 있으면 쉬운 말, 없으면 순위상관만', () => {
    expect(cardScore('카페', 0.46, [0.802, 0.222])).toBe(
      '처음 보는 구에서 시험하니 높다고 본 상권(위 20%)은 10곳 중 8곳, 낮다고 본 상권(아래 20%)은 10곳 중 2곳이 실제로 카페 가운데 값보다 많이 팔았어요(운이면 둘 다 5곳). 여러 자리를 견주는 데 쓰세요 · 순위상관 0.46',
    )
    expect(cardScore('카페', 0.46, null)).toBe('처음 보는 구에서 상권 매출 순서를 맞힌 정도 0.46 (1이면 완벽, 0이면 운). 여러 자리를 견주는 데 쓰세요')
  })

  it('성적표 네 줄 — 카페', () => {
    const cafe = index.find((d) => d.nm === '카페')!
    const L = scoreLines(cafe, model)
    expect(L.map((l) => l.key)).toEqual(['ind', 'ny', 'all', 'how'])
    expect(L[0]).toEqual({ key: 'ind', head: '카페', text: '높다고 본 상권(위 20%)은 10곳 중 8곳, 낮다고 본 상권(아래 20%)은 10곳 중 2곳에서 실제 가게당 매출이 업종 가운데 값을 넘었어요. 위 20% 상권의 가게당 매출은 아래 20%의 4.7배였어요.' })
    expect(L[1].text).toBe('2025년 자료만으로 배운 같은 모형은 2026년 상반기에 10곳 중 8곳 · 2곳이었어요.')
    expect(L[2]).toMatchObject({ head: '칠하는 34개 업종', text: '가운데 값은 10곳 중 7곳 · 3곳 (다음 해 7곳 · 3곳)이에요.' })
    expect(L[3].text).toContain('운으로 찍으면 둘 다 10곳 중 5곳')
  })

  it('성적이 없는 자료(옛 판) · 다음 해가 없는 자료', () => {
    expect(scoreLines({ nm: '카페' }, model)).toEqual([])
    expect(scoreLines({ nm: '카페', hit: [0.8, 0.2] }, undefined).map((l) => l.key)).toEqual(['ind', 'how'])
    expect(scoreLines({ nm: '카페', hit: [0.8, 0.2], ny: [0.7, 0.3] }, { score: model.score }).map((l) => l.key)).toEqual(['ind', 'all', 'how'])
  })
})
