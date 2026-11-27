// 방문 통계 — Cloudflare Web Analytics (쿠키를 쓰지 않는다, 2026-11-27)
// · 실제 사이트에서만 싣는다 — 내 컴퓨터 · 미리보기 · 시험에서 연 페이지는 세지 않는다
// · 페이지를 열 때 한 번만 센다(spa=false) — 앱은 쓰는 동안 주소를 계속 바꾸는데, 그때마다 세면 본 페이지 수가 부풀고 바뀐 주소가 나간다
// · 손익 점검에 넣은 숫자(in · inx)가 든 주소로 열면 싣지 않는다 — 넣은 숫자는 서버로 보내지 않는다(안내 페이지 '문의')
// 토큰은 비밀 열쇠가 아니다 — 방문자가 받는 페이지에 그대로 실리는 사이트 표시다
const SITE = 'isohex.leehyeonjun.com'
const TOKEN = 'bb068a5254a5418fb25df69e0d131128'

/** 실을 비컨 주소 — 싣지 않으면 null */
export function statsSrc(host: string, search: string): string | null {
  if (host !== SITE) return null
  const q = new URLSearchParams(search)
  if (q.has('in') || q.has('inx')) return null
  return `https://static.cloudflareinsights.com/beacon.min.js?token=${TOKEN}&spa=false`
}

export function loadStats(): void {
  const src = statsSrc(location.hostname, location.search)
  if (!src) return
  const s = document.createElement('script')
  s.type = 'module' // Cloudflare 안내대로 — 아주 오래된 브라우저(IE)에서는 싣지 않는다
  s.src = src
  document.head.append(s)
}
