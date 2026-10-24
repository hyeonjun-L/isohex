import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1600 },
  server: { port: 5173 },
  // 단위 시험만 — e2e/는 Playwright가 돌린다
  test: { include: ['tests/**/*.test.ts'] },
})
