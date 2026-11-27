import { useState } from 'react'
import { IcoShare } from './icons'

// 공유 — 폰은 공유 창(카카오톡 등)으로 한 줄 문장 + 지금 주소, 공유 창이 없는 기기는 복사 (마스터플랜 W7.16 쓰임새 3).
// 주소가 곧 상태라(W7.4) 받은 사람은 같은 화면을 본다

/** 공유할 글 — 문장 + 주소 */
export function shareText(text: string | null | undefined, url: string): string {
  return text ? `${text}\n${url}` : url
}

export default function ShareButton({ text, testid = 'share', label = '공유', className = 'btn2' }: { text?: string | null; testid?: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  const flash = () => {
    setDone(true)
    setTimeout(() => setDone(false), 1600)
  }
  const onClick = () => {
    const url = location.href
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: '점지 — 서울 가게 자리 찾기', text: text ?? undefined, url }).catch(() => undefined) // 닫으면 그대로 둔다
      return
    }
    void navigator.clipboard?.writeText(shareText(text, url)).then(flash)
  }
  return (
    <button className={className} onClick={onClick} data-testid={testid} data-share={shareText(text, '')}>
      <IcoShare size={18} />
      {done ? '복사했어요' : label}
    </button>
  )
}
