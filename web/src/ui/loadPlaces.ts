import { type BaseData, loadJSON } from '../core/data'
import { type PlaceIndex, type PlaceNames, type StationData, buildPlaceIndex, placeGrid } from '../core/places'

/**
 * 곳 찾기 목록 — 동(dongs.json) + 역(places/stations.json) + 상권 · 법정동 이름(places/names.json).
 * 역이나 이름 파일을 못 받아도(옛 판 · 받기 실패) 받은 것만으로 만든다
 */
export async function loadPlaces(data: BaseData): Promise<PlaceIndex> {
  const [st, nm] = await Promise.all([
    loadJSON<StationData>(data.ver, 'places/stations.json').catch(() => null),
    loadJSON<PlaceNames>(data.ver, 'places/names.json').catch(() => null),
  ])
  return buildPlaceIndex(placeGrid(data.cells), data.dongs, st, nm)
}
