import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadStats } from './stats'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

loadStats() // 방문 통계 — 실제 사이트에서만, 열 때 한 번 (stats.ts)
