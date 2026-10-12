# -*- coding: utf-8 -*-
"""p23 (1/2) — OpenStreetMap 추출: 서울과 둘레 5km의 길·철도만 뽑아 작은 파일로 (후보 찾기·등시선, 마스터플랜 §5.18)

입력:  ../../OSM/south-korea-261011.osm.pbf  (Geofabrik, 2026-10-11 데이터, md5 df6f9430a975f927c08f4afddade7f97, ODbL)
출력:  ../../OSM/서울_길.npz        길(way)마다 꼭짓점 번호·경도·위도 (이어 붙인 배열 + 시작 위치)
       ../../OSM/서울_길.csv        길마다 속성 — way_id·highway·oneway·junction·maxspeed·motorroad·access·foot·service·bridge·tunnel·name
       ../../OSM/서울_철도.json     철도 노선(관계)마다 정차 순서와 정차 지점 좌표·이름
사용:  python3 p23_osm_extract.py [pbf] [출력 폴더]      (Mac 작업 공간 4GB에서 약 2분 — 나라 전체 파일을 세 번 훑는다)

범위: 경도 126.70~127.26, 위도 37.37~37.77 — 서울(126.76~127.19, 37.41~37.72) 둘레 약 5km. 꼭짓점이 하나라도 범위 안인 길은 통째로 둔다.
철도: type=route 관계 중 route = subway · light_rail · train · monorail 이고 정차 지점이 범위 안에 있는 것. 정차 지점은 역할이 stop·stop_entry_only·stop_exit_only인 꼭짓점."""
import csv, json, os, sys, time
import numpy as np
import osmium

H = os.path.dirname(os.path.abspath(__file__))
PBF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, "..", "..", "OSM", "south-korea-261011.osm.pbf")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(H, "..", "..", "OSM")
BB = (126.70, 37.37, 127.26, 37.77)       # 서쪽, 남쪽, 동쪽, 북쪽
KEEP = ("highway", "oneway", "junction", "maxspeed", "motorroad", "access", "motor_vehicle", "foot", "service", "bridge", "tunnel", "name")
RAIL = {"subway", "light_rail", "train", "monorail"}
inb = lambda lon, lat: BB[0] <= lon <= BB[2] and BB[1] <= lat <= BB[3]
t0 = time.time()

# ① 길 — 꼭짓점 좌표가 붙은 highway 길
ids, lons, lats, ptr, attrs = [], [], [], [0], []
fp = (osmium.FileProcessor(PBF).with_locations()
      .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(osmium.filter.KeyFilter("highway")))
seen = 0
for w in fp:
    seen += 1
    try:
        pts = [(n.ref, n.lon, n.lat) for n in w.nodes]
    except osmium.InvalidLocationError:
        pts = [(n.ref, n.lon, n.lat) for n in w.nodes if n.location.valid()]
    if len(pts) < 2 or not any(inb(lo, la) for _, lo, la in pts):
        continue
    for r, lo, la in pts:
        ids.append(r); lons.append(lo); lats.append(la)
    ptr.append(len(ids))
    attrs.append([w.id] + [w.tags.get(k, "") for k in KEEP])
print(f"길: highway {seen:,}개 중 범위 안 {len(attrs):,}개, 꼭짓점 {len(ids):,}개 ({time.time()-t0:.0f}초)", flush=True)
os.makedirs(OUT, exist_ok=True)
np.savez_compressed(os.path.join(OUT, "서울_길.npz"), node=np.array(ids, dtype=np.int64), lon=np.array(lons), lat=np.array(lats),
                    ptr=np.array(ptr, dtype=np.int64))
with open(os.path.join(OUT, "서울_길.csv"), "w", encoding="utf-8-sig", newline="") as f:
    cw = csv.writer(f); cw.writerow(("way_id",) + KEEP); cw.writerows(attrs)
del ids, lons, lats, ptr, attrs

# ② 철도 노선 관계
routes = []
for r in osmium.FileProcessor(PBF).with_filter(osmium.filter.EntityFilter(osmium.osm.RELATION)).with_filter(osmium.filter.TagFilter(("type", "route"))):
    rt = r.tags.get("route", "")
    if rt not in RAIL:
        continue
    stops = [m.ref for m in r.members if m.type == "n" and m.role in ("stop", "stop_entry_only", "stop_exit_only")]
    if len(stops) < 2:
        continue
    routes.append({"id": r.id, "route": rt, "ref": r.tags.get("ref", ""), "name": r.tags.get("name", ""), "name_ko": r.tags.get("name:ko", ""),
                   "colour": r.tags.get("colour", ""), "operator": r.tags.get("operator", ""), "network": r.tags.get("network", ""),
                   "from": r.tags.get("from", ""), "to": r.tags.get("to", ""), "service": r.tags.get("service", ""), "stops": stops})
print(f"철도 노선 관계 {len(routes):,}개 ({time.time()-t0:.0f}초)", flush=True)

# ③ 정차 지점 좌표·이름
need = sorted({s for rr in routes for s in rr["stops"]})
nodes = {}
for n in osmium.FileProcessor(PBF).with_filter(osmium.filter.EntityFilter(osmium.osm.NODE)).with_filter(osmium.filter.IdFilter(need)):
    nodes[n.id] = {"lon": round(n.location.lon, 7), "lat": round(n.location.lat, 7), "name": n.tags.get("name", ""), "name_ko": n.tags.get("name:ko", ""),
                   "railway": n.tags.get("railway", ""), "pt": n.tags.get("public_transport", "")}
routes = [rr for rr in routes if any(s in nodes and inb(nodes[s]["lon"], nodes[s]["lat"]) for s in rr["stops"])]
used = {s for rr in routes for s in rr["stops"]}
json.dump({"bbox": BB, "source": os.path.basename(PBF), "routes": routes, "nodes": {str(k): v for k, v in nodes.items() if k in used}},
          open(os.path.join(OUT, "서울_철도.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"범위 안 철도 노선 {len(routes):,}개, 정차 지점 {len(used):,}곳 (좌표 못 찾음 {len([s for s in used if s not in nodes])}) — 끝 {time.time()-t0:.0f}초", flush=True)
