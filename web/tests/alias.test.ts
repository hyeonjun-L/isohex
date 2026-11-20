/// <reference types="node" />
// 업종 별칭 — 일상 낱말로 업종 찾기 (2026-11-20, 전체 검토 1번: 낱말 114개 중 52개가 '맞는 업종이 없어요'였다)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aliasCodes, aliasExact, aliasInside, aliasPrefix, aliasWords, normQ } from '../src/core/alias'
import { type KindsData, findKinds, matchKinds } from '../src/core/kinds'
import { bestHit, searchAll } from '../src/core/search'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const kd = JSON.parse(readFileSync(new URL(`${ver}/kinds/index.json`, ROOT), 'utf8')) as KindsData
const nm = (q: string, n = 3) => findKinds(kd, q, n).map((k) => k.nm)

// 가게를 차리려는 사람이 칠 만한 낱말 — 검토 때 막혔던 것(커피 · 빵집 · 햄버거 · 국밥 · 고깃집 · 술집 · 피시방 · 옷가게…)을 포함한다
const WORDS = `
커피 카페 커피숍 디저트 빵집 베이커리 도넛 케이크 와플 샌드위치 토스트 샐러드 햄버거 버거 피자 치킨 통닭 분식 떡볶이 김밥 만두 라면 국밥 순대국 해장국 설렁탕 감자탕 삼계탕 찌개
부대찌개 백반 한식 한정식 식당 밥집 고깃집 삼겹살 갈비 소고기 한우 곱창 막창 닭갈비 찜닭 닭발 족발 보쌈 회 횟집 초밥 스시 일식 돈까스 돈가스 라멘 우동 덮밥 카레 중국집 중식 짜장면
마라탕 양꼬치 쌀국수 베트남 태국음식 파스타 스테이크 양식 레스토랑 브런치 타코 술집 호프 맥주 포차 이자카야 와인바 바 칵테일바 막걸리 전집 주점 뷔페 샤브샤브 국수 칼국수 냉면 해물찜
아구찜 조개구이 장어 아이스크림 빙수 요거트 탕후루 떡집 핫도그 붕어빵 도시락 죽 죽집 반찬가게 정육점 과일가게 야채가게 수산 생선가게 떡 방앗간
편의점 슈퍼 마트 옷가게 옷집 의류 여성복 남성복 아동복 신발가게 가방 악세사리 액세서리 화장품 약국 안경점 안경 꽃집 꽃가게 휴대폰 핸드폰 폰가게 휴대폰매장 문구점 문방구 서점 책방
장난감 완구 가구 가전 철물점 인테리어 조명 이불 커튼 펫샵 애견용품 반려동물 건강식품 홍삼 와인샵 담배 전자담배 금은방 귀금속 시계 중고 빈티지 다이소 생활용품 자전거 스포츠용품
골프용품 낚시 악기 컴퓨터 카메라 기념품 소품샵
미용실 헤어 헤어샵 이발소 바버샵 네일 네일샵 피부관리 피부관리실 왁싱 속눈썹 마사지 타이마사지 세탁소 빨래방 코인세탁 수선 옷수선 구두수선 열쇠 카센터 정비소 세차 세차장 사진관
스튜디오 인생네컷 부동산 공인중개사 세무사 변호사 법무사 여행사 인쇄 간판 복사 청소 인력사무소 렌터카 목욕탕 사우나 찜질방 예식장 웨딩홀 장례식장 동물병원 휴대폰수리 컴퓨터수리 에어컨
학원 보습학원 수학학원 영어학원 공부방 교습소 피아노학원 미술학원 태권도 태권도장 요가 필라테스 댄스학원 발레 코딩학원 컴퓨터학원 독서실 스터디카페 유학원 운전면허 어학원 과외
병원 의원 내과 소아과 치과 한의원 피부과 성형외과 정형외과 안과 이비인후과 산부인과 정신과 요양병원
노래방 코인노래방 PC방 피시방 피씨방 당구장 볼링장 헬스장 헬스 피트니스 PT 크로스핏 골프연습장 스크린골프 테니스 탁구장 수영장 키즈카페 보드게임카페 방탈출 만화카페 오락실 인형뽑기
복권 로또 클라이밍 모텔 호텔 게스트하우스 고시원 펜션`.split(/\s+/).filter(Boolean)

describe('업종 별칭', () => {
  it('사전 — 코드는 모두 업종 목록에 있고, 낱말은 빈칸 없는 소문자', () => {
    const codes = new Set(kd.kinds.map((k) => k.c))
    for (const c of aliasCodes()) expect(codes.has(c), c).toBe(true)
    const ws = aliasWords()
    expect(ws.length).toBeGreaterThan(900)
    for (const w of ws) expect(w, w).toBe(normQ(w))
    // 업종 이름과 똑같은 낱말은 사전에 두지 않는다 — 이름이 먼저 걸려 쓸모가 없고, 뜻이 갈리면 헷갈린다
    const names = new Set(kd.kinds.map((k) => normQ(k.nm)))
    expect(ws.filter((w) => names.has(w))).toEqual([])
  })

  it('일상 낱말 300개 가까이가 모두 업종에 닿는다', () => {
    expect(WORDS.length).toBeGreaterThan(280)
    const miss = WORDS.filter((w) => findKinds(kd, w).length === 0)
    expect(miss).toEqual([])
  })

  it('검토 때 막혔던 낱말 — 어디로 가나', () => {
    const want: [string, string][] = [
      ['커피', '카페'], ['빵집', '빵/도넛'], ['베이커리', '빵/도넛'], ['햄버거', '버거'], ['떡볶이', '김밥/만두/분식'], ['국밥', '국/탕/찌개류'],
      ['고깃집', '돼지고기 구이/찜'], ['삼겹살', '돼지고기 구이/찜'], ['술집', '요리 주점'], ['호프', '생맥주 전문'], ['헤어', '미용실'],
      ['피시방', 'PC방'], ['키즈카페', '기타 오락장'], ['옷가게', '기타 의류 소매업'], ['휴대폰', '핸드폰 소매업'], ['공인중개사', '부동산 중개/대리업'], ['떡집', '떡/한과'],
      // 뜻으로 짐작한 것과 원자료 분류가 달랐던 곳 — 가게 이름을 세어 보고 정했다
      ['돈까스', '경양식'], ['양꼬치', '중국집'], ['이발소', '미용실'], ['게스트하우스', '펜션'], ['복싱', '태권도/무술학원'], ['왁싱', '피부 관리실'], ['도시락', '백반/한정식'],
    ]
    for (const [q, k] of want) expect(nm(q, 1), q).toEqual([k])
    expect(nm('고깃집')).toEqual(['돼지고기 구이/찜', '소고기 구이/찜'])
    expect(nm('이자카야')).toEqual(['요리 주점', '일식 회/초밥'])
    expect(nm('술집')).toEqual(['요리 주점', '생맥주 전문', '일반 유흥 주점'])
  })

  it('차례 — 이름과 똑같음 → 별칭과 똑같음 → 이름 앞부분 · 들어 있음 → 치는 중인 별칭', () => {
    // 이름이 먼저 — 별칭이 있어도 '카페'는 카페, 알림(via)도 없다
    expect(matchKinds(kd, '카페')).toMatchObject({ kinds: [{ nm: '카페' }, { nm: '독서실/스터디 카페' }], via: null })
    expect(matchKinds(kd, '커피', 1)).toMatchObject({ kinds: [{ nm: '카페' }], via: '커피' })
    // 한 글자 — '회'는 횟집이 '문구/회화용품'보다 앞, '죽'은 백반이 '가죽/가방/신발 수선업'보다 앞
    expect(nm('회')).toEqual(['횟집', '일식 회/초밥', '문구/회화용품 소매업'])
    expect(nm('죽', 2)).toEqual(['백반/한정식', '가죽/가방/신발 수선업'])
    // 이름 앞부분이 걸리면 알림 없이
    expect(matchKinds(kd, '미용', 1)).toMatchObject({ kinds: [{ nm: '미용실' }], via: null })
    // 치는 중 — '삼겹' · '고깃'
    expect(matchKinds(kd, '삼겹', 1)).toMatchObject({ kinds: [{ nm: '돼지고기 구이/찜' }], via: '삼겹살' })
    expect(nm('고깃', 1)).toEqual(['돼지고기 구이/찜'])
    // 대소문자 · 빈칸
    expect(nm('pc방', 1)).toEqual(['PC방'])
    expect(nm(' P T ', 1)).toEqual(['헬스장'])
  })

  it('하나도 없으면 — 끝말을 떼고, 그래도 없으면 말 안에 든 이름 · 별칭', () => {
    expect(nm('치킨전문점')).toEqual(['치킨'])
    expect(nm('피자가게')).toEqual(['피자'])
    expect(nm('수제버거집')).toEqual(['버거'])
    expect(nm('동네카페')).toEqual(['카페'])
    expect(nm('참치김밥')).toEqual(['김밥/만두/분식'])
    expect(matchKinds(kd, '24시국밥')).toMatchObject({ kinds: [{ nm: '국/탕/찌개류' }], via: '국밥' })
    // 모르는 말은 그대로 '없어요' — 틀린 업종으로 데려가지 않는다
    for (const q of ['스타벅스', 'xyz', '없는말', '   ']) expect(findKinds(kd, q), q).toEqual([])
  })

  it('사전 함수', () => {
    expect(aliasExact('커피')).toEqual(['I21201'])
    expect(aliasExact('없는말')).toEqual([])
    expect(aliasPrefix('삼겹').map((h) => h.w)).toEqual(['삼겹살', '삼겹살집'])
    expect(aliasPrefix('')).toEqual([])
    expect(aliasInside('동네빵집')?.w).toBe('빵집')
    expect(aliasInside('빵집')).toBeNull()
  })

  it('첫 화면 찾기 — 별칭과 똑같으면 엔터는 그 업종', () => {
    const r = searchAll('커피', kd, null)
    expect(bestHit('커피', r)).toMatchObject({ kind: 'kind', k: { nm: '카페' } })
  })
})
