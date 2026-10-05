// 셀 차선(M06-T05, ADR-0065): 영역(셀 + 8-이웃) OSM 간선 → derive/lanes 초안 → 셀로 잘라 lanes.bin(gzip). 정지선 신호 코드 = 소품 차량 신호기와 같은 사이트·규칙
// (signal-sites — 교차로 1020 묶음·OSM 차도 축·계획 사이트) → 신호등·차·보행자가 같은 박자. 신호 교차점 = 신호 점·신호 횡단 선 30 m 안.
import { gzip, writeLanes } from '@sanpo/tile-format';
import type { RoadRecord } from '../../readers/plateau/types.ts';
import { bilinear } from '../derive/grid.ts';
import { buildLaneDrafts, cellLanes, type LaneSignals } from '../derive/lanes.ts';
import { isVehicleRoad } from '../derive/markings/stopline.ts';
import {
  junctionsOf,
  type SignalPlanSite,
  signalCode,
  siteFinder,
  weightedRoadLines,
} from '../derive/props/signal-sites.ts';
import type { ShapedGround } from '../derive/terrain-shape.ts';
import type { OsmRecord } from '../normalize-osm.ts';

const SIGNAL_REACH_M = 30;

export interface LanesCellInput {
  ox: number;
  oz: number;
  roads: readonly RoadRecord[];
  vehicleRoadsAround: readonly OsmRecord[];
  /** 셀 + 8-이웃 신호 점(highway=traffic_signals)·신호 횡단 선. */
  signalsAround: readonly OsmRecord[];
  shaped: ShapedGround;
  signalSites?: readonly SignalPlanSite[];
}

export interface LanesCellStats {
  lanes: number;
  connectors: number;
  signalLanes: number;
  bytes: number;
}

function signalsOf(i: LanesCellInput): LaneSignals {
  const pts: [number, number][] = [];
  for (const r of i.signalsAround) {
    const xz = r.rings[0] ?? [];
    for (let k = 0; k + 1 < xz.length; k += 2) pts.push([xz[k] as number, xz[k + 1] as number]);
  }
  const w = weightedRoadLines(i.vehicleRoadsAround.filter(isVehicleRoad));
  const site = siteFinder(
    junctionsOf(i.roads.filter((r) => r.functionCode === 'TrafficArea:1020')),
    [...(i.signalSites ?? [])],
    w.lines,
    w.weights,
  );
  return {
    signalized: (x, z) => pts.some((p) => Math.hypot(p[0] - x, p[1] - z) <= SIGNAL_REACH_M),
    code: (x, z, dx, dz) => signalCode(site([x, z], { center: [x, z], axis: Math.atan2(dz, dx) }), 'vehicle', dx, dz),
  };
}

export async function lanesCell(i: LanesCellInput): Promise<{ bytes: Uint8Array | null; stats: LanesCellStats }> {
  const drafts = buildLaneDrafts(i.vehicleRoadsAround, signalsOf(i));
  const g = i.shaped.grid;
  const chunk = cellLanes(drafts, i.ox, i.oz, (x, z) => bilinear(g, i.shaped.ground, x - i.ox, z - i.oz));
  if (!chunk) return { bytes: null, stats: { lanes: 0, connectors: 0, signalLanes: 0, bytes: 0 } };
  const bytes = await gzip(writeLanes(chunk));
  let connectors = 0;
  let signalLanes = 0;
  for (let k = 0; k < chunk.lanes.id.length; k++) {
    if (chunk.lanes.kind[k] === 1) connectors++;
    if (chunk.lanes.signal[k] !== 0xffffffff) signalLanes++;
  }
  return {
    bytes,
    stats: { lanes: chunk.lanes.id.length - connectors, connectors, signalLanes, bytes: bytes.byteLength },
  };
}
