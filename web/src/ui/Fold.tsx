import type { ReactNode } from 'react'
import { IcoDown } from './icons'

/** 접는 줄 — 제목(17px) · 요약 한 줄 · 꺾쇠. 자리 카드 · 손익 점검 · 견주기가 같이 쓴다 (화면 다시 잡기 4 · 7 · 8단계) */
export default function Fold({ title, sum, sumId, testid, more = false, open, className, children }: { title: string; sum?: ReactNode; sumId?: string; testid?: string; more?: boolean; open?: boolean; className?: string; children: ReactNode }) {
  return (
    <details className={['acc', more ? 'acc-more' : '', className ?? ''].filter(Boolean).join(' ')} open={open} data-testid={testid}>
      <summary>
        <span className="acc-t">
          <span className="acc-title">{title}</span>
          {sum && <span className="acc-sum" data-testid={sumId}>{sum}</span>}
        </span>
        <IcoDown size={20} />
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  )
}
