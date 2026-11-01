#!/usr/bin/env python3
"""건물 타일 — 국토교통부 GIS건물통합정보(AL_D010) 서울분 → web/public/tiles/bldg/<판>/{z}/{x}/{y}.pbf

  python3 pipeline/bldg_tiles.py prep  <AL_D010_11_YYYYMMDD.shp> [작업 폴더]   # 읽기·높이·칸 번호 → 작업 폴더/prep.pkl
  python3 pipeline/bldg_tiles.py tiles <줌> <조각> <조각 수> [작업 폴더]         # 타일 쓰기 (조각으로 나눠 돌릴 수 있다)
  python3 pipeline/bldg_tiles.py meta  [작업 폴더]                                # latest.json

규칙 (마스터플랜 W7.5·W7.6, 점검은 데이터 명세서 '산출물 — 건물 타일')
- 높이 h(m, 정수) — 건물높이(A16)가 층수와 맞으면(층당 1.5~10m, 1~2층은 40m까지) 그대로,
  아니면 지상층수(A26) × 3.25m(층당 높이 가운데값), 둘 다 없으면 한 층(3.25m)
- 칸 c — 건물 바닥 가운데가 든 H3 res9 칸의 번호(웹 자료 cells.json 순서). 칸 밖이면 넣지 않는다
- 높이 모름 u=1 — 건물높이·지상층수가 모두 없는 건물(대장과 이어지지 않은 것, 약 22%). 큰 건물도 섞여 있다(바닥 1,000㎡ 이상의 13%)
- 줌 14는 바닥 25㎡ 미만을 빼고, 15는 전부. 4096 단위, 테두리 여유 64 — 타일 경계에 가짜 벽이 서지 않게
- 꾸러미: pyogrio · shapely 2 · pyproj · h3 4 · mapbox-vector-tile 2 (pip install --user ...)
"""
import json, math, os, pickle, sys, time
import numpy as np

W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # isohex
WEB = os.path.join(W, 'web', 'public')
HALF = 20037508.342789244
EXTENT, BUFFER, LAYER = 4096, 64, 'b'
PER_FLOOR, MIN_AREA_Z14 = 3.25, 25.0
SEOUL_5186 = (175000, 525000, 225000, 575000)   # 이 상자 밖에 바닥 가운데가 있는 건물은 좌표 오류로 뺀다


def work_dir(args, i):
    d = args[i] if len(args) > i else os.path.expanduser('~/bldg')
    os.makedirs(d, exist_ok=True)
    return d


def cells_h3():
    ver = json.load(open(os.path.join(WEB, 'data', 'latest.json')))['ver']
    return ver, json.load(open(os.path.join(WEB, 'data', ver, 'cells.json')))['h3']


def heights(a16, a26):
    h = np.nan_to_num(np.asarray(a16, float)); fl = np.nan_to_num(np.asarray(a26, float))
    r = np.divide(h, fl, out=np.zeros_like(h), where=fl > 0)
    trust = (h > 0) & ((fl <= 0) | ((r >= 1.5) & ((r <= 10) | ((fl <= 2) & (h <= 40)))))
    out = np.where(trust, h, np.where(fl > 0, fl * PER_FLOOR, PER_FLOOR))
    kind = np.where(trust, 0, np.where(fl > 0, 1, 2))   # 0 높이 · 1 층수로 · 2 모름(한 층)
    return np.clip(np.rint(out), 2, 600).astype(np.uint16), kind


def prep(args):
    import pyogrio, shapely, h3
    from pyproj import Transformer
    shp, wd = args[0], work_dir(args, 1)
    t0 = time.time()
    meta, _, geom, fields = pyogrio.raw.read(shp, encoding='cp949', columns=['A16', 'A26'])
    F = dict(zip(meta['fields'], fields))
    assert meta['crs'] == 'EPSG:5186', meta['crs']
    g = shapely.from_wkb(geom)
    n0 = len(g)
    b = shapely.bounds(g); cx = (b[:, 0] + b[:, 2]) / 2; cy = (b[:, 1] + b[:, 3]) / 2
    keep = (cx > SEOUL_5186[0]) & (cx < SEOUL_5186[2]) & (cy > SEOUL_5186[1]) & (cy < SEOUL_5186[3])
    bad = np.where(~shapely.is_valid(g))[0]
    fixed = 0
    for i in bad:
        v = shapely.make_valid(g[i])
        if v.geom_type not in ('Polygon', 'MultiPolygon'):
            parts = [p for p in shapely.get_parts(v) if p.geom_type in ('Polygon', 'MultiPolygon')]
            v = shapely.union_all(parts) if parts else None
        if v is None or v.is_empty: keep[i] = False
        else: g[i] = v; fixed += 1
    h, kind = heights(F['A16'], F['A26'])
    g, h, kind = g[keep], h[keep], kind[keep].astype(np.uint8)
    area = shapely.area(g).astype(np.float32)
    cen = shapely.centroid(g)
    to_ll = Transformer.from_crs(5186, 4326, always_xy=True)
    lon, lat = to_ll.transform(shapely.get_x(cen), shapely.get_y(cen))
    ver, h3s = cells_h3()
    idx = {k: i for i, k in enumerate(h3s)}
    c = np.array([idx.get(h3.latlng_to_cell(la, lo, 9), -1) for la, lo in zip(lat, lon)], np.int32)
    to_m = Transformer.from_crs(5186, 3857, always_xy=True)
    g = shapely.transform(g, lambda xy: np.column_stack(to_m.transform(xy[:, 0], xy[:, 1])))
    st = {'원본': n0, '좌표오류로뺌': int((~keep).sum()) - (len(bad) - fixed), '고친도형': fixed, '못고쳐뺌': len(bad) - fixed,
          '남음': len(g), '높이그대로': int((kind == 0).sum()), '층수로': int((kind == 1).sum()), '모름_한층': int((kind == 2).sum()),
          '칸밖': int((c < 0).sum()), '줌14_뺌_25㎡미만': int((area < MIN_AREA_Z14).sum()), 'cells_판': ver,
          '원본파일': os.path.basename(shp)}
    pickle.dump({'wkb': shapely.to_wkb(g), 'h': h, 'k': kind, 'c': c, 'area': area, 'bounds': shapely.bounds(g), 'stats': st},
                open(os.path.join(wd, 'prep.pkl'), 'wb'), protocol=5)
    print(json.dumps(st, ensure_ascii=False), f'{time.time() - t0:.1f}초')


def tile_bounds(z, x, y):
    s = 2 * HALF / 2 ** z
    return (-HALF + x * s, HALF - (y + 1) * s, -HALF + (x + 1) * s, HALF - y * s)


def ver_of(wd):
    return pickle.load(open(os.path.join(wd, 'prep.pkl'), 'rb'))['stats']['원본파일'].split('_')[-1].split('.')[0]


def tiles(args):
    import shapely, mapbox_vector_tile as mvt
    z, part, nparts = int(args[0]), int(args[1]), int(args[2]); wd = work_dir(args, 3)
    P = pickle.load(open(os.path.join(wd, 'prep.pkl'), 'rb'))
    ver = P['stats']['원본파일'].split('_')[-1].split('.')[0]
    sel = np.ones(len(P['h']), bool) if z >= 15 else P['area'] >= MIN_AREA_Z14
    ids = np.where(sel)[0]
    s = 2 * HALF / 2 ** z
    b = P['bounds'][ids]
    x0 = np.floor((b[:, 0] + HALF) / s).astype(int); x1 = np.floor((b[:, 2] + HALF) / s).astype(int)
    y0 = np.floor((HALF - b[:, 3]) / s).astype(int); y1 = np.floor((HALF - b[:, 1]) / s).astype(int)
    by_tile = {}
    for k, (a0, a1, c0, c1) in enumerate(zip(x0, x1, y0, y1)):
        for x in range(a0, a1 + 1):
            for y in range(c0, c1 + 1):
                if (x * 7 + y) % nparts == part: by_tile.setdefault((x, y), []).append(ids[k])
    geoms = {}
    t0 = time.time(); nbytes = nfeat = 0
    for (x, y), fl in sorted(by_tile.items()):
        fl = np.array(fl)
        tb = tile_bounds(z, x, y); pad = s * BUFFER / EXTENT
        gs = shapely.from_wkb(P['wkb'][fl])
        cl = shapely.clip_by_rect(gs, tb[0] - pad, tb[1] - pad, tb[2] + pad, tb[3] + pad)
        ok = ~shapely.is_empty(cl) & (shapely.area(cl) > 0)
        feats = []
        for gg, hh, kk, cc in zip(cl[ok], P['h'][fl][ok], P['k'][fl][ok], P['c'][fl][ok]):
            props = {'h': int(hh)}
            if cc >= 0: props['c'] = int(cc)
            if kk == 2: props['u'] = 1
            feats.append({'geometry': gg, 'properties': props})
        if not feats: continue
        data = mvt.encode([{'name': LAYER, 'features': feats}],
                          default_options={'quantize_bounds': tb, 'extents': EXTENT, 'on_invalid_geometry': mvt.encoder.on_invalid_geometry_make_valid})
        out = os.path.join(WEB, 'tiles', 'bldg', ver, str(z), str(x)); os.makedirs(out, exist_ok=True)
        open(os.path.join(out, f'{y}.pbf'), 'wb').write(data)
        nbytes += len(data); nfeat += len(feats)
    print(f'z{z} 조각 {part}/{nparts}: 타일 {len(by_tile)} · 건물 {nfeat} · {nbytes/1e6:.1f}MB · {time.time() - t0:.0f}초')


def meta(args):
    wd = work_dir(args, 0)
    P = pickle.load(open(os.path.join(wd, 'prep.pkl'), 'rb')); st = P['stats']
    ver = st['원본파일'].split('_')[-1].split('.')[0]
    root = os.path.join(WEB, 'tiles', 'bldg', ver)
    zs = {}
    for z in sorted(os.listdir(root)):
        files = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(root, z)) for f in fs if f.endswith('.pbf')]
        sizes = sorted(os.path.getsize(f) for f in files)
        zs[z] = {'tiles': len(files), 'bytes': sum(sizes), 'max': sizes[-1], 'p95': sizes[int(len(sizes) * 0.95)]}
    m = {'ver': ver, 'as_of': f'{ver[:4]}-{ver[4:6]}-{ver[6:]}', 'path': f'tiles/bldg/{ver}/{{z}}/{{x}}/{{y}}.pbf',
         'layer': LAYER, 'minzoom': 14, 'maxzoom': 15, 'props': {'h': '높이(m)', 'c': '칸 번호(cells.json 순서)', 'u': '1이면 높이 모름 — 한 층으로 세움'},
         'source': '국토교통부 GIS건물통합정보 (브이월드 공간정보 다운로드, 서울특별시 전체데이터)', 'license': 'CC BY',
         'buildings': st['남음'], 'height_from': {'건물높이': st['높이그대로'], '지상층수×3.25m': st['층수로'], '모름(한 층)': st['모름_한층']},
         'cells_ver': st['cells_판'], 'zooms': zs}
    json.dump(m, open(os.path.join(WEB, 'tiles', 'bldg', 'latest.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(m, ensure_ascii=False))


if __name__ == '__main__':
    {'prep': prep, 'tiles': tiles, 'meta': meta}[sys.argv[1]](sys.argv[2:])
