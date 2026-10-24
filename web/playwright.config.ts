import { defineConfig, devices } from '@playwright/test'

// 지도는 WebGL2가 있어야 뜬다 — 머리 없는 브라우저에서는 소프트웨어 렌더러(SwiftShader)를 쓴다
const gl = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
// 작업 공간에 미리 깔린 Chromium이 있으면 그것을 쓴다 (CI는 playwright install로 받는다)
const executablePath = process.env.PW_CHROMIUM || undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: gl, executablePath },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: '데스크톱', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: '폰', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
