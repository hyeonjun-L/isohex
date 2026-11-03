import { expect, test, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { cellToLatLng } from 'h3-js'
import { buildPlaceIndex, findPlace, placeGrid, type StationData } from '../src/core/places'

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

test('첫 화면 — 지도와 칸 8,322개, 업종 목록', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await mapReady(page)
  expect(await page.evaluate(() => window.__jeomji!.cellCount)).toBe(cells.h3.length)
  // 업종 고르기 — 상가정보 소분류 247개
  await page.getByTestId('kind-btn').click()
  await expect(page.getByTestId('kind-picker').locator('.kind-row')).toHaveCount(247)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('kind-picker')).toHaveCount(0)
  await expect(page.getByText('가게가 모인 정도 — 반경 300m 가게 수')).toBeVisible()
  expect(errors).toEqual([])
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

  // 업종을 고르기 전 — 가게 수 · 1층 임대료
  await page.goto('/')
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
