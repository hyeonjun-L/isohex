import { IcoClose, IcoPin } from './icons'

// 후보 찾기 조건 띠 (화면 다시 잡기 11-25) — 기준점 · 가는 법 · 시간 · 시간대 한 줄과 ×(후보 찾기를 끝내고 동네 보기로).
// 폰은 찾기 칸 자리에, 데스크톱은 패널 맨 위 찾기 칸 아래에 선다. 조건을 따로 연 시트로 바꾸는 [바꾸기]는 6단계(후보 찾기)에서

interface Props {
  label: string
  onEnd: () => void
}

export default function FindStrip({ label, onEnd }: Props) {
  return (
    <div className="find-strip" data-testid="find-strip">
      <IcoPin size={18} />
      <span className="fs-label">{label}</span>
      <button className="icon-btn" onClick={onEnd} aria-label="후보 찾기 끝내기 — 동네 보기로" data-testid="tab-map">
        <IcoClose size={20} />
      </button>
    </div>
  )
}
