// 이동 시간 일꾼(Web Worker)이 하는 일 — 그래프를 한 번 만들고, 요청마다 칸별 시간을 낸다.
// 워커 안(worker.ts)에서도, 시험에서도 이 클래스를 그대로 쓴다. 그래프(graph/mv.json, 2.6MB)는 일꾼이 직접 받아 화면 쪽은 멈추지 않는다
import { buildGraphs, type MvData, type Period, type TravelGraphs } from './graph'
import { travelTimes, type Mode } from './times'

export type TravelReq =
  /** 그래프 준비 — url이면 일꾼이 받고, mv면 그대로 쓴다(시험) */
  | { id: number; type: 'init'; url: string }
  | { id: number; type: 'init'; mv: MvData }
  | { id: number; type: 'times'; mode: Mode; origin: number; period: Period }

export type TravelRes =
  | { id: number; ok: true; type: 'ready'; cells: number }
  | { id: number; ok: true; type: 'times'; times: Float64Array }
  | { id: number; ok: false; error: string }

type FetchJSON = (url: string) => Promise<unknown>

const fetchJSON: FetchJSON = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} — ${r.status}`)
  return r.json()
}

export class TravelService {
  private graphs: Promise<TravelGraphs> | null = null

  constructor(private readonly get: FetchJSON = fetchJSON) {}

  /** 요청 하나 → 답 하나. 시간 요청은 그래프 준비가 끝날 때까지 기다린다 */
  async handle(m: TravelReq): Promise<TravelRes> {
    try {
      if (m.type === 'init') {
        this.graphs = (async () => buildGraphs('mv' in m ? m.mv : ((await this.get(m.url)) as MvData)))()
        const g = await this.graphs
        return { id: m.id, ok: true, type: 'ready', cells: g.cells }
      }
      if (!this.graphs) throw new Error('그래프를 아직 만들지 않았다 — init을 먼저 보낸다')
      const g = await this.graphs
      return { id: m.id, ok: true, type: 'times', times: travelTimes(g, m.mode, m.origin, m.period) }
    } catch (e) {
      return { id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}
