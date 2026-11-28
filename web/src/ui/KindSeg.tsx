// 업종 둘 견주기 — 지도에 칠할 업종 바꾸기 [A 지도 | B 지도] (화면 다시 잡기 S20).
// 8단계부터 지도 위 칩 줄 아래가 아니라 시트 안 — 견주기 머리 바로 아래, 자리 카드를 열면 카드 위. 지도 띠를 가리지 않는다
export default function KindSeg({ pair, active, onActive }: { pair: { c: string; nm: string }[]; active: string | null; onActive: (c: string) => void }) {
  return (
    <div className="kind-seg" role="group" aria-label="지도에 칠할 업종" data-testid="kind-seg">
      {pair.map((k) => (
        <button key={k.c} aria-pressed={k.c === active} onClick={() => onActive(k.c)}>{k.nm} 지도</button>
      ))}
    </div>
  )
}
