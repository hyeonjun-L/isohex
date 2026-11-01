// base64 → 정수 배열 (예전 뷰어 b64u8·b64u16·b64i16과 같은 값).
// 이동 그래프(graph/mv.json)의 정수 배열은 16비트씩, 작은 바이트를 먼저(리틀엔디언) 적은 뒤 base64로 쌌다.
// atob만 쓴다 — 브라우저와 Node(시험) 모두에 있다

/** base64 → 바이트 (0~255) */
export function b64u8(s: string): Uint8Array {
  const b = atob(s)
  const a = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i)
  return a
}

/** base64 → 16비트 양수 (0~65535). 65535는 '변 없음'·'노선 시작' 표시로 쓴다 */
export function b64u16(s: string): Uint16Array {
  const b = b64u8(s)
  const a = new Uint16Array(b.length >> 1)
  for (let i = 0; i < a.length; i++) a[i] = b[2 * i] | (b[2 * i + 1] << 8)
  return a
}

/** base64 → 16비트 정수 (−32768~32767). 이웃 번호의 −1(이웃 없음)에 쓴다 */
export function b64i16(s: string): Int16Array {
  // 같은 16비트를 부호 있는 수로 읽는다 — 32768 이상은 65536을 뺀 값이 된다
  return new Int16Array(b64u16(s).buffer)
}
