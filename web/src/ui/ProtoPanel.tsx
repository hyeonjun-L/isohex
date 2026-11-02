import { PROTO_DEFAULT, type Proto } from '../map/MapView'

// P1 지도 시안 비교 — 주소에 ?proto=1이 있을 때만 보인다 (마스터플랜 W7.7 P1 ③).
// 건물 표현(회색·칸 색)·투명도·배경을 바꿔 보고, 마포구 세 곳(업무·번화가·주거)으로 바로 간다.

export const PLACES = [
  { k: 'sangam', nm: '상암 (업무)', at: [126.8895, 37.5795] as [number, number] },
  { k: 'hongdae', nm: '홍대 (번화가)', at: [126.9235, 37.5560] as [number, number] },
  { k: 'mangwon', nm: '망원 (주거)', at: [126.9050, 37.5560] as [number, number] },
] as const

const BLDG: { v: Proto['bldg']; nm: string }[] = [
  { v: 'gray', nm: '회색' },
  { v: 'tint', nm: '칸 색' },
  { v: 'off', nm: '끄기' },
]
const OPACITY: { v: number; nm: string }[] = [
  { v: 0.2, nm: '옅게' },
  { v: 0.35, nm: '보통' },
  { v: 0.5, nm: '진하게' },
]
const BG: { v: Proto['bg']; nm: string }[] = [
  { v: 'vworld', nm: '브이월드' },
  { v: 'none', nm: '없음' },
]

interface Props {
  proto: Proto
  onChange: (p: Proto) => void
  onGo: (at: [number, number]) => void
}

function Group<T extends string | number>({ label, items, value, onPick }: { label: string; items: { v: T; nm: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="proto-row" role="radiogroup" aria-label={label}>
      <span className="proto-label">{label}</span>
      {items.map((it) => (
        <button key={String(it.v)} role="radio" aria-checked={value === it.v} className="proto-opt" onClick={() => onPick(it.v)}>
          {it.nm}
        </button>
      ))}
    </div>
  )
}

export default function ProtoPanel({ proto, onChange, onGo }: Props) {
  return (
    <section className="proto" aria-label="지도 시안 비교" data-testid="proto">
      <div className="proto-title">지도 시안 비교</div>
      <Group label="건물" items={BLDG} value={proto.bldg} onPick={(v) => onChange({ ...proto, bldg: v })} />
      <Group label="진하기" items={OPACITY} value={proto.bop ?? PROTO_DEFAULT.bop ?? 0.35} onPick={(v) => onChange({ ...proto, bop: v })} />
      <Group label="배경" items={BG} value={proto.bg} onPick={(v) => onChange({ ...proto, bg: v })} />
      <div className="proto-row" aria-label="가 볼 곳">
        <span className="proto-label">가 보기</span>
        {PLACES.map((p) => (
          <button key={p.k} className="proto-opt" onClick={() => onGo(p.at)}>{p.nm}</button>
        ))}
      </div>
    </section>
  )
}
