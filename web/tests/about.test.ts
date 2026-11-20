/// <reference types="node" />
// 안내 · 출처 쪽(public/about.html) — 공개용 (2026-11-21). 손으로 쓴 글이라 manifest의 출처와 어긋나지 않는지 맞춰 본다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../public/', import.meta.url)
const html = readFileSync(new URL('about.html', ROOT), 'utf8')
const idx = readFileSync(new URL('../index.html', ROOT), 'utf8')
const { ver } = JSON.parse(readFileSync(new URL('data/latest.json', ROOT), 'utf8')) as { ver: string }
const manifest = JSON.parse(readFileSync(new URL(`data/${ver}/manifest.json`, ROOT), 'utf8')) as { sources: { name: string; via?: string }[] }

// 출처 이름을 덮는 토큰 — 새 출처가 생기면 여기와 about.html을 함께 고친다
const TOKENS = ['소상공인시장진흥공단', '서울시 상권분석서비스', '수도권 생활이동', 'SGIS', '한국부동산원', '무인점포 현황', '공정거래위원회', '금융위원회', 'OpenStreetMap', 'H3', '브이월드']

describe('안내 · 출처 쪽', () => {
  it('manifest의 모든 출처가 글에 있다 (토큰으로)', () => {
    for (const t of TOKENS) expect(html, t).toContain(t)
    for (const s of manifest.sources) expect(TOKENS.some((t) => s.name.includes(t) || (s.via ?? '').includes(t)), `덮는 토큰 없음: ${s.name}`).toBe(true)
  })

  it('문의 메일 · ODbL 알림 · 주의 문장 · 돌아가기', () => {
    expect(html).toContain('mailto:beeminor60@gmail.com')
    expect(html).toContain('© OpenStreetMap contributors')
    expect(html).toContain('opendatacommons.org/licenses/odbl')
    expect(html).toContain('계약이나 투자 판단의 근거로 쓰지 마세요')
    expect(html).toContain('<a class="back" href="/">')
    expect(html).not.toContain('noindex')
  })

  it('index.html — 검색 허용(noindex 없음) · 설명 · canonical · 안내 링크', () => {
    expect(idx).not.toContain('noindex')
    expect(idx).toMatch(/<meta name="description" content=".{60,}"/)
    expect(idx).toContain('<link rel="canonical" href="https://isohex.leehyeonjun.com/" />')
    expect(idx).toContain('/about.html')
    expect(idx).toContain('application/ld+json')
  })

  it('robots.txt · sitemap.xml — 자료 폴더는 막고 두 쪽을 싣는다', () => {
    const robots = readFileSync(new URL('robots.txt', ROOT), 'utf8')
    expect(robots).toContain('Allow: /')
    expect(robots).toContain('Disallow: /data/')
    expect(robots).toContain('Sitemap: https://isohex.leehyeonjun.com/sitemap.xml')
    const sm = readFileSync(new URL('sitemap.xml', ROOT), 'utf8')
    expect(sm).toContain('<loc>https://isohex.leehyeonjun.com/</loc>')
    expect(sm).toContain('<loc>https://isohex.leehyeonjun.com/about.html</loc>')
  })
})
