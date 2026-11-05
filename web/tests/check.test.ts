/// <reference types="node" />
// 손익 점검 화면 규칙 — 업종 대응 · 예시 입력 · 주소 · 한 번 계산 · 쉬운 말 문장 (마스터플랜 W7.4 '손익 점검', §5.14)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowValue, verdict, type BeRow } from '../src/core/breakeven'
import {
  BE_SKIP, CHECK_DEFAULT, type BeInd, type BeMeta, beFor, calcText, costRate, fitText, haeyo, isExample, leadText, needText, noBeText, readCheck, rentCheck, rentText, runCheck, shareEasy, signedWon, verdictEasy, won, writeCheck,
} from '../src/core/check'
import type { KindsData } from '../src/core/kinds'
import type { RebRent } from '../src/core/rent'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const be = read<{ meta: BeMeta; ind: BeInd[] }>('be/index.json')
const kinds = read<KindsData>('kinds/index.json').kinds
const places = read<{ sang: { nm: string[] } }>('be/places.json')

describe('견줄 서울시 업종', () => {
  it('업종 대응표 — 카페 · 백반/한정식(한식 묶음) · 세탁소, 셀프 빨래방은 견주지 않는다', () => {
    expect(beFor('I21201', be.ind)?.k).toBe('CS100010')
    const han = beFor('I20101', be.ind)!
    expect([han.k, han.codes.length]).toEqual(['CS100001', 14])
    expect(beFor('S20901', be.ind)?.k).toBe('CS200031')
    expect(BE_SKIP.has('S20902')).toBe(true)
    expect(beFor('S20902', be.ind)).toBeNull()
    expect(beFor('L10203', be.ind)).toBeNull() // 부동산 중개 — 카드 매출로 잡히지 않아 손익 자료에서 뺐다
    // 상가 코드 하나는 서울시 업종 하나에만
    const seen = new Set<string>()
    for (const d of be.ind) for (const c of d.codes) {
      expect(seen.has(c), c).toBe(false)
      seen.add(c)
    }
    // 247업종 가운데 96업종 — 서울 가게의 59%
    const hit = kinds.filter((k) => beFor(k.c, be.ind))
    expect(hit.length).toBe(96)
    expect(Math.round((hit.reduce((a, k) => a + k.n, 0) / kinds.reduce((a, k) => a + k.n, 0)) * 100)).toBe(59)
  })

  it('대응 설명 — 묶음 · 잘 맞지 않는 짝', () => {
    expect(fitText(beFor('I21201', be.ind)!, '카페')).toBe("서울시 상권분석 '커피-음료'의 매출과 견줘요")
    expect(fitText(beFor('I20101', be.ind)!, '백반/한정식')).toBe("서울시 상권분석 '한식음식점'의 매출과 견줘요 — 상가정보 업종 14개를 묶은 값이에요")
    const cloth = beFor('G20902', be.ind)!
    expect(cloth.fit?.ok).toBe(false)
    expect(fitText(cloth, '여성 의류 소매업')).toContain('여성 의류 소매업과 상권마다 가게 수가 잘 맞지 않는 짝')
    expect(noBeText('셀프 빨래방', 'S20902')).toMatch(/^셀프 빨래방은 서울시 '세탁소' 매출/)
    expect(noBeText('부동산 중개/대리업', 'L10203')).toMatch(/^부동산 중개\/대리업은 서울시 상권분석 업종과 바로 이어지지 않아요/)
  })
})

describe('자료 글을 화면 말로', () => {
  it('60업종의 카드 매출 설명 · 원가율 근거에 합니다체가 남지 않는다', () => {
    for (const d of be.ind) for (const t of [d.capnote, d.vsrc]) expect(haeyo(t), t).not.toMatch(/니다/)
    expect(haeyo('하루 카드 결제가 3.1건으로 잡힙니다 — 현금이 많으면 실제 매출은 더 큽니다')).toBe('하루 카드 결제가 3.1건으로 잡혀요 — 현금이 많으면 실제 매출은 더 커요')
    expect(['약 56%입니다', '그 사이입니다', '업종입니다', '연 1.2억입니다'].map(haeyo)).toEqual(['약 56%예요', '그 사이예요', '업종이에요', '연 1.2억이에요'])
  })
})

describe('입력 · 주소', () => {
  it('예시 값은 주소에 쓰지 않고, 바꾼 것만 — 층의 −1도', () => {
    const q = new URLSearchParams()
    writeCheck(q, CHECK_DEFAULT)
    expect(q.toString()).toBe('')
    expect(isExample(CHECK_DEFAULT)).toBe(true)
    expect(isExample({ ...CHECK_DEFAULT, cost: 40.7 })).toBe(false)
    expect(isExample({ ...CHECK_DEFAULT, floor: '2' })).toBe(false)
    expect(readCheck(q)).toEqual(CHECK_DEFAULT)
    const inp = { ...CHECK_DEFAULT, area: 33, rent: 150, cost: 35, floor: '-1' as const }
    const q2 = new URLSearchParams()
    writeCheck(q2, inp)
    expect(q2.get('in')).toBe('33_150')
    expect(q2.get('inx')).toBe('____35__-1')
    expect(readCheck(q2)).toEqual(inp)
    // 엉뚱한 값은 예시 값으로
    expect(readCheck(new URLSearchParams('in=0_abc_-5&inx=__1e9__x_200_7'))).toEqual({ ...CHECK_DEFAULT, inv: 1e9, other2: 99 })
  })
})

describe('한 번 계산 — 카페 · 노량진역 상권 (§5.14 예시)', () => {
  const ind = beFor('I21201', be.ind)!
  const si = places.sang.nm.indexOf('노량진역(노량진)')
  const rows = read<{ S: number[][] }>(`be/ind/${ind.k}.json`)
  const r = rows.S.find((x) => x[0] === si)!
  const s = rowValue([r[0], 0, r[1], r[2], r[3], r[4]] as BeRow)

  it('손익분기 843만 원 ↔ 진입 뒤 평균 901만 원 = 94%', () => {
    const res = runCheck(ind, be.meta, CHECK_DEFAULT, s, null)
    expect(won(res.S)).toBe('843만 원')
    expect(won(res.ref.ref)).toBe('901만 원')
    expect(Math.round(res.R * 100)).toBe(94)
    expect(res.ref.level).toBe('상권')
    expect(verdictEasy(res.R, res.ref.word)).toBe('평균만큼 팔면 남지만 여유가 크지 않아요')
    // 예전 판정(breakeven.ts verdict)과 같은 경계 0.6 · 0.85 · 1 · 1.3
    expect([0.59, 0.6, 0.85, 1, 1.3].map((R) => verdictEasy(R, '평균'))).toEqual([
      '평균의 60%만 팔아도 남아요 — 여유가 큰 편이에요',
      '평균보다 15% 넘게 덜 팔아도 남아요',
      '평균만큼 팔면 남지만 여유가 크지 않아요',
      '평균보다 더 팔아야 남아요',
      '평균보다 30% 넘게 더 팔아야 남아요 — 빠듯해요',
    ])
    expect([0.59, 0.6, 0.85, 1, 1.3].map((R) => verdict(R, '평균').slice(0, 8))).toEqual([0.59, 0.6, 0.85, 1, 1.3].map((R) => verdictEasy(R, '평균').slice(0, 8)))
    expect(leadText(res, ind)).toBe('본전 매출은 이 동네 같은 업종 가게가 내가 들어간 뒤 올릴 평균 월매출(901만 원)의 94%예요.')
    expect(needText(res, s!.tx)).toBe('하루로 바꾸면 결제 약 56건이에요 (객단가 5,000원, 30일 기준). 이 동네 같은 업종 가게는 카드 결제가 하루 59.5건으로 잡혀요.')
    expect(res.profits.map((p) => p.f)).toEqual([0.6, 0.8, 1, 1.2])
    expect(res.profits[2].P).toBeGreaterThan(0) // 평균만큼이면 남는다
    expect(res.profits[0].P).toBeLessThan(0)
    expect(shareEasy(ind, res.share)).toMatch(/^서울 '커피-음료' 가게의 약 \d+%가 점포당 평균 매출이 이 본전 매출을 넘는 상권에 있어요\.$/)
    expect(calcText(res, CHECK_DEFAULT, costRate(CHECK_DEFAULT, ind))).toMatch(/^고정비 월 497만 원\(월세 250만 원 · 관리비 30만 원 · 인건비 0만 원 · 기타 50만 원 · 투자 회수 167만 원\) ÷ \(1 − 변동비 41\.1% = 원가 40\.7% \+ 기타 0\.0% \+ 카드 0\.40%\)$/)
  })

  it('상권 · 행정동 값이 없으면 서울 가운데 값과', () => {
    const res = runCheck(ind, be.meta, CHECK_DEFAULT, null, null)
    expect(res.ref.level).toBe('서울')
    expect(res.ref.word).toBe('중앙값')
    expect(leadText(res, ind)).toMatch(/^본전 매출은 서울 '커피-음료' 상권별 점포당 월매출의 가운데 값\(909만 원\)의 \d+%예요\.$/)
  })

  it('변동비와 수수료가 100%를 넘으면 손익분기가 없다', () => {
    const res = runCheck(ind, be.meta, { ...CHECK_DEFAULT, cost: 99, other2: 5 }, s, null)
    expect(res.S).toBe(Infinity)
  })
})

describe('글자 · 월세', () => {
  it('돈', () => {
    expect([843.2, 12000, 10000, 9999.6, -52.4].map(won)).toEqual(['843만 원', '1억 2,000만 원', '1억 원', '1억 원', '−52만 원'])
    expect([134.4, -52.4, 0.2].map(signedWon)).toEqual(['+134만 원', '−52만 원', '0원'])
  })

  it('부동산원 조사 상권 — 3.3㎡당 만 원으로 견준다', () => {
    const reb = read<{ rents: RebRent[] }>('reb/index.json').rents
    const r = reb.find((x) => x.n === '명동')!
    const rc = rentCheck(CHECK_DEFAULT, r)!
    // (250 + 3000×1%) × 10 ÷ 50㎡ = 56천 원/㎡ → 3.3㎡당 18.5만 원
    expect(rc.myPy.toFixed(1)).toBe('18.5')
    expect(rc.word).toBe('싼 편')
    expect(rentText(rc, 3000)).toMatch(/^보증금의 1%를 더하면 3\.3㎡당 18\.5만 원 — 이 상권\(명동\) 1층 평균 46\.7만 원의 0\.40배로 싼 편이에요\.$/)
    expect(rentCheck({ ...CHECK_DEFAULT, area: 0 }, r)).toBeNull()
    expect(rentCheck(CHECK_DEFAULT, null)).toBeNull()
    // 지하 1층 — 그 상권 효용비율이 있으면 그것
    const b1 = rentCheck({ ...CHECK_DEFAULT, floor: '-1' }, r)!
    expect(b1.floorNm).toBe('지하 1층')
    expect(b1.basePy).toBeLessThan(rc.basePy)
  })
})
