// 다익스트라 — 한 마디에서 다른 모든 마디까지 가장 짧은 시간 (예전 뷰어 cDijkstra와 같은 뜻).
// 이진 힙(작은 값이 맨 위)에 같은 마디가 여러 번 들어갈 수 있고, 꺼낼 때 이미 더 짧게 정해진 것은 건너뛴다.
// 꺼낸 값이 limit를 넘으면 멈춘다 — 그때까지 정해진(done) 마디만 '닿음'. 변 무게에는 f를 곱한다(자동차 시간대 배율)
import type { Csr } from './graph'

export interface Reach {
  /** 시작 마디에서 걸리는 시간(초). done이 아닌 마디의 값은 쓰지 않는다 */
  dist: Float64Array
  /** 1 = limit 안에서 시간이 정해진 마디 */
  done: Uint8Array
}

/** 작은 값이 맨 위로 오는 이진 힙 (값 = 시간, 짝 = 마디) */
class MinHeap {
  readonly key: Float64Array
  readonly val: Int32Array
  size = 0
  constructor(cap: number) {
    this.key = new Float64Array(cap)
    this.val = new Int32Array(cap)
  }
  push(k: number, v: number): void {
    const { key, val } = this
    let q = this.size++
    while (q > 0) {
      const p = (q - 1) >> 1
      if (key[p] > k) {
        key[q] = key[p]
        val[q] = val[p]
        q = p
      } else break
    }
    key[q] = k
    val[q] = v
  }
  /** 맨 위를 빼고 그 마디를 돌려준다 (값은 먼저 key[0]으로 본다) */
  pop(): number {
    const { key, val } = this
    const top = val[0]
    const n = --this.size
    if (n > 0) {
      const lk = key[n], lv = val[n]
      let p = 0
      for (;;) {
        let c = 2 * p + 1
        if (c >= n) break
        if (c + 1 < n && key[c + 1] < key[c]) c++
        if (key[c] < lk) {
          key[p] = key[c]
          val[p] = val[c]
          p = c
        } else break
      }
      key[p] = lk
      val[p] = lv
    }
    return top
  }
}

/** g에서 src부터 — d0 = 시작 시간(초), limit = 이 시간을 넘으면 그만, f = 변 무게 배율 */
export function dijkstra(g: Csr, src: number, d0: number, limit: number, f = 1): Reach {
  const { n, ptr, idx, w } = g
  const dist = new Float64Array(n).fill(Infinity)
  const done = new Uint8Array(n)
  // 마디는 한 번만 정해지고 그때 나가는 변을 한 번씩 본다 — 힙에 넣는 횟수는 변 수 + 1을 넘지 않는다
  const heap = new MinHeap(idx.length + 2)
  dist[src] = d0
  heap.push(d0, src)
  while (heap.size > 0) {
    const d = heap.key[0]
    const u = heap.pop()
    if (done[u] || d > dist[u]) continue // 더 짧은 값으로 이미 정해졌거나, 낡은 값
    if (d > limit) break
    done[u] = 1
    for (let e = ptr[u]; e < ptr[u + 1]; e++) {
      const v = idx[e], nd = d + w[e] * f
      if (nd < dist[v]) {
        dist[v] = nd
        heap.push(nd, v)
      }
    }
  }
  return { dist, done }
}
