import { comma } from '../core/format'
import { won } from '../core/check'

// 손익 점검 막대 — 서울 이 업종 상권별 점포당 월매출 분포(로그 눈금) 위에 본전 매출과 견준 매출 (예전 뷰어 beChart를 옮김, 마스터플랜 W7.4 '막대(손익분기 ↔ 이 동네 평균)').
// 연한 띠 = 가운데 90%(5~95%), 진한 띠 = 가운데 50%, 세로 눈금 = 가운데 값. 점포 수 가중, 2025년

interface Props {
  /** 분위값(만 원) — 5 · 10 · 25 · 50 · 75 · 90 · 95% */
  q: number[]
  S: number
  refV: number
  refLabel: string
  nm: string
}

const W = 320, H = 112, ML = 4, MR = 4, YB = 52

/** 글자 폭 어림 — 한글 12.6 · 빈칸 3.6 · 나머지 7.4 (11px) */
function tw(t: string): number {
  let w = 0
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    w += c >= 0x1100 ? 12.6 : c === 32 ? 3.6 : 7.4
  }
  return w * 0.92
}

export default function CheckChart({ q, S, refV, refLabel, nm }: Props) {
  const lo = Math.min(q[0], S, refV) / 1.25, hi = Math.max(q[6], S, refV) * 1.25
  const L0 = Math.log(lo), L1 = Math.log(hi)
  const X = (v: number) => ML + ((Math.log(v) - L0) / (L1 - L0)) * (W - ML - MR)
  const cx = (x: number, w: number) => Math.min(Math.max(x, ML + w / 2), W - MR - w / 2)
  const tS = `▼ 본전 ${won(S)}`, tR = `● ${refLabel} ${won(refV)}`
  const ticks: { x: number; t: number }[] = []
  let last = -1e9
  for (let e = 1; e <= 6; e++) for (const m of [1, 2, 5]) {
    const t = m * 10 ** (e - 1), x = X(t)
    if (t > lo * 1.03 && t < hi / 1.03 && x - last >= 48 && x > ML + 18 && x < W - MR - 18) {
      ticks.push({ x, t })
      last = x
    }
  }
  return (
    <figure className="chk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`서울 ${nm} 상권별 점포당 월매출 분포(가운데 값 ${won(q[3])}) 위에 본전 매출 ${won(S)}과 ${refLabel} ${won(refV)}`}>
        <rect x={X(q[0])} y={YB - 8} width={X(q[6]) - X(q[0])} height={16} rx={3} className="b90"><title>{`가운데 90%: ${won(q[0])}~${won(q[6])}`}</title></rect>
        <rect x={X(q[2])} y={YB - 8} width={Math.max(1, X(q[4]) - X(q[2]))} height={16} className="b50"><title>{`가운데 50%: ${won(q[2])}~${won(q[4])} · 가운데 값 ${won(q[3])}`}</title></rect>
        <line x1={X(q[3])} x2={X(q[3])} y1={YB - 8} y2={YB + 8} className="bmed" />
        {ticks.map((k) => <text key={k.t} x={k.x} y={H - 4} textAnchor="middle" className="tick">{comma(k.t)}</text>)}
        <line x1={X(S)} x2={X(S)} y1={YB - 14} y2={YB + 14} className="mbe" />
        <path d={`M${X(S) - 6},${YB - 22} L${X(S) + 6},${YB - 22} L${X(S)},${YB - 14} Z`} className="mbecap" />
        <circle cx={X(refV)} cy={YB} r={6} className="mref" />
        <text x={cx(X(S), tw(tS))} y={16} textAnchor="middle" className="lbl">{tS}</text>
        <text x={cx(X(refV), tw(tR))} y={YB + 30} textAnchor="middle" className="lbl">{tR}</text>
      </svg>
      <figcaption className="hint">띠: 서울 &apos;{nm}&apos; 상권별 점포당 월매출(만 원, 로그 눈금) — 연한 띠 가운데 90%, 진한 띠 가운데 50%, 세로 눈금 가운데 값. 점포 수 가중, 2025년</figcaption>
    </figure>
  )
}
