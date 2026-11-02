// 이동 시간 일꾼 — 화면이 멈추지 않게 다익스트라를 따로 돌린다 (client.ts가 만든다). 시간 배열은 복사하지 않고 넘긴다(transfer)
import { TravelService, type TravelReq, type TravelRes } from './service'

interface Scope {
  onmessage: ((e: MessageEvent<TravelReq>) => void) | null
  postMessage(m: TravelRes, transfer?: Transferable[]): void
}
const scope = self as unknown as Scope
const svc = new TravelService()

scope.onmessage = (e) => {
  void svc.handle(e.data).then((r) => {
    if (r.ok && r.type === 'times') scope.postMessage(r, [r.times.buffer])
    else scope.postMessage(r)
  })
}
