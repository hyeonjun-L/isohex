/// <reference types="node" />
// 무인매장 묶음 — 내보낸 자료(unm/index.json · cand/index.json)로 업종처럼 고르기 · 지도 · 카드 · 후보 범위 · 손익 · 둘 견주기 · 비교함이
// 자료와 맞물리는지 본다 (마스터플랜 W7.4 무인매장 묶음 · 와이어프레임 T1m · T1n, §5.16 · §5.17)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boxRows } from '../src/core/box'
import { type CandData, fromSparse, nbSum } from '../src/core/candidates'
import { type CardInput, buildCard } from '../src/core/card'
import { CHECK_DEFAULT, applyInputs, type BeInd, type BeMeta } from '../src/core/check'
import { readCmp } from '../src/core/compare'
import { kindBand } from '../src/core/find'
import { type KindsData, kindIndex, sameKind } from '../src/core/kinds'
import { chipsFor, pickShow, sameLayer, unmLayer } from '../src/core/layers'
import { type SiteData, siteCuts } from '../src/core/site'
import {
  type UnmData, UN_GROUP, aboveText, isUn, listWhen, runUn, survNote, unCard, unDefaults, unDiffThree, unExample, unInside, unKind, unLead, unRows, unSide, wonShort,
} from '../src/core/unm'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const unm = read<UnmData>('unm/index.json')
const cand = read<CandData>('cand/index.json')
const kinds = read<KindsData>('kinds/index.json')
const ind = read<{ k: string; codes: string[]; paint: boolean }[]>('ind/index.json')
const entry = read<{ ind: { k: string }[] }>('entry/index.json').ind
const be = read<{ meta: BeMeta; ind: BeInd[] }>('be/index.json')
const cells = read<{ h3: string[]; n300: number[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const site = read<SiteData>('grid/site.json')
const nb = read<number[]>('grid/nb.json')
const N = cells.h3.length
const ix = kindIndex(kinds, ind, entry, unm)
const U = (k: string) => unm.types.find((u) => u.k === k)!
const side = (k: string) => unSide(U(k), ix.byCode, be.ind)

describe('자료 — 무인 6종', () => {
  it('유형 여섯 · 코드 · 브랜드 가운데 값이 브랜드 매출의 가운데', () => {
    expect(unm.types.map((u) => u.k)).toEqual(['UN-laundry', 'UN-study', 'UN-icecream', 'UN-cafe', 'UN-photo', 'UN-mealkit'])
    for (const u of unm.types) {
      expect(isUn(u.k)).toBe(true)
      expect(u.nm).toBe(`무인 ${u.t}`)
      const s = u.brands.map((b) => b.sales).sort((a, b) => a - b), n = s.length
      const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
      expect(Math.abs(u.money.sales[0] - med)).toBeLessThanOrEqual(0.5) // 내보내기가 정수로 둥근다(밀키트 744.5 → 744)
      expect([u.money.sales[1], u.money.sales[2]]).toEqual([s[0], s[n - 1]])
      expect(u.money.inv).toBeLessThan(u.money.open[0]) // 돌려받는 가맹 보증금을 뺐다
      expect(cand.types.some((t) => t.t === u.t)).toBe(true)
    }
    // §5.17 — 가맹점 평균 월매출 사진관 1,852만 ~ 카페 458만, 창업비 빨래방 1.9억 ~ 아이스크림 2,805만
    expect(U('UN-photo').money.sales[0]).toBe(1852)
    expect(U('UN-cafe').money.sales[0]).toBe(458)
    expect(wonShort(U('UN-laundry').money.open[0])).toBe('1.9억 원')
    expect(wonShort(U('UN-icecream').money.open[0])).toBe('2,805만 원')
    expect(wonShort(10000)).toBe('1억 원')
    expect(listWhen(unm.meta.list)).toBe('2025년 말')
  })
})

describe('업종처럼 고르기 (T1m)', () => {
  it('업종 247 뒤에 무인 6종 — 묶음 \'무인매장\'은 맨 끝, 깊이는 무인 가게 · 손익', () => {
    expect(ix.all.length).toBe(kinds.kinds.length + 6)
    expect([...ix.groups.keys()].at(-1)).toBe(UN_GROUP)
    expect(ix.groups.get(UN_GROUP)!.map((k) => k.nm)).toEqual(['무인 빨래방', '무인 스터디카페', '무인 아이스크림', '무인 카페', '무인 사진관', '무인 밀키트'])
    expect(ix.depth('UN-cafe')).toEqual({ pot: null, entry: false, un: true })
    expect(ix.depth('I21201').un).toBe(false)
    // 생존 위치는 업종 247만으로 — 무인 유형은 빌려 온 값이라 넣지 않는다
    expect(ix.s12Sorted.length).toBe(kinds.kinds.filter((k) => k.s12).length)
  })

  it('서울 가게 수는 명단 수, 생존은 주로 실린 업종 — 무인 아이스크림은 슈퍼마켓(73%)', () => {
    const k = ix.byCode.get('UN-icecream')!
    expect(k.n).toBe(928)
    expect(k.s12).toEqual(ix.byCode.get('G20404')!.s12)
    expect(survNote(U('UN-icecream'), ix.byCode)).toBe('슈퍼마켓 업종 값 — 무인 아이스크림의 73%가 이 업종으로 실려 있어요')
    expect(survNote(U('UN-photo'), ix.byCode)).toBe('사진촬영업 업종 값') // 95% — 거의 다 실렸다
    expect(unKind(U('UN-cafe'), ix.byCode)).toMatchObject({ c: 'UN-cafe', g: UN_GROUP, n: 568, s12: ix.byCode.get('I21201')!.s12 })
    const c = unCard(U('UN-laundry'), ix.byCode.get('UN-laundry')!, ix.byCode)
    expect(c).toMatchObject({ trend: 'up', trendText: '늘어나는 중', sales: '529만 원', salesSub: '브랜드 한 곳(워시엔조이) 값', open: '1.9억 원', surv: '87%' })
  })

  it('업종 안에 든 무인 유형 — 카페에는 무인 카페, 슈퍼마켓에는 무인 아이스크림, 편의점(13%)은 아님', () => {
    const inside = (c: string) => unInside(ix.byCode.get(c)!, unm.types).map((u) => u.nm)
    expect(inside('I21201')).toEqual(['무인 카페'])
    expect(inside('G20404')).toEqual(['무인 아이스크림'])
    expect(inside('S20901')).toEqual(['무인 빨래방'])
    expect(inside('S20902')).toEqual(['무인 빨래방'])
    expect(inside('G20405')).toEqual([])
  })

  it('주소 — 무인 유형 둘 견주기(cmp=UN-icecream_UN-cafe)', () => {
    expect(readCmp('UN-icecream_UN-cafe')).toEqual(['UN-icecream', 'UN-cafe'])
    expect(readCmp('UN-cafe_UN-cafe')).toBeNull()
    expect(readCmp('UN-Cafe_I21201')).toBeNull()
  })
})

describe('지도 — 무인 가게 · 같은 업종', () => {
  it('칩 — 볼 수 있는 셋이 앞, 매출 수준 · 새 가게는 흐리게(까닭), 기본은 무인 가게', () => {
    const ch = chipsFor('무인 카페', ix.depth('UN-cafe'))
    expect(ch.map((c) => [c.s, c.ok])).toEqual([['unm', true], ['same', true], ['rent', true], ['pot', false], ['entry', false]])
    expect(ch[3].why).toBe('무인 카페는 자리별 매출 수준을 칠하지 않아요 — 무인 가게는 업종 전체와 다른 자리를 골라요')
    expect(pickShow(null, ch)).toBe('unm')
    expect(pickShow('same', ch)).toBe('same')
    expect(pickShow('pot', ch)).toBe('unm')
    // 업종 247은 그대로 넷
    expect(chipsFor('카페', ix.depth('I21201')).map((c) => c.s)).toEqual(['pot', 'rent', 'entry', 'same'])
  })

  it('무인 가게 지도 — 명단에서 찾은 수와 합이 같고, 범례는 빠진 곳이 있다고 말한다', () => {
    for (const u of unm.types) {
      const t = cand.types.find((x) => x.t === u.t)!
      const own = fromSparse(cand.un[u.t], N)
      expect(own.reduce((a, b) => a + b, 0)).toBe(t.found)
    }
    const near = sameKind(cand.un['빨래방'], nb, N).near
    const L = unmLayer(near, '무인 빨래방', 647, 1165, '2025년 말')
    expect(L.show).toBe('unm')
    expect(L.legend.title).toBe('무인 가게 — 이 칸과 둘레 6칸의 무인 빨래방')
    expect(L.legend.sub).toBe('서울시 무인점포 명단(2025년 말) 1,165곳 중 이름으로 찾은 647곳만 — 빠진 곳이 있어요')
    expect(L.legend.items[0].label).toBe('없음')
    const S = sameLayer(sameKind(cand.cnt['빨래방'], nb, N).near, '무인 빨래방', '2025년 4분기', { label: cand.types[0].label })
    expect(S.legend.title).toBe('같은 업종 — 이 칸과 둘레 6칸에서 무인 빨래방과 손님을 나누는 가게 수')
    expect(S.legend.sub).toMatch(/^셀프 빨래방 \(세탁소 중 이름에 .+\) · 상가정보 2025년 4분기$/)
  })
})

describe('후보 찾기 — 비슷한 자리는 명단의 무인 가게로', () => {
  it('무인 6종 모두 명단 수로 잰 범위가 p24 범위와 같다', () => {
    for (const t of cand.types) {
      const B = kindBand(fromSparse(cand.un[t.t], N), cells.n300, site.tilt)!
      expect(B).toEqual(t.band)
    }
  })
})

describe('자리 카드 · 비교함 — 무인 빨래방 (신촌동)', () => {
  const h3 = '8930e1d80abffff', i = cells.h3.indexOf(h3), code = 'UN-laundry', u = U(code)
  const cuts = siteCuts(cells.n300, site.tilt)
  const n300Sorted = Float64Array.from(cells.n300).sort()
  const mk = (j: number): CardInput => {
    const sk = sameKind(cand.cnt[u.t], nb, N), un = sameKind(cand.un[u.t], nb, N)
    return {
      i: j, dongKey: dongs[cells.dong[j]], n: N, n300: cells.n300[j], n300Sorted, site, cuts, station: null, reb: null,
      kind: { k: ix.byCode.get(code)!, depth: ix.depth(code), s12Sorted: ix.s12Sorted },
      same: { own: sk.own[j], near: sk.near[j], nearSorted: Float64Array.from(sk.near).sort() },
      un: { u, own: un.own[j], near: un.near[j], nearSorted: Float64Array.from(un.near).sort(), found: 647, when: '2025년 말', survNm: '셀프 빨래방' },
    }
  }

  it('숫자 넷 — 무인 가게 · 1층 임대료 · 같은 업종 · 생존(셀프 빨래방 업종 값), 매출은 브랜드 값이라고', () => {
    const own = fromSparse(cand.un[u.t], N), near = nbSum(own, nb)
    const card = buildCard(mk(i))
    expect(card.facts.map((f) => f.key)).toEqual(['unm', 'rent', 'same', 'surv'])
    expect(card.facts[0].value).toBe(`무인 빨래방 ${near[i]}곳`)
    expect(card.facts[0].sub).toBe(`이 칸 ${own[i]}곳 · 명단에서 찾은 곳만`)
    expect(card.facts[2].value).toMatch(/^빨래방 \d+곳$/)
    expect(card.facts[3].label).toBe('새 가게 1년 생존 (셀프 빨래방, 서울)')
    expect(card.line).toContain(`둘레에 무인 빨래방 ${near[i]}곳이 있어요 (명단에서 찾은 곳)`)
    expect(card.trust.map((t) => t.title)).toEqual(expect.arrayContaining(['매출은 가맹 브랜드 값', '무인 가게는 명단에서 찾은 곳만']))
    expect(card.trust.find((t) => t.title === '매출은 가맹 브랜드 값')!.text).toContain('브랜드 한 곳(워시엔조이) 값으로 529만 원이에요')
    expect(card.why).toBeNull()
    expect(card.foot).toMatch(/^숫자는 공공데이터를 칸에 모은 값이에요/)
  })

  it('비교함 줄 — 매출 수준 대신 무인 가게, 매출은 한 문장', () => {
    const j = cells.h3.indexOf('8930e1d9a4fffff')
    const rows = boxRows([mk(i), mk(j)], null)
    expect(rows.map((r) => r.key)).toEqual(['unm', 'sales', 'same', 'n300', 'place', 'rent', 'station', 'surv'])
    expect(rows[1].span).toBe('브랜드 한 곳(워시엔조이) 값 529만 원 — 서울 전체 값이라 곳마다 같아요(정보공개서)')
    expect(rows.at(-1)!.label).toBe('새 가게 1년 생존 (셀프 빨래방, 서울)')
  })
})

describe('손익 — 브랜드 가운데 값과 견준다', () => {
  it('처음 숫자 — 면적 · 초기 투자 · 층은 브랜드 값, 바꾼 숫자는 유형을 바꿔도 남는다', () => {
    expect(unDefaults(U('UN-cafe'))).toEqual({ ...CHECK_DEFAULT, area: 31, inv: 6400, labor: 0, floor: '1' })
    expect(unDefaults(U('UN-study'))).toMatchObject({ area: 186, inv: 15800, floor: '2' })
    // 월세만 바꾼 뒤 스터디카페 → 카페: 면적은 카페 값, 월세는 그대로
    const over = applyInputs({}, { rent: 120 }, unDefaults(U('UN-study')))
    expect({ ...unDefaults(U('UN-cafe')), ...over }).toMatchObject({ area: 31, rent: 120, floor: '1' })
  })

  it('무인 카페 예시 — 본전 862만 원, 브랜드 5곳 모두 그보다 낮다', () => {
    const s = side('UN-cafe')
    expect(s.v).toBe(be.ind.find((d) => d.k === 'CS100010')!.v)
    expect(s.vcs).toBe('커피-음료')
    const res = runUn(s, be.meta.card, unDefaults(U('UN-cafe')))
    expect(Math.round(res.S)).toBe(862)
    expect(res.ref).toBe(458)
    expect(res.above).toBe(0)
    expect(aboveText(res, s.u)).toBe('가맹 브랜드 5곳 모두 가맹점 평균 월매출이 본전 매출보다 낮아요.')
    expect(unLead(res, s.u)).toBe('본전 매출은 무인 카페 가맹점 평균 월매출의 브랜드 가운데 값(458만 원)의 188%예요.')
    // 월세를 낮추면 넘는 브랜드가 생긴다
    const low = runUn(s, be.meta.card, { ...unDefaults(U('UN-cafe')), rent: 60, other: 20 })
    expect(low.above).toBeGreaterThan(0)
    expect(aboveText(low, s.u)).toMatch(/^가맹 브랜드 5곳 중 \d곳의 가맹점 평균 월매출이 본전 매출을 넘어요\.$/)
  })

  it('브랜드 한 곳(빨래방)이면 거친 기준이라고, 스터디카페는 원가율 0', () => {
    const l = side('UN-laundry')
    const res = runUn(l, be.meta.card, unDefaults(l.u))
    expect(aboveText(res, l.u)).toBe('견줄 수 있는 가맹 브랜드가 워시엔조이 한 곳뿐이라 거친 기준이에요.')
    expect(unLead(res, l.u)).toMatch(/^본전 매출은 무인 빨래방 가맹점 평균 월매출\(워시엔조이 529만 원\)의 \d+%예요\.$/)
    expect(side('UN-study').v).toBe(0)
  })
})

describe('둘 견주기 (T1n) — 무인 아이스크림 vs 무인 카페', () => {
  const a = side('UN-icecream'), b = side('UN-cafe')

  it('차이 셋 — 매출 2배(물건값을 빼면 1.2배) · 창업비 절반 이하 · 흐름은 카페가 나음, 순서를 바꿔도 같은 문장', () => {
    const d = unDiffThree(a, b)
    expect(d.map((x) => x.head)).toEqual(['가맹점 매출은 무인 아이스크림이 2.0배', '창업비는 무인 아이스크림이 절반 이하', '흐름은 무인 카페가 나아요'])
    expect(d[0].text).toBe('월 920만 원 vs 458만 원')
    expect(d[0].sub).toBe('물건값(매출의 65% · 41%)을 빼면 월 322만 원 vs 272만 원 — 1.2배로 차이가 줄어요')
    expect(d[1].text).toBe('2,805만 원 vs 6,485만 원 (점포 임차 빼고)')
    expect(d[2].text).toBe('무인 카페 작은 몫, 명단은 늘어남 · 무인 아이스크림 정점 지나 둔화')
    expect(d[2].sub).toBe('한 해에 문 닫은 가맹점 10% vs 19%')
    expect(unDiffThree(b, a)).toEqual(d)
  })

  it('그 밖의 짝 — 창업비 3배 넘으면 배수로, 브랜드 한 곳이면 거칠다고, 흐름이 같으면 같은 쪽', () => {
    const l = side('UN-laundry'), p = side('UN-photo'), m = side('UN-mealkit')
    const d = unDiffThree(l, a)
    expect(d[1].head).toBe('창업비는 무인 빨래방이 6.7배')
    expect(d[1].text).toBe('1.9억 원 vs 2,805만 원 (점포 임차 빼고)')
    expect(d[0].head).toBe('가맹점 매출은 무인 아이스크림이 1.7배')
    expect(d[0].sub).toContain('무인 빨래방은 브랜드 한 곳 값이라 거칠어요')
    expect(unDiffThree(p, m)[2].head).toBe('흐름은 같은 쪽이에요')
  })

  it('같은 예시 비용이면 — 아이스크림 본전 1,162만 원(가맹점 평균의 126%), 표 열 줄', () => {
    const e = unExample(a, be.meta.card)
    expect(Math.round(e.S)).toBe(1162)
    expect(Math.round(e.R * 100)).toBe(126)
    const rows = unRows(a, b)
    expect(rows.map((r) => r.key)).toEqual(['trend', 'sales', 'open', 'cost', 'close', 's12', 'area', 'place', 'list', 'brands'])
    expect(rows.find((r) => r.key === 'cost')!.a).toEqual({ v: '65%', sub: "서울시 '슈퍼마켓' 예시" })
    expect(rows.find((r) => r.key === 's12')!.a.sub).toBe('슈퍼마켓 업종 값')
    expect(rows.find((r) => r.key === 'brands')!.b.v).toBe('카페인24 · 카페만월경 · 카페프리헷 · 데이롱카페 · 카페일분')
  })
})
