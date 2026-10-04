// 노면 표시 조립(M05-T02): 셀 OSM 레코드 → 횡단보도·정지선(신호·止まれ)·차선 → 데칼 버퍼 + 통계. 04 §4.3(노면 표시), ADR-0050
// M06 사전 2(ADR-0058): PLATEAU frn 横断歩道·停止線(측량)이 있으면 그것을 그리고, 덮인 OSM 횡단 선분·근처 OSM 정지선은 뺀다(정지선 기준 띠는 PLATEAU 띠로).
// OSM 횡단 선은 content 보정 파일(GSI 항공사진 대조)을 먼저 적용한다 — OSM 원본은 고치지 않는다.
import type { MarkingRecord } from '../../../readers/plateau/frn-markings.ts';
import type { RoadRecord } from '../../../readers/plateau/types.ts';
import type { OsmRecord } from '../../normalize-osm.ts';
import { roadIndex } from '../roads.ts';
import {
  add,
  type DecalBuf,
  emptyDecals,
  type MarkCtx,
  mul,
  owns,
  PAINT,
  stripe,
  type TerrainAt,
  triangle,
  type V2,
} from './common.ts';
import { applyCrossingCorrections, type CrossingCorrection } from './corrections.ts';
import { addCrosswalk, type CrossBand, crossBands, isMarkedCrossing } from './crosswalk.ts';
import { addLanes, isLaneRoad } from './lanes.ts';
import { coveringBand, inBand, inTriangles, type PlateauMarks, plateauMarks, type Tri2 } from './plateau.ts';
import { addSignalStops, addStopSigns, isVehicleRoad } from './stopline.ts';

/** PLATEAU 車道交差部(TrafficArea_function 1020). */
const INTERSECTION_CODE = 'TrafficArea:1020';
/** 일본 横断歩道 막대·간격(m) — 영역형 PLATEAU 면 채우기. */
const BAR_M = 0.45;
const PERIOD_M = 0.9;

export interface MarkingStats {
  crosswalkBars: number;
  stopLines: number;
  stopSigns: number;
  lanePieces: number;
  /** PLATEAU 横断歩道(그린 것 — 이 셀 소유 삼각형·막대가 하나라도) · 停止線 수. */
  plateauCrosswalks: number;
  plateauStopLines: number;
}

export interface MarkingInput {
  /** 이 셀 OSM 레코드(선·면 = 셀에 닿는 것 전부, 점 = 셀 안). */
  osm: readonly OsmRecord[];
  /** 셀 + 8-이웃 PLATEAU 도로(차도 분류·교차부). */
  roads: readonly RoadRecord[];
  ox: number;
  oz: number;
  terrainAt: TerrainAt;
  /** 셀 + 8-이웃 PLATEAU 道路標示(frn). 없으면 OSM만. */
  plateau?: readonly MarkingRecord[];
  /** OSM 횡단 선 보정(content/markings). */
  corrections?: readonly CrossingCorrection[];
}

const centroid = (t: Tri2): V2 => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];

/** PLATEAU 표시 그리기(이 셀 소유분): 줄무늬형·停止線 = 삼각형 그대로, 영역형 = 면 안 0.45 m 막대. 반환 = [横断歩道, 停止線] 수. */
function addPlateau(c: MarkCtx, m: PlateauMarks): [number, number] {
  let cw = 0;
  for (const x of m.crosswalks) {
    let drawn = 0;
    if (x.striped) {
      for (const t of x.tris) if (owns(c, centroid(t))) drawn += triangle(c, t[0], t[1], t[2], PAINT.white);
    } else {
      const { a, b, half, u } = x.band;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s + BAR_M <= L; s += PERIOD_M) {
        const p = add(a, mul(u, s));
        if (!owns(c, add(p, mul(u, BAR_M / 2)))) continue;
        drawn += stripe(c, p, add(p, mul(u, BAR_M)), half * 2 + 1, PAINT.white, (q) => inTriangles(x.tris, q));
      }
    }
    if (drawn > 0) cw++;
  }
  let sl = 0;
  for (const x of m.stopLines) {
    let drawn = 0;
    for (const t of x.tris) if (owns(c, centroid(t))) drawn += triangle(c, t[0], t[1], t[2], PAINT.white);
    if (drawn > 0) sl++;
  }
  return [cw, sl];
}

/** bands = 신호·정지선 기준 횡단 띠(보정·PLATEAU 대체 뒤 — 내비 횡단보도 M06-T03도 이것). */
export function buildMarkings(i: MarkingInput): { decals: DecalBuf; stats: MarkingStats; bands: CrossBand[] } {
  const intersections = roadIndex(i.roads.filter((r) => r.functionCode === INTERSECTION_CODE));
  const osm = applyCrossingCorrections(i.osm, i.corrections ?? []);
  const pm = plateauMarks(
    i.plateau ?? [],
    osm.filter(isMarkedCrossing).map((r) => r.rings[0] ?? []),
  );
  const c: MarkCtx = {
    out: emptyDecals(),
    ox: i.ox,
    oz: i.oz,
    terrainAt: i.terrainAt,
    roads: roadIndex(i.roads),
    inIntersection: (x, z) => intersections.classify(x, z) !== 'none',
    stopBlocked: (p) => pm.stopLines.some((s) => inBand(s.band, p, 3)),
  };
  const onRoad = (p: V2): boolean => c.roads.classify(p[0], p[1]) === 'road';
  const covered = (a: V2, b: V2): boolean => coveringBand(pm, a, b, onRoad) !== undefined;
  const [plateauCrosswalks, plateauStopLines] = addPlateau(c, pm);
  const stats: MarkingStats = {
    crosswalkBars: 0,
    stopLines: 0,
    stopSigns: 0,
    lanePieces: 0,
    plateauCrosswalks,
    plateauStopLines,
  };
  // 정지선 기준 띠: PLATEAU가 덮은 선분은 PLATEAU 띠(신호 여부는 OSM)로.
  const bands = crossBands(osm).map((b): CrossBand => {
    const pb = coveringBand(pm, b.a, b.b, onRoad);
    return pb ? { a: pb.a, b: pb.b, half: pb.half, signal: b.signal } : b;
  });
  for (const r of osm) if (isMarkedCrossing(r)) stats.crosswalkBars += addCrosswalk(c, r, covered);
  const vehicle = osm.filter(isVehicleRoad);
  stats.stopLines = addSignalStops(c, bands, vehicle);
  stats.stopSigns = addStopSigns(c, osm, vehicle);
  for (const r of osm) if (isLaneRoad(r)) stats.lanePieces += addLanes(c, r, bands);
  return { decals: c.out, stats, bands };
}
