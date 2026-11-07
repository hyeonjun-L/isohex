import { useEffect, useState } from 'react'
import { type BaseData, loadJSON } from '../core/data'
import type { BeInd, BeMeta } from '../core/check'
import type { RebRent } from '../core/rent'

// 손익 점검에 드는 자료 — 처음 열 때 받는다(업종 표 · 상권/행정동 이름 · 칸 → 상권·행정동 · 부동산원), 업종 행은 견줄 업종마다.
// 받은 파일은 core/data.ts loadJSON이 기억해 두어 다시 열어도 다시 받지 않는다

export interface CheckBase {
  meta: BeMeta
  inds: BeInd[]
  /** 상권 — 이름 · 구분(골목상권 · 발달상권 · 전통시장 · 관광특구) */
  sang: { code: number[]; nm: string[]; se: string[] }
  dong: { code: string[]; nm: string[] }
  /** 칸 → 상권 · 행정동 번호 (없으면 −1) */
  c2s: number[]
  c2d: number[]
  /** 부동산원 조사 상권 72곳과 칸 → 그 번호 (−1 = 조사 상권 밖) */
  reb: { rents: RebRent[]; cell: number[] }
}

/** 업종 하나의 상권(S) · 행정동(D) 행 — 지역 번호 → [지역, 월매출(천 원), 점포 수, 하루 결제×10, 객단가(백 원)] */
export interface CheckRows {
  code: string
  S: Map<number, number[]>
  D: Map<number, number[]>
}

export function useCheckBase(data: BaseData, on = true): { base: CheckBase | null; err: string | null } {
  const [base, setBase] = useState<CheckBase | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const ver = data.ver
  useEffect(() => {
    if (!on || base) return
    let live = true
    Promise.all([
      loadJSON<{ meta: BeMeta; ind: BeInd[] }>(ver, 'be/index.json'),
      loadJSON<{ sang: CheckBase['sang']; dong: CheckBase['dong'] }>(ver, 'be/places.json'),
      loadJSON<{ c2s: number[]; c2d: number[] }>(ver, 'be/cells.json'),
      loadJSON<CheckBase['reb']>(ver, 'reb/index.json'),
    ])
      .then(([be, pl, cl, reb]) => live && setBase({ meta: be.meta, inds: be.ind, sang: pl.sang, dong: pl.dong, c2s: cl.c2s, c2d: cl.c2d, reb }))
      .catch((e: unknown) => live && setErr(String(e)))
    return () => { live = false }
  }, [ver, on, base])
  return { base, err }
}

export function useCheckRows(ver: string, code: string | null): { rows: CheckRows | null; err: string | null } {
  const [rows, setRows] = useState<CheckRows | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!code) return
    let live = true
    setErr(null)
    loadJSON<{ S: number[][]; D: number[][] }>(ver, `be/ind/${code}.json`)
      .then((r) => live && setRows({ code, S: new Map(r.S.map((x) => [x[0], x])), D: new Map(r.D.map((x) => [x[0], x])) }))
      .catch((e: unknown) => live && setErr(String(e)))
    return () => { live = false }
  }, [ver, code])
  return { rows: rows && rows.code === code ? rows : null, err }
}

/** 손익 업종 표만 (be/index.json, 33KB) — 업종 고르기의 '손익' 표시와 업종 견주기에서. on이 처음 참일 때 받는다 */
export function useBe(ver: string, on: boolean): { meta: BeMeta; ind: BeInd[] } | null {
  const [be, setBe] = useState<{ meta: BeMeta; ind: BeInd[] } | null>(null)
  useEffect(() => {
    if (!on || be || !ver) return
    let live = true
    loadJSON<{ meta: BeMeta; ind: BeInd[] }>(ver, 'be/index.json')
      .then((d) => live && setBe(d))
      .catch(() => {})
    return () => { live = false }
  }, [on, be, ver])
  return be
}
