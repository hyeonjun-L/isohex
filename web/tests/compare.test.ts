/// <reference types="node" />
// 업종 둘 견주기 — 차이 셋 · 자세히 표 · 주소 (마스터플랜 W7.4 '업종 고르기', 와이어프레임 T1b '카페 vs 빵집')
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BeInd } from '../src/core/check'
import { type Side, bae, compareRows, diffThree, makeSide, quarterText, readCmp, ticketText } from '../src/core/compare'
import type { Industry } from '../src/core/data'
import { type KindsData, kindIndex } from '../src/core/kinds'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const kd = read<KindsData>('kinds/index.json')
const inds = read<Industry[]>('ind/index.json')
const be = read<{ ind: BeInd[] }>('be/index.json').ind
const entry = read<{ meta: { period: string }; ind: { k: string; n: number }[] }>('entry/index.json')
const ix = kindIndex(kd, inds, entry.ind)
const fresh = new Map(entry.ind.map((e) => [e.k, e.n]))
const side = (c: string): Side => makeSide(ix.byCode.get(c)!, ix.depth(c).pot, inds, be, fresh)
const meta = { poi: kd.meta.poi, period: entry.meta.period }

describe('차이 셋', () => {
  it('카페 vs 빵/도넛 — 와이어프레임과 같은 세 문장 (가게 수는 2026년 2분기)', () => {
    const [s, c, v] = diffThree(side('I21201'), side('I21001'))
    expect(s.head).toBe('가게당 매출은 빵/도넛이 1.4배')
    expect(s.text).toBe('월 1,303만 원 vs 909만 원') // 머리에 나온 업종부터
    expect(s.sub).toBe('한 번에 1.1만 원 vs 8천 원을 써요')
    expect(c.head).toBe('경쟁 가게는 카페가 3.7배')
    expect(c.text).toBe('서울 22,718곳 vs 6,113곳')
    expect(v.head).toBe('버티는 힘은 비슷해요') // 84% (82~86%) vs 84% (81~87%) — 구간이 겹친다
    expect(v.text).toBe('새 가게 1년 생존 84% vs 84%')
    expect(v.sub).toBe('다만 빵/도넛은 자리별 매출 수준을 추정하지 못해요 — 자리는 새 가게 · 같은 업종 수로 봐요')
  })

  it('고른 순서를 바꿔도 차이가 있는 문장은 같고, 비슷하면 고른 순서', () => {
    const ab = diffThree(side('I21201'), side('I21001')), ba = diffThree(side('I21001'), side('I21201'))
    expect(ba.slice(0, 2)).toEqual(ab.slice(0, 2))
    expect(ba[2].text).toBe('새 가게 1년 생존 84% vs 84%')
    expect(diffThree(side('I21006'), side('S20701'))[2].text).toBe('새 가게 1년 생존 91% vs 75%') // 미용실이 앞
  })

  it('생존 구간이 안 겹치면 높은 쪽 · 둘 다 매출 수준 지도', () => {
    const [, , v] = diffThree(side('S20701'), side('I21006')) // 미용실 91% vs 치킨 75%
    expect(v.head).toBe('1년 버티는 비율은 미용실이 높아요')
    expect(v.sub).toBe('둘 다 자리별 매출 수준 지도가 있어요')
  })

  it('같은 서울시 업종으로 묶인 짝 · 한쪽만 매출 · 셀프 빨래방', () => {
    expect(diffThree(side('I20101'), side('I20102'))[0]).toMatchObject({ head: '가게당 매출은 견줄 수 없어요', text: "둘 다 서울시 상권분석 '한식음식점' 한 업종으로 묶여 있어요 — 월 2,377만 원" })
    const one = diffThree(side('I21201'), side('L10203'))[0] // 부동산 중개 — 손익 자료에서 뺐다
    expect(one.head).toBe('가게당 매출은 카페만 알 수 있어요')
    expect(one.sub).toMatch(/^부동산 중개\/대리업은 서울시 상권분석 매출 업종과 바로 이어지지 않아요$/)
    expect(diffThree(side('S20902'), side('S20901'))[0].sub).toBe("셀프 빨래방은 서울시 '세탁소' 매출(맡기는 세탁소 위주)과 맞지 않아 견주지 않아요")
    // 둘 다 매출 수준 없음 · 새 가게 지도도 한쪽만
    const none = diffThree(side('S20902'), side('I21001'))[2]
    expect(none.sub).toMatch(/^둘 다 자리별 매출 수준은 없어요 — 자리는 (새 가게 · )?같은 업종 수로 봐요$/)
  })

  it('생존을 셀 수 없는 업종(X 등급)', () => {
    const x = kd.kinds.find((k) => k.grade === 'X')!
    const [, , v] = diffThree(side('I21201'), side(x.c))
    expect(v.head).toBe('1년 생존은 카페만 알 수 있어요')
  })
})

describe('자세히 표', () => {
  it('카페 vs 빵/도넛 — 열 줄', () => {
    const rows = compareRows(side('I21201'), side('I21001'), meta)
    const by = Object.fromEntries(rows.map((r) => [r.key, [r.a.v, r.b.v]]))
    expect(rows.find((r) => r.key === 'n')!.hint).toBe('상가정보 2026년 2분기')
    expect(rows.find((r) => r.key === 'fresh')!.hint).toBe('2025년 상반기')
    expect(by).toEqual({
      n: ['22,718곳', '6,113곳'],
      fresh: ['1,340곳', expect.stringMatching(/^[\d,]+곳$/)],
      med: ['909만 원', '1,303만 원'],
      mid: ['416만~1,580만', '603만~2,122만'],
      tx: ['45건 · 8천 원', '50건 · 1.1만 원'],
      s12: ['84%', '84%'],
      close: ['17%', '14%'],
      pot: ['있음', '없음'],
      cap: ['확인 못 함', '확인 못 함'],
      be: ["'커피-음료'", "'제과점'"],
    })
    const pot = rows.find((r) => r.key === 'pot')!
    expect(pot.a.sub).toBe('모형의 힘 보통 (0.36)')
    expect(pot.b.sub).toBe('자리 차이를 맞히지 못해 칠하지 않아요')
  })

  it('없는 값은 — 와 까닭', () => {
    const rows = compareRows(side('I21201'), side('L10203'), meta)
    const r = (k: string) => rows.find((x) => x.key === k)!
    expect(r('med').b.v).toBe('—')
    expect(r('pot').b.sub).toBe('자리별 매출 수준을 배운 업종이 아니에요')
    expect(compareRows(side('S20902'), side('I21201'), meta).find((x) => x.key === 'pot')!.a.sub).toBe("'세탁소' 값이 맞지 않아 칠하지 않아요")
  })
})

describe('글자 · 주소', () => {
  it('배수 · 한 번 결제 · 분기', () => {
    expect([1.434, 3.716, 9.96, 12.4].map(bae)).toEqual(['1.4배', '3.7배', '10배', '12배'])
    expect([7987, 9400, 9600, 11100, 20000, 54200, 800].map(ticketText)).toEqual(['8천 원', '9천 원', '1만 원', '1.1만 원', '2만 원', '5.4만 원', '800원'])
    expect(quarterText('2026Q2')).toBe('2026년 2분기')
  })

  it('cmp=A_B — 업종 코드 둘, 서로 달라야', () => {
    expect(readCmp('I21201_I21001')).toEqual(['I21201', 'I21001'])
    for (const v of [null, '', 'I21201', 'I21201_I21201', 'I21201_x', 'I21201_I21001_I21006']) expect(readCmp(v)).toBeNull()
    // 업종 247 코드가 모두 이 꼴이다
    for (const k of kd.kinds) expect(readCmp(`${k.c}_Z99999`), k.c).not.toBeNull()
  })
})
