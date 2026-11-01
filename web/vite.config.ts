import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1600 },
  server: { port: 5173 },
  // 없는 파일은 404 — 배포(wrangler.jsonc의 404-page)와 같게. 'spa'면 없는 타일에 index.html이 온다
  appType: 'mpa',
  // 단위 시험만 — e2e/는 Playwright가 돌린다
  test: { include: ['tests/**/*.test.ts'] },
})
