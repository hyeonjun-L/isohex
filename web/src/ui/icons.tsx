// 선 아이콘 — 화면 다시 잡기(11-25) 시안과 같은 24 그리드 · 굵기 2. 글자와 같은 색(currentColor), 이름은 단추의 aria-label이 말한다
import type { ReactNode } from 'react'

interface Props {
  size?: number
}

function Svg({ size = 22, children, sw = 2 }: Props & { children: ReactNode; sw?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className="ico">
      {children}
    </svg>
  )
}

/** ⬡ 점지 — 처음 화면으로 */
export const IcoHex = (p: Props) => <Svg {...p}><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" /></Svg>
export const IcoSearch = (p: Props) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
/** 비교함 */
export const IcoBox = (p: Props) => <Svg {...p}><path d="M3 4h18v4H3z" /><path d="M5 8v12h14V8" /><path d="M10 12h4" /></Svg>
export const IcoPlus = (p: Props) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IcoMinus = (p: Props) => <Svg {...p}><path d="M5 12h14" /></Svg>
/** 3D로 · 위에서 보기 */
export const IcoCube = (p: Props) => <Svg {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></Svg>
/** 내 위치 */
export const IcoTarget = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></Svg>
export const IcoDown = (p: Props) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
export const IcoUp = (p: Props) => <Svg {...p}><path d="M6 15l6-6 6 6" /></Svg>
export const IcoRight = (p: Props) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
export const IcoCheck = (p: Props) => <Svg {...p} sw={2.5}><path d="M5 12l5 5 9-10" /></Svg>
export const IcoClose = (p: Props) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
/** 기준점 */
export const IcoPin = (p: Props) => <Svg {...p}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></Svg>
/** 손익 따져보기 — 계산기 */
export const IcoCalc = (p: Props) => <Svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></Svg>
/** 이 자리에 맞는 업종 — 목록 */
export const IcoList = (p: Props) => <Svg {...p}><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.4} /></Svg>
export const IcoShare = (p: Props) => <Svg {...p}><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" /><path d="M12 3v12M7 8l5-5 5 5" /></Svg>
/** 알려 둘 것 (i) · 괜찮은 것 (✓) · 살펴볼 것 (!) — 믿음 줄 · 주의 글 */
export const IcoInfo = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></Svg>
export const IcoOk = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></Svg>
export const IcoWarn = (p: Props) => <Svg {...p}><path d="M12 3.5l9 16h-18z" /><path d="M12 10v4.5M12 17.2h.01" /></Svg>
/** 새 창으로 */
export const IcoOut = (p: Props) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
/** 뒤로 (목록 · 비교함으로) */
export const IcoLeft = (p: Props) => <Svg {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>
