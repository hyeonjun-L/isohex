// 방문 통계 — 실제 사이트에서만, 페이지를 열 때 한 번, 손익 점검 숫자가 든 주소로 열면 싣지 않는다
import { describe, expect, it } from 'vitest'
import { statsSrc } from '../src/stats'

describe('방문 통계 비컨', () => {
  it('실제 사이트에서만, 열 때 한 번(spa=false)', () => {
    const src = statsSrc('isohex.leehyeonjun.com', '')
    expect(src).toMatch(/^https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\?token=[0-9a-f]{32}&spa=false$/)
    expect(statsSrc('isohex.leehyeonjun.com', '?kind=I21201&cell=8930e1d80abffff')).toBe(src)
    for (const host of ['localhost', '127.0.0.1', 'jeomji.example.workers.dev']) expect(statsSrc(host, '')).toBeNull()
  })

  it('손익 점검에 넣은 숫자가 주소에 있으면 싣지 않는다', () => {
    for (const q of ['?chk=1&in=33_200', '?inx=_300', '?kind=I21201&in=', '?in=40&inx=500_1'])
      expect(statsSrc('isohex.leehyeonjun.com', q)).toBeNull()
  })
})
