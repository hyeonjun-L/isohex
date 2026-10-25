#!/usr/bin/env python3
"""자료 출처 점검 (probe) — GitHub Actions(해외 서버)에서 자료 사이트가 열리는지, 새 판이 나왔는지 잰다.

왜: 자동 갱신(마스터플랜 W7.9)을 GitHub Actions에서 돌릴 수 있는지 먼저 알아야 한다.
    브이월드는 해외에서 막힌다(502). 서울 열린데이터광장·R-ONE·SGIS는 잰 적이 없다.
무엇: 사이트마다 한 번 요청해 응답 코드·걸린 시간·Last-Modified를 적는다.
      공공데이터포털 파일은 판 이름(alternateName)·고친 날(dateModified)을,
      서울 OpenAPI(샘플 키)는 자료 건수와, 분기를 하나씩 물어 찾은 가장 최근 분기를 지난번과 견준다.
결과: <out>/latest.json (기계용) · latest.md (사람용) · history.jsonl (한 번에 한 줄씩 쌓임)
표준 라이브러리만 쓴다 — 설치 없이 돈다.

    python3 pipeline/probe.py --out probe-out [--prev-dir 지난결과폴더] [--targets 시험용목록.json]
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
UA = 'jeomji-probe/1 (+https://github.com/hyeonjun-L/isohex)'
TIMEOUT = 25
READ_MAX = 512 * 1024

# kind — page: 열리는지만 · datagokr: 공공데이터포털 파일의 판 · seoul_api: 서울 OpenAPI 샘플 · file: 파일 머리(HEAD)
TARGETS: list[dict] = [
    {'id': 'datagokr-sangga', 'name': '공공데이터포털 — 상가(상권)정보', 'use': '가게 수 (분기마다)', 'kind': 'datagokr',
     'url': 'https://www.data.go.kr/catalog/15083033/fileData.json'},
    {'id': 'datagokr-sgis-grid', 'name': '공공데이터포털 — SGIS 격자 통계', 'use': '인구·종사자 격자', 'kind': 'datagokr',
     'url': 'https://www.data.go.kr/catalog/15141768/fileData.json'},
    {'id': 'datagokr-bldg-daily', 'name': '공공데이터포털 — GIS건물통합정보 (일별)', 'use': '3D 건물 (P1)', 'kind': 'datagokr',
     'url': 'https://www.data.go.kr/catalog/15052097/fileData.json'},
    {'id': 'datagokr-bldg', 'name': '공공데이터포털 — GIS건물통합정보', 'use': '3D 건물 (P1)', 'kind': 'datagokr',
     'url': 'https://www.data.go.kr/catalog/15083092/fileData.json'},
    {'id': 'datagokr-api', 'name': '공공데이터포털 OpenAPI 관문', 'use': 'API 호출', 'kind': 'page',
     'url': 'https://apis.data.go.kr/'},
    {'id': 'seoul-data', 'name': '서울 열린데이터광장', 'use': '상권분석서비스·생활이동 파일', 'kind': 'page',
     'url': 'https://data.seoul.go.kr/'},
    {'id': 'seoul-file', 'name': '서울 열린데이터광장 파일 서버', 'use': '파일 받기', 'kind': 'page',
     'url': 'https://datafile.seoul.go.kr/'},
    {'id': 'seoul-api-sales', 'name': '서울 OpenAPI — 추정매출(상권), 샘플 키', 'use': '상권분석서비스 새 분기 (매출)', 'kind': 'seoul_api',
     'url': 'http://openapi.seoul.go.kr:8088/sample/json/VwsmTrdarSelngQq/1/1/'},
    {'id': 'seoul-api-store', 'name': '서울 OpenAPI — 점포(상권), 샘플 키', 'use': '상권분석서비스 새 분기 (점포)', 'kind': 'seoul_api',
     'url': 'http://openapi.seoul.go.kr:8088/sample/json/VwsmTrdarStorQq/1/1/'},
    {'id': 'golmok', 'name': '서울시 상권분석서비스(골목상권)', 'use': '참고 화면', 'kind': 'page',
     'url': 'https://golmok.seoul.go.kr/'},
    {'id': 'rone', 'name': '부동산통계정보 R-ONE', 'use': '임대동향 (지금은 안 씀)', 'kind': 'page',
     'url': 'https://www.reb.or.kr/r-one/'},
    {'id': 'sgis', 'name': 'SGIS', 'use': '경계·통계', 'kind': 'page', 'url': 'https://sgis.kostat.go.kr/'},
    {'id': 'sgis-mods', 'name': 'SGIS (국가데이터처 주소)', 'use': '경계·통계', 'kind': 'page', 'url': 'https://sgis.mods.go.kr/'},
    {'id': 'vworld-api', 'name': '브이월드 API', 'use': '배경지도', 'kind': 'page', 'url': 'https://api.vworld.kr/'},
    {'id': 'vworld-www', 'name': '브이월드 누리집', 'use': '키 발급·건물 자료', 'kind': 'page', 'url': 'https://www.vworld.kr/'},
    {'id': 'geofabrik-kr', 'name': 'Geofabrik — OSM 한국', 'use': '길 (이동 시간)', 'kind': 'file',
     'url': 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf'},
    {'id': 'ftc-franchise', 'name': '공정위 가맹사업거래', 'use': '정보공개서', 'kind': 'page',
     'url': 'https://franchise.ftc.go.kr/'},
]

STATE_TEXT = {'ok': '열림', 'answer': '답함(4xx)', 'error5xx': '막힘?(5xx)', 'tls': '인증서 문제', 'down': '안 닿음'}
HEADER_KEYS = ('last-modified', 'etag', 'content-length', 'content-type', 'server')


def tcp_ok(url: str) -> bool:
    """TLS가 깨졌을 때 — 연결 자체는 되는지(망 차단인지 인증서 문제인지) 가른다"""
    u = urllib.parse.urlsplit(url)
    port = u.port or (443 if u.scheme == 'https' else 80)
    try:
        with socket.create_connection((u.hostname, port), timeout=10):
            return True
    except OSError:
        return False


def fetch(url: str, method: str) -> dict:
    req = urllib.request.Request(url, method=method, headers={'User-Agent': UA, 'Accept': '*/*'})
    t0 = time.monotonic()
    out: dict = {'method': method, 'status': None}
    body = b''
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(READ_MAX) if method == 'GET' else b''
            out.update(status=r.status, final_url=r.geturl(), headers=pick(r.headers))
    except urllib.error.HTTPError as e:
        try:
            body = e.read(READ_MAX)
        except Exception:  # noqa: BLE001 — 몸통이 없어도 응답 코드는 남긴다
            body = b''
        out.update(status=e.code, final_url=e.geturl(), headers=pick(e.headers))
    except urllib.error.URLError as e:
        reason = e.reason
        out['error'] = f'{type(reason).__name__}: {reason}'[:300]
        out['tls_error'] = isinstance(reason, ssl.SSLError)
    except (TimeoutError, socket.timeout, ConnectionError, ssl.SSLError, OSError) as e:
        out['error'] = f'{type(e).__name__}: {e}'[:300]
        out['tls_error'] = isinstance(e, ssl.SSLError)
    out['ms'] = round((time.monotonic() - t0) * 1000)
    out['_body'] = body
    return out


def pick(headers) -> dict:
    return {k: headers.get(k) for k in HEADER_KEYS if headers.get(k)}


def state_of(r: dict) -> str:
    s = r.get('status')
    if s is None:
        return 'tls' if r.get('tls_error') and r.get('tcp_ok') else 'down'
    if s < 400:
        return 'ok'
    return 'answer' if s < 500 else 'error5xx'


def first_key(obj, key: str):
    """JSON-LD 안 어디에 있든 처음 나오는 key 값"""
    if isinstance(obj, dict):
        if key in obj and isinstance(obj[key], (str, int, float)):
            return obj[key]
        for v in obj.values():
            found = first_key(v, key)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = first_key(v, key)
            if found is not None:
                return found
    return None


def read_version(kind: str, body: bytes) -> dict:
    if kind not in ('datagokr', 'seoul_api') or not body:
        return {}
    try:
        doc = json.loads(body.decode('utf-8', errors='replace'))
    except json.JSONDecodeError:
        return {'parse': 'JSON이 아님'}
    if kind == 'datagokr':
        return {k: v for k in ('name', 'alternateName', 'dateModified') if (v := first_key(doc, k)) is not None}
    # 서울 OpenAPI: {"<서비스>": {"list_total_count": n, "RESULT": {...}, "row": [...]}} 또는 {"RESULT": {...}}
    svc = next((v for v in doc.values() if isinstance(v, dict) and 'row' in v), None) if isinstance(doc, dict) else None
    result = (svc or doc).get('RESULT', {}) if isinstance(svc or doc, dict) else {}
    out = {'code': result.get('CODE'), 'message': result.get('MESSAGE')}
    if svc:
        out['total'] = svc.get('list_total_count')
    return {k: v for k, v in out.items() if v is not None}


def seoul_latest_quarter(url: str, today: datetime | None = None, back: int = 8) -> dict:
    """서울 OpenAPI의 행은 분기 순이 아니다(샘플 다섯 줄이 2022년일 때도 있다) — 주소 끝에 분기(YYYYQ)를 붙이면
    그 분기 행만 오므로, 이번 분기부터 거꾸로 물어 행이 있는 가장 최근 분기를 찾는다"""
    now = today or datetime.now(KST)
    y, q = now.year, (now.month - 1) // 3 + 1
    first = f'{y}{q}'
    for _ in range(back):
        code = f'{y}{q}'
        r = fetch(url.rstrip('/') + '/' + code, 'GET')
        v = read_version('seoul_api', r.pop('_body')) if r.get('status') == 200 else {}
        if v.get('total'):
            return {'latest_quarter': code, 'latest_quarter_rows': v['total']}
        q -= 1
        if q == 0:
            y, q = y - 1, 4
    return {'latest_quarter_note': f'{first}부터 {back}분기 거슬러 행 없음'}


VERSION_FIELDS = ('alternateName', 'dateModified', 'total', 'latest_quarter')


def probe_one(t: dict, prev: dict | None) -> dict:
    method = 'HEAD' if t['kind'] == 'file' else 'GET'
    r = fetch(t['url'], method)
    if r.get('status') is None and r.get('tls_error'):
        r['tcp_ok'] = tcp_ok(t['url'])
    body = r.pop('_body')
    r['state'] = state_of(r)
    r['version'] = read_version(t['kind'], body) if r['state'] == 'ok' else {}
    if t['kind'] == 'seoul_api' and r['version'].get('total'):
        r['version'].update(seoul_latest_quarter(t['url']))
    if t['kind'] == 'file' and r.get('headers'):
        r['version'] = {k: r['headers'][k] for k in ('last-modified', 'content-length') if k in r['headers']}
    # 지난번과 견주기 — 판을 나타내는 값이 바뀌었으면 changed
    if prev and prev.get('version') and r['version']:
        keys = [k for k in (*VERSION_FIELDS, 'last-modified') if k in r['version'] or k in prev['version']]
        r['changed'] = any(r['version'].get(k) != prev['version'].get(k) for k in keys)
    return {**{k: t[k] for k in ('id', 'name', 'use', 'kind', 'url')}, **r}


def load_prev(prev_dir: Path | None) -> tuple[dict, list[str]]:
    if not prev_dir:
        return {}, []
    prev, hist = {}, []
    p = prev_dir / 'latest.json'
    if p.exists() and p.stat().st_size:
        try:
            prev = {x['id']: x for x in json.loads(p.read_text(encoding='utf-8')).get('results', [])}
        except (json.JSONDecodeError, KeyError, TypeError):
            prev = {}
    h = prev_dir / 'history.jsonl'
    if h.exists():
        hist = [ln for ln in h.read_text(encoding='utf-8').splitlines() if ln.strip()]
    return prev, hist


def to_markdown(doc: dict) -> str:
    rows = doc['results']
    n_ok = sum(r['state'] in ('ok', 'answer') for r in rows)
    lines = [
        '# 자료 출처 점검 (probe)',
        '',
        f"{doc['checked_kst']} · {doc['where']} · 닿음 {n_ok}/{len(rows)}",
        '',
        '| 곳 | 결과 | 코드 | 걸린 시간 | 판 · 고친 날 | 바뀜 | 쓰임 |',
        '|---|---|---|---|---|---|---|',
    ]
    for r in rows:
        v = r.get('version') or {}
        ver = ' · '.join(str(v[k]) for k in (*VERSION_FIELDS, 'last-modified') if k in v) or v.get('code') or v.get('parse') or ''
        code = r['status'] if r['status'] is not None else (r.get('error') or '').split(':')[0]
        changed = {True: '**새 판**', False: '', None: ''}[r.get('changed')]
        lines.append(f"| {r['name']} | {STATE_TEXT[r['state']]} | {code} | {r['ms'] / 1000:.1f}s | {ver} | {changed} | {r['use']} |")
    lines += ['', '열림 = 2xx·3xx · 답함 = 4xx(서버는 닿음, 키·주소 문제) · 막힘? = 5xx(브이월드는 해외에서 502) · '
              '인증서 문제 = 연결은 되나 TLS 확인 실패 · 안 닿음 = 시간 초과·이름 풀이 실패 등', '']
    return '\n'.join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--prev-dir', type=Path, help='지난 latest.json·history.jsonl이 있는 폴더')
    ap.add_argument('--targets', type=Path, help='시험용 — 목록을 바꿔 끼운다(JSON 배열)')
    a = ap.parse_args()

    targets = json.loads(a.targets.read_text(encoding='utf-8')) if a.targets else TARGETS
    prev, hist = load_prev(a.prev_dir)
    now = datetime.now(timezone.utc)
    results = [probe_one(t, prev.get(t['id'])) for t in targets]
    where = 'GitHub Actions' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'local'
    if os.environ.get('RUNNER_OS'):
        where += f" ({os.environ['RUNNER_OS']}/{os.environ.get('RUNNER_ARCH', '?')})"
    doc = {
        'checked_utc': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'checked_kst': now.astimezone(KST).strftime('%Y-%m-%d %H:%M KST'),
        'where': where,
        'results': results,
    }
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / 'latest.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    md = to_markdown(doc)
    (a.out / 'latest.md').write_text(md, encoding='utf-8')
    line = {'t': doc['checked_utc'], 'where': where,
            'r': {r['id']: [r['status'], r['ms'], *([r['version']] if r.get('version') else [])] for r in results}}
    hist.append(json.dumps(line, ensure_ascii=False, separators=(',', ':')))
    (a.out / 'history.jsonl').write_text('\n'.join(hist) + '\n', encoding='utf-8')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(md)
    n_ok = sum(r['state'] in ('ok', 'answer') for r in results)
    print(f"probe: 닿음 {n_ok}/{len(results)} · 새 판 {sum(bool(r.get('changed')) for r in results)}곳 → {a.out}")


if __name__ == '__main__':
    main()
