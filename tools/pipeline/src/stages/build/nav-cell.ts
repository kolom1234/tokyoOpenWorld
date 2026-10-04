// 셀 내비(M06-T03, ADR-0063): 조립 중간 결과(성형·도로·소품 콜라이더·횡단 띠) → derive/navmesh 입력 → nav.bin. 신호 횡단 코드는 소품 신호기와 같은
// 사이트·규칙(signal-sites — 교차로 1020 묶음·OSM 차도 축·계획 사이트)이라 신호등과 보행자가 같은 박자.
import type { JcolShape } from '@sanpo/tile-format';
import type { RoadRecord } from '../../readers/plateau/types.ts';
import type { FootprintSource } from '../derive/footprints.ts';
import { bilinear } from '../derive/grid.ts';
import { type CrossBand, crosswalkWidth, isMarkedCrossing } from '../derive/markings/crosswalk.ts';
import { isVehicleRoad } from '../derive/markings/stopline.ts';
import { buildNavCell, type NavCellStats } from '../derive/navmesh.ts';
import {
  junctionsOf,
  type SignalPlanSite,
  signalCode,
  siteFinder,
  weightedRoadLines,
} from '../derive/props/signal-sites.ts';
import { TOP_OFFSET_M } from '../derive/sidewalks.ts';
import type { ShapedGround } from '../derive/terrain-shape.ts';
import type { OsmRecord } from '../normalize-osm.ts';

export interface NavCellBuildInput {
  ix: number;
  iz: number;
  ox: number;
  oz: number;
  roads: readonly RoadRecord[];
  footprints: readonly FootprintSource[];
  osm: readonly OsmRecord[];
  vehicleRoadsAround?: readonly OsmRecord[];
  shaped: ShapedGround;
  /** 표시 횡단 띠(buildMarkings bands — 보정·PLATEAU 대체 뒤). */
  bands: readonly CrossBand[];
  colliders: readonly JcolShape[];
  signalSites?: readonly SignalPlanSite[];
}

/** 표시 없는 횡단(footway=crossing, unmarked 등)도 내비엔 넣는다(폭 ≤ 3 m). */
function unmarkedBands(osm: readonly OsmRecord[]): CrossBand[] {
  const out: CrossBand[] = [];
  for (const r of osm) {
    if (r.geom !== 'line' || r.tags.footway !== 'crossing' || isMarkedCrossing(r)) continue;
    const xz = r.rings[0] ?? [];
    const half = Math.min(crosswalkWidth(r), 3) / 2;
    for (let i = 0; i + 3 < xz.length; i += 2)
      out.push({
        a: [xz[i] as number, xz[i + 1] as number],
        b: [xz[i + 2] as number, xz[i + 3] as number],
        half,
        signal: r.tags.crossing === 'traffic_signals',
      });
  }
  return out;
}

/** 끝점을 공유하고(0.5 m) 거의 일직선(15° 안)인 띠는 하나로 — OSM 횡단 선의 도로 중간 꼭짓점(스크램블 대각선 등)에서 끊긴 조각을 잇는다. */
export function mergeCollinear(bands: readonly CrossBand[]): CrossBand[] {
  const out = bands.map((b) => ({ ...b, a: [...b.a] as [number, number], b: [...b.b] as [number, number] }));
  const dir = (b: CrossBand): [number, number] => {
    const L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) || 1;
    return [(b.b[0] - b.a[0]) / L, (b.b[1] - b.a[1]) / L];
  };
  const near = (p: readonly number[], q: readonly number[]) =>
    Math.hypot((p[0] as number) - (q[0] as number), (p[1] as number) - (q[1] as number)) < 0.5;
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++)
      for (let j = 0; j < out.length && !merged; j++) {
        const x = out[i] as CrossBand;
        const y = out[j] as CrossBand;
        if (i === j || x.signal !== y.signal || Math.abs(x.half - y.half) > 0.01 || !near(x.b, y.a)) continue;
        const [dx, dz] = dir(x);
        const [ex, ez] = dir(y);
        if (dx * ex + dz * ez < Math.cos(Math.PI / 12)) continue;
        out[i] = { ...x, b: y.b };
        out.splice(j, 1);
        merged = true;
      }
  }
  return out;
}

export type NavCellOutput = { bytes: Uint8Array | null; stats: NavCellStats };

export function navCell(i: NavCellBuildInput): Promise<NavCellOutput> {
  const g = i.shaped.grid;
  const w = weightedRoadLines(i.vehicleRoadsAround ?? i.osm.filter(isVehicleRoad));
  const site = siteFinder(
    junctionsOf(i.roads.filter((r) => r.functionCode === 'TrafficArea:1020')),
    [...(i.signalSites ?? [])],
    w.lines,
    w.weights,
  );
  // 소품 보행 신호기(props/signals.ts)와 같은 식: 띠 중점·보행 방향 w, 대체 축 = w의 수직.
  const signalOf = (b: CrossBand): number => {
    const mid: [number, number] = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
    const L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) || 1;
    const w: [number, number] = [(b.b[0] - b.a[0]) / L, (b.b[1] - b.a[1]) / L];
    return signalCode(site(mid, { center: mid, axis: Math.atan2(w[0], -w[1]) }), 'pedestrian', w[0], w[1]);
  };
  return buildNavCell({
    ix: i.ix,
    iz: i.iz,
    ox: i.ox,
    oz: i.oz,
    roads: i.roads,
    footprints: i.footprints,
    osm: [...i.osm, ...(i.vehicleRoadsAround ?? [])],
    bands: mergeCollinear([...i.bands, ...unmarkedBands(i.osm)]),
    colliders: i.colliders,
    walkTop: (x, z) => bilinear(g, i.shaped.top, x, z) + TOP_OFFSET_M,
    ground: (x, z) => bilinear(g, i.shaped.ground, x, z),
    signalOf,
  });
}
