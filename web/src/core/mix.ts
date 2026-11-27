// 이 동네 손님은 — 같은 업종 가게들의 2025년 매출을 요일 · 시간대 · 성별 · 연령대로 나눈 몫과 가게 드나듦(개업 · 폐업 · 프랜차이즈)
// (2026-11-20 전체 검토 3번). 영업시간(언제 팔리나)과 손님(누가 사나)을 정할 때 바로 보는 숫자라 자리 카드에 둔다.
// 자료: be/mix/<서울시 업종>.json (p28_customer_mix.py) — 상권(S) · 행정동(D) 행, 지역 번호는 be/places.json과 같다.
// 어느 지역 값을 쓰나는 이 동네 가게당 월매출(core/card.ts recAt)과 같다 — 칸이 상권 안이면 상권, 아니면 행정동
import { comma, josa } from './format'

/** be/mix/<코드>.json */
export interface MixFile {
  k: string
  year: number
  /** 서울(행정동 전부) — 주말%, 시간대% 여섯, 여성%, 연령대% 여섯, 100곳당 개업, 100곳당 폐업, 프랜차이즈% */
  seoul: number[] | null
  /** [지역, 주말%, 시간대% 여섯, 여성%, 연령대% 여섯, 개업, 폐업, 평균 가게 ×10, 프랜차이즈%(없으면 −1)] */
  S: number[][]
  D: number[][]
}

export const TIME_NM = ['새벽(0~6시)', '아침(6~11시)', '점심(11~14시)', '오후(14~17시)', '저녁(17~21시)', '밤(21~24시)'] as const
/** 막대 아래 짧은 이름 */
export const TIME_SHORT = ['새벽', '아침', '점심', '오후', '저녁', '밤'] as const
export const AGE_NM = ['10대', '20대', '30대', '40대', '50대', '60대 이상'] as const

export interface MixRow {
  weekend: number
  time: number[]
  female: number
  age: number[]
  open: number
  close: number
  /** 2025년 평균 가게 수 */
  n: number
  /** 프랜차이즈 % (모르면 null) */
  fr: number | null
}

export interface MixSeoul {
  weekend: number
  time: number[]
  female: number
  age: number[]
  /** 가게 100곳당 한 해 개업 · 폐업 */
  open100: number
  close100: number
  fr: number | null
}

export function mixRow(r: readonly number[]): MixRow {
  return { weekend: r[1], time: r.slice(2, 8), female: r[8], age: r.slice(9, 15), open: r[15], close: r[16], n: r[17] / 10, fr: r[18] >= 0 ? r[18] : null }
}

export function mixSeoul(s: readonly number[]): MixSeoul {
  return { weekend: s[0], time: s.slice(1, 7), female: s[7], age: s.slice(8, 14), open100: s[14], close100: s[15], fr: s[16] >= 0 ? s[16] : null }
}

export interface MixLine {
  key: 'weekend' | 'time' | 'sex' | 'age' | 'churn' | 'fr'
  label: string
  value: string
  /** 서울 같은 업종과 견준 말 */
  note: string
}

export interface MixView {
  /** 접은 줄에 보이는 요약 — '주말 43% · 오후(14~17시) · 20 · 30대 69%' */
  sum: string
  /** '상권 망리단길 · 2025년' */
  where: string
  lines: MixLine[]
  /** 시간대 막대 — 이 동네 · 서울 (%) */
  time: { here: number[]; seoul: number[] | null }
  caveat: string
}

/** 서울보다 많나 · 적나 — 5%p 안쪽은 비슷 */
function vs(here: number, seoul: number, more: string, less: string, same: string): string {
  const d = here - seoul
  return d >= 5 ? more : d <= -5 ? less : same
}

/** 가장 큰 둘의 번호 (몫 내림차순, 같으면 앞 번호) */
function top2(a: readonly number[]): [number, number] {
  const o = a.map((v, j) => [v, j] as const).sort((x, y) => y[0] - x[0] || x[1] - y[1])
  return [o[0][1], o[1][1]]
}

/**
 * 손님 구성 보기 — nm은 업종 이름(카드에 보이는 이름), snm은 견준 서울시 업종 이름('커피-음료'), level · where는 지역.
 * 서울 값이 없으면 견주는 말만 빠진다
 */
export function mixView(r: MixRow, s: MixSeoul | null, nm: string, level: '상권' | '행정동', where: string, year: number): MixView {
  const lines: MixLine[] = []
  const sn = `서울 ${nm}`
  // 주말
  lines.push({
    key: 'weekend',
    label: '주말 매출',
    value: `${r.weekend}%`,
    note: s ? vs(r.weekend, s.weekend, `${sn} ${s.weekend}%보다 주말에 더 팔려요`, `${sn} ${s.weekend}%보다 평일에 더 팔려요`, `${sn}도 ${s.weekend}%예요`) : '',
  })
  // 시간대 — 가장 많이 파는 때 둘, 서울보다 가장 많이 몰린 때
  const [t1, t2] = top2(r.time)
  let peak = -1
  if (s) for (let j = 0; j < r.time.length; j++) if (r.time[j] - s.time[j] >= 5 && (peak < 0 || r.time[j] - s.time[j] > r.time[peak] - s.time[peak])) peak = j
  lines.push({
    key: 'time',
    label: '많이 파는 때',
    value: `${TIME_SHORT[t1]} ${r.time[t1]}%`, // 값은 한 줄로 — 시간은 덧말 맨 앞에 (화면 다시 잡기 S06)
    note: `${TIME_NM[t1].slice(TIME_SHORT[t1].length + 1, -1)} · 다음은 ${TIME_NM[t2]} ${r.time[t2]}%` + (s && peak >= 0 ? ` · ${TIME_SHORT[peak]} 몫이 ${sn} ${s.time[peak]}%보다 커요` : ''),
  })
  // 성별
  lines.push({
    key: 'sex',
    label: '여성 손님',
    value: `${r.female}%`,
    note: s ? vs(r.female, s.female, `${sn} ${s.female}%보다 여성이 많아요`, `${sn} ${s.female}%보다 남성이 많아요`, `${sn}도 ${s.female}%예요`) : '',
  })
  // 나이 — 가장 많은 둘, 서울보다 가장 많이 몰린 나이
  const [a1, a2] = top2(r.age)
  let over = -1
  if (s) for (let j = 0; j < r.age.length; j++) if (r.age[j] - s.age[j] >= 5 && (over < 0 || r.age[j] - s.age[j] > r.age[over] - s.age[over])) over = j
  lines.push({
    key: 'age',
    label: '주 손님',
    value: `${AGE_NM[a1]} ${r.age[a1]}% · ${AGE_NM[a2]} ${r.age[a2]}%`,
    note: s ? (over >= 0 ? `${sn}보다 ${josa(AGE_NM[over], '이', '가')} 많아요 (${r.age[over]}% · 서울 ${s.age[over]}%)` : `나이 구성은 ${josa(sn, '과', '와')} 비슷해요`) : '',
  })
  // 가게 드나듦 — 가게 5곳 아래면 100곳당으로 바꾸지 않는다(한 곳만 열어도 20이 넘는다)
  const per = (x: number) => Math.round((x / r.n) * 100)
  lines.push({
    key: 'churn',
    label: `가게 드나듦 (${year}년)`,
    value: `새로 연 곳 ${comma(r.open)} · 닫은 곳 ${comma(r.close)}`,
    note: r.n >= 5
      ? `평균 가게 ${comma(Math.round(r.n))}곳, 100곳당 연 곳 ${per(r.open)} · 닫은 곳 ${per(r.close)}${s ? ` (${sn} ${Math.round(s.open100)} · ${Math.round(s.close100)})` : ''}`
      : `평균 가게 ${comma(Math.round(r.n))}곳이라 100곳당으로 바꾸지 않아요`,
  })
  if (r.fr != null)
    lines.push({
      key: 'fr',
      label: '프랜차이즈',
      value: `${r.fr}%`,
      note: s?.fr != null ? vs(r.fr, s.fr, `${sn} ${s.fr}%보다 많아요`, `${sn} ${s.fr}%보다 적어요`, `${sn}도 ${s.fr}%예요`) : '',
    })
  const young = a1 + 1 === a2 || a2 + 1 === a1 ? `${AGE_NM[Math.min(a1, a2)].replace('대', '')} · ${AGE_NM[Math.max(a1, a2)]} ${r.age[a1] + r.age[a2]}%` : `${AGE_NM[a1]} ${r.age[a1]}%`
  return {
    sum: `주말 ${r.weekend}% · ${TIME_NM[t1]} · ${young}`,
    where: `${level} ${where} · ${year}년`,
    lines,
    time: { here: r.time, seoul: s ? s.time : null },
    caveat: `서울시가 카드 결제로 추정한 매출을 나눈 몫이에요 — 성별 · 나이는 카드 주인 기준이고, 현금 · 법인카드 · 배달앱 결제는 빠졌을 수 있어요. 개업 · 폐업 · 프랜차이즈는 서울시 점포 집계예요.`
      + (r.n < 5 ? ` 가게 ${comma(Math.round(r.n))}곳의 값이라 한두 곳에 크게 흔들려요.` : ''),
  }
}
