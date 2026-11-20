/// <reference types="node" />
// 곳 이름 — 서울시 상권 이름 · 법정동 이름으로 찾기 (2026-11-20, 전체 검토 1번: 가로수길 · 서촌 · 대학로 · 상수동 · 익선동이 찾아지지 않았다)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type PlaceNames, type StationData, buildPlaceIndex, findPlace, placeGrid, sangKeys } from '../src/core/places'
import { type KindsData } from '../src/core/kinds'
import { bestHit, searchAll } from '../src/core/search'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; dong: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const st = read<StationData>('places/stations.json')
const names = read<PlaceNames>('places/names.json')
const kd = read<KindsData>('kinds/index.json')
const g = placeGrid(cells)
const idx = buildPlaceIndex(g, dongs, st, names)
const old = buildPlaceIndex(g, dongs, st)
const dongOf = (c: number) => dongs[cells.dong[c]]
const top = (q: string) => findPlace(idx, q).e?.label ?? null

describe('곳 이름 (상권 · 법정동)', () => {
  it('자료 — 칸 번호 · 구 · 구분이 범위 안, 역 출구 이름은 없다', () => {
    const n = cells.h3.length
    expect(names.sang.length).toBeGreaterThan(1200)
    expect(names.bdong.length).toBeGreaterThan(300)
    for (const [nm, se, gu, c] of names.sang) {
      expect(c >= 0 && c < n && se >= 0 && se < names.se.length && gu >= 0 && gu < names.gu.length, nm).toBe(true)
      expect(nm, nm).not.toMatch(/역\s*\d+번$/)
      // 상권이 가리키는 칸은 그 상권의 자치구 안이거나 바로 옆이다 — 적어도 서울 격자 안의 칸
      expect(dongOf(c)).toBeTruthy()
    }
    for (const [nm, gu, c] of names.bdong) expect(c >= 0 && c < n && gu >= 0 && gu < names.gu.length, nm).toBe(true)
    // 법정동은 자치구와 이름이 행정동과 같은 것이 빠져 있다
    const adm = new Set(dongs)
    for (const [nm, gu] of names.bdong) expect(adm.has(`${nm}|${names.gu[gu]}`), nm).toBe(false)
    // 법정동이 가리키는 칸은 같은 자치구 — 가게들의 가운데에서 가장 가까운 칸이라 구 경계를 넘는 일은 드물다
    const cross = names.bdong.filter(([, gu, c]) => dongOf(c).split('|')[1] !== names.gu[gu])
    expect(cross.length).toBeLessThanOrEqual(names.bdong.length * 0.03)
  })

  it('검토 때 못 찾던 이름이 찾아진다', () => {
    expect(top('가로수길')).toBe('가로수길 (발달상권 · 강남구)')
    expect(top('서촌')).toBe('서촌(경복궁역) (발달상권 · 종로구)')
    expect(top('대학로')).toBe('대학로(혜화역) (발달상권 · 종로구)')
    expect(top('코엑스')).toBe('코엑스 (발달상권 · 강남구)')
    expect(top('망리단길')).toBe('망리단길 (골목상권 · 마포구)')
    expect(top('샤로수길')).toBe('샤로수길 (골목상권 · 관악구)')
    expect(top('경리단길')).toMatch(/^경리단길/)
    expect(top('dmc')).toBe('DMC(디지털미디어시티) (발달상권 · 마포구)')
    expect(top('익선동')).toBe('익선동 (종로구 · 법정동)')
    expect(top('상수동')).toBe('상수동 (마포구 · 법정동)')
    expect(top('동교동')).toBe('동교동 (마포구 · 법정동)')
    expect(top('창천동')).toBe('창천동 (서대문구 · 법정동)')
    expect(top('봉천동')).toBe('봉천동 (관악구 · 법정동)')
    // 가서 서는 칸 — 그 동네 안
    const at = (q: string) => dongOf(findPlace(idx, q).e!.cell)
    expect(at('가로수길')).toBe('신사동|강남구')
    expect(at('익선동')).toBe('종로1·2·3·4가동|종로구')
    expect(at('샤로수길')).toBe('낙성대동|관악구')
    // 예전에는 모두 못 찾았다
    for (const q of ['가로수길', '서촌', '대학로', '코엑스', '익선동', '상수동', '봉천동']) expect(findPlace(old, q).e, q).toBeNull()
  })

  it('동 · 역이 먼저다 — 이름이 같은 상권은 빼고, 딴 이름(괄호)은 살린다', () => {
    expect(top('강남역')).toMatch(/^강남역 \(2호선/)
    expect(top('선릉')).toMatch(/^선릉역 \(/)
    expect(top('명동')).toBe('명동 (중구)')
    expect(top('연남동')).toBe('연남동 (마포구)')
    // '선릉역' · '강남역' · '도곡1동'이라는 상권은 목록에 없다
    for (const nm of ['선릉역', '강남역', '도곡1동']) expect(idx.list.some((e) => e.kind === 'sang' && e.name === nm), nm).toBe(false)
    // '잠실새내역(신천)'은 '신천'으로만 찾아진다
    expect(top('신천')).toBe('잠실새내역(신천) (발달상권 · 송파구)')
    expect(top('잠실새내')).toMatch(/^잠실새내역 \(2호선/)
    // 이름이 같은 법정동은 가게 많은 쪽이 앞 — 신정동은 양천구
    expect(top('신정동')).toBe('신정동 (양천구 · 법정동)')
    expect(findPlace(idx, '신정동').alts[0].label).toBe('신정동 (마포구 · 법정동)')
    // '○○동' — 법정동이 있으면 그 하나를 먼저, 행정동 ○○1동 · ○○2동은 비슷한 이름으로
    const r = findPlace(idx, '망원동')
    expect(r.e?.label).toBe('망원동 (마포구 · 법정동)')
    expect(r.alts.map((x) => x.label)).toEqual(['망원1동 (마포구)', '망원2동 (마포구)'])
    // 동 · 역만 있던 목록의 순서는 그대로 — 새 것은 뒤에 붙는다
    expect(idx.list.slice(0, old.list.length).map((e) => e.label)).toEqual(old.list.map((e) => e.label))
    expect(idx.list.slice(old.list.length).every((e) => e.kind === 'bdong' || e.kind === 'sang')).toBe(true)
  })

  it('맞춰 볼 이름 — 괄호 안 딴 이름을 나눈다', () => {
    expect(sangKeys('대학로(혜화역)')).toEqual(['대학로', '혜화역'])
    expect(sangKeys('총신대입구역(이수, 총신대)')).toEqual(['총신대입구역', '이수', '총신대'])
    expect(sangKeys('DMC(디지털미디어시티)')).toEqual(['dmc', '디지털미디어시티'])
    expect(sangKeys('홍대 걷고싶은 거리')).toEqual(['홍대걷고싶은거리'])
    expect(sangKeys('낙원시장(낙원지하시장(대일상가))')[0]).toBe('낙원시장')
  })

  it('첫 화면 찾기 — 상권 이름은 곳으로, 업종 별칭은 업종으로', () => {
    expect(bestHit('가로수길', searchAll('가로수길', kd, idx))).toMatchObject({ kind: 'place', p: { kind: 'sang', name: '가로수길' } })
    expect(bestHit('커피', searchAll('커피', kd, idx))).toMatchObject({ kind: 'kind', k: { nm: '카페' } })
    expect(bestHit('익선동', searchAll('익선동', kd, idx))).toMatchObject({ kind: 'place', p: { kind: 'bdong' } })
  })
})
