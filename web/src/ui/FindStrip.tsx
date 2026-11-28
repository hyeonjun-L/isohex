import { IcoClose, IcoPin, IcoTarget } from './icons'

// 후보 찾기 조건 띠 (화면 다시 잡기 11-25 · S13) — 기준점 · 가는 법 · 시간 · 시간대 한 줄, [바꾸기](조건 시트를 연다), ×(후보 찾기를 끝내고 동네 보기로).
// 폰은 찾기 칸 자리에, 데스크톱은 패널 맨 위 찾기 칸 아래에 선다. 지도에서 기준점을 찍는 동안은 그 자리에 PickBanner(S12)

interface Props {
  label: string
  onEdit: () => void
  onEnd: () => void
}

export default function FindStrip({ label, onEdit, onEnd }: Props) {
  return (
    <div className="find-strip" data-testid="find-strip">
      <IcoPin size={18} />
      <span className="fs-label">{label}</span>
      <button className="btn-quiet fs-edit" onClick={onEdit} aria-label="조건 바꾸기" data-testid="find-edit">
        <span className="fs-edit-pre">조건 </span>바꾸기
      </button>
      <button className="icon-btn" onClick={onEnd} aria-label="후보 찾기 끝내기 — 동네 보기로" data-testid="tab-map">
        <IcoClose size={20} />
      </button>
    </div>
  )
}

/** 지도에서 기준점 찍는 중 — 맨 위 먹색 띠와 [취소] (S12) */
export function PickBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="pick-banner" role="status" data-testid="pick-banner">
      <IcoTarget size={20} />
      <span className="pb-text">지도에서 기준점으로 쓸 칸을 누르세요</span>
      <button className="pb-cancel" onClick={onCancel} data-testid="pick-cancel">취소</button>
    </div>
  )
}
