// PLATEAU 코드리스트 → 게임 레이어 축약값. 원 코드는 레코드에 보존한다. see docs/04-data-pipeline.md §4.2
// 출처: PLATEAU 2025 codelists/TrafficArea_function.xml, AuxiliaryTrafficArea_function.xml (標準製品仕様書 v5)
import type { RoadFunction } from './types.ts';

/** TrafficArea_function: 1000 車道部, 1010 車線, 1020 車道交差部, 1030 すりつけ区間, 1040 踏切道, 1050 軌道敷,
 * 1070 待避所, 1130 副道 / 2000 歩道部, 2010 自転車歩行者道, 2020 歩道, 2030 自転車道 / 6000·7000 駐車場, 8xxx 軌道 */
const TRAFFIC_AREA: Readonly<Record<string, RoadFunction>> = {
  '1000': 'carriageway',
  '1010': 'carriageway',
  '1020': 'carriageway',
  '1030': 'carriageway',
  '1040': 'carriageway',
  '1050': 'carriageway',
  '1070': 'carriageway',
  '1130': 'carriageway',
  '2000': 'sidewalk',
  '2010': 'sidewalk',
  '2020': 'sidewalk',
  '2030': 'sidewalk',
};

/** AuxiliaryTrafficArea_function: 1000 車道部, 1060 非常駐車帯, 1090 側帯, 1100 路肩, 1110 停車帯, 1120 乗合自動車停車所 /
 * 1080 中央帯, 3000 島, 3010 交通島, 3020 分離帯, 4000 路面電車停車所, 5000·5010·5020 植栽 */
const AUX_TRAFFIC_AREA: Readonly<Record<string, RoadFunction>> = {
  '1000': 'carriageway',
  '1060': 'carriageway',
  '1090': 'carriageway',
  '1100': 'carriageway',
  '1110': 'carriageway',
  '1120': 'carriageway',
  '1080': 'island',
  '3000': 'island',
  '3010': 'island',
  '3020': 'island',
  '4000': 'island',
  '5000': 'island',
  '5010': 'island',
  '5020': 'island',
};

export type TrafficAreaType = 'TrafficArea' | 'AuxiliaryTrafficArea' | 'Road';

/** 코드 → 축약 기능. Road(LOD1 대체)는 전체 도로면이라 'carriageway'. 횡단보도는 PLATEAU tran에 없음 → OSM(derive). */
export function roadFunctionOf(type: TrafficAreaType, code: string | null): RoadFunction {
  if (type === 'Road') return 'carriageway';
  const table = type === 'TrafficArea' ? TRAFFIC_AREA : AUX_TRAFFIC_AREA;
  return (code !== null && table[code]) || 'other';
}

/** PLATEAU 미상값(9999, -9999 등) → null. */
export function knownNumber(text: string | null): number | null {
  if (text === null) return null;
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v === 9999 || v === -9999 || v < 0) return null;
  return v;
}
