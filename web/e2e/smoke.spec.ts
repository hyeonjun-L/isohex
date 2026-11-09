import { expect, test, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { cellToLatLng } from 'h3-js'
import { buildPlaceIndex, findPlace, placeGrid, type StationData } from '../src/core/places'
import { rowValue, type BeRow } from '../src/core/breakeven'
import { CHECK_DEFAULT, type BeInd, type BeMeta, type CheckInputs, beFor, runCheck, won } from '../src/core/check'
import { type KindsData, kindIndex } from '../src/core/kinds'
import { type UnmData, runUn, unDefaults, unSide } from '../src/core/unm'

// 자료를 시험 쪽에서 따로 읽어 화면 값과 견준다
const ROOT = new URL('../public/data/', import.meta.url)
const { ver } = JSON.parse(readFileSync(new URL('latest.json', ROOT), 'utf8')) as { ver: string }
const read = <T,>(p: string) => JSON.parse(readFileSync(new URL(`${ver}/${p}`, ROOT), 'utf8')) as T
const cells = read<{ h3: string[]; dong: number[]; n300: number[] }>('cells.json')
const dongs = read<string[]>('dongs.json')
const index = read<{ k: string; nm: string; paint: boolean; rho: number; note?: string }[]>('ind/index.json')

// 배경지도(브이월드)는 해외 CI에서 열리지 않는다 — 기다리지 않게 미리 끊는다
test.beforeEach(async ({ page }) => {
  await page.route('https://api.vworld.kr/**', (r) => r.abort())
})

async function mapReady(page: Page) {
  await page.waitForFunction(() => window.__jeomji?.map?.loaded() && !!window.__jeomji.map.getSource('cells'), null, { timeout: 45_000 })
  await page.waitForFunction(() => {
    const m = window.__jeomji!.map
    return m.querySourceFeatures('cells').length > 0
  })
}

/** 칸 중심을 화면 좌표로 바꿔 누른다 */
async function clickCell(page: Page, h3: string) {
  const [lat, lng] = cellToLatLng(h3)
  await page.evaluate(([lng, lat]) => window.__jeomji!.map.jumpTo({ center: [lng, lat], zoom: 14 }), [lng, lat])
  await page.waitForFunction(() => window.__jeomji!.map.loaded())
  const pt = await page.evaluate(([lng, lat]) => {
    const p = window.__jeomji!.map.project([lng, lat])
    const r = window.__jeomji!.map.getCanvas().getBoundingClientRect()
    return { x: r.left + p.x, y: r.top + p.y }
  }, [lng, lat])
  // 폰(터치) 설정에서는 눌러 보기로, 데스크톱은 마우스로
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(pt.x, pt.y)
  else await page.mouse.click(pt.x, pt.y)
}

test('첫 화면 — 질문 셋 · 지도와 칸 8,322개 · 업종 목록, 동네 보기로', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await mapReady(page)
  expect(await page.evaluate(() => window.__jeomji!.cellCount)).toBe(cells.h3.length)
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.getByTestId('home').locator('.q-card')).toHaveCount(3)
  // 업종 고르기 — 상가정보 소분류 247개 + 무인매장 묶음 6종
  await page.getByTestId('kind-btn').click()
  await expect(page.getByTestId('kind-picker').locator('.kind-row')).toHaveCount(247 + 6)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('kind-picker')).toHaveCount(0)
  await page.getByTestId('tab-map').click()
  await expect(page.getByText('가게가 모인 정도 — 반경 300m 가게 수')).toBeVisible()
  await expect(page).toHaveURL(/mode=map/)
  // 새로고침해도 동네 보기, 이름을 누르면 처음 화면
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('brand').click()
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page).not.toHaveURL(/mode=/)
  expect(errors).toEqual([])
})

test('첫 화면 찾기 — 업종 이름이면 그 업종 지도, 동 이름이면 그 자리 카드', async ({ page }) => {
  await page.goto('/')
  await mapReady(page)
  await page.getByTestId('home-search').fill('카페')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/kind=I21201/)
  await expect(page.getByTestId('legend-title')).toHaveText('카페 매출 수준(추정) — 서울 이 업종 평균 상권 대비')
  await page.getByTestId('brand').click()
  await page.getByTestId('home-search').fill('망원1동')
  await page.getByRole('button', { name: /망원1동 \(마포구\)/ }).click()
  await expect(page.getByRole('heading', { name: '망원1동' })).toBeVisible()
  await expect(page.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'true')
  // 바로 가기
  await page.getByTestId('brand').click()
  await page.getByTestId('home').getByRole('button', { name: '셀프 빨래방' }).click()
  await expect(page).toHaveURL(/kind=S20902/)
  await expect(page.getByTestId('legend-title')).toHaveText('같은 업종 — 이 칸과 둘레 6칸의 셀프 빨래방 가게 수')
})

test('예시로 보기 — 시청역 · 자동차 30분 · 카페 → 1번 후보 카드 → 끝', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await mapReady(page)
  await page.getByTestId('example').click()
  const tour = page.getByTestId('tour')
  await expect(tour).toContainText('예시로 보기 1/3')
  await expect(page.getByTestId('cand-list').locator('li')).toHaveCount(20, { timeout: 60_000 })
  await expect(tour).toContainText('20곳을 뽑았어요')
  await expect(page).toHaveURL(/kind=I21201/)
  await expect(page).toHaveURL(/mode=find/)
  await page.getByTestId('tour-next').click()
  await expect(tour).toContainText('예시로 보기 2/3')
  await expect(page.getByTestId('find-ctx')).toContainText('후보 1 · 자동차')
  await page.getByTestId('tour-next').click()
  await expect(tour).toContainText('예시로 보기 3/3')
  await expect(page.getByTestId('cand-list')).toBeVisible()
  await page.getByTestId('tour-next').click()
  await expect(tour).toHaveCount(0)
})

test('폰 아래 시트 — 처음 화면은 크게, 손잡이로 지도 크게 → 반 → 크게', async ({ page, isMobile }) => {
  test.skip(!isMobile, '폰에서만')
  await page.goto('/')
  await mapReady(page)
  const panel = page.locator('.panel')
  await expect(panel).toHaveClass(/sheet-full/)
  const h = async () => (await panel.boundingBox())!.height
  const full = await h()
  await page.getByTestId('sheet-handle').click()
  await expect(panel).toHaveClass(/sheet-peek/)
  const peek = await h()
  await page.getByTestId('sheet-handle').click()
  await expect(panel).toHaveClass(/sheet-half/)
  const half = await h()
  expect(peek).toBeLessThan(half)
  expect(half).toBeLessThan(full)
  // 지도 여백이 시트를 따른다 (아래 여백 = 지도 높이 × 몫 + 8)
  const pad = await page.evaluate(() => window.__jeomji!.map.getPadding().bottom ?? 0)
  const mh = await page.evaluate(() => window.__jeomji!.map.getContainer().clientHeight)
  expect(Math.abs(pad - (Math.round(mh * 0.44) + 8))).toBeLessThanOrEqual(1)
  // 동네 보기로 가면 반
  await page.getByTestId('sheet-handle').click()
  await page.getByTestId('tab-map').click()
  await expect(panel).toHaveClass(/sheet-half/)
})


test('칸을 누르면 행정동과 가게 수, 업종을 고르면 매출 수준', async ({ page }) => {
  // 가게가 많은 칸 하나 (카페가 칠해지는 칸)
  const cafe = index.find((d) => d.nm === '카페')!
  const v = read<{ v: (number | null)[] }>(`ind/${cafe.k}.json`).v
  let i = 0
  for (let j = 0; j < v.length; j++) if (v[j] != null && cells.n300[j] > cells.n300[i]) i = j
  const [dong, gu] = dongs[cells.dong[i]].split('|')

  await page.goto('/?kind=I21201') // 카페 (상가정보 소분류)
  await mapReady(page)
  await clickCell(page, cells.h3[i])
  await expect(page.getByRole('heading', { name: dong })).toBeVisible()
  await expect(page.getByTestId('card-sub')).toContainText(gu)
  await expect(page.getByTestId('n300')).toHaveText(`${cells.n300[i].toLocaleString('ko-KR')}곳`)
  const pct = v[i]! / 10
  const ratio = 1 + pct / 100
  const want = pct >= 95 ? `${(Math.round(ratio * 10) / 10).toFixed(1)}배` : pct >= 10 ? `${Math.round(pct / 10) * 10}% 높음` : pct <= -10 ? `${Math.round(-pct / 10) * 10}% 낮음` : '비슷함'
  await expect(page.getByTestId('level')).toHaveText(want)
  // 한 줄 요약 · 숫자 넷
  await expect(page.getByTestId('oneline')).toContainText('카페 매출 수준은 서울 평균 상권')
  for (const k of ['pot', 'rent', 'same', 'surv']) await expect(page.getByTestId(`fact-${k}`)).toBeVisible()
  // 주소에 상태가 남는다
  await expect(page).toHaveURL(new RegExp(`cell=${cells.h3[i]}`))
  await expect(page).toHaveURL(/kind=I21201/)
  // 기둥은 고른 칸 하나에만 — 모든 칸에 높이 0으로 두면 납작한 면이 서울 전체를 기둥 색으로 덮는다 (11-03에 고침)
  const pillar = await page.evaluate(async () => {
    const m = window.__jeomji!.map
    const src = m.getSource('sel') as unknown as { getData: () => Promise<{ features: { id?: number | string }[] }> }
    return { src: m.getLayer('cells-pillar')!.source, ids: (await src.getData()).features.map((f) => Number(f.id)) }
  })
  expect(pillar).toEqual({ src: 'sel', ids: [i] })
})

test('동네 보기 지표 칩 — 업종을 고르면 넷, 바꾸면 범례 · 칸 색 · 주소가 따라간다', async ({ page }) => {
  const reb = read<{ cell: number[] }>('reb/index.json')
  const cafe = read<{ v: (number | null)[] }>(`ind/${index.find((d) => d.nm === '카페')!.k}.json`).v
  const inside = reb.cell.findIndex((r) => r >= 0)
  const outside = reb.cell.findIndex((r, i) => r < 0 && cafe[i] != null) // 매출 수준으로는 칠하고 임대료로는 비우는 칸
  const state = (i: number) => page.evaluate((id) => window.__jeomji!.map.getFeatureState({ source: 'cells', id }).c as number, i)

  // 업종을 고르기 전 — 가게 수 · 1층 임대료 (처음 화면에는 칩이 없다 — 동네 보기에서)
  await page.goto('/?mode=map')
  await mapReady(page)
  await expect(page.locator('.show-chip')).toHaveCount(2)
  await expect(page.getByTestId('show-store')).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/?kind=I21201') // 카페
  await mapReady(page)
  await expect(page.locator('.show-chip')).toHaveCount(4)
  await expect(page.getByTestId('show-pot')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('legend-title')).toHaveText('카페 매출 수준(추정) — 서울 이 업종 평균 상권 대비')
  await expect.poll(() => state(outside)).toBeGreaterThanOrEqual(0)
  // 1층 임대료 — 조사 상권 안 칸만 칠한다
  await page.getByTestId('show-rent').click()
  await expect(page.getByTestId('legend-title')).toHaveText('1층 임대료 — 3.3㎡(1평)당 한 달')
  await expect(page).toHaveURL(/show=rent/)
  await expect.poll(() => state(outside)).toBe(-1)
  expect(await state(inside)).toBeGreaterThanOrEqual(0)
  // 같은 업종 — 카페 둘레 단계
  await page.getByTestId('show-same').click()
  await expect(page.getByTestId('legend-title')).toHaveText('같은 업종 — 이 칸과 둘레 6칸의 카페 가게 수')
  await expect(page.getByTestId('legend')).toContainText('60곳 이상')
  await expect(page).toHaveURL(/show=same/)
  await expect.poll(() => state(outside)).toBeGreaterThanOrEqual(0) // 0곳도 칠한다('없음')
  // 새로고침해도 같은 지표
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('show-same')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('show-entry').click()
  await expect(page.getByTestId('legend-title')).toHaveText('새 가게 — 이 칸과 둘레 6칸에 새로 생긴 카페')
  // 기본(매출 수준)으로 돌아오면 주소에서 빠진다
  await page.getByTestId('show-pot').click()
  await expect(page.getByTestId('legend-title')).toHaveText('카페 매출 수준(추정) — 서울 이 업종 평균 상권 대비')
  await expect(page).not.toHaveURL(/show=/)
})

test('후보 찾기 — 시청역 예시에서 차 30분 카페: 깔때기 · 20곳 · 경계선 · 번호, 바꾸면 주소에 남는다', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?kind=I21201&mode=find')
  await mapReady(page)
  const list = page.getByTestId('cand-list').locator('li')
  await expect(list).toHaveCount(20, { timeout: 60_000 })
  await expect(page.getByTestId('base-now')).toContainText('예시(시청역)')
  const funnel = page.getByTestId('funnel')
  await expect(funnel).toContainText('자동차 30분 안에 닿는 칸3,378칸')
  await expect(funnel).toContainText('그중 카페 자리와 비슷한 칸')
  await expect(funnel).toContainText('20곳')
  // 지도 — 번호 20개 · 경계선 · 기준점 · OSM 출처
  await expect(page.locator('.cand-no')).toHaveCount(20)
  await expect(page.locator('.base-pt')).toHaveCount(1)
  expect(await page.evaluate(() => window.__jeomji!.map.getLayoutProperty('iso-line', 'visibility'))).toBe('visible')
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap contributors')
  await expect(page.getByTestId('find')).toContainText('OpenStreetMap contributors (ODbL)')
  // 후보를 누르면 카드 맨 위에 '왜 후보인가'
  await list.first().getByRole('button').click()
  await expect(page.getByTestId('find-ctx')).toContainText(/^후보 1 · 자동차 \d+분/)
  await expect(page.getByTestId('find-ctx')).toContainText('1번째예요')
  await expect(page.locator('.cand-no.on')).toHaveText('1')
  await page.getByRole('button', { name: '후보 목록으로' }).click()
  await expect(list).toHaveCount(20)
  // 대중교통 · 출근 · 같은 업종 상한 — 주소에 남고 새로고침해도 같다
  await page.getByTestId('by-pt').click()
  await expect(funnel).toContainText('대중교통 30분 안에 닿는 칸', { timeout: 30_000 })
  await page.getByRole('button', { name: '출근' }).click()
  await page.locator('.opts > summary').click()
  await page.getByTestId('comp').selectOption('19')
  await expect(funnel).toContainText('그중 같은 업종이 19곳 이하인 칸')
  await expect(page.getByTestId('opts-sum')).toContainText('같은 업종 19곳 이하')
  await expect(page).toHaveURL(/mode=find/)
  await expect(page).toHaveURL(/by=pt/)
  await expect(page).toHaveURL(/at=am/)
  await expect(page).toHaveURL(/comp=19/)
  const before = (await funnel.textContent())!
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('cand-list').locator('li').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('funnel')).toHaveText(before)
  // 동네 보기로 돌아가면 시간 띠 · 번호가 사라진다
  await page.getByTestId('tab-map').click()
  await expect(page.locator('.cand-no')).toHaveCount(0)
  await expect(page).not.toHaveURL(/mode=find/)
  expect(await page.evaluate(() => window.__jeomji!.map.getLayoutProperty('iso-line', 'visibility'))).toBe('none')
})

test('후보 찾기 — 동 이름으로 기준점, 지도에서 찍기, 카드의 \'여기서 후보 찾기\'', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?kind=I21201&mode=find')
  await mapReady(page)
  await expect(page.getByTestId('cand-list').locator('li')).toHaveCount(20, { timeout: 60_000 })
  // 이름으로 찾기
  await page.getByTestId('base-search').fill('망원1동')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('base-now')).toHaveText('기준점: 망원1동 (마포구)')
  const mw = dongs.indexOf('망원1동|마포구')
  const places = buildPlaceIndex(placeGrid(cells), dongs, read<StationData>('places/stations.json'))
  await expect(page).toHaveURL(new RegExp(`from=${cells.h3[findPlace(places, '망원1동').e!.cell]}`))
  await expect(page.getByTestId('funnel')).toContainText('자동차 30분 안에 닿는 칸')
  // 지도에서 찍기 — 후보가 아닌 칸 하나 (번호 표시가 가리지 않게)
  const taken = new Set(await page.locator('.cand-no').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.i))))
  const target = cells.dong.findIndex((d, i) => d === mw && !taken.has(i) && cells.n300[i] > 50)
  await page.getByTestId('pick-btn').click()
  await clickCell(page, cells.h3[target])
  await expect(page).toHaveURL(new RegExp(`from=${cells.h3[target]}`))
  await expect(page.getByTestId('pick-btn')).toHaveAttribute('aria-pressed', 'false')
  // 동네 보기 카드에서 '여기서 후보 찾기'
  await page.getByTestId('tab-map').click()
  await clickCell(page, cells.h3[target])
  await page.getByTestId('find-here').click()
  await expect(page.getByTestId('tab-find')).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(new RegExp(`from=${cells.h3[target]}`))
  await expect(page.getByTestId('base-now')).toContainText('기준점:')
})

test('공유 주소로 열면 그 칸으로 가서 패널에 가리지 않게 보여 준다', async ({ page }) => {
  // 기본 화면 가운데(중구)에서 먼 노원구 칸
  const cafe = index.find((d) => d.nm === '카페')!
  const v = read<{ v: (number | null)[] }>(`ind/${cafe.k}.json`).v
  let i = -1
  for (let j = 0; j < v.length; j++) {
    if (v[j] == null || !dongs[cells.dong[j]].endsWith('|노원구')) continue
    if (i < 0 || cells.n300[j] > cells.n300[i]) i = j
  }
  const [dong] = dongs[cells.dong[i]].split('|')
  const [lat, lng] = cellToLatLng(cells.h3[i])

  await page.goto(`/?kind=I21201&cell=${cells.h3[i]}`)
  await mapReady(page)
  await expect(page.getByRole('heading', { name: dong })).toBeVisible()
  const seen = await page.evaluate(([lng, lat]) => {
    const m = window.__jeomji!.map
    const p = m.project([lng, lat])
    const { top = 0, right = 0, bottom = 0, left = 0 } = m.getPadding()
    const { clientWidth: w, clientHeight: h } = m.getContainer()
    return { inside: p.x >= left && p.x <= w - right && p.y >= top && p.y <= h - bottom, zoom: m.getZoom() }
  }, [lng, lat])
  expect(seen.inside).toBe(true)
  expect(seen.zoom).toBeGreaterThanOrEqual(13)
})

test('위에서 보기 단추가 기울임을 0으로', async ({ page }) => {
  await page.goto('/')
  await mapReady(page)
  expect(await page.evaluate(() => window.__jeomji!.map.getPitch())).toBeGreaterThan(20)
  await page.getByRole('button', { name: '위에서 보기' }).click()
  await page.waitForFunction(() => window.__jeomji!.map.getPitch() < 0.5)
  await expect(page).toHaveURL(/view=top/)
})

test('줌 15에서 3D 건물이 뜨고 높이가 들어 있다', async ({ page }) => {
  await page.goto('/')
  await mapReady(page)
  // 서울시청 둘레, 위에서 — 줌 15 타일만 받게
  await page.evaluate(() => window.__jeomji!.map.jumpTo({ center: [126.978, 37.5665], zoom: 15.5, pitch: 0, bearing: 0 }))
  await page.waitForFunction(() => {
    const m = window.__jeomji!.map
    return !!m.getLayer('bldg') && m.querySourceFeatures('bldg', { sourceLayer: 'b' }).length > 100
  }, null, { timeout: 30_000 })
  const hs = await page.evaluate(() =>
    window.__jeomji!.map.querySourceFeatures('bldg', { sourceLayer: 'b' }).slice(0, 200).map((f) => f.properties.h as number),
  )
  expect(hs.every((h) => Number.isInteger(h) && h >= 2 && h <= 600)).toBe(true)
  expect(Math.max(...hs)).toBeGreaterThan(20) // 도심이라 높은 건물이 있다
  // 기본 모양(11-02 정함) — 건물을 바닥 칸 색으로 물들이고(식 = 배열) 진하게(0.5)
  expect(await page.evaluate(() => Array.isArray(window.__jeomji!.map.getPaintProperty('bldg', 'fill-extrusion-color')))).toBe(true)
  expect(await page.evaluate(() => window.__jeomji!.map.getPaintProperty('bldg', 'fill-extrusion-opacity'))).toBe(0.5)
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('국토교통부 GIS건물통합정보')
})

test('시안 비교(?proto=1) — 기본(칸 색 · 진하게)에서 회색 · 옅게로 바꾸면 주소에 남는다, 고른 칸에 기둥', async ({ page }) => {
  await page.goto('/?proto=1')
  await mapReady(page)
  await expect(page.getByTestId('proto')).toBeVisible()
  await page.evaluate(() => window.__jeomji!.map.jumpTo({ center: [126.978, 37.5665], zoom: 15.5, pitch: 0, bearing: 0 }))
  await page.waitForFunction(() => !!window.__jeomji!.map.getLayer('bldg'))
  // 칸 색 물들이기는 식(배열), 회색은 색 하나(문자열)
  await page.waitForFunction(() => Array.isArray(window.__jeomji!.map.getPaintProperty('bldg', 'fill-extrusion-color')))
  await page.getByRole('radio', { name: '회색' }).click()
  await page.waitForFunction(() => typeof window.__jeomji!.map.getPaintProperty('bldg', 'fill-extrusion-color') === 'string')
  await expect(page.getByRole('radio', { name: '진하게' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: '옅게' }).click()
  await page.waitForFunction(() => window.__jeomji!.map.getPaintProperty('bldg', 'fill-extrusion-opacity') === 0.2)
  await expect(page).toHaveURL(/proto=1/)
  await expect(page).toHaveURL(/bldg=gray/)
  await expect(page).toHaveURL(/bop=0\.2/)
  expect(await page.evaluate(() => !!window.__jeomji!.map.getLayer('cells-pillar'))).toBe(true)
})

test('이동 시간 일꾼 — 시청에서 차로 30분 안 칸 (시안 비교판)', async ({ page }) => {
  await page.goto('/?proto=1')
  await page.waitForFunction(() => !!window.__jeomjiTravel, null, { timeout: 45_000 })
  const r = await page.evaluate(async () => {
    const c = await window.__jeomjiTravel!()
    const cells = await c.ready
    const t = await c.times('car', 6570, 'day') // 6570 = 서울시청(소공동)
    let n = 0
    for (const x of t) if (x <= 1800) n++
    return { cells, n, len: t.length }
  })
  // 기준값 — 옛 뷰어와 같은 그래프·다익스트라 (tests/travel.test.ts)
  expect(r).toEqual({ cells: cells.h3.length, n: 3378, len: cells.h3.length })
})

test('주의 문구가 있는 업종(세탁소)은 고르면 문구가, 칸을 누르면 모형의 힘이 보인다', async ({ page }) => {
  const laundry = index.find((d) => d.k === 'CS200031')!
  expect(laundry.paint).toBe(true)
  expect(laundry.nm).toBe('세탁소')
  const v = read<{ v: (number | null)[] }>(`ind/${laundry.k}.json`).v
  let i = 0
  for (let j = 0; j < v.length; j++) if (v[j] != null && cells.n300[j] > cells.n300[i]) i = j

  // 예전 주소(?ind=매출 수준 업종)는 그 업종의 첫 소분류 코드(세탁소 S20901)로 바뀐다
  await page.goto(`/?ind=${laundry.k}`)
  await mapReady(page)
  await expect(page).toHaveURL(/kind=S20901/)
  await expect(page.getByTestId('ind-note')).toHaveText(laundry.note!)
  await clickCell(page, cells.h3[i])
  const label = laundry.rho >= 0.3 ? '보통' : laundry.rho >= 0.2 ? '약함' : '아주 약함'
  await expect(page.getByTestId('strength')).toContainText(`모형의 힘: ${label}`)
  await expect(page.locator('.trust')).toContainText(laundry.note!)
  // 셀프 빨래방은 세탁소로 배운 매출 수준을 쓰지 않는다 (W7.15) — 카드는 '추정하지 않음', 지도는 같은 업종(새 가게 지도도 없는 업종)
  await page.getByTestId('kind-btn').click()
  await page.getByRole('searchbox', { name: '업종 이름' }).fill('셀프 빨래방')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/kind=S20902/)
  await expect(page.getByTestId('level')).toHaveText('추정하지 않음')
  await expect(page.getByTestId('legend-title')).toHaveText('같은 업종 — 이 칸과 둘레 6칸의 셀프 빨래방 가게 수')
  await expect(page.getByTestId('show-pot')).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('show-pot').click({ force: true }) // 흐린 칩도 눌린다 — 까닭을 말하려고 (Playwright는 aria-disabled를 '누를 수 없음'으로 본다)
  await expect(page.locator('.show-note')).toHaveText('셀프 빨래방은 자리별 매출 수준을 추정하지 않아요')
  await expect(page.getByTestId('show-same')).toHaveAttribute('aria-pressed', 'true')
  // 칠하지 않는 업종은 값 파일을 내보내지 않는다
  for (const d of index.filter((x) => !x.paint)) expect(existsSync(new URL(`${ver}/ind/${d.k}.json`, ROOT))).toBe(false)
})

// 손익 점검 (마스터플랜 W7.4) — 노량진역 상권 카페: 예시 숫자면 본전 843만 원 ↔ 진입 뒤 평균 901만 원 (tests/check.test.ts와 같은 예)
const be = read<{ meta: BeMeta; ind: BeInd[] }>('be/index.json')
const bePlaces = read<{ sang: { nm: string[] } }>('be/places.json')
const beCells = read<{ c2s: number[]; c2d: number[] }>('be/cells.json')
const reb = read<{ rents: { n: string }[]; cell: number[] }>('reb/index.json')

test('손익 점검 — 카드에서 열고, 매물 숫자를 바꾸면 본전 매출 · 주소가 따라가고, 새로고침해도 그대로', async ({ page, isMobile }) => {
  const si = bePlaces.sang.nm.indexOf('노량진역(노량진)')
  const i = beCells.c2s.findIndex((x) => x === si)
  const ind = beFor('I21201', be.ind)!
  const r = read<{ S: number[][] }>(`be/ind/${ind.k}.json`).S.find((x) => x[0] === si)!
  const s = rowValue([r[0], 0, r[1], r[2], r[3], r[4]] as BeRow)
  const want = (rent: number) => `월 ${won(runCheck(ind, be.meta, { ...CHECK_DEFAULT, rent }, s, null).S)}`

  await page.goto(`/?kind=I21201&cell=${cells.h3[i]}`)
  await mapReady(page)
  await page.getByTestId('check-open').click()
  const chk = page.getByTestId('check')
  await expect(chk).toBeVisible()
  if (isMobile) await expect(page.locator('.panel')).toHaveClass(/sheet-full/)
  await expect(page.getByTestId('check-where')).toContainText("'노량진역(노량진)'")
  await expect(page.getByTestId('check-fit')).toHaveText("서울시 상권분석 '커피-음료'의 매출과 견줘요")
  await expect(page.getByTestId('check-example')).toContainText('처음 숫자는 예시예요')
  await expect(page.getByTestId('check-S')).toHaveText('월 843만 원')
  await expect(page.getByTestId('check-verdict')).toContainText('평균 월매출(901만 원)의 94%예요')
  await expect(page.getByTestId('check-profits').locator('tbody tr')).toHaveCount(4)
  await expect(page).toHaveURL(/chk=1/)
  await expect(page).not.toHaveURL(/in=/)
  // 매물 숫자 — 33㎡ · 월세 150만 원 (T3)
  await page.getByTestId('in-area').fill('33')
  await page.getByTestId('in-rent').fill('150')
  await expect(page.getByTestId('check-S')).toHaveText(want(150))
  await expect(page).toHaveURL(/in=33_150(&|$)/)
  await expect(page.getByTestId('check-example')).toContainText('주소에 남아요')
  // 칸을 지우는 중에는 0으로 바뀌지 않는다
  await page.getByTestId('in-rent').fill('')
  await expect(page.getByTestId('check-S')).toHaveText(want(150))
  await page.getByTestId('in-rent').fill('150')
  // 새로고침해도 그대로
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('in-area')).toHaveValue('33')
  await expect(page.getByTestId('check-S')).toHaveText(want(150))
  // 예시 값으로 되돌리기 → 주소에서 빠진다, 자리 카드로 돌아가면 chk도
  await page.getByTestId('check-reset').click()
  await expect(page.getByTestId('check-S')).toHaveText('월 843만 원')
  await expect(page).not.toHaveURL(/in=/)
  await page.getByTestId('check-back').click()
  await expect(page.getByTestId('oneline')).toBeVisible()
  await expect(page).not.toHaveURL(/chk=/)
})

test('손익 점검 — 견줄 업종이 없으면 직접 고르고(bei), 부동산원 조사 상권이면 월세 수준', async ({ page }) => {
  const ri = reb.rents.findIndex((x) => x.n === '명동')
  const i = reb.cell.findIndex((x) => x === ri)
  await page.goto(`/?kind=S20902&cell=${cells.h3[i]}&chk=1&bei=NOPE`)
  await mapReady(page)
  await expect(page.getByTestId('check-fit')).toContainText("셀프 빨래방은 서울시 '세탁소' 매출")
  await expect(page).not.toHaveURL(/bei=/) // 없는 업종 코드는 풀린다
  await expect(page.getByTestId('check-res')).toHaveCount(0)
  // 월세 수준은 업종 없이도 — 예시 숫자(50㎡ · 월세 250 · 보증금 3,000)면 3.3㎡당 18.5만 원
  await expect(page.getByTestId('check-rent')).toContainText('이 상권(명동) 1층 평균 46.7만 원의 0.40배로 싼 편이에요')
  await page.getByTestId('check-bei').selectOption('CS200031')
  await expect(page.getByTestId('check-res')).toBeVisible()
  await expect(page.getByTestId('check-S')).toContainText('만 원')
  await expect(page).toHaveURL(/bei=CS200031/)
  // 업종을 바꾸면 직접 고른 견줄 업종은 풀린다
  await page.getByTestId('kind-btn').click()
  await page.getByRole('searchbox', { name: '업종 이름' }).fill('카페')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('check-fit')).toHaveText("서울시 상권분석 '커피-음료'의 매출과 견줘요")
  await expect(page).not.toHaveURL(/bei=/)
  // 지하 1층 — 그 상권 효용비율로 바꾼다
  await page.locator('.check .more summary').click()
  await page.getByTestId('in-floor').selectOption('-1')
  await expect(page.getByTestId('check-rent')).toContainText('지하 1층 평균')
  await expect(page).toHaveURL(/inx=______-1/)
})

test('첫 화면 ③ 이 자리 괜찮을까 — 동을 찾으면 그 자리 손익 점검이 바로 열린다', async ({ page }) => {
  await page.goto('/')
  await mapReady(page)
  await page.getByTestId('q-place').click()
  await expect(page.getByTestId('q3-hint')).toBeVisible()
  await page.getByTestId('home-search').fill('망원1동')
  await page.getByRole('button', { name: /망원1동 \(마포구\)/ }).click()
  await expect(page.getByTestId('check')).toBeVisible()
  await expect(page.getByTestId('check-where')).toContainText('망원1동 (마포구)')
  await expect(page).toHaveURL(/chk=1/)
  // 업종 전에는 업종부터 — 고르면 결과가 나온다
  await page.getByTestId('check').getByRole('button', { name: '업종 고르기' }).click()
  await page.getByRole('searchbox', { name: '업종 이름' }).fill('카페')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('check-S')).toContainText('만 원')
})

// 업종 둘 견주기 (마스터플랜 W7.4 '업종 고르기' · 와이어프레임 T1b) — 카페 vs 빵/도넛: 빵/도넛이 가게당 매출 1.4배, 카페가 가게 수 3.7배, 생존은 비슷
test('업종 견주기 — 첫 화면 ①에서 둘 고르면 차이 셋, 지도 위에서 바꾸면 칠하는 업종 · 자리 카드 · 주소가 따라간다', async ({ page }) => {
  const cafe = read<{ v: (number | null)[] }>(`ind/${index.find((d) => d.nm === '카페')!.k}.json`).v
  let i = 0
  for (let j = 0; j < cafe.length; j++) if (cafe[j] != null && cells.n300[j] > cells.n300[i]) i = j

  await page.goto('/')
  await mapReady(page)
  await page.getByTestId('q-kind').click()
  const picker = page.getByTestId('kind-picker')
  await expect(picker.getByRole('heading', { name: '어떤 업종이 나을까?' })).toBeVisible()
  await expect(page.getByTestId('pick-go')).toBeDisabled()
  const box = picker.getByRole('searchbox')
  await box.fill('카페')
  await box.press('Enter')
  await expect(page.getByTestId('pick-go')).toHaveText('카페 지도 보기')
  await box.fill('빵')
  await box.press('Enter')
  await box.fill('치킨')
  await box.press('Enter') // 셋째는 고르지 않는다
  await expect(page.getByTestId('pick-foot')).toContainText('둘까지 고를 수 있어요')
  await expect(page.getByTestId('pick-go')).toHaveText('카페 · 빵/도넛 견주기')
  await page.getByTestId('pick-go').click()

  await expect(page.getByTestId('cmp-title')).toHaveText('카페 vs 빵/도넛')
  await expect(page.getByTestId('diff-sales')).toContainText('가게당 매출은 빵/도넛이 1.4배 — 월 1,303만 원 vs 909만 원')
  await expect(page.getByTestId('diff-comp')).toContainText('경쟁 가게는 카페가 3.7배')
  await expect(page.getByTestId('diff-surv')).toContainText('버티는 힘은 비슷해요')
  await expect(page.getByTestId('cmp-table').locator('tbody tr')).toHaveCount(10)
  await expect(page).toHaveURL(/kind=I21201/)
  await expect(page).toHaveURL(/cmp=I21201_I21001/)
  await expect(page.getByTestId('legend-title')).toHaveText('카페 매출 수준(추정) — 서울 이 업종 평균 상권 대비')

  // 지도 위 [카페 | 빵/도넛] — 빵/도넛은 매출 수준이 없어 새 가게부터. 표 순서는 그대로
  const seg = page.getByTestId('kind-seg')
  await seg.getByRole('button', { name: '빵/도넛' }).click()
  await expect(page).toHaveURL(/kind=I21001/)
  await expect(page).toHaveURL(/cmp=I21201_I21001/)
  await expect(page.getByTestId('legend-title')).toContainText('새로 생긴 빵/도넛')
  await expect(page.getByTestId('show-pot')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('cmp-title')).toHaveText('카페 vs 빵/도넛')
  // 새로고침해도 그대로
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('kind-seg').getByRole('button', { name: '빵/도넛' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('diff-sales')).toContainText('빵/도넛이 1.4배')

  // 같은 칸을 두 업종으로 — 칸 카드가 칠하는 업종을 따라간다
  await clickCell(page, cells.h3[i])
  await expect(page.getByTestId('fact-pot')).toContainText('추정하지 않음')
  await page.getByTestId('kind-seg').getByRole('button', { name: '카페' }).click()
  await expect(page.getByTestId('fact-pot')).not.toContainText('추정하지 않음')
  await expect(page).toHaveURL(new RegExp(`cell=${cells.h3[i]}`))
  // 카드를 닫으면 견주기, '견주기 끝'이면 업종 하나로
  await page.getByRole('button', { name: '고른 칸 지우기' }).click()
  await page.getByTestId('cmp-end').click()
  await expect(page.getByTestId('compare')).toHaveCount(0)
  await expect(page.getByTestId('kind-seg')).toHaveCount(0)
  await expect(page).not.toHaveURL(/cmp=/)
  await expect(page).toHaveURL(/kind=I21201/)
})

test('업종 견주기 — 동네 보기 \'다른 업종과 견주기\', 머리줄에서 다른 업종을 고르면 끝', async ({ page }) => {
  await page.goto('/?kind=I21201')
  await mapReady(page)
  await page.getByTestId('vs-open').click()
  const picker = page.getByTestId('kind-picker')
  await expect(picker.getByRole('heading', { name: '견줄 업종 고르기' })).toBeVisible()
  await expect(picker.getByRole('button', { name: /^카페/ })).toHaveCount(0) // 지금 업종은 목록에서 뺀다
  await picker.getByRole('searchbox').fill('치킨')
  await picker.getByRole('searchbox').press('Enter')
  await expect(page.getByTestId('cmp-title')).toHaveText('카페 vs 치킨')
  await expect(page.getByTestId('diff-surv')).toContainText('1년 버티는 비율은 카페가 높아요')
  await expect(page).toHaveURL(/cmp=I21201_I21006/)
  // 잘못된 cmp 주소는 버린다
  await page.goto('/?kind=I21201&cmp=I21201_I21201')
  await mapReady(page)
  await expect(page.getByTestId('compare')).toHaveCount(0)
  await page.goto('/?kind=I21201&cmp=I21201_I21006')
  await mapReady(page)
  await expect(page.getByTestId('cmp-title')).toHaveText('카페 vs 치킨')
  // 머리줄에서 둘 밖의 업종을 고르면 견주기를 끝낸다
  await page.getByTestId('kind-btn').click()
  await page.getByTestId('kind-picker').getByRole('searchbox').fill('편의점')
  await page.getByTestId('kind-picker').getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/kind=G20405/)
  await expect(page.getByTestId('compare')).toHaveCount(0)
  await expect(page).not.toHaveURL(/cmp=/)
})

// 비교함 (마스터플랜 W7.4 '비교함' · 와이어프레임 D3) — 자리 카드에서 담고, 탭에서 같은 줄로 견준다
test('비교함 — 카드에서 담고 빼기, 탭에서 줄마다 가장 높은·낮은 값, 위에서 보기 + 번호, 새로고침해도 그대로', async ({ page }) => {
  test.setTimeout(120_000)
  const cafe = read<{ v: (number | null)[] }>(`ind/${index.find((d) => d.nm === '카페')!.k}.json`).v
  // 카페를 칠하는 칸 셋 — 반경 300m 가게가 많은 순으로, 서로 떨어진 구에서
  const pick: number[] = []
  const gus = new Set<string>()
  for (const j of cells.h3.map((_, j) => j).filter((j) => cafe[j] != null).sort((a, b) => cells.n300[b] - cells.n300[a])) {
    const gu = dongs[cells.dong[j]].split('|')[1]
    if (gus.has(gu)) continue
    gus.add(gu)
    pick.push(j)
    if (pick.length === 3) break
  }
  await page.goto('/?kind=I21201')
  await mapReady(page)
  await expect(page.getByTestId('tab-box')).toHaveCount(0) // 담기 전에는 탭이 없다
  for (const [n, i] of pick.entries()) {
    await clickCell(page, cells.h3[i])
    await expect(page.getByTestId('box-toggle')).toHaveText('비교함에 담기')
    await page.getByTestId('box-toggle').click()
    await expect(page.getByTestId('box-toggle')).toHaveText('비교함에서 빼기')
    await expect(page.getByTestId('tab-box')).toContainText(String(n + 1))
  }
  await expect(page).toHaveURL(new RegExp(`box=${pick.map((i) => cells.h3[i]).join('_')}`))
  // 비교함 — 위에서 보기, 번호 셋
  await page.getByTestId('tab-box').click()
  await expect(page.getByTestId('box-title')).toHaveText('비교함 — 카페 자리 3곳')
  await expect(page).toHaveURL(/mode=box/)
  await expect(page).toHaveURL(/view=top/)
  await expect(page.locator('.cand-no')).toHaveCount(3)
  await expect(page.locator('.cand-no').first()).toHaveAttribute('aria-label', '비교함 1')
  await page.waitForFunction(() => window.__jeomji!.map.getPitch() < 0.5)
  // 줄 — 반경 300m 가게는 첫 칸이 가장 많다(많은 순으로 골랐다)
  const n300 = page.getByTestId('box-n300')
  await expect(n300.locator('td').nth(0)).toContainText(`${cells.n300[pick[0]].toLocaleString('ko-KR')}곳`)
  await expect(n300.locator('td').nth(0)).toContainText('가장 많음')
  await expect(n300.locator('td').nth(2)).toContainText('가장 적음')
  await expect(page.getByTestId('box-pot').locator('td')).toHaveCount(3)
  await expect(page.getByTestId('box-sales')).toContainText('만 원')
  await expect(page.getByTestId('box-surv')).toContainText('84% — 업종 값이라 모든 곳이 같아요')
  // 새로고침해도 그대로
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('box-title')).toHaveText('비교함 — 카페 자리 3곳')
  // 업종을 바꾸면 모든 곳이 따라간다
  await page.getByTestId('kind-btn').click()
  await page.getByTestId('kind-picker').getByRole('searchbox').fill('빵')
  await page.getByTestId('kind-picker').getByRole('searchbox').press('Enter')
  await expect(page.getByTestId('box-title')).toHaveText('비교함 — 빵/도넛 자리 3곳')
  await expect(page.getByTestId('box-pot')).toContainText('빵/도넛은 자리별 매출 수준을 추정하지 않아요')
  // 자리 카드로 갔다가 돌아오기 · 빼기 · 모두 빼기
  await page.getByRole('button', { name: /^2 .+ 자리 카드$/ }).click()
  await expect(page.getByTestId('oneline')).toBeVisible()
  await page.getByRole('button', { name: '비교함으로' }).click()
  await page.getByTestId('box-remove-2').click()
  await expect(page.getByTestId('box-title')).toHaveText('비교함 — 빵/도넛 자리 2곳')
  await expect(page.locator('.cand-no')).toHaveCount(2)
  await expect(page).toHaveURL(new RegExp(`box=${cells.h3[pick[0]]}_${cells.h3[pick[2]]}`))
  await page.getByTestId('box-clear').click()
  await expect(page.getByTestId('box')).toContainText('담은 자리가 없어요')
  await expect(page).not.toHaveURL(/box=/)
})

test('비교함 — 다섯 곳이 차면 더 담지 못한다, 잘못된 칸은 주소에서 버린다', async ({ page }) => {
  const five = [0, 1000, 2000, 3000, 4000]
  await page.goto(`/?box=${five.map((i) => cells.h3[i]).join('_')}_zz_${cells.h3[0]}&mode=box`)
  await mapReady(page)
  await expect(page.getByTestId('box-title')).toHaveText('비교함 — 자리 5곳')
  await expect(page.getByTestId('box')).toContainText('업종을 고르면')
  await expect(page).toHaveURL(new RegExp(`box=${five.map((i) => cells.h3[i]).join('_')}(&|$)`))
  await page.getByTestId('tab-map').click() // 폰은 비교함 시트가 지도를 덮는다 — 동네 보기에서 칸을 누른다
  await expect(page.getByTestId('tab-box')).toContainText('5')
  await clickCell(page, cells.h3[5000])
  await expect(page.getByTestId('box-toggle')).toBeDisabled()
  await expect(page.getByText('비교함이 찼어요(5곳) — 하나를 빼고 담으세요.')).toBeVisible()
})

// 무인매장 묶음 (마스터플랜 W7.4 '업종 고르기'의 무인매장 묶음 · 와이어프레임 T1m · T1n) — 정보공개서가 붙은 무인 6종을 업종처럼
const unm = read<UnmData>('unm/index.json')
const cand = read<{ un: Record<string, number[]>; cnt: Record<string, number[]> }>('cand/index.json')
const nbs = read<number[]>('grid/nb.json')
const kix = kindIndex(read<KindsData>('kinds/index.json'), read<{ k: string; codes: string[]; paint: boolean }[]>('ind/index.json'), read<{ ind: { k: string }[] }>('entry/index.json').ind, unm)
/** 무인 유형의 본전 매출 글자 — 그 유형 예시 값 + 바꾼 숫자 */
const unWant = (k: string, over: Partial<CheckInputs> = {}) => {
  const u = unm.types.find((x) => x.k === k)!
  return `월 ${won(runUn(unSide(u, kix.byCode, be.ind), be.meta.card, { ...unDefaults(u), ...over }).S)}`
}
/** 칸 + 둘레 6칸 합 ([칸, 수]… 자료에서) */
const nearOf = (sparse: number[], i: number) => {
  const m = new Map<number, number>()
  for (let k = 0; k < sparse.length; k += 2) m.set(sparse[k], sparse[k + 1])
  let v = m.get(i) ?? 0
  for (let k = 0; k < 6; k++) if (nbs[i * 6 + k] >= 0) v += m.get(nbs[i * 6 + k]) ?? 0
  return v
}

test('무인매장 묶음 — 바로 가기에서 6종 카드, 업종과 섞지 않고 둘 고르면 차이 셋 · 예시 본전, 지도는 무인 가게 · 같은 업종', async ({ page }) => {
  await page.goto('/')
  await mapReady(page)
  await page.getByTestId('quick-unm').click()
  const picker = page.getByTestId('kind-picker')
  await expect(picker.getByRole('button', { name: '무인매장', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const cards = page.getByTestId('un-cards')
  await expect(cards.locator('li')).toHaveCount(6)
  await expect(cards.locator('li').first()).toContainText('무인 빨래방')
  await expect(cards.locator('li').first()).toContainText('늘어나는 중')
  await expect(cards.locator('li').first()).toContainText('1.9억 원')
  // 업종 247과는 섞어 고르지 않는다
  const box = picker.getByRole('searchbox')
  await box.fill('편의점')
  await box.press('Enter')
  await box.fill('무인 카페')
  await box.press('Enter')
  await expect(page.getByTestId('pick-foot')).toContainText('무인매장은 무인매장끼리 견줘요')
  await expect(page.getByTestId('pick-go')).toHaveText('편의점 지도 보기')
  await picker.getByRole('button', { name: '편의점 빼기' }).click()
  await box.fill('')
  await cards.getByText('무인 아이스크림').click()
  await cards.getByText('무인 카페', { exact: true }).click()
  await expect(page.getByTestId('pick-go')).toHaveText('무인 아이스크림 · 무인 카페 견주기')
  await page.getByTestId('pick-go').click()

  await expect(page.getByTestId('cmp-title')).toHaveText('무인 아이스크림 vs 무인 카페')
  await expect(page.getByTestId('diff-sales')).toContainText('가맹점 매출은 무인 아이스크림이 2.0배 — 월 920만 원 vs 458만 원')
  await expect(page.getByTestId('diff-sales')).toContainText('1.2배로 차이가 줄어요')
  await expect(page.getByTestId('diff-open')).toContainText('창업비는 무인 아이스크림이 절반 이하')
  await expect(page.getByTestId('diff-trend')).toContainText('흐름은 무인 카페가 나아요')
  await expect(page.getByTestId('unex-UN-icecream')).toContainText('1,162만 원')
  await expect(page.getByTestId('unex-UN-icecream')).toContainText('가맹점 평균의 126%')
  await expect(page.getByTestId('cmp-table').locator('tbody tr')).toHaveCount(10)
  await expect(page).toHaveURL(/kind=UN-icecream/)
  await expect(page).toHaveURL(/cmp=UN-icecream_UN-cafe/)
  // 지도 — 매출 수준 · 새 가게는 흐리게, 기본은 무인 가게
  await expect(page.getByTestId('show-unm')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('show-pot')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('show-entry')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('legend-title')).toHaveText('무인 가게 — 이 칸과 둘레 6칸의 무인 아이스크림')
  await page.getByTestId('show-same').click()
  await expect(page.getByTestId('legend-title')).toHaveText('같은 업종 — 이 칸과 둘레 6칸에서 무인 아이스크림과 손님을 나누는 가게 수')
  await expect(page).toHaveURL(/show=same/)
  await page.getByTestId('kind-seg').getByRole('button', { name: '무인 카페' }).click()
  await expect(page).toHaveURL(/kind=UN-cafe/)
  await expect(page.getByTestId('legend-title')).toHaveText('같은 업종 — 이 칸과 둘레 6칸에서 무인 카페와 손님을 나누는 가게 수')
  // 새로고침해도 그대로
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('cmp-title')).toHaveText('무인 아이스크림 vs 무인 카페')
  // 견주기 끝 → 무인 카페 하나, '다른 무인 유형과 견주기'는 무인끼리만
  await page.getByTestId('cmp-end').click()
  await expect(page.getByTestId('un-intro')).toContainText('서울시 무인점포 명단 568곳 · 가맹점 평균 월매출 458만 원')
  await expect(page.getByTestId('vs-open')).toHaveText('다른 무인 유형과 견주기')
  await page.getByTestId('vs-open').click()
  await expect(page.getByTestId('un-cards').locator('li')).toHaveCount(5)
  await expect(page.getByTestId('kind-picker').getByRole('group', { name: '묶음' })).toHaveCount(0)
  await page.getByTestId('un-cards').getByText('무인 빨래방').click()
  await expect(page).toHaveURL(/cmp=UN-cafe_UN-laundry/)
  await expect(page.getByTestId('diff-sales')).toContainText('무인 빨래방은 브랜드 한 곳 값이라 거칠어요')
})

test('무인 유형 — 자리 카드는 무인 가게 · 같은 업종, 손익 점검은 브랜드 가운데 값과 견주고 바꾼 숫자는 유형을 바꿔도 남는다', async ({ page }) => {
  const h3 = '8930e1d80abffff', i = cells.h3.indexOf(h3) // 신촌동 — 명단의 무인 빨래방이 가장 많은 칸
  await page.goto(`/?kind=UN-laundry&cell=${h3}`)
  await mapReady(page)
  await expect(page.getByTestId('fact-unm')).toContainText(`무인 빨래방 ${nearOf(cand.un['빨래방'], i)}곳`)
  await expect(page.getByTestId('fact-same')).toContainText(`빨래방 ${nearOf(cand.cnt['빨래방'], i)}곳`)
  await expect(page.getByTestId('fact-surv')).toContainText('셀프 빨래방, 서울')
  await expect(page.getByTestId('oneline')).toContainText('(명단에서 찾은 곳)')
  await page.getByTestId('check-open').click()
  await expect(page.getByTestId('check-fit')).toContainText('한 곳(워시엔조이)의 가맹점 평균 월매출(529만 원)')
  await expect(page.getByTestId('check-example')).toContainText('처음 숫자는 무인 빨래방 기본값이에요')
  await expect(page.getByTestId('in-area')).toHaveValue('63')
  await expect(page.getByTestId('check-S')).toHaveText(unWant('UN-laundry'))
  await expect(page.getByTestId('check-above')).toHaveText('견줄 수 있는 가맹 브랜드가 워시엔조이 한 곳뿐이라 거친 기준이에요.')
  await expect(page.getByTestId('brand-bars').locator('li')).toHaveCount(1)
  await expect(page.getByTestId('check-cmp')).toHaveCount(0) // 서울시 '세탁소' 매출은 참고로도 보이지 않는다 (W7.15)
  await expect(page).not.toHaveURL(/in=/)
  // 월세만 바꾸면 주소에 그것만
  await page.getByTestId('in-rent').fill('120')
  await expect(page.getByTestId('check-S')).toHaveText(unWant('UN-laundry', { rent: 120 }))
  await expect(page).toHaveURL(/in=_120(&|$)/)
  // 유형을 바꾸면 — 면적 · 초기 투자는 그 유형 값, 바꾼 월세는 그대로
  await page.getByTestId('kind-btn').click()
  await page.getByTestId('kind-picker').getByRole('searchbox').fill('무인 카페')
  await page.getByTestId('kind-picker').getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/kind=UN-cafe/)
  await expect(page.getByTestId('in-area')).toHaveValue('31')
  await expect(page.getByTestId('in-rent')).toHaveValue('120')
  await expect(page.getByTestId('check-S')).toHaveText(unWant('UN-cafe', { rent: 120 }))
  await expect(page.getByTestId('brand-bars').locator('li')).toHaveCount(5)
  await expect(page.getByTestId('check-cmp')).toContainText("서울 '커피-음료' 상권별 가운데 값")
  // 새로고침해도 그대로, 되돌리면 주소에서 빠진다
  await page.reload()
  await mapReady(page)
  await expect(page.getByTestId('check-S')).toHaveText(unWant('UN-cafe', { rent: 120 }))
  await page.getByTestId('check-reset').click()
  await expect(page.getByTestId('check-S')).toHaveText(unWant('UN-cafe'))
  await expect(page).not.toHaveURL(/in=/)
})

test('무인 유형 — 후보 찾기는 명단 기준 비슷한 자리, 비교함 줄, 업종 견주기의 \'카페에는 무인 카페도\', 섞인 주소는 버린다', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?kind=UN-cafe&mode=find')
  await mapReady(page)
  await expect(page.getByTestId('funnel')).toContainText('그중 무인 카페 자리와 비슷한 칸', { timeout: 60_000 })
  await expect(page.getByTestId('cand-list').locator('> li')).toHaveCount(20)
  await expect(page.locator('.band-text')).toContainText('서울시 무인점포 명단에서 찾은 무인 카페 194곳이 있는 칸의 가운데 80%')
  await expect(page.getByTestId('opts-sum')).toContainText('주민이 많은 순') // 매출 수준이 없어 기본은 주민 순 (W7.15)
  // 비교함 — 매출 수준 줄 자리에 무인 가게, 매출은 브랜드 값 한 문장
  await page.goto('/?kind=UN-cafe&mode=box&box=8930e1d968bffff_8930e1d8a73ffff')
  await mapReady(page)
  await expect(page.getByTestId('box-title')).toHaveText('비교함 — 무인 카페 자리 2곳')
  await expect(page.getByTestId('box-unm')).toBeVisible()
  await expect(page.getByTestId('box-pot')).toHaveCount(0)
  await expect(page.getByTestId('box-sales')).toContainText('브랜드 5곳의 가운데 값 458만 원')
  // 업종 견주기 — 카페에는 무인 카페도 들어 있다고
  await page.goto('/?kind=I21201&cmp=I21201_I21001')
  await mapReady(page)
  await expect(page.getByTestId('cmp-inside')).toHaveText(/^카페에는 무인 카페도 들어 있어요/)
  // 무인 유형과 업종 247을 섞은 짝은 버린다
  await page.goto('/?kind=UN-cafe&cmp=UN-cafe_I21201')
  await mapReady(page)
  await expect(page.getByTestId('un-intro')).toBeVisible()
  await expect(page.getByTestId('compare')).toHaveCount(0)
  await expect(page).not.toHaveURL(/cmp=/)
})
