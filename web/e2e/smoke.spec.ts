import { expect, test, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { cellToLatLng } from 'h3-js'

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
  // 셀프 빨래방은 세탁소로 배운 매출 수준을 쓰지 않는다 (W7.15) — 지도는 가게가 모인 정도, 카드는 '추정하지 않음'
  await page.getByTestId('kind-btn').click()
  await page.getByRole('searchbox', { name: '업종 이름' }).fill('셀프 빨래방')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/kind=S20902/)
  await expect(page.getByTestId('level')).toHaveText('추정하지 않음')
  await expect(page.getByText('가게가 모인 정도 — 반경 300m 가게 수')).toBeVisible()
  // 칠하지 않는 업종은 값 파일을 내보내지 않는다
  for (const d of index.filter((x) => !x.paint)) expect(existsSync(new URL(`${ver}/ind/${d.k}.json`, ROOT))).toBe(false)
})
