import { useEffect, useMemo, useState } from 'react'
import { type AddrHit, addrOrder, addrUrl, cleanKey, looksLikeAddress, parseAddr } from '../core/address'

// 주소 찾기 — 브이월드 검색 API를 callback(JSONP)으로 부른다 (core/address.ts). 글자를 멈춘 뒤 0.4초에 한 번, 주소처럼 생긴 글만 보낸다

const KEY = cleanKey(import.meta.env.VITE_VWORLD_KEY as string | undefined)
/** 주소 찾기를 쓸 수 있나 — 브이월드 키가 있는 빌드에서만 */
export const ADDR_ON = !!KEY

let seq = 0
function jsonp(url: (cb: string) => string, signal: { dead: boolean }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cb = `__jeomjiAddr${++seq}`
    const w = window as unknown as Record<string, unknown>
    const s = document.createElement('script')
    const done = () => {
      clearTimeout(t)
      delete w[cb]
      s.remove()
    }
    const t = setTimeout(() => { done(); reject(new Error('timeout')) }, 7000)
    w[cb] = (j: unknown) => { done(); if (!signal.dead) resolve(j) }
    s.onerror = () => { done(); reject(new Error('load')) }
    s.src = url(cb)
    document.head.appendChild(s)
  })
}

export type AddrState = 'off' | 'idle' | 'busy' | 'ok' | 'none' | 'error'

export function useAddress(q: string, h3: readonly string[]): { hits: AddrHit[]; state: AddrState } {
  const look = useMemo(() => {
    const m = new Map(h3.map((h, i) => [h, i]))
    return (h: string) => m.get(h) ?? -1
  }, [h3])
  const [out, setOut] = useState<{ q: string; hits: AddrHit[]; state: AddrState }>({ q: '', hits: [], state: 'idle' })
  const s = q.trim()
  const on = !!KEY && looksLikeAddress(s)
  useEffect(() => {
    if (!on || !KEY) return
    const signal = { dead: false }
    const key = KEY
    const t = setTimeout(() => {
      setOut({ q: s, hits: [], state: 'busy' })
      const [a, b] = addrOrder(s)
      const ask = (c: typeof a) => jsonp((cb) => addrUrl(key, s, c, cb), signal).then((j) => parseAddr(j, look))
      ask(a)
        .then((r) => (r.status === 'none' ? ask(b) : r))
        .then((r) => { if (!signal.dead) setOut({ q: s, hits: r.hits, state: r.status }) })
        .catch(() => { if (!signal.dead) setOut({ q: s, hits: [], state: 'error' }) })
    }, 400)
    return () => { signal.dead = true; clearTimeout(t) }
  }, [on, s, look])
  if (!KEY) return { hits: [], state: 'off' }
  if (!on) return { hits: [], state: 'idle' }
  return out.q === s ? { hits: out.hits, state: out.state } : { hits: [], state: 'busy' }
}

/** 주소 줄 아래 한마디 — 찾는 중 · 없음 · 못 씀 */
export function addrNote(state: AddrState): string | null {
  if (state === 'busy') return '주소를 찾는 중이에요…'
  if (state === 'none') return '서울에서 이 주소를 찾지 못했어요 — 도로명(망원로 23)이나 지번(망원동 395-1)으로 넣어 보세요'
  if (state === 'error') return '지금은 주소 찾기를 쓸 수 없어요 — 동이나 역 이름으로 찾아 주세요'
  return null
}
