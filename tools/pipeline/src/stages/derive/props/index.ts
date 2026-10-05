// 소품 조립(M05-T03): 셀 OSM·건물·도로 → 배치 규칙(우선순위 순: 신호 → 전주·전선 → OSM 점 → 자판기 → 간판(M05-T06) → 가드 파이프 → 맨홀) →
// props.inst 배치(PropBatch) + JCOL 콜라이더 + 전선 메시 + 통계. 셀당 예산(카탈로그 budget, 기본 5k)을 넘으면 뒤 순위부터 버린다. see ADR-0051
import type { JcolShape, PropBatch } from '@sanpo/tile-format';
import type { BuildingRecord, RoadRecord } from '../../../readers/plateau/types.ts';
import type { OsmRecord } from '../../normalize-osm.ts';
import { crossBands } from '../markings/crosswalk.ts';
import { isVehicleRoad } from '../markings/stopline.ts';
import type { RoadIndex } from '../roads.ts';
import { batchesOf, type PlaceCtx, type PropCatalog } from './context.ts';
import { placeGuardRails, placeManholes } from './linear.ts';
import { placePoints } from './points.ts';
import { placePoles } from './poles.ts';
import { junctionsOf, siteFinder, weightedRoadLines } from './signal-sites.ts';
import { placeSignals } from './signals.ts';
import { placeSigns } from './signs.ts';
import { placeVending } from './vending.ts';
import { addWire, emptyWires, type WireBuf } from './wires.ts';

export interface PropStats {
  instances: number;
  signals: number;
  poles: number;
  wireSpans: number;
  points: number;
  vending: number;
  /** 가상 간판(M05-T06): 돌출 상자·입간판·옥상 광고탑. */
  signs: { projecting: number; standing: number; rooftop: number };
  guardRails: number;
  manholes: number;
  /** 예산 초과로 버린 인스턴스. */
  trimmed: number;
}

export interface PropInput {
  catalog: PropCatalog;
  cellId: string;
  ox: number;
  oz: number;
  osm: readonly OsmRecord[];
  /** 이 셀 건물(자판기). */
  buildings: readonly BuildingRecord[];
  roads: RoadIndex;
  inIntersection: (x: number, z: number) => boolean;
  inBuilding: (x: number, z: number) => boolean;
  /** 건물 지면 링 정밀 시험(WF) — 소품 정착(curb.ts). 없으면 inBuilding. */
  inFootprint?: (x: number, z: number) => boolean;
  /** 셀 + 8-이웃 PLATEAU 車道交差部(1020) — 신호 사이트(M06-T02). */
  junctions?: readonly RoadRecord[];
  /** 셀 + 8-이웃 OSM 차도 선(교차로 도로 방향이 셀마다 같게). 없으면 osm 중 차도. */
  vehicleRoadsAround?: readonly OsmRecord[];
  /** 셀 로컬 표면 높이(보도 윗면 또는 지형) — 셀 밖은 창 가장자리로 고정(전선 끝). */
  surfaceAt: (x: number, z: number) => number | undefined;
}

export interface PropOutput {
  batches: PropBatch[];
  colliders: JcolShape[];
  wires: WireBuf;
  stats: PropStats;
}

function signalSiteOf(i: PropInput) {
  const w = weightedRoadLines(i.vehicleRoadsAround ?? i.osm.filter(isVehicleRoad));
  return siteFinder(junctionsOf(i.junctions ?? []), i.catalog.signalSites ?? [], w.lines, w.weights);
}

export function buildProps(i: PropInput): PropOutput {
  const c: PlaceCtx = {
    catalog: i.catalog,
    cellId: i.cellId,
    ox: i.ox,
    oz: i.oz,
    roads: i.roads,
    surfaceAt: i.surfaceAt,
    inIntersection: i.inIntersection,
    inBuilding: i.inBuilding,
    ...(i.inFootprint ? { inFootprint: i.inFootprint } : {}),
    signalSite: signalSiteOf(i),
    out: new Map(),
    colliders: [],
    left: i.catalog.budget.maxInstancesPerCell,
    trimmed: 0,
  };
  const signals = placeSignals(c, i.osm);
  const { poles, spans } = placePoles(c, i.osm);
  const points = placePoints(c, i.osm);
  const vending = placeVending(c, i.buildings);
  const signs = placeSigns(c, i.buildings);
  const guardRails = placeGuardRails(c, i.osm, crossBands(i.osm));
  const manholes = placeManholes(c, i.osm);
  const wires = emptyWires();
  const ground = (x: number, z: number): number => i.surfaceAt(x, z) ?? 0;
  for (const s of spans) addWire(wires, s, i.ox, i.oz, ground);
  const batches = batchesOf(c.out);
  const instances = batches.reduce((n, b) => n + b.transforms.length / 5, 0);
  return {
    batches,
    colliders: c.colliders,
    wires,
    stats: {
      instances,
      signals,
      poles,
      wireSpans: spans.length,
      points,
      vending,
      signs,
      guardRails,
      manholes,
      trimmed: c.trimmed,
    },
  };
}
