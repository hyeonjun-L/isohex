import type { CandData, CandType } from '../core/candidates'
import { loadJSON } from '../core/data'
import type { UnType } from '../core/unm'

// 무인 유형의 칸 자료 — cand/index.json(90KB, 무인 유형을 처음 고를 때 받는다)에서 그 유형의 같은 업종 · 명단의 무인 (core/unm.ts)

export interface UnCells {
  t: CandType
  /** 같은 업종 [칸, 수]… · 명단의 무인 [칸, 수]… */
  cnt: number[]
  un: number[]
  /** 같은 업종을 센 상가정보 분기 ('2025Q4') · 명단 ('서울시 무인점포 현황 2025-12-31') */
  poi: string
  list: string
}

export function loadUnCells(ver: string, u: UnType): Promise<UnCells> {
  return loadJSON<CandData>(ver, 'cand/index.json').then((d) => {
    const t = d.types.find((x) => x.t === u.t)
    if (!t) throw new Error(`후보 자료에 '${u.t}' 유형이 없다`)
    return { t, cnt: d.cnt[u.t] ?? [], un: d.un[u.t] ?? [], poi: d.meta.poi, list: d.meta.list }
  })
}
