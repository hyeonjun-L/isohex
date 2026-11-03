// 예시로 보기 — 시청역에서 차로 30분 안 카페 자리로 전체 흐름을 세 번 눌러 본다 (마스터플랜 W7.4 '첫 화면', '튜토리얼 대신 예시로 보기 한 번').
// 앱 상태를 바꾸는 것은 App이 한다(카페 · 후보 찾기 · 1번 후보 카드). 여기는 글자와 단추만

export const TOUR_STEPS = [
  '시청역에서 자동차로 30분 안에 닿는 칸 가운데, 카페가 지금 있는 자리와 비슷한 곳 20곳을 뽑았어요. 패널의 깔때기가 몇 칸이 남았는지 보여 줘요.',
  '1번 후보의 자리 카드예요. 맨 위에 왜 후보인지, 그 아래 한 줄 요약과 숫자 넷(매출 수준 · 1층 임대료 · 같은 업종 · 새 가게 생존)이 있어요.',
  '이제 기준점을 집이나 일터로 바꾸고, 가는 법과 시간을 골라 보세요. 업종은 위 ‘업종’ 단추로 바꿔요.',
] as const

interface Props {
  step: number
  /** 다음 단계가 준비됐나 (후보를 다 뽑았나) */
  ready: boolean
  onNext: () => void
  onEnd: () => void
}

export default function Tour({ step, ready, onNext, onEnd }: Props) {
  const last = step >= TOUR_STEPS.length
  return (
    <div className="tour" role="dialog" aria-label="예시로 보기" data-testid="tour">
      <div className="tour-head">
        <strong>예시로 보기 {step}/{TOUR_STEPS.length}</strong>
        <button className="ghost" onClick={onEnd}>그만 보기</button>
      </div>
      <p aria-live="polite">{ready ? TOUR_STEPS[step - 1] : '후보를 뽑는 중이에요…'}</p>
      <div className="tour-acts">
        <button className="btn2 btn-ink" onClick={last ? onEnd : onNext} disabled={!ready} data-testid="tour-next">{last ? '끝' : '다음'}</button>
      </div>
    </div>
  )
}
