// 월세 수준 — 내가 넣은 월세를 ㎡당 값으로 바꿔 조사값과 견준다 (예전 뷰어 beRentBlock의 계산 부분, 마스터플랜 §5.12·§5.14).
// 공개판은 행정동 임대시세(서울신용보증재단 화면 값)를 싣지 않는다 (W7.8 ①) — 견줄 값은 한국부동산원 조사 상권(서울 72곳)뿐이고,
// 그 밖 자리는 '비교할 임대료가 없습니다'. 행정동 층 보정(floorAdjust·adjustedFloorRatio)은 계산만 옮겨 두었다(자료를 싣기로 하면 쓴다).
// 단위: 월세·보증금은 만 원, 면적은 ㎡, 견줄 값은 천 원/㎡·월(부동산원 단위). 보증금은 1%를 월세에 더한다.

import { josa } from './format'

export type FloorKey = '1' | '2' | '3' | '-1'

export interface Floor {
  key: FloorKey
  nm: string
  /** 1층 대비 효용비율 — 서울 중대형 상가 2025 (부동산원) */
  r: number
  /** 부동산원 조사 상권마다 따로 있는 효용비율 열 */
  rebKey?: string
}

export const FLOORS: Record<FloorKey, Floor> = {
  '1': { key: '1', nm: '1층', r: 1 },
  '2': { key: '2', nm: '2층', r: 0.446, rebKey: '중대형2층효용_2025' },
  '3': { key: '3', nm: '3층', r: 0.352 },
  '-1': { key: '-1', nm: '지하 1층', r: 0.275, rebKey: '중대형지하효용_2025' },
}

/** 부동산원 조사 상권 한 곳 — v['대표1층']은 천 원/㎡·월, 효용비율 열은 % (1층 = 100) */
export interface RebRent {
  n: string
  v: Record<string, number | null | undefined>
}

/** 보증금의 1%를 더한 월 부담(만 원) */
export function monthlyBurden(rent: number, deposit: number): number {
  return rent + deposit / 100
}

/** ㎡당 천 원/월 — 만 원 × 10 ÷ ㎡. 면적이 없으면 null */
export function perSqm(rent: number, deposit: number, area: number): number | null {
  return area > 0 ? (monthlyBurden(rent, deposit) * 10) / area : null
}

/** 부동산원 조사 상권 값을 그 층으로 — 그 상권의 층별 효용비율이 있으면 그것(own), 없으면 서울 중대형 평균 */
export function rebAtFloor(reb: RebRent, fl: Floor): { value: number | null; ratio: number; own: boolean } {
  const base = reb.v['대표1층']
  let ratio = fl.r
  let own = false
  const v = fl.rebKey ? reb.v[fl.rebKey] : null
  if (v != null) {
    ratio = v / 100
    own = true
  }
  return { value: base == null ? null : base * ratio, ratio, own }
}

export type RentWord = '싼 편' | '비슷' | '비싼 편'

/** 내 값 ÷ 견줄 값 — 0.8 미만 싼 편 · 1.25까지 비슷 · 넘으면 비싼 편 */
export function compareRent(my: number, base: number): { x: number; word: RentWord } {
  const x = my / base
  return { x, word: x < 0.8 ? '싼 편' : x <= 1.25 ? '비슷' : '비싼 편' }
}

/** 견줄 값 한 칸 — '56.0천 원 (1.23배)' */
export function rentCell(base: number, my: number): string {
  return `${base.toFixed(1)}천 원 (${(my / base).toFixed(2)}배)`
}

/** 부동산원 값 층 환산 설명 */
export function rebFloorNote(fl: Floor, ratio: number, own: boolean): string | null {
  if (fl.r >= 1) return null
  return `부동산원 값의 ${fl.nm}은 ${own ? '이 상권의' : '서울 중대형 상가'} 층별 효용비율 ${Math.round(ratio * 1000) / 10}(1층=100)로 환산했습니다.`
}

export const REB_NOTE = '부동산원 값: 상업용부동산 임대동향조사 표본, 임대면적(전용+공용) 기준이며 보증금은 조사 전환율로 월세에 더한 값입니다.'
export const NO_REB = '이 자리는 한국부동산원 조사 상권(서울 72곳) 밖이라 비교할 임대료가 없습니다.'
/** 면적을 넣기 전 안내 — 옛 뷰어의 '조사값와'를 바로잡았다 */
export const NEED_AREA = `면적을 넣으면 ${josa('부동산원 조사값', '과', '와')} 견줍니다.`

// ── 행정동 층 보정 (비공개 — 자료를 싣기로 정하면 쓴다)

/** 그 동의 '1층 외 ÷ 1층'(fr)을 동 가운데값으로 나눠 0.6~1.5로 자른다. 값이 없으면 1 */
export function floorAdjust(fr: number | null | undefined, median: number | null | undefined): number {
  if (fr == null || !median) return 1
  return Math.min(1.5, Math.max(0.6, fr / median))
}

/** 서울 효용비율에 동 보정을 곱한다 — 1층은 기준이라 그대로, 결과는 0.95를 넘지 않는다 */
export function adjustedFloorRatio(fl: Pick<Floor, 'r'>, adj: number): number {
  return adj === 1 || fl.r >= 1 ? fl.r : Math.min(0.95, fl.r * adj)
}
