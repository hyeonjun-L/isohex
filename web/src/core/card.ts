// 자리 카드 — 칸 하나를 고른 업종으로 읽어 화면에 넣을 글자와 위치를 만든다 (마스터플랜 W7.4 '자리 카드', 와이어프레임 T2e·T2f).
// 제목(동 · 가까운 역) → 한 줄 요약 → 숫자(이 동네 가게당 월매출 · 매출 수준 · 1층 임대료 · 같은 업종(이 칸 + 둘레) · 새 가게 1년 생존) → 왜 이 값인가 → 얼마나 믿을 수 있나.
// 2026-11-20 — 이 동네 가게당 월매출(서울시 추정매출, 상권 없으면 행정동)이 있으면 맨 앞 큰 숫자로 둔다. 추정 비율만 보이면 좋게 읽혔다:
//   '평균 상권보다 30% 높음'의 평균 상권(카페 가게당 월 408만 원)은 가게 수로 센 서울 가운데 값(909만 원)보다 낮고, 값이 있는 상권 넷 중 하나는 추정과 반대쪽이었다
// 위치 막대(pos)는 서울 안 위치 — 0이 가장 낮고 1이 가장 높다. 화면(React)은 이 모양을 그리기만 한다.
// 무인 유형(무인매장 묶음)은 매출 수준 자리에 '무인 가게(이 칸 + 둘레)'를 둔다 — 매출은 가맹 브랜드 값이라 자리 값이 아니다(core/unm.ts)
import { shareAbove } from './breakeven'
import { fracAbove } from './candidates'
import { comma, rankText } from './format'
import { type Kind, type KindDepth, survText } from './kinds'
import { levelText, strength } from './level'
import { type OutLink, outLinks } from './links'
import { type MixRow, type MixSeoul, type MixView, mixRow, mixSeoul, mixView } from './mix'
import { type IndCells, type PotIndex, byInfluence, explainCell, times, upText } from './potential'
import { cardScore } from './score'
import { type SiteCuts, type SiteData, placeText, sideText, upOf } from './site'
import { noPotSentence, oneLine, potSentence, recSentence, rentSentence } from './summary'
import { type UnType, UN_SAME, unSentence } from './unm'
import { type BeInd, rowOf, won } from './check'

export interface Fact {
  key: 'rec' | 'pot' | 'unm' | 'rent' | 'same' | 'surv'
  label: string
  value: string
  sub: string
  /** 서울 안 위치 0~1 (오른쪽일수록 높음), 견줄 것이 없으면 null */
  pos: number | null
  /** 값이 없음 — 흐리게 */
  none?: boolean
  /** 맨 앞 큰 숫자 — 한 줄을 다 쓴다 */
  wide?: boolean
}

/** 이 동네 같은 업종 가게의 매출 — 서울시 상권분석서비스 추정매출(카드 결제로 만든 값)을 가게 수로 나눈 평균. 칸이 서울시 상권 안이면 상권 값, 아니면 행정동 값 */
export interface RecInput {
  /** 가게당 월매출(만 원) */
  v: number
  /** 가게 수 */
  n: number
  level: '상권' | '행정동'
  /** 상권 이름 · 행정동 이름 */
  where: string
  /** 견준 서울시 업종 — 이름 · 이어진 상가정보 업종 · 서울 분포(분위값, 천 원) · 카드 매출 포착 판정 */
  ind: Pick<BeInd, 'nm' | 'codes' | 'q' | 'cap' | 'capnote'>
  /** 분위 위치(be/index.json meta.qs) */
  qs: number[]
  year: number
}

export interface WhyRow {
  text: string
  side: string
  x: string
}

export interface TrustItem {
  mark: '중' | '✓' | '!' | 'i'
  title: string
  text: string
}

export interface CardModel {
  title: string
  sub: string
  line: string
  facts: Fact[]
  n300: string
  /**
   * 이 동네 값과 추정을 같은 잣대로 — '서울 평균 상권(가게당 월 408만 원)을 1로 보면 이 동네 값 2.2배 · 추정 1.4배'. 둘 다 있을 때만.
   * 이 동네 값은 금액, 추정은 비율이라 그대로는 견줄 수 없다. 값이 있는 칸의 절반에서 둘이 2배 넘게 벌어진다(2026-11-20 점검) — 문턱 없이 늘 보인다
   */
  cmp: string | null
  why: { intro: string; rows: WhyRow[]; total: string; note: string } | null
  /** 이 동네 손님은 — 요일 · 시간대 · 성별 · 나이 · 가게 드나듦 (이 동네 매출과 같은 지역) */
  mix: MixView | null
  /** 다음 행동 — 근처 상가 매물 · 거리 보기 */
  links: OutLink[]
  trust: TrustItem[]
  /** 카드 맨 아래 한 줄 — 매출 수준이 있으면 추정값이라고, 없으면 칸에 모은 값이라고 */
  foot: string
}

/** 매출 수준을 칠하는 업종의 자료 — ind/index.json 한 줄 · ind/<업종>.json · potIndex · 손익 자료의 결제 포착 판정 */
export interface PotInput {
  nm: string
  rho: number
  /** 맞힘 성적 [위 20%, 아래 20%] — ind/index.json hit */
  hit?: readonly [number, number] | null
  note?: string
  cells: IndCells
  ix: PotIndex
  cap?: { cap: 'ok' | 'low' | 'unk'; capnote: string } | null
  /** 학습한 상권의 매출 수준 범위 [가장 낮은, 가장 높은] — 평균 상권 = 100 (ind/index.json span) */
  span?: readonly [number, number] | null
  /** 평균적인 상권의 가게당 월매출(천 원 — ind/index.json base) */
  base?: number | null
}

export interface CardInput {
  i: number
  /** '역삼1동|강남구' */
  dongKey: string
  n: number
  n300: number
  /** 서울 칸 반경 300m 가게 수 오름차순 */
  n300Sorted: ArrayLike<number>
  site: SiteData
  cuts: SiteCuts
  station?: { name: string; m: number } | null
  /** 고른 업종 — 없으면 자리 성격만 */
  kind?: { k: Kind; depth: KindDepth; s12Sorted: ArrayLike<number> } | null
  pot?: PotInput | null
  /** 같은 업종 — 이 칸, 이 칸 + 둘레, 서울 칸의 '이 칸 + 둘레' 오름차순 */
  same?: { own: number; near: number; nearSorted: ArrayLike<number> } | null
  /** 이 칸이 든 한국부동산원 조사 상권 (1층 천 원/㎡) — 72곳 값 오름차순과 함께 */
  reb?: { name: string; v: number | null; sorted: ArrayLike<number> } | null
  /** 이 동네 같은 업종 가게의 매출 — 없으면(견줄 서울시 업종이 없거나 둘레 매출이 비공개) null */
  rec?: RecInput | null
  /** 이 동네 손님 구성 — rec와 같은 지역 (be/mix/) */
  mix?: { row: MixRow; seoul: MixSeoul | null; year: number } | null
  /** 칸 중심과 칸이 든 법정동 — 카드 링크 */
  at?: { lat: number; lng: number; bd: { nm: string; gu: string } | null } | null
  /** 무인 유형 — 둘레 무인 가게(명단에서 찾은 곳) · 명단 시점 · 생존을 빌려 온 업종 이름 (같은 업종은 same에 유형의 셈으로) */
  un?: { u: UnType; own: number; near: number; nearSorted: ArrayLike<number>; found: number; when: string; survNm: string | null } | null
}

/** 칸 → 서울시 상권 · 행정동 번호(없으면 −1)와 이름(be/cells.json · be/places.json) · 분위 위치와 기준 연도(be/index.json meta) */
export interface RecBase {
  c2s: ArrayLike<number>
  c2d: ArrayLike<number>
  sangNm: readonly string[]
  dongNm: readonly string[]
  qs: number[]
  year: number
}

/** 견줄 서울시 업종 하나의 상권(S) · 행정동(D) 행 — 지역 번호 → [지역, 월매출(천 원), 가게 수, 하루 결제×10, 객단가(백 원)] (be/ind/<코드>.json) */
export interface RecRows {
  ind: RecInput['ind']
  S: ReadonlyMap<number, readonly number[]>
  D: ReadonlyMap<number, readonly number[]>
}

/** 이 칸의 이 동네 매출 — 칸이 서울시 상권 안이고 그 상권 값이 공개돼 있으면 상권, 아니면 행정동 (손익 점검 · 비교함과 같은 규칙). 둘 다 없으면 null */
export function recAt(i: number, b: RecBase, r: RecRows): RecInput | null {
  const si = b.c2s[i] ?? -1, di = b.c2d[i] ?? -1
  const s = si >= 0 ? rowOf(r.S.get(si)) : null
  const d = di >= 0 ? rowOf(r.D.get(di)) : null
  const p = s ? { level: '상권' as const, where: b.sangNm[si], x: s } : d ? { level: '행정동' as const, where: b.dongNm[di], x: d } : null
  return p ? { v: p.x.sales, n: p.x.n, level: p.level, where: p.where, ind: r.ind, qs: b.qs, year: b.year } : null
}

/** 손님 구성 행 — be/mix/<코드>.json의 S · D를 지역 번호로 */
export interface MixRows {
  year: number
  seoul: readonly number[] | null
  S: ReadonlyMap<number, readonly number[]>
  D: ReadonlyMap<number, readonly number[]>
}

/** 이 칸의 손님 구성 — recAt과 같은 규칙(상권 값이 있으면 상권, 아니면 행정동). 손익 자료와 같은 칸만 실려 있어 rec가 있으면 이것도 있다 */
export function mixAt(i: number, b: Pick<RecBase, 'c2s' | 'c2d'>, m: MixRows, level: '상권' | '행정동'): CardInput['mix'] {
  const r = level === '상권' ? m.S.get(b.c2s[i] ?? -1) : m.D.get(b.c2d[i] ?? -1)
  return r ? { row: mixRow(r), seoul: m.seoul ? mixSeoul(m.seoul) : null, year: m.year } : null
}

const FACTOR_TEXT = ['둘레에 사는 사람', '출근·등교로 오는 사람', '그 밖의 일로 오는 사람', '', ''] as const

/** '주변 가게 구성' 줄의 곁말 — 서울 칸 위치 대신, 구성이 이 업종 매출이 높던 상권 쪽인지 (배수 5% 안쪽은 비슷) */
export function mixSide(x: number): string {
  return x >= 1.05 ? '이 업종 매출이 높던 상권과 닮은 쪽' : x <= 0.95 ? '이 업종 매출이 낮던 상권과 닮은 쪽' : '평균적인 상권과 비슷'
}

/** 평균 상권을 1로 본 배수 — '2.2배' · '0.7배' · '12배' (0.05 아래는 '0.1배 미만') */
export function ratioText(x: number): string {
  if (x < 0.05) return '0.1배 미만'
  return x >= 10 ? `${Math.round(x)}배` : `${x.toFixed(1)}배`
}

/** 'm' → '400m' · '1.2km' (50m 단위) */
export function distText(m: number): string {
  return m < 1000 ? `${Math.max(50, Math.round(m / 50) * 50)}m` : `${(m / 1000).toFixed(1)}km`
}

/** 1층 임대료 천 원/㎡ → 3.3㎡(1평)당 '26.6만 원' */
export function pyText(v: number): string {
  return `${((v * 3.3058) / 10).toFixed(1)}만 원`
}

/** 오름차순에서 v 이하인 몫 — 위치 막대 (오른쪽일수록 높음) */
function posOf(sorted: ArrayLike<number>, v: number): number {
  return 1 - fracAbove(sorted, v)
}

function manyOrFew(up: number): string {
  return up <= 0.3 ? '이 많음' : up >= 0.7 ? '이 적음' : ''
}

export function buildCard(c: CardInput): CardModel {
  const [dong, gu] = c.dongKey.split('|')
  const tilt = c.site.tilt[c.i]
  const n300Up = fracAbove(c.n300Sorted, c.n300)
  const sub = [gu, c.station ? `${c.station.name}역 ${distText(c.station.m)}` : null].filter(Boolean).join(' · ')
  const lines: (string | null)[] = [placeText(c.n300, tilt, c.cuts)]
  const facts: Fact[] = []
  let why: CardModel['why'] = null
  let cmp: string | null = null
  let mix: MixView | null = null
  const trust: TrustItem[] = []
  const k = c.kind?.k ?? null

  if (k && c.kind) {
    const nm = k.nm, pnm = c.pot?.nm ?? nm // 매출 수준은 칠하는 업종 이름으로 (한식처럼 여러 소분류를 묶은 업종이 있다)
    const un = c.kind.depth.un ? c.un ?? null : null
    // ⓪ 이 동네 가게당 월매출 — 있으면 맨 앞 (무인 유형은 가맹 브랜드 값으로 말하므로 뺀다)
    const rec = un ? null : c.rec ?? null
    const baseWon = c.pot?.base ? won(c.pot.base / 10) : null
    if (rec) {
      const med = rec.ind.q[Math.max(0, rec.qs.indexOf(0.5))] / 10
      lines.push(recSentence(nm, won(rec.v), `${rec.level} ${rec.where}`, rec.n))
      facts.push({
        key: 'rec',
        label: `${nm} 가게당 월매출 (이 동네 · 카드 결제 기준)`,
        value: won(rec.v),
        sub: `${rec.level} ${rec.where} ${comma(rec.n)}곳 평균 · ${rec.year}년 · 서울 가운데 값 ${won(med)}`,
        pos: 1 - shareAbove(rec.ind, rec.qs, rec.v),
        wide: true,
      })
      const bundle = rec.ind.codes.length > 1 ? ` 상가정보 업종 ${rec.ind.codes.length}개를 묶은 값이에요.` : ''
      trust.push({
        mark: 'i',
        title: '이 동네 가게당 월매출은',
        text: `서울시 상권분석서비스의 '${rec.ind.nm}' 추정매출(${rec.year}년)을 그 ${rec.level}의 가게 수로 나눈 평균이에요 — 카드 결제액으로 만든 값이라 현금 · 계좌이체 · 배달앱 결제는 빠졌을 수 있어요.${bundle}`
          + (rec.level === '행정동' ? ' 이 칸은 서울시가 정한 상권 밖이라 행정동 평균을 보였어요 — 같은 동 안에서도 자리마다 달라요.' : '')
          + (rec.n < 5 ? ` 가게 ${comma(rec.n)}곳의 평균이라 한두 곳에 크게 흔들려요.` : ''),
      })
      // 손님 구성 — 같은 지역. 여러 업종을 묶은 서울시 업종이면 그 이름으로 견준다(묶은 값이라)
      if (c.mix) {
        const snm = rec.ind.codes.length > 1 ? `'${rec.ind.nm}'` : nm
        mix = mixView(c.mix.row, c.mix.seoul, snm, rec.level, rec.where, c.mix.year)
        if (rec.ind.codes.length > 1) mix.where += ` · 서울시 '${rec.ind.nm}' 업종(상가정보 ${rec.ind.codes.length}개 묶음) 값`
      }
    }
    // ① 매출 수준 — 무인 유형은 그 자리에 둘레 무인 가게
    const e = c.pot ? explainCell(c.pot.cells, c.pot.ix, c.i) : null
    if (un) {
      lines.push(unSentence(nm, un.near))
      facts.push({
        key: 'unm',
        label: '무인 가게 (이 칸 + 둘레)',
        value: `${nm} ${comma(un.near)}곳`,
        sub: un.near ? `이 칸 ${comma(un.own)}곳 · 명단에서 찾은 곳만` : '명단에서 찾은 곳이 둘레에 없어요',
        pos: posOf(un.nearSorted, un.near),
      })
      const u = un.u, m = u.money
      trust.push({
        mark: 'i',
        title: '매출은 가맹 브랜드 값',
        text: `${nm} 가맹점 평균 월매출은 ${u.brands.length > 1 ? `브랜드 ${u.brands.length}곳의 가운데 값` : `브랜드 한 곳(${u.brands[0]?.nm ?? '—'}) 값`}으로 ${won(m.sales[0])}이에요(정보공개서, 서울 전체) — 이 자리 값이 아니에요. 매물 숫자는 [손익 따져보기]에서 견줘요`,
      })
      trust.push({ mark: '!', title: '무인 가게는 명단에서 찾은 곳만', text: `서울시 무인점포 명단(${un.when}) ${comma(u.list)}곳 중 이름으로 상가정보에 붙인 ${comma(un.found)}곳만 칸에 놓았어요 — 빠진 곳이 있어요` })
    } else if (!c.kind.depth.pot || !c.pot) {
      lines.push(noPotSentence(nm))
      facts.push({ key: 'pot', label: `${nm} 매출 수준 (추정)`, value: '추정하지 않음', sub: '자리별 매출 수준이 없는 업종', pos: null, none: true })
    } else if (!e) {
      lines.push(potSentence(pnm, null))
      facts.push({ key: 'pot', label: `${pnm} 매출 수준 (추정)`, value: '칠하지 않음', sub: '가게가 드문 곳', pos: null, none: true })
    } else {
      lines.push(potSentence(pnm, e.pct, rec ? null : baseWon)) // 금액이 앞에 있으면 기준 금액은 되풀이하지 않는다
      facts.push({ key: 'pot', label: `${pnm} 매출 수준 (추정)`, value: levelText(e.pct), sub: upText(e.up), pos: 1 - e.up })
      const sides = [c.site.rr[c.i], c.site.rw[c.i], c.site.ro[c.i]].map((r) => upOf(r, c.n))
      const rows = byInfluence(e.factors).map((f) => {
        if (f.j === 3) return { text: `반경 300m 가게 ${comma(c.n300)}곳`, side: `서울 칸 ${sideText(n300Up)}`, x: times(f.x) }
        if (f.j === 4) return { text: '주변 가게 구성 (음식 · 소매 · 교육 · 보건 등 일곱 묶음)', side: mixSide(f.x), x: times(f.x) }
        return { text: `${FACTOR_TEXT[f.j]}${manyOrFew(sides[f.j])}`, side: `서울 칸 ${sideText(sides[f.j])}`, x: times(f.x) }
      })
      const prod = e.factors.reduce((a, f) => a * f.x, 1)
      // 재료를 곱한 값이 배운 상권의 범위를 넘으면 끝값으로 말한다 (v3.1 — 재료 하나하나는 범위 안이어도 함께 치우친 조합은 배운 적이 없다)
      const end = e.joint && c.pot.span ? `(${times(c.pot.span[e.joint === 'high' ? 1 : 0] / 100)})` : ''
      const cut = e.joint === 'high' ? `다섯을 곱한 값(${times(prod)})이 모형이 배운 상권의 가장 높은 값${end}을 넘어, 그 끝값으로 말해요`
        : e.joint === 'low' ? `다섯을 곱한 값(${times(prod)})이 모형이 배운 상권의 가장 낮은 값${end}에 못 미쳐, 그 끝값으로 말해요`
        : '다섯 배수를 곱한 값을 10% 단위로 둥글게 말해요'
      why = {
        intro: `매출 수준은 칸 둘레의 사람과 가게 다섯 가지로 추정해요. 이 칸에서는 이렇게 작용했어요.${baseWon ? ` 기준(×1.00)인 서울 평균 상권은 가게당 월 ${baseWon}쯤이에요.` : ''}`,
        rows,
        total: times(prod),
        note: `카드에는 '${levelText(e.pct)}' — ${cut}`,
      }
      trust.push({
        mark: '중',
        title: `모형의 힘: ${strength(c.pot.rho)}`,
        text: cardScore(pnm, c.pot.rho, c.pot.hit),
      })
      const outs = [...e.clamped, ...(e.joint ? [`재료를 곱한 값이 학습한 상권보다 ${e.joint === 'high' ? '높음' : '낮음'}`] : [])]
      trust.push(
        outs.length
          ? { mark: '!', title: '학습한 범위 밖', text: `${outs.join(' · ')} — 모형이 배운 가장 끝 상권 수준으로 계산했어요` }
          : { mark: '✓', title: '학습한 범위 안', text: '이 칸의 다섯 가지와 곱한 값 모두 모형이 배운 상권들 사이에 있어요' },
      )
      // 이 동네 값과 추정을 같은 잣대(평균 상권 = 1)로 — 늘 보이고, 한쪽은 10% 넘게 높은데 다른 쪽은 10% 넘게 낮으면 따로 알린다
      if (rec && c.pot.base) {
        const rr = rec.v / (c.pot.base / 10), er = 1 + e.pct / 100
        cmp = `서울 평균 상권(가게당 월 ${baseWon})을 1로 보면 이 동네 값 ${ratioText(rr)} · 추정 ${ratioText(er)}`
        if ((rr >= 1.1 && er <= 0.9) || (rr <= 0.9 && er >= 1.1))
          trust.push({
            mark: '!',
            title: '이 동네 값과 추정이 반대로 말해요',
            text: `서울 평균 상권과 견주면 이 동네 값은 ${rr > 1 ? '높은데' : '낮은데'}(${ratioText(rr)}) 추정은 ${er > 1 ? '높아요' : '낮아요'}(${ratioText(er)}). 이 동네 값은 지금 있는 가게들의 평균이고, 추정은 둘레의 사람과 가게로 본 자리 수준이에요 — 다르면 이 동네 값을 먼저 보세요.`
              + (rec.level === '행정동' ? ' 다만 행정동 평균이라 이 칸과는 다를 수 있어요.' : ''),
          })
      }
    }
    const cap = c.pot?.cap ?? (rec ? { cap: rec.ind.cap, capnote: rec.ind.capnote } : null)
    if (cap && cap.cap === 'low' && (rec || (c.kind.depth.pot && e))) trust.push({ mark: '!', title: '카드 결제로 만든 추정매출', text: cap.capnote })
    if (c.pot?.note) trust.push({ mark: '!', title: `${pnm} 값을 읽을 때`, text: c.pot.note })

    // ② 1층 임대료 — 한국부동산원 조사 상권 72곳만 (행정동 임대시세는 공개판에 없다, W7.8)
    if (c.reb && c.reb.v != null) {
      lines.push(rentSentence(c.reb.v, c.reb.sorted))
      facts.push({ key: 'rent', label: '1층 임대료 (3.3㎡당)', value: pyText(c.reb.v), sub: `${c.reb.name} · 한국부동산원 조사 상권`, pos: posOf(c.reb.sorted, c.reb.v) })
    } else {
      facts.push({ key: 'rent', label: '1층 임대료', value: '—', sub: '조사 상권(서울 72곳) 밖이에요', pos: null, none: true })
    }

    // ③ 같은 업종 (이 칸 + 둘레) — 무인 유형은 그 유형과 손님을 나누는 가게
    if (c.same) {
      const p = posOf(c.same.nearSorted, c.same.near)
      const snm = un ? UN_SAME[un.u.t] ?? nm : nm
      facts.push({
        key: 'same',
        label: '같은 업종 (이 칸 + 둘레)',
        value: `${snm} ${comma(c.same.near)}곳`,
        sub: c.same.near ? `이 칸 ${comma(c.same.own)}곳 · 손님을 나눠 가져요` : '둘레에 같은 업종이 없어요',
        pos: p,
      })
      if (c.same.near && fracAbove(c.same.nearSorted, c.same.near) < 0.1)
        trust.push(
          un
            ? { mark: '!', title: '같은 업종이 많아요', text: `둘레 ${snm} ${comma(c.same.near)}곳 — 무인이든 아니든 손님을 나눠 가져요` }
            : { mark: '!', title: '같은 업종이 많아요', text: `둘레 ${nm} ${comma(c.same.near)}곳 — 매출 수준은 이 가게들이 손님을 이미 나눠 가진 뒤의 가게당 값이에요` },
        )
    }

    // ④ 새 가게 1년 생존 (업종 값) — 무인 유형은 그 유형이 주로 실린 업종 값 (같은 코드 안에서 무인이 더 빨리 닫지 않는다, §5.16)
    const svn = un?.survNm ?? nm
    facts.push(
      k.s12
        ? { key: 'surv', label: `새 가게 1년 생존 (${svn}, 서울)`, value: survText(k), sub: un ? '무인만 따로 세지 않은 업종 값' : '이 자리 값이 아니라 업종 값', pos: posOf(c.kind.s12Sorted, k.s12[0]) }
        : { key: 'surv', label: `새 가게 1년 생존 (${svn}, 서울)`, value: '—', sub: '원천 기록이 한꺼번에 바뀐 업종이라 쓰지 않아요', pos: null, none: true },
    )
  }
  trust.push({ mark: '!', title: '칸 안에서도 차이가 커요', text: '골목·층·간판에 따라 달라요. 칸 값은 둘레의 평균적인 자리를 말해요' })

  return {
    title: dong,
    sub,
    line: oneLine(lines),
    facts,
    n300: `반경 300m 가게 ${comma(c.n300)}곳 (서울 칸 ${rankText(n300Up)})`,
    cmp,
    why,
    mix,
    links: c.at ? outLinks(c.at.lat, c.at.lng, c.at.bd) : [],
    trust,
    foot: facts.some((f) => f.key === 'rec')
      ? why
        ? '가게당 월매출은 서울시가 카드 결제로 만든 추정매출이고, 매출 수준은 상권 단위로 배운 관계를 칸에 옮긴 추정이에요 — 둘 다 실제 매출 그대로가 아니에요.'
        : '가게당 월매출은 서울시가 카드 결제로 만든 추정매출이에요 — 같은 칸 안에서도 골목 · 층 · 간판에 따라 달라요.'
      : why
        ? '추정값이에요 — 실제 매출이 아니라, 상권 단위로 배운 관계를 칸에 옮긴 것입니다.'
        : '숫자는 공공데이터를 칸에 모은 값이에요 — 같은 칸 안에서도 골목 · 층 · 간판에 따라 달라요.',
  }
}

/** 업종을 고르지 않았을 때 숫자 넷 자리에 두는 안내 */
export const PICK_HINT = '업종을 고르면 이 동네 가게당 월매출 · 매출 수준 · 1층 임대료 · 같은 업종 · 새 가게 생존이 나와요'
