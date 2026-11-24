import type { CSSProperties, ReactNode } from 'react'
import { BASE_COLORS, rgbaCss, type Theme } from '../map/palette'

// 지도 위 범례 — 칠할 것을 고르는 단추(지표 칩) 바로 아래에 늘 떠 있다.
// 예전에는 패널 안에 있어서 폰에서는 8줄 중 3줄만 보였고, 자리 카드를 열면 카드 아래로 밀려 화면 밖이었다(2026-11-24 화면 점검).
// 접으면 한 줄 막대 — 숫자 지표는 단계 사이 경계에 눈금(12 · 15 · 20 · 25만 원), 매출 수준은 쉬운 말 세 마디(절반 이하 · 비슷 · 2배 넘음).
// 펴면 단계마다 쉬운 말 한 줄씩(예전 범례 그대로).
// 데스크톱의 처음 화면 · 동네 보기는 편 채로, 폰과 후보 찾기 · 비교함은 접은 채로 시작한다(App의 legendIsOpen).
// 접힌 범례는 어디를 눌러도 펴지고, 편 범례는 제목 줄을 누르면 접힌다.
// 제목은 '무엇 — 어떻게 쟀나' 꼴이라 앞을 진하게 — 펴면 두 줄로 나눈다(글자는 그대로라 화면 읽기 · 시험에는 한 문장)

export interface MapLegendSpec {
  title: string
  sub: string | null
  /** 낮은 값 → 높은 값 */
  items: { label: string; color: string }[]
  /** 칠하지 않는 칸 — 빗금(추정하지 않음) 또는 빈칸(자료 밖) */
  none: { label: string; short: string; look: 'hatch' | 'empty' } | null
  /** 단계 사이 경계 눈금 (단계 수 − 1개, 없으면 빈 배열) */
  ticks: string[]
  /** 막대 두 끝에 적는 글자 — 시간 띠의 0 · 30분, 매출 수준의 절반 이하 · 2배 넘음. 없으면 눈금만 */
  ends: [string, string] | null
  /** 가운데 단계 아래에 적는 글자 — 매출 수준의 '비슷' (at = 단계 차례) */
  mid: { at: number; label: string } | null
}

interface Props {
  spec: MapLegendSpec
  theme: Theme
  open: boolean
  onToggle: () => void
  /** 편 목록 끝에 덧붙일 줄 — 후보 찾기의 경계선 · 후보 번호 · 기준점 */
  extra?: ReactNode
  /** 폰 — 범례 위 끝에서 아래 시트까지 남은 높이(px, ui/useSheetRoom). 데스크톱은 null */
  room?: number | null
}

/** 접힌 범례(한 줄 막대)의 높이 67px이 서려면 있어야 하는 높이 */
const ROOM_MIN = 64

export default function MapLegend({ spec, theme, open, onToggle, extra = null, room = null }: Props) {
  const B = BASE_COLORS[theme]
  const noneSw: CSSProperties | undefined = spec.none
    ? {
        backgroundColor: B.land,
        backgroundImage: spec.none.look === 'hatch' ? `repeating-linear-gradient(135deg, ${rgbaCss(B.hatch)} 0 1px, transparent 1px 4px)` : undefined,
      }
    : undefined
  const n = spec.items.length
  const cut = spec.title.indexOf(' — ')
  const what = cut < 0 ? spec.title : spec.title.slice(0, cut)
  const how = cut < 0 ? null : spec.title.slice(cut + 3)
  const all = [...spec.items.map((it) => it.label), ...(spec.none ? [spec.none.label] : [])].join(', ')
  // 폰에서 시트를 크게 펴 한 줄 막대도 설 자리가 없으면 감춘다(자리는 그대로 둔다 — 지도가 48px만 남는 때라 읽을 지도도 없다).
  // 편 범례는 시트 위 끝까지만 보이고 안에서 넘겨 본다(키 작은 폰)
  const tight = room != null && room < ROOM_MIN
  return (
    <section
      className={`map-legend${open ? ' open' : ''}${tight ? ' ml-hidden' : ''}`}
      style={room != null && open && !tight ? { maxHeight: room } : undefined}
      aria-label="범례"
      data-testid="legend"
      onClick={open ? undefined : onToggle}
    >
      {/* 접혔을 때는 상자 전체가 누르는 곳이다(단추를 눌러도 상자의 onClick으로 한 번만 바뀐다) */}
      <button type="button" className="ml-head" aria-expanded={open} onClick={open ? onToggle : undefined} data-testid="legend-toggle">
        <span className="ml-title" data-testid="legend-title">
          <span className="ml-what">{what}</span>
          {how && <><span className="ml-dash"> — </span><span className="ml-how">{how}</span></>}
        </span>
        <span className="sr">{open ? ' — 범례 접기' : ' — 범례 펴기'}</span>
        <span className="ml-tog" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <>
          {spec.sub && <div className="ml-sub">{spec.sub}</div>}
          <ul className="ml-list" data-testid="legend-list">
            {spec.items.map((it) => (
              <li key={it.label}>
                <span className="sw" style={{ background: it.color }} aria-hidden="true" />
                {it.label}
              </li>
            ))}
            {spec.none && (
              <li>
                <span className="sw sw-none" style={noneSw} aria-hidden="true" />
                {spec.none.label}
              </li>
            )}
            {extra}
          </ul>
        </>
      ) : (
        <div className="ml-row" data-testid="legend-bar">
          <div className="ml-scale" style={{ '--n': n } as CSSProperties} role="img" aria-label={all}>
            <div className="ml-bar">
              {spec.items.map((it) => <i key={it.label} style={{ background: it.color }} />)}
            </div>
            <div className="ml-ticks" aria-hidden="true">
              {spec.ends && <span className="ml-end ml-lo">{spec.ends[0]}</span>}
              {spec.ticks.map((t, j) => (
                <span key={`${j}${t}`} className="ml-tick" style={{ left: `${((j + 1) / n) * 100}%` }}>{t}</span>
              ))}
              {spec.mid && <span className="ml-tick" style={{ left: `${((spec.mid.at + 0.5) / n) * 100}%` }}>{spec.mid.label}</span>}
              {spec.ends && <span className="ml-end ml-hi">{spec.ends[1]}</span>}
            </div>
          </div>
          {spec.none && (
            <div className="ml-none">
              <i className="ml-none-sw" style={noneSw} aria-hidden="true" />
              <span>{spec.none.short}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
