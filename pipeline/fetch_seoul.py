#!/usr/bin/env python3
"""서울시 상권분석서비스 OpenAPI 받기 — 연도 파일(zip)이 아직 없는 분기를 API로 받는다 (마스터플랜 W7.15)

왜   열린데이터광장의 연도 파일은 해가 끝난 뒤 올라온다. 2026년 분기는 OpenAPI에만 있다.
     Cowork 작업 공간은 이 주소(openapi.seoul.go.kr:8088)에 닿지 않아 이현준님 Mac 터미널에서 돈다.
무엇 추정매출-상권(VwsmTrdarSelngQq) · 점포-상권(VwsmTrdarStorQq)을 분기마다 1,000줄씩 끝까지 받아
     2025년 점포 파일과 같은 꼴(열 이름 = 소문자 영문, cp949, 모든 칸 따옴표)의 CSV로 쓴다.
     받은 줄 수가 API가 말한 전체 수와 같은지, 모든 줄이 그 분기인지 확인한다.
키   환경변수 SEOUL_API_KEY. 없으면 입력창에 붙여 넣는다(화면에 안 보임). 키는 어디에도 쓰지 않는다.

    cd ~/Developer/isohex
    python3 pipeline/fetch_seoul.py                      # 2026Q1부터 최신 분기까지 + 대조용 2025Q4
    python3 pipeline/fetch_seoul.py --quarters 20261 20262 --check 20254

쓰는 곳 (isohex/서울시 상권분석 서비스/api/)
    서울시 상권분석서비스(추정매출-상권)_API_<첫분기>-<끝분기>.csv   ← analysis/build_master.py가 읽는다
    서울시 상권분석서비스(점포-상권)_API_<첫분기>-<끝분기>.csv
    점검/…_<분기>.csv   대조용(연도 파일에도 있는 분기) — build_master는 읽지 않는다
    받은기록.json       언제·무엇을·몇 줄·sha256 (키는 남기지 않는다)
같은 분기의 연도 파일이 나오면 build_master는 연도 파일을 쓴다(API 줄은 버린다). 표준 라이브러리만 쓴다.
"""
from __future__ import annotations

import argparse
import csv
import getpass
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
BASE = os.environ.get('SEOUL_API_BASE', 'http://openapi.seoul.go.kr:8088')   # 시험 때만 바꾼다
PAGE = 1000                                   # 한 번에 1,000줄까지 (서울 OpenAPI 규칙)
SERVICES = {
    'sales': ('VwsmTrdarSelngQq', '추정매출-상권'),
    'store': ('VwsmTrdarStorQq', '점포-상권'),
}
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / '서울시 상권분석 서비스' / 'api'


class ApiError(Exception):
    pass


def call(key: str, svc: str, start: int, end: int, quarter: str, tries: int = 4) -> dict:
    """한 쪽 받기 — 실패하면 1·2·4초 쉬고 다시. 키 문제·자료 없음은 바로 알린다"""
    url = f"{BASE}/{urllib.parse.quote(key)}/json/{svc}/{start}/{end}/{quarter}"
    last = ''
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'jeomji-fetch/1'}), timeout=60) as r:
                doc = json.loads(r.read().decode('utf-8'))
            body = doc.get(svc) if isinstance(doc, dict) else None
            result = (body or doc).get('RESULT', {}) if isinstance(body or doc, dict) else {}
            code = result.get('CODE', '')
            if code == 'INFO-000' and body:
                return body
            if code == 'INFO-200':
                return {'list_total_count': 0, 'row': []}
            if code in ('INFO-100', 'ERROR-300', 'ERROR-301', 'ERROR-310', 'ERROR-331', 'ERROR-332', 'ERROR-333', 'ERROR-334', 'ERROR-335', 'ERROR-336'):
                raise ApiError(f"{code} {result.get('MESSAGE', '')}")
            last = f"{code} {result.get('MESSAGE', '')}".strip() or 'RESULT 없음'
        except ApiError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            last = f'{type(e).__name__}: {e}'
        time.sleep(2 ** i)
    raise ApiError(f'{svc} {quarter} {start}-{end} 받기 실패 — {last}')


def fetch_quarter(key: str, svc: str, quarter: str) -> tuple[list[str], list[dict], int]:
    first = call(key, svc, 1, 1, quarter)
    total = int(first.get('list_total_count') or 0)
    if total == 0:
        return [], [], 0
    rows: list[dict] = []
    for s in range(1, total + 1, PAGE):
        e = min(s + PAGE - 1, total)
        body = call(key, svc, s, e, quarter)
        got = body.get('row', [])
        if len(got) != e - s + 1:
            raise ApiError(f'{svc} {quarter} {s}-{e}: {len(got)}줄만 왔다')
        rows += got
        time.sleep(0.05)
    fields = list(rows[0].keys())
    bad = [r for r in rows if str(r.get('STDR_YYQU_CD')) != quarter]
    if bad:
        raise ApiError(f'{svc} {quarter}: 다른 분기 줄 {len(bad)}개 (예: {bad[0].get("STDR_YYQU_CD")})')
    if len(rows) != total:
        raise ApiError(f'{svc} {quarter}: {len(rows):,}줄 ≠ 전체 {total:,}')
    return fields, rows, total


def latest_quarter(key: str, back: int = 8) -> str | None:
    now = datetime.now(KST)
    y, q = now.year, (now.month - 1) // 3 + 1
    for _ in range(back):
        code = f'{y}{q}'
        if int(call(key, SERVICES['sales'][0], 1, 1, code).get('list_total_count') or 0) > 0:
            return code
        q -= 1
        if q == 0:
            y, q = y - 1, 4
    return None


def quarters_between(a: str, b: str) -> list[str]:
    y, q = int(a[:4]), int(a[4])
    out = []
    while f'{y}{q}' <= b:
        out.append(f'{y}{q}')
        q += 1
        if q == 5:
            y, q = y + 1, 1
    return out


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> tuple[int, str]:
    """2025년 점포 파일과 같은 꼴 — 소문자 영문 열, cp949, 모든 칸 따옴표. cp949에 없는 글자는 ?로 (상권·업종 이름에서만 나온다)"""
    buf = io.StringIO()
    w = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator='\n')
    w.writerow([f.lower() for f in fields])
    for r in rows:
        w.writerow(['' if r.get(f) is None else (str(int(r[f])) if isinstance(r[f], float) and r[f].is_integer() else str(r[f])) for f in fields])
    text = buf.getvalue()
    data = text.encode('cp949', errors='replace')
    replaced = data.count(b'?') - text.count('?')
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.part')
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return max(replaced, 0), hashlib.sha256(data).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--quarters', nargs='*', help='받을 분기(YYYYQ). 기본: 2026Q1부터 API의 최신 분기까지')
    ap.add_argument('--check', nargs='*', default=['20254'], help='대조용 분기 — 연도 파일에도 있어 build_master는 읽지 않는다 (기본 20254)')
    ap.add_argument('--out', type=Path, default=OUT)
    a = ap.parse_args()

    key = os.environ.get('SEOUL_API_KEY') or getpass.getpass('서울 열린데이터광장 인증키 (붙여 넣고 Enter, 화면에 안 보임): ').strip()
    if not key:
        print('인증키가 없습니다.', file=sys.stderr)
        return 2
    t0 = time.monotonic()
    try:
        if a.quarters:
            qs = sorted(a.quarters)
        else:
            last = latest_quarter(key)
            if not last:
                print('API에서 최근 분기를 찾지 못했습니다.', file=sys.stderr)
                return 1
            qs = quarters_between('20261', last)
        print(f"받을 분기 {', '.join(qs)} · 대조용 {', '.join(a.check) or '없음'} → {a.out}")
        log = {'받은_때': datetime.now(KST).strftime('%Y-%m-%d %H:%M KST'), '주소': BASE, '분기': qs, '대조용': a.check, '파일': []}
        for kind, (svc, ko) in SERVICES.items():
            for group, quarters, folder in (('새 분기', qs, a.out), ('대조용', a.check, a.out / '점검')):
                if not quarters:
                    continue
                all_rows: list[dict] = []
                fields: list[str] = []
                counts = {}
                for q in quarters:
                    t1 = time.monotonic()
                    f, rows, total = fetch_quarter(key, svc, q)
                    if not rows:
                        print(f'  {ko} {q}: 자료 없음 — 건너뜀')
                        counts[q] = 0
                        continue
                    if fields and f != fields:
                        raise ApiError(f'{svc}: 분기마다 열이 다르다 ({q})')
                    fields = f
                    all_rows += rows
                    counts[q] = total
                    print(f'  {ko} {q}: {total:,}줄 ({-(-total // PAGE)}번 요청, {time.monotonic() - t1:.0f}초)')
                if not all_rows:
                    continue
                got = [q for q in quarters if counts.get(q)]
                if group == '새 분기':
                    name = f'서울시 상권분석서비스({ko})_API_{got[0]}-{got[-1]}.csv'
                    path = folder / name
                else:
                    path = folder / f'서울시 상권분석서비스({ko})_API_점검_{"-".join(got)}.csv'
                rep, digest = write_csv(path, fields, all_rows)
                if group == '새 분기':      # 예전에 받은 API 파일(분기 범위가 다른 것)은 새 파일로 바꾼다
                    for old in folder.glob(f'서울시 상권분석서비스({ko})_API_*.csv'):
                        if old != path:
                            old.unlink()
                            print(f'  (예전 파일 {old.name} → 새 파일로 바꿈)')
                log['파일'].append({'파일': str(path.relative_to(a.out.parent)), '종류': ko, '무리': group, '분기별_줄': counts,
                                  '열': len(fields), 'sha256': digest, 'cp949_바꾼_글자': rep})
                print(f'  → {path.name} ({len(all_rows):,}줄, 열 {len(fields)}개{", cp949에 없는 글자 " + str(rep) + "개를 ?로" if rep else ""})')
        log['걸린_초'] = round(time.monotonic() - t0)
        a.out.mkdir(parents=True, exist_ok=True)
        (a.out / '받은기록.json').write_text(json.dumps(log, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    except ApiError as e:
        msg = str(e)
        hint = ' — 인증키를 다시 확인해 주세요' if msg.startswith(('INFO-100', 'ERROR-3')) else ''
        print(f'멈춤: {msg}{hint}', file=sys.stderr)
        return 1
    print(f'끝 — {time.monotonic() - t0:.0f}초. 받은기록: {a.out / "받은기록.json"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
