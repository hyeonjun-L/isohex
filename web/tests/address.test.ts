/// <reference types="node" />
// 주소 찾기 — 주소처럼 생긴 글 가리기 · 요청 주소 · 브이월드 응답을 서울 칸에 잇기 (마스터플랜 W7.16 쓰임새 5)
import { readFileSync } from 'node:fs'
import { latLngToCell } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { addrOrder, addrUrl, cleanKey, looksLikeAddress, parseAddr } from '../src/core/address'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const h3 = (JSON.parse(readFileSync(new URL(`${ver}/cells.json`, ROOT), 'utf8')) as { h3: string[] }).h3
const idx = new Map(h3.map((h, i) => [h, i]))
const look = (h: string) => idx.get(h) ?? -1
const item = (road: string, parcel: string, x: number, y: number, bldnm = '') => ({ address: { road, parcel, bldnm }, point: { x: String(x), y: String(y) } })

describe('주소처럼 생긴 글', () => {
  it('도로명 · 지번은 주소, 동 · 역 · 업종 이름은 아니다', () => {
    for (const q of ['망원로 23', '월드컵로13길 12', '서울 마포구 망원로 23', '망원동 395-1', '신사동 산 12', '을지로3가 65-1', '망원동 395번지', ' 테헤란로 152 ']) expect(looksLikeAddress(q), q).toBe(true)
    for (const q of ['망원동', '역삼1동', '종로3가', '강남역', '카페', '망원로', '', '23']) expect(looksLikeAddress(q), q).toBe(false)
  })

  it('먼저 찾을 갈래 — 로 · 길이면 도로명부터', () => {
    expect(addrOrder('망원로 23')).toEqual(['road', 'parcel'])
    expect(addrOrder('월드컵로13길 12-3')).toEqual(['road', 'parcel'])
    expect(addrOrder('망원동 395-1')).toEqual(['parcel', 'road'])
  })

  it("요청 주소 — 서울을 앞에 붙이고(이미 있으면 그대로) 주소 검색 · 경위도 · callback", () => {
    const u = new URL(addrUrl('KEY', ' 망원로 23 ', 'road', 'cb1'))
    expect(u.origin + u.pathname).toBe('https://api.vworld.kr/req/search')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ request: 'search', version: '2.0', crs: 'EPSG:4326', query: '서울 망원로 23', type: 'address', category: 'road', format: 'json', key: 'KEY', callback: 'cb1' })
    expect(new URL(addrUrl('K', '서울 마포구 망원로 23', 'parcel', 'c')).searchParams.get('query')).toBe('서울 마포구 망원로 23')
  })
})

describe('키', () => {
  it('앞뒤 빈칸을 뗀다 — 빈 값은 없는 것으로', () => {
    expect(cleanKey(' 0A1B2C3D-0000-1111-2222-333344445555')).toBe('0A1B2C3D-0000-1111-2222-333344445555')
    expect(cleanKey('KEY\n')).toBe('KEY')
    expect([cleanKey(''), cleanKey('  '), cleanKey(undefined), cleanKey(null)]).toEqual([undefined, undefined, undefined, undefined])
  })
})

describe('응답 읽기', () => {
  const ok = (items: unknown[]) => ({ response: { status: 'OK', result: { items } } })
  it('서울 칸에 이어지는 주소만 — 그 좌표가 든 칸으로', () => {
    const r = parseAddr(ok([
      item('서울특별시 마포구 망원로 23', '서울특별시 마포구 망원동 395-1', 126.9019, 37.5556, '어느빌딩'),
      item('경기도 고양시 덕양구 망원로 23', '', 126.83, 37.63), // 서울 밖
      item('서울특별시 마포구 망원로 23', '', 126.9019, 37.5556), // 같은 주소
      item('서울특별시 어딘가', '', 0, 0), // 칸 밖 좌표
    ]), look)
    expect(r.status).toBe('ok')
    expect(r.hits).toEqual([{ label: '마포구 망원로 23', sub: '마포구 망원동 395-1 · 어느빌딩', cell: idx.get(latLngToCell(37.5556, 126.9019, 9)) }])
    // 지번으로 찾으면 도로명이 비어 온다
    expect(parseAddr(ok([item('', '서울특별시 마포구 망원동 395-1', 126.9019, 37.5556)]), look).hits[0]).toMatchObject({ label: '마포구 망원동 395-1', sub: '' })
  })

  it('없음 · 오류(키에 검색 API가 없을 때 등)', () => {
    expect(parseAddr({ response: { status: 'NOT_FOUND' } }, look)).toEqual({ status: 'none', hits: [] })
    expect(parseAddr(ok([item('부산광역시 해운대구 어디로 1', '', 129.16, 35.16)]), look).status).toBe('none')
    expect(parseAddr({ response: { status: 'ERROR', error: { code: 'INVALID_KEY' } } }, look).status).toBe('error')
    expect(parseAddr(null, look).status).toBe('error')
  })
})
