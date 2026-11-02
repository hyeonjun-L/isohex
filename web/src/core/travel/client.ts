// 화면 쪽 — 이동 시간 일꾼(worker.ts)에게 맡기고 약속(Promise)으로 받는다.
// 같은 (수단, 기준 칸, 시간대)는 다시 계산하지 않는다(최근 8개). 받은 시간 배열은 여럿이 나눠 쓰므로 고치지 않는다
import type { Period } from './graph'
import type { TravelReq, TravelRes } from './service'
import type { Mode } from './times'

/** 일꾼과 같은 꼴 — 시험에서는 가짜를 넣는다 */
export interface WorkerLike {
  postMessage(m: TravelReq): void
  onmessage: ((e: MessageEvent<TravelRes>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
  terminate(): void
}

type Send = TravelReq extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never

const KEEP = 8

export class TravelClient {
  private readonly w: WorkerLike
  private seq = 0
  private closed = false
  private readonly wait = new Map<number, { ok: (r: TravelRes) => void; no: (e: Error) => void }>()
  private readonly cache = new Map<string, Promise<Float64Array>>()
  /** 그래프 준비가 끝나면 칸 수 */
  readonly ready: Promise<number>

  /** url — graph/mv.json의 절대 주소 (일꾼은 자기 파일 위치를 기준으로 상대 주소를 푼다) */
  constructor(url: string, worker?: WorkerLike) {
    this.w = worker ?? (new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike)
    this.w.onmessage = (e) => {
      const p = this.wait.get(e.data.id)
      if (!p) return
      this.wait.delete(e.data.id)
      if (e.data.ok) p.ok(e.data)
      else p.no(new Error(e.data.error))
    }
    this.w.onerror = (e) => this.fail(new Error(e.message || '이동 시간 일꾼이 멈췄다'))
    this.ready = this.send({ type: 'init', url }).then((r) => (r.ok && r.type === 'ready' ? r.cells : 0))
    this.ready.catch(() => {}) // 아무도 기다리지 않아도 '처리 안 된 거절'로 남지 않게 — 기다리는 쪽은 그대로 오류를 받는다
  }

  private send(m: Send): Promise<TravelRes> {
    if (this.closed) return Promise.reject(new Error('이동 시간 일꾼을 닫았다'))
    const id = ++this.seq
    return new Promise((ok, no) => {
      this.wait.set(id, { ok, no })
      this.w.postMessage({ ...m, id } as TravelReq)
    })
  }

  private fail(e: Error) {
    for (const p of this.wait.values()) p.no(e)
    this.wait.clear()
  }

  /** 기준 칸 origin에서 칸마다 걸리는 시간(초) — 도보는 시간대와 상관없다 */
  times(mode: Mode, origin: number, period: Period = 'day'): Promise<Float64Array> {
    const p0 = mode === 'walk' ? 'day' : period
    const key = `${mode}|${origin}|${p0}`
    let p = this.cache.get(key)
    if (p) {
      this.cache.delete(key) // 최근에 쓴 것을 뒤로
      this.cache.set(key, p)
      return p
    }
    p = this.ready
      .then(() => this.send({ type: 'times', mode, origin, period: p0 }))
      .then((r) => {
        if (!(r.ok && r.type === 'times')) throw new Error('이동 시간 답이 아니다')
        return r.times
      })
    this.cache.set(key, p)
    p.catch(() => this.cache.delete(key))
    while (this.cache.size > KEEP) this.cache.delete(this.cache.keys().next().value!)
    return p
  }

  terminate() {
    this.closed = true
    this.w.terminate()
    this.fail(new Error('이동 시간 일꾼을 닫았다'))
  }
}
