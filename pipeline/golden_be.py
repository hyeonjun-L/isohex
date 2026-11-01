#!/usr/bin/env python3
"""손익 시험용 고정 자료 — analysis/panel/결과/breakeven_data.json(p19)에서 web/tests/golden/be_meta.json으로.

  python3 pipeline/golden_be.py [breakeven_data.json] [출력]

카드 수수료표·분위 위치와 60개 업종의 분위값(q)·α·객단가·변동비율만 담는다(작아서 저장소에 둔다, 약 15KB).
상권·행정동 행(S·D)은 웹 자료 내보내기(export_web.py)가 맡는다. 원본 sha256을 함께 적어 어느 판으로 만든 값인지 남긴다.
"""
import hashlib, json, os, sys, datetime

W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(W, 'analysis', 'panel', '결과', 'breakeven_data.json')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(W, 'web', 'tests', 'golden', 'be_meta.json')
raw = open(src, 'rb').read()
B = json.loads(raw)
m = B['meta']
g = {
    'src': os.path.basename(src), 'sha256': hashlib.sha256(raw).hexdigest(), 'year': m['year'],
    'made': datetime.date.today().isoformat(),
    'meta': {'card': m['card'], 'qs': m['qs'], 'alpha0': m['alpha0']},
    'ind': [{'k': d['k'], 'nm': d['nm'], 'v': d['v'], 'alpha': d['alpha'], 'q': d['q'], 'ticket': d['ticket']} for d in B['ind']],
}
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(g, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(out, len(g['ind']), '업종', os.path.getsize(out), 'B')
