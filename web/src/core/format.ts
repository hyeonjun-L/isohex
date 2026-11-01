// 숫자를 글자로 — 예전 뷰어(viewer/template.html)의 함수를 뜻 그대로 옮겼다 (마스터플랜 W7.7 P3).
// tests/format.test.ts가 옛 함수를 그 파일에서 꺼내 돌려 같은 글자를 내는지 견준다.
// 빼기 표시는 '−'(U+2212)를 쓴다 — 단, man()은 옛 뷰어처럼 ASCII '-'가 나온다(comma가 붙인다).
// toFixed·Math.round는 .5를 올린다 — 파이썬 round(짝수 쪽)와 다르니 기준값을 파이썬으로 만들 때 주의

const MINUS = '−'

/** 비율 → '+12%'·'−3.4%' (10% 미만은 소수 한 자리) */
export function fmtPct(v: number): string {
  const s = v * 100
  const r = Math.abs(s) < 9.95 ? s.toFixed(1) : s.toFixed(0)
  return (s >= 0 ? '+' : MINUS) + r.replace('-', '') + '%'
}

/** 로그 배수 → '×1.23' (±0.5% 안이면 '×1.00') */
export function fmtX(logv: number): string {
  const x = Math.exp(logv)
  return '×' + (x < 0.995 || x >= 1.005 ? x.toFixed(2) : '1.00')
}

/** 1234567 → '1,234,567' (소수는 셋째 자리까지) */
export function comma(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 받침에 따라 조사 고르기 — josa('카페', '이', '가') → '카페가' */
export function josa(w: string, a: string, b: string): string {
  const c = w.charCodeAt(w.length - 1)
  return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b)
}

/** 소수 둘째 자리, 빼기는 '−' */
export function f2(v: number): string {
  return (v < 0 ? MINUS : '') + Math.abs(v).toFixed(2)
}

/** 탄력성 b → '임대료가 10% 높을 때 매출이 몇 % 다른가'(정수 %) */
export function pc10(b: number): number {
  return Math.round((Math.pow(1.1, b) - 1) * 100)
}

/** 탄력성 b → '+6.0%'·'−12%'·'거의 영향 없음' (|b| < 0.05) */
export function drvText(b: number): string {
  const mag = Math.abs(b)
  if (mag < 0.05) return '거의 영향 없음'
  const dir = b > 0 ? '+' : MINUS
  const v = Math.abs(Math.pow(1.1, b) - 1) * 100
  return dir + v.toFixed(v < 9.95 ? 1 : 0) + '%'
}

/** 만 원 단위 → '1,235만' */
export function man(x: number): string {
  return comma(Math.round(x)) + '만'
}

/** 만 원 단위 차이 → '+134만'·'−2만'·'0만' */
export function sman(x: number): string {
  const r = Math.round(x)
  return (r < 0 ? MINUS : r > 0 ? '+' : '') + comma(Math.abs(r)) + '만'
}

/** 비율 → '12%' (d = 소수 자리, 기본 0) */
export function pct(x: number, d?: number): string {
  return (x < 0 ? MINUS : '') + Math.abs(x * 100).toFixed(d ?? 0) + '%'
}

/** 비율 → '1% 미만'·'37%' */
export function pctTxt(v: number): string {
  return v < 0.005 ? '1% 미만' : Math.round(v * 100) + '%'
}

/** 비율 → 10% 아래는 소수 한 자리('3.4%'), 위는 정수('37%') */
export function pctU(v: number): string {
  return v < 0.1 ? (v * 100).toFixed(1) + '%' : Math.round(v * 100) + '%'
}

/** 위쪽 몫 → '상위 7%'·'하위 30%' (1% 아래로는 쓰지 않는다) */
export function rankText(up: number): string {
  const p = Math.round(up * 100)
  return p <= 50 ? '상위 ' + Math.max(1, p) + '%' : '하위 ' + Math.max(1, 100 - p) + '%'
}

/** 초 → '23분' (올림, 최소 1분) · 닿지 않으면 '—' */
export function minutes(t: number): string {
  return Number.isFinite(t) ? Math.max(1, Math.ceil(t / 60 - 1e-9)) + '분' : '—'
}
