import type { ReactNode } from 'react'
import { type CardModel, type Fact, PICK_HINT, ratioText } from '../core/card'
import { LEVEL_SHORT, levelPos } from '../core/level'
import { TIME_SHORT } from '../core/mix'
import { BASE_COLORS, LEVEL_COLORS, rgbaCss, type Theme } from '../map/palette'
import ShareButton from './ShareButton'
import { IcoBox, IcoCalc, IcoClose, IcoDown, IcoInfo, IcoLeft, IcoList, IcoOk, IcoOut, IcoPin, IcoWarn } from './icons'

// 자리 카드 화면 — core/card.ts가 만든 글자와 위치를 그린다 (와이어프레임 T2e·T2f · 화면 다시 잡기 11-25 시안 S06 · S07 · S18).
// 위에서부터: 이름 → 할 일 줄(손익 따져보기 · 비교함 · 여기서 후보 찾기 · 이 자리에 맞는 업종 · 공유) → 답 문장(한 줄 요약의 첫 마디)
// → 기록(이 동네 가게당 월매출, 30px) → 추정(매출 수준, 지도 칸 색 일곱 단계 막대) → 둘을 같은 잣대로 견준 막대
// → 접는 줄 넷(숫자 넷 더 · 이 동네 손님은 · 왜 이 값인가 · 얼마나 믿을 수 있나) → 바깥 링크 → 맺는 말

interface Props {
  card: CardModel
  onClose: () => void
  /** 후보 찾기에서 연 카드 — 머리('후보 3 · 자동차 18분')와 왜 후보인가/빠졌나, 목록으로 돌아가는 단추 */
  ctx?: { head: string; why: string } | null
  /** 동네 보기에서 — 이 칸을 기준점으로 후보 찾기 */
  onFindHere?: (() => void) | null
  /** 이 자리에서 매물 숫자로 손익 점검 */
  onCheck?: (() => void) | null
  /** 비교함 — 담았나 · 다 찼나(5곳) */
  box?: { boxed: boolean; full: boolean; onBox: () => void } | null
  /** 비교함에서 연 카드 — 돌아가는 단추의 글자('← 비교함') */
  back?: string | null
  /** 이 자리에 맞는 업종(거꾸로 찾기) 열기 */
  onFit?: (() => void) | null
  /** 추정 막대의 칸 색 — 지도와 같은 색 */
  theme?: Theme
}

/** 시간대 막대 여섯 — 이 동네 시간대별 매출 몫, 가장 큰 때만 먹색 */
function TimeBars({ here }: { here: number[] }) {
  const top = Math.max(...here, 1)
  const max = here.indexOf(Math.max(...here))
  const say = here.map((v, j) => `${TIME_SHORT[j]} ${v}%`).join(', ')
  return (
    <figure className="tfig">
      <div className="tbars" role="img" aria-label={`시간대별 매출 몫 — ${say}`} data-testid="mix-bars">
        {here.map((v, j) => (
          <div key={j} className={`tbar${j === max ? ' top' : ''}`}>
            <span className="tbar-n">{v}%</span>
            <i className="tbar-v" style={{ height: `${Math.max(3, (v / top) * 80)}px` }} />
            <span className="tbar-l">{TIME_SHORT[j]}</span>
          </div>
        ))}
      </div>
      <figcaption className="hint">시간대별 매출 몫 — 이 동네</figcaption>
    </figure>
  )
}

/** 접는 줄 — 제목 17px · 요약 한 줄 · 펴고 접는 꺾쇠 */
function Fold({ title, sum, sumId, testid, more = false, children }: { title: string; sum?: string | null; sumId?: string; testid?: string; more?: boolean; children: ReactNode }) {
  return (
    <details className={more ? 'acc acc-more' : 'acc'} data-testid={testid}>
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

/** 이름 · 덧말(왼쪽)과 값(오른쪽) 한 줄 */
function Row({ label, sub, value, testid, valueId }: { label: string; sub?: ReactNode; value: ReactNode; testid?: string; valueId?: string }) {
  return (
    <div className="krow" data-testid={testid}>
      <div className="krow-l">
        <div className="krow-label">{label}</div>
        {sub && <div className="krow-sub">{sub}</div>}
      </div>
      <div className="krow-v" data-testid={valueId}>{value}</div>
    </div>
  )
}

/** 믿음 줄 표시 — i 알려 둘 것 · ✓ 괜찮은 것 · ! 살펴볼 것 (모형의 힘(중)은 알려 둘 것) */
function TrustIco({ mark }: { mark: string }) {
  return mark === '✓' ? <IcoOk size={16} /> : mark === '!' ? <IcoWarn size={16} /> : <IcoInfo size={16} />
}

/** 칠하지 않은 칸 견본 — 지도 범례의 '추정 안 함'과 같은 빗금 (MapLegend) */
const hatchSw = (theme: Theme) => ({ backgroundColor: BASE_COLORS[theme].land, backgroundImage: `repeating-linear-gradient(135deg, ${rgbaCss(BASE_COLORS[theme].hatch)} 0 1px, transparent 1px 4px)` })

/** 기록 · 추정 꼬리표 — 기록은 꽉 찬 먹, 추정은 점선 */
const Tag = ({ kind }: { kind: 'rec' | 'est' }) => <span className={`ktag ktag-${kind}`}>{kind === 'rec' ? '기록' : '추정'}</span>

/** '주변 가게 구성 (음식 · 소매 …)' → 이름 · 덧말 (괄호 안은 덧말 앞으로) */
function whyLabel(text: string, side: string): [string, string] {
  const m = /^(.*) \((.*)\)$/.exec(text)
  return m ? [m[1], `${m[2]} — ${side}`] : [text, side]
}

/** 얼마나 믿을 수 있나 — 접은 줄 요약: '모형의 힘 보통 · 학습한 범위 안 · 살펴볼 것 둘' */
function trustSum(card: CardModel): string {
  const KO = ['', '하나', '둘', '셋', '넷', '다섯', '여섯']
  const parts: string[] = []
  const st = card.trust.find((t) => t.title.startsWith('모형의 힘'))
  if (st) parts.push(st.title.replace(':', ''))
  const range = card.trust.find((t) => t.title.startsWith('학습한 범위'))
  if (range) parts.push(range.title)
  const n = card.trust.filter((t) => t.mark === '!' && t !== range).length
  if (n) parts.push(`살펴볼 것 ${KO[n] ?? n}`)
  return parts.join(' · ')
}

function EstBar({ f, theme }: { f: Fact; theme: Theme }) {
  const at = f.pct != null ? levelPos(f.pct) : null
  return (
    <div className="kbar-wrap" aria-hidden="true">
      <span className="kbar">
        {LEVEL_COLORS[theme].map((c) => <i key={c} style={{ background: c }} />)}
      </span>
      {at != null && <b className="kbar-at" style={{ left: `${(at * 100).toFixed(1)}%` }} />}
      <span className="kbar-ends hint">
        <span>평균의 {LEVEL_SHORT.lo}</span>
        <span>{LEVEL_SHORT.hi}</span>
      </span>
    </div>
  )
}

export default function PlaceCard({ card, onClose, ctx = null, onFindHere = null, onCheck = null, box = null, back = null, onFit = null, theme = 'light' }: Props) {
  const f = (k: Fact['key']) => card.facts.find((x) => x.key === k) ?? null
  const rec = f('rec'), pot = f('pot'), unm = f('unm')
  const num = card.n300.match(/^반경 300m 가게 ([\d,]+곳) \(서울 칸 (.+)\)$/)
  // 숫자 넷 더 — 1층 임대료 · 같은 업종 · 반경 300m 가게 · 새 가게 1년 생존 (시안 S18). 이름의 괄호는 덧말로
  const more: { key: string; label: string; sub: string; value: string; testid?: string; valueId?: string }[] = []
  const rent = f('rent'), same = f('same'), surv = f('surv')
  if (rent) more.push({ key: 'rent', label: rent.label, sub: rent.note ? `${rent.sub} · ${rent.note}` : rent.sub, value: rent.value, testid: 'fact-rent' })
  if (same) more.push({ key: 'same', label: same.label, sub: same.sub, value: same.value, testid: 'fact-same' })
  if (card.facts.length) more.push({ key: 'n300', label: '반경 300m 가게', sub: num ? `서울 칸 ${num[2]}` : card.n300, value: num ? num[1] : '—', valueId: 'n300' })
  if (surv) {
    const m = /^(.*) \((.*)\)$/.exec(surv.label)
    more.push({ key: 'surv', label: m ? m[1] : surv.label, sub: m ? `${m[2]} — ${surv.sub}` : surv.sub, value: surv.value, testid: 'fact-surv' })
  }
  const cb = card.cmpBars
  const cbMax = cb ? Math.max(cb.rec, cb.est) : 1
  return (
    <section className="card place-card" aria-label="고른 칸">
      {(ctx || back) && (
        <div className="find-ctx">
          <button className="btn-back" onClick={onClose} aria-label={ctx ? '후보 목록으로' : '비교함으로'}>
            <IcoLeft size={18} />
            {ctx ? '목록' : '비교함'}
          </button>
          {ctx && (
            <span className="fc-t" data-testid="find-ctx">
              <strong>{ctx.head}</strong>
              <span>{ctx.why}</span>
            </span>
          )}
        </div>
      )}
      <div className="card-head">
        <div>
          <h2>{card.title}</h2>
          <div className="sub" data-testid="card-sub">{card.sub}</div>
        </div>
        {!ctx && !back && (
          <button className="icon-btn close-btn" onClick={onClose} aria-label="고른 칸 지우기">
            <IcoClose size={20} />
          </button>
        )}
      </div>
      <div className="card-acts card-todo" role="group" aria-label="이 자리에서 할 일">
        {onCheck && <button className="btn2 btn-ink" onClick={onCheck} data-testid="check-open"><IcoCalc size={18} />손익 따져보기</button>}
        {box && (
          <button className="btn2" onClick={box.onBox} disabled={!box.boxed && box.full} data-testid="box-toggle">
            <IcoBox size={18} />
            {box.boxed ? '비교함에서 빼기' : '비교함에 담기'}
          </button>
        )}
        {onFindHere && <button className="btn2" onClick={onFindHere} data-testid="find-here"><IcoPin size={18} />여기서 후보 찾기</button>}
        {onFit && <button className="btn2" onClick={onFit} data-testid="fit-open"><IcoList size={18} />이 자리에 맞는 업종</button>}
        <ShareButton text={`${card.title} — ${card.line}`} testid="card-share" />
      </div>
      {box && !box.boxed && box.full && <p className="note" role="status">비교함이 찼어요(5곳) — 하나를 빼고 담으세요.</p>}
      <p className="answer" data-testid="oneline">{card.answer}</p>

      {/* 기록 — 이 동네 가게당 월매출 */}
      {rec && (
        <div className="kblock" data-testid="fact-rec">
          <div className="ktag-row"><Tag kind="rec" /><span className="hint">{rec.tag}</span></div>
          <div className="klabel">{rec.label}</div>
          <div className="kbig" data-testid="rec">{rec.value}</div>
          <div className="hint">{rec.sub}{cb && ' · 지금 있는 가게들의 평균'}</div>
        </div>
      )}
      {rec && (pot || unm) && <hr className="krule" />}

      {/* 추정 — 매출 수준 (무인 유형은 둘레 무인 가게) */}
      {pot && (
        <div className={`kblock${pot.none ? ' knone' : ''}`} data-testid="fact-pot">
          <div className="ktag-row"><Tag kind="est" /><span className="hint">{pot.tag}</span></div>
          <div className="kline">
            <span className="klabel">{pot.label}</span>
            <span className="kmid" data-testid="level">{pot.value}</span>
          </div>
          {pot.hatch ? (
            <>
              <div className="khatch-row"><i className="khatch" aria-hidden="true" style={hatchSw(theme)} /><span>지도의 빗금 칸과 같아요</span></div>
              <div className="hint">{pot.sub}</div>
            </>
          ) : pot.none ? (
            <div className="hint">{pot.sub}</div>
          ) : (
            <>
              <EstBar f={pot} theme={theme} />
              <div className="hint">{pot.sub} · 막대는 서울 안 위치, 오른쪽일수록 높음{cb && ' · 자리로 본 추정'}</div>
            </>
          )}
        </div>
      )}
      {unm && (
        <div className="kblock" data-testid="fact-unm">
          <div className="klabel">{unm.label}</div>
          <div className="kmid">{unm.value}</div>
          <div className="hint">{unm.sub}</div>
        </div>
      )}

      {/* 기록과 추정을 같은 잣대(서울 평균 상권 = 1)로 */}
      {cb && (
        <div className="kcmp-bars" data-testid="cmp">
          <div className="hint kcb-head">서울 평균 상권(가게당 월 {cb.base})을 1로 보면</div>
          <div className="kcb">
            <span className="kcb-l"><Tag kind="rec" />이 동네 값</span>
            <span className="kcb-bar"><i className="rec" style={{ width: `${(cb.rec / cbMax) * 100}%` }} /></span>
            <b>{ratioText(cb.rec)}</b>
            <span className="kcb-l"><Tag kind="est" />이 칸 값</span>
            <span className="kcb-bar"><i className="est" style={{ width: `${(cb.est / cbMax) * 100}%` }} /></span>
            <b>{ratioText(cb.est)}</b>
          </div>
        </div>
      )}

      {!card.facts.length && <p className="hint pick-hint">{PICK_HINT}</p>}

      {/* 숫자 넷 더 — 접은 줄에도 값이 다 보인다 */}
      {more.length > 0 && (
        <Fold title="숫자 넷 더" sum={more.map((x) => `${x.label.replace(/ \(.*\)$/, '')} ${x.value}`).join(' · ')} testid="more4" more>
          {more.map((x) => <Row key={x.key} label={x.label} sub={x.sub} value={x.value} testid={x.testid} valueId={x.valueId} />)}
        </Fold>
      )}

      {card.mix && (
        <Fold title="이 동네 손님은" sum={card.mix.sum} sumId="mix-sum" testid="mix">
          <p className="hint">{card.mix.where} · 카드 결제 기준</p>
          <TimeBars here={card.mix.time.here} />
          <div className="krows">
            {card.mix.lines.map((l) => (
              <Row key={l.key} label={l.label} sub={l.note} value={l.value} testid={`mix-${l.key}`} />
            ))}
          </div>
          <p className="knote"><IcoInfo size={16} /><span>{card.mix.caveat}</span></p>
        </Fold>
      )}

      {card.why && (
        <Fold title="왜 이 값인가" sum={`칸 둘레의 사람과 가게 다섯 가지를 곱하면 ${card.why.total}`} testid="why">
          <p className="acc-intro">{card.why.intro}</p>
          <div className="krows">
            {card.why.rows.map((r) => {
              const [label, sub] = whyLabel(r.text, r.side)
              return <Row key={r.text} label={label} sub={sub} value={r.x} />
            })}
            <Row label="모두 곱하면" sub={card.why.note} value={card.why.total} />
          </div>
        </Fold>
      )}

      <Fold title="얼마나 믿을 수 있나" sum={trustSum(card) || null} testid="trust">
        <ul className="trust">
          {card.trust.map((t) => (
            <li key={t.title} data-testid={t.title.startsWith('모형의 힘') ? 'strength' : undefined}>
              <TrustIco mark={t.mark} />
              <span>{t.title} — {t.text}</span>
            </li>
          ))}
        </ul>
      </Fold>

      {card.links.length > 0 && (
        <div className="out-links" aria-label="다른 서비스에서 보기" data-testid="out-links">
          {card.links.map((l) => (
            <a key={l.key} className="out-link" href={l.href} target="_blank" rel="noopener noreferrer" data-testid={`link-${l.key}`}>
              <span className="ol-t">
                <span className="ol-label">{l.label}</span> <span className="hint">{l.sub} ↗ — 새 창</span>
              </span>
              <IcoOut size={18} />
            </a>
          ))}
        </div>
      )}
      <p className="knote card-foot"><IcoInfo size={16} /><span>{card.foot}</span></p>
    </section>
  )
}
