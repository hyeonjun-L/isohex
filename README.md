# 점지 — 서울 가게 자리 찾기 (시험판)

서울을 육각 칸(H3, 한 칸 약 0.1㎢) 8,322개로 나눠, 칸마다 **반경 300m 가게 수**와 업종별 **매출 수준(추정)** 을 지도에 칠합니다.

- 매출 수준은 *서울에서 그 업종의 평균 상권과 견준 % 차이*입니다. 실제 매출이 아니라, 상권 단위로 배운 관계를 칸에 옮긴 **추정값**입니다.
- 가게가 드문 칸은 모형이 본 적 없는 자리라 추정하지 않습니다 (지도에서 빗금).
- 업종은 37개 중 검증을 통과한 23개만 칠합니다 — 업종마다 처음 보는 구의 상권 매출 순서를 맞히는지 보고, 37개를 한꺼번에 검정한 것도 보정합니다(거짓 발견 5%). 칠하지 않는 업종의 칸 값은 내보내지 않습니다.
- 지금 판은 최근 네 분기 매출(2025Q3~2026Q2, 2026년은 서울 OpenAPI)과 상가정보 2026Q2로 배웠습니다. 2025년 자료로 배운 모형도 2026년 상반기 상권 순서를 같은 정도로 맞혔습니다.
- 세탁소는 맡기는 세탁소 위주로 배운 값이라 셀프빨래방 자리를 보는 데는 쓰지 않습니다 (지도에 주의 문구).

## 폴더

| 폴더 | 내용 |
|---|---|
| `web/` | 웹 앱 — React + TypeScript + Vite, 지도 MapLibre GL JS, 배포 Cloudflare Workers |
| `web/public/data/` | 웹 앱이 읽는 자료. 판마다 폴더 하나, `latest.json`이 지금 판을 가리킨다 |
| `pipeline/` | `export_web.py` 분석 결과 → 웹 자료 · `probe.py` 자료 사이트 점검 · `fetch_seoul.py` 상권분석 새 분기를 서울 OpenAPI로 받기(인증키 필요, Mac 터미널에서) |
| `analysis/` | 분석 코드 (상권 패널·생존·매출 잠재 등) |
| `scripts/` `sql/` `docker/` | 원자료 적재 (PostGIS) |
| `viewer/` | 예전 단일 HTML 지도 뷰어의 틀과 빌드 코드 |
| `.github/workflows/` | `ci.yml` 시험·배포 · `probe.yml` 매주 자료 사이트 점검 (결과는 `probe` 가지) |

## 내 컴퓨터에서 돌리기

Node.js 22 이상.

```sh
cd web
npm ci
npm run dev        # http://localhost:5173
```

배경지도(브이월드)를 보려면 `web/.env.example`을 `web/.env.local`로 복사해 키를 넣습니다. `.env.local`은 저장소에 올라가지 않습니다.

```sh
npm test                                          # 단위 시험
npx playwright install chromium && npm run e2e    # 브라우저 시험 (데스크톱·폰)
```

## 자료 다시 만들기

분석 결과(`analysis/panel/결과/`, 저장소에는 없음)가 있을 때:

```sh
python3 pipeline/export_web.py --src analysis/panel/결과 --out web/public/data
```

같은 입력이면 같은 판 이름이 나옵니다 (이름 끝 8자리가 파일 내용의 해시). 판 폴더는 한 번 올리면 바꾸지 않습니다.

## 배포

`main`에 올리면 GitHub Actions가 시험을 돌리고, 저장소 비밀값(Settings → Secrets and variables → Actions)이 있으면 Cloudflare Workers로 배포합니다.

| 이름 | 무엇 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 토큰 ('Edit Cloudflare Workers' 템플릿) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| `VWORLD_KEY` | 브이월드 인증키 (없으면 배경지도 없이 배포) |

## 자료 출처

| 쓰임 | 자료 | 제공 | 이용 조건 |
|---|---|---|---|
| 가게 수 | 소상공인시장진흥공단 상가(상권)정보 (2026Q2) | 공공데이터포털 | 이용허락범위 제한 없음 |
| 매출 수준 학습 | 서울시 상권분석서비스 (추정매출·점포, 2025Q3~2026Q2 — 2026년은 OpenAPI) | 서울 열린데이터광장 | 공공누리 제1유형 |
| 도착 수요 | 수도권 생활이동 | 서울 열린데이터광장 | 공공누리 제1유형 |
| 인구·종사자 | SGIS 격자 통계 | 국가데이터처 (공공데이터포털) | 이용허락범위 제한 없음 |
| 자치구 경계 | 서울시 상권분석서비스 영역 | 서울 열린데이터광장 | 공공누리 제1유형 |
| 칸 | H3 | h3geo.org | Apache-2.0 |
| 배경지도 | 브이월드 | 국토교통부 | 화면에 표출만 (복제·재배포하지 않음) |

## 저장소에 올리지 않는 것

- 내려받은 원자료(CSV·SHP·zip)와 분석 결과 표 — `.gitignore`가 코드 폴더만 열어 둡니다
- **임대시세** — 원자료와 그것으로 만든 값 모두 (공개 조건을 정하기 전)
- 키·토큰 — 비밀값은 GitHub 저장소 설정에만 둡니다
