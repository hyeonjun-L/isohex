/// <reference types="node" />
// 이동 시간 일꾼 — 일꾼이 하는 일(service.ts)과 화면 쪽(client.ts)을 진짜 일꾼 없이 이어 본다.
// 진짜 일꾼(브라우저 Web Worker)은 브라우저 시험(e2e '이동 시간 일꾼')이 본다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TravelClient, type WorkerLike } from '../src/core/travel/client'
import { buildGraphs, type MvData } from '../src/core/travel/graph'
import { TravelService, type TravelReq, type TravelRes } from '../src/core/travel/service'
import { travelTimes } from '../src/core/travel/times'

const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const mv = JSON.parse(readFileSync(new URL(`${ver}/graph/mv.json`, ROOT), 'utf8')) as MvData
const G = buildGraphs(mv)

function same(a: ArrayLike<number>, b: ArrayLike<number>) {
  expect(a.length).toBe(b.length)
  let d = 0
  for (let i = 0; i < a.length; i++) if (!(a[i] === b[i])) d++
  expect(d).toBe(0)
}

/** 같은 스레드에서 도는 가짜 일꾼 — 받은 요청을 TravelService로 처리해 다음 차례에 답한다 */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<TravelRes>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  sent: TravelReq[] = []
  closed = false
  private readonly svc = new TravelService(async () => mv)
  postMessage(m: TravelReq) {
    this.sent.push(m)
    void this.svc.handle(m).then((r) => setTimeout(() => this.onmessage?.({ data: r } as MessageEvent<TravelRes>)))
  }
  terminate() {
    this.closed = true
  }
  count(type: TravelReq['type']) {
    return this.sent.filter((m) => m.type === type).length
  }
}

describe('이동 시간 일꾼이 하는 일', () => {
  it('준비 · 시간 — 준비가 끝나기 전에 온 시간 요청은 기다린다', async () => {
    const svc = new TravelService(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return mv
    })
    const init = svc.handle({ id: 1, type: 'init', url: 'graph/mv.json' })
    const t = svc.handle({ id: 2, type: 'times', mode: 'car', origin: 6570, period: 'pm' })
    expect(await init).toEqual({ id: 1, ok: true, type: 'ready', cells: mv.meta.cells })
    const r = await t
    if (!(r.ok && r.type === 'times')) throw new Error('시간 답이 아니다')
    same(r.times, travelTimes(G, 'car', 6570, 'pm'))
  })

  it('잘못된 요청은 오류로 답한다', async () => {
    const svc = new TravelService()
    expect(await svc.handle({ id: 1, type: 'times', mode: 'car', origin: 1, period: 'day' })).toMatchObject({ id: 1, ok: false, error: expect.stringContaining('init') })
    await svc.handle({ id: 2, type: 'init', mv })
    expect(await svc.handle({ id: 3, type: 'times', mode: 'walk', origin: -1, period: 'day' })).toMatchObject({ id: 3, ok: false, error: expect.stringContaining('없는 칸') })
    const bad = new TravelService(async () => {
      throw new Error('graph/mv.json — 404')
    })
    expect(await bad.handle({ id: 4, type: 'init', url: 'x' })).toMatchObject({ ok: false, error: 'graph/mv.json — 404' })
    expect(await bad.handle({ id: 5, type: 'times', mode: 'car', origin: 1, period: 'day' })).toMatchObject({ ok: false, error: 'graph/mv.json — 404' })
  })
})

describe('화면 쪽 (TravelClient)', () => {
  it('같은 값 · 같은 요청은 한 번만 · 도보는 시간대와 상관없다', async () => {
    const w = new FakeWorker(), c = new TravelClient('graph/mv.json', w)
    expect(await c.ready).toBe(mv.meta.cells)
    const [a, b] = await Promise.all([c.times('pt', 188, 'am'), c.times('pt', 188, 'am')])
    expect(a).toBe(b)
    same(a, travelTimes(G, 'pt', 188, 'am'))
    await c.times('walk', 188, 'am')
    await c.times('walk', 188, 'pm')
    expect(w.count('times')).toBe(2)
  })

  it('최근 8개만 기억한다', async () => {
    const w = new FakeWorker(), c = new TravelClient('graph/mv.json', w)
    for (let o = 0; o < 9; o++) await c.times('walk', o)
    expect(w.count('times')).toBe(9)
    await c.times('walk', 8) // 남아 있다
    expect(w.count('times')).toBe(9)
    await c.times('walk', 0) // 가장 오래된 것은 지웠다
    expect(w.count('times')).toBe(10)
  })

  it('오류는 거절로 — 실패한 요청은 기억하지 않아 다시 물을 수 있다 · 닫으면 기다리던 것도 거절', async () => {
    const w = new FakeWorker(), c = new TravelClient('graph/mv.json', w)
    await expect(c.times('car', 99999)).rejects.toThrow('없는 칸')
    await expect(c.times('car', 99999)).rejects.toThrow('없는 칸')
    expect(w.count('times')).toBe(2)
    const p = c.times('car', 6570)
    c.terminate()
    await expect(p).rejects.toThrow('닫았다')
    expect(w.closed).toBe(true)
  })
})
