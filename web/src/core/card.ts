// 자리 카드 — 칸 하나를 고른 업종으로 읽어 화면에 넣을 글자와 위치를 만든다 (마스터플랜 W7.4 '자리 카드', 와이어프레임 T2e·T2f).
// 제목(동 · 가까운 역) → 한 줄 요약 → 숫자 넷(매출 수준 · 1층 임대료 · 같은 업종(이 칸 + 둘레) · 새 가게 1년 생존) → 왜 이 값인가 → 얼마나 믿을 수 있나.
// 위치 막대(pos)는 서울 안 위치 — 0이 가장 낮고 1이 가장 높다. 화면(React)은 이 모양을 그리기만 한다.
// 무인 유형(무인매장 묶음)은 매출 수준 자리에 '무인 가게(이 칸 + 둘레)'를 둔다 — 매출은 가맹 브랜드 값이라 자리 값이 아니다(core/unm.ts)
import { fracAbove } from './candidates'
import { comma, rankText } from './format'
import { type Kind, type KindDepth, survText } from './kinds'
import { levelText, strength } from './level'
import { type IndCells, type PotIndex, byInfluence, explainCell, times, upText } from './potential'
import { type SiteCuts, type SiteData, placeText, sideText, upOf } from './site'
import { noPotSentence, oneLine, potSentence, rentSentence } from './summary'
import { type UnType, UN_SAME, unSentence } from './unm'
import { won } from './check'

export interface Fact {
  key: 'pot' | 'unm' | 'rent' | 'same' | 'surv'
  label: string
  value: string
  sub: string
  /** 서울 안 위치 0~1 (오른쪽일수록 높음), 견줄 것이 없으면 null */
  pos: number | null
  /** 값이 없음 — 흐리게 */
  none?: boolean
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
  why: { intro: string; rows: WhyRow[]; total: string; note: string } | null
  trust: TrustItem[]
  /** 카드 맨 아래 한 줄 — 매출 수준이 있으면 추정값이라고, 없으면 칸에 모은 값이라고 */
  foot: string
}

/** 매출 수준을 칠하는 업종의 자료 — ind/index.json 한 줄 · ind/<업종>.json · potIndex · 손익 자료의 결제 포착 판정 */
export interface PotInput {
  nm: string
  rho: number
  note?: string
  cells: IndCells
  ix: PotIndex
  cap?: { cap: 'ok' | 'low' | 'unk'; capnote: string } | null
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
  /** 무인 유형 — 둘레 무인 가게(명단에서 찾은 곳) · 명단 시점 · 생존을 빌려 온 업종 이름 (같은 업종은 same에 유형의 셈으로) */
  un?: { u: UnType; own: number; near: number; nearSorted: ArrayLike<number>; found: number; when: string; survNm: string | null } | null
}

const FACTOR_TEXT = ['둘레에 사는 사람', '출근·등교로 오는 사람', '그 밖의 일로 오는 사람', ''] as const

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
  const trust: TrustItem[] = []
  const k = c.kind?.k ?? null

  if (k && c.kind) {
    const nm = k.nm, pnm = c.pot?.nm ?? nm // 매출 수준은 칠하는 업종 이름으로 (한식처럼 여러 소분류를 묶은 업종이 있다)
    const un = c.kind.depth.un ? c.un ?? null : null
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
      lines.push(potSentence(pnm, e.pct))
      facts.push({ key: 'pot', label: `${pnm} 매출 수준 (추정)`, value: levelText(e.pct), sub: upText(e.up), pos: 1 - e.up })
      const sides = [c.site.rr[c.i], c.site.rw[c.i], c.site.ro[c.i]].map((r) => upOf(r, c.n))
      const rows = byInfluence(e.factors).map((f) => {
        if (f.j === 3) return { text: `반경 300m 가게 ${comma(c.n300)}곳`, side: `서울 칸 ${sideText(n300Up)}`, x: times(f.x) }
        return { text: `${FACTOR_TEXT[f.j]}${manyOrFew(sides[f.j])}`, side: `서울 칸 ${sideText(sides[f.j])}`, x: times(f.x) }
      })
      const prod = e.factors.reduce((a, f) => a * f.x, 1)
      why = {
        intro: '매출 수준은 칸 둘레의 사람과 가게 네 가지로 추정해요. 이 칸에서는 이렇게 작용했어요.',
        rows,
        total: times(prod),
        note: `카드에는 '${levelText(e.pct)}' — 네 배수를 곱한 값을 10% 단위로 둥글게 말해요`,
      }
      trust.push({
        mark: '중',
        title: `모형의 힘: ${strength(c.pot.rho)}`,
        text: `처음 보는 구에서 상권 매출 순서를 맞힌 정도 ${c.pot.rho.toFixed(2)} (1이면 완벽, 0이면 운). 여러 자리를 견주는 데 쓰세요`,
      })
      trust.push(
        e.clamped.length
          ? { mark: '!', title: '학습한 범위 밖', text: `${e.clamped.join(' · ')} — 모형이 배운 가장 끝 상권 수준으로 계산했어요` }
          : { mark: '✓', title: '학습한 범위 안', text: '이 칸의 네 가지 모두 모형이 배운 상권들 사이에 있어요' },
      )
      if (c.pot.cap && c.pot.cap.cap === 'low') trust.push({ mark: '!', title: '카드 결제로 만든 추정매출', text: c.pot.cap.capnote })
    }
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
    why,
    trust,
    foot: why
      ? '추정값이에요 — 실제 매출이 아니라, 상권 단위로 배운 관계를 칸에 옮긴 것입니다.'
      : '숫자는 공공데이터를 칸에 모은 값이에요 — 같은 칸 안에서도 골목 · 층 · 간판에 따라 달라요.',
  }
}

/** 업종을 고르지 않았을 때 숫자 넷 자리에 두는 안내 */
export const PICK_HINT = '업종을 고르면 매출 수준 · 1층 임대료 · 같은 업종 · 새 가게 생존이 나와요'
