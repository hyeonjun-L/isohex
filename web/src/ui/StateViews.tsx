import Fold from './Fold'
import { IcoClock, IcoHex, IcoInfo, IcoOk, IcoRefresh, IcoSearch, IcoWarn } from './icons'

// 상태 화면 (화면 다시 잡기 S15–S17 · 9단계)
// 받는 중 — 앱 틀(찾기 칸 · 칩 자리 · 빈 지도) 위에 시트 하나: 처음 한 번 받는 것 넷과 그 상태, 막대.
// 못 받음 · 못 그림 — 머리(⬡ 점지) + 쉬운 말 + [다시 시도] + [안내 · 자료 출처 · 문의](+ 접은 기술 정보). 빈 화면으로 끝나지 않게

export type LoadStep = 'wait' | 'load' | 'done'
export interface LoadProg {
  base: LoadStep
  kinds: LoadStep
  entry: LoadStep
  unm: LoadStep
}

/** 처음 받는 자료 크기 — 판 폴더의 JSON(latest · manifest · cells · dongs · ind/index · bounds · kinds · entry · unm),
 *  압축 전 약 0.44MB(11-28 v3 판 · 내려받을 때는 압축해 0.11MB). 판이 바뀌어 크게 달라지면 고친다 */
const FIRST_SIZE = '0.4MB'
const STEP_NM: Record<LoadStep, string> = { done: '받음', load: '받는 중', wait: '기다림' }

export function LoadingView({ prog, cells, narrow, placeholder }: { prog: LoadProg; cells: number | null; narrow: boolean; placeholder: string }) {
  const items: { k: keyof LoadProg; nm: string }[] = [
    { k: 'base', nm: cells ? `칸 ${cells.toLocaleString('ko-KR')}개 · 구 경계` : '칸 · 구 경계' },
    { k: 'kinds', nm: '업종 목록' },
    { k: 'entry', nm: '새 가게' },
    { k: 'unm', nm: '무인매장' },
  ]
  // 받은 것은 하나, 받는 중은 반으로 센다
  const pct = Math.round((items.reduce((s, it) => s + (prog[it.k] === 'done' ? 1 : prog[it.k] === 'load' ? 0.5 : 0), 0) / items.length) * 100)
  const search = (
    <div className="search-box search-off" aria-hidden="true">
      <span className="icon-btn"><IcoHex size={22} /></span>
      <span className="search-field"><IcoSearch size={20} /><input disabled tabIndex={-1} placeholder={placeholder} /></span>
    </div>
  )
  return (
    <div className="app">
    <main className="stage state-load">
      <div className="map map-wait" />
      {narrow && <div className="topbar">{search}</div>}
      <div className="map-top"><div className="skel-chips" aria-hidden="true"><i /><i /><i /><i /></div></div>
      <aside className="panel sheet-half" aria-label="불러오는 중">
        {narrow && <div className="sheet-handle" aria-hidden="true"><i /></div>}
        {!narrow && <div className="panel-head">{search}</div>}
        <div className="panel-body">
          <section className="loadv" aria-busy="true" data-testid="loading">
            <h2>자료를 받는 중이에요</h2>
            <p>처음 한 번은 자료 약 {FIRST_SIZE}를 받아요. 다음부터는 브라우저에 남은 자료로 빨리 열려요.</p>
            <div className="lv-bar" role="progressbar" aria-label="자료 받기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
            <ul className="lv-list">
              {items.map((it) => (
                <li key={it.k} className={`lv-${prog[it.k]}`} data-testid={`load-${it.k}`}>
                  {prog[it.k] === 'done' ? <IcoOk size={20} /> : <IcoClock size={20} />}
                  <span className="lv-nm">{it.nm}</span>
                  <span className="lv-st">{STEP_NM[prog[it.k]]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </main>
    </div>
  )
}

export type StateKind = 'data' | 'nogl' | 'map'
const PAGE: Record<StateKind, { warn: boolean; h: string; p: string }> = {
  data: { warn: true, h: '자료를 받지 못했어요', p: '인터넷 연결이 끊겼거나, 새 자료 판으로 바뀌는 중일 수 있어요. 잠시 뒤 다시 시도해 주세요.' },
  nogl: { warn: false, h: '이 기기에서는 지도를 그릴 수 없어요', p: '브라우저의 WebGL2가 꺼져 있거나 지원하지 않는 기기예요. 브라우저 설정에서 하드웨어 가속을 켜거나, 다른 브라우저로 열어 보세요.' },
  map: { warn: true, h: '지도를 그리지 못했어요', p: '지도를 그리는 중에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.' },
}

/** 못 받음 · 못 그림 — detail은 기술 정보(문의할 때 함께 보낼 오류 글) */
export function StatePage({ kind, detail = null }: { kind: StateKind; detail?: string | null }) {
  const t = PAGE[kind]
  return (
    <div className="state-page" data-testid={`state-${kind}`}>
      <header className="sp-head">
        <a className="sp-brand" href="/"><IcoHex size={22} />점지</a>
      </header>
      <main className="sp-body">
        <div className="sp-say" role="alert">
          {t.warn ? <IcoWarn size={32} /> : <IcoInfo size={32} />}
          <h1>{t.h}</h1>
          <p>{t.p}</p>
        </div>
        <button className="btn-primary sp-go" onClick={() => window.location.reload()} data-testid="state-retry"><IcoRefresh size={18} />다시 시도</button>
        <a className="btn2 sp-about" href="/about.html">안내 · 자료 출처 · 문의</a>
        {detail && (
          <Fold title="기술 정보" sum="문의하실 때 함께 보내 주세요" testid="state-detail" open>
            <p className="sp-detail">{detail}</p>
          </Fold>
        )}
      </main>
    </div>
  )
}
