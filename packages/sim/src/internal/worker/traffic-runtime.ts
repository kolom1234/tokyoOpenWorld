// sim.worker 교통 실행(M06-T05): 셀 lanes.bin → 차선 그래프(셀 원점 = 키), 교통 시뮬, 보행자 근접 = 이번 틱 군중 출력(SAB 칸) 격자 + 도로 위 플레이어.
// 물리 키네마틱(M06-T06, ADR-0066): 플레이어 KINEMATIC_RADIUS_M 안 차량 → KinematicFrame 레코드(core 계약).
import {
  type CellKey,
  KINEMATIC_STRIDE,
  unpackCellKey,
  VEHICLE_TYPES,
  type Vec3d,
  type VehicleTypeInfo,
} from '@sanpo/core';
import { parseLanes } from '@sanpo/tile-format';
import type { TrafficParams } from '../../api.ts';
import { createLaneGraph } from '../traffic/lane-graph.ts';
import { createTrafficSim, type TrafficStats, type Vehicle } from '../traffic/traffic-sim.ts';
import type { CrossBand } from '../traffic/yielding.ts';
import { STRIDE } from './instance-buffer.ts';

const CELL = 4;
/** 08 §3: 플레이어 60 m 안 차량만 물리 바디. */
export const KINEMATIC_RADIUS_M = 60;

export interface TrafficRuntime {
  addCell(key: CellKey, lanes: ArrayBuffer): void;
  removeCell(key: CellKey): void;
  setPlayer(pos: Readonly<Vec3d>, fwd?: { x: number; z: number }): void;
  /** 군중 출력(이번 틱, WF − anchor) → 보행자 격자. */
  setPedestrians(buf: Float32Array, count: number, anchor: Readonly<Vec3d>): void;
  step(dt: number, gameMs: number, out: Float32Array, anchor: Readonly<Vec3d>): number;
  stats(): (TrafficStats & { lanes: number; cells: number }) | undefined;
  /** 플레이어 60 m 안 차량 레코드(KINEMATIC_STRIDE f64). 플레이어 모름 = 빈 배열. */
  kinematics(): Float64Array;
}

/** 플레이어 60 m 안 차량 → KinematicFrame 레코드(id = 순번, 바닥 중심 WF·yaw·속력·치수). */
export function kinematicRecords(list: readonly Vehicle[], player: Readonly<Vec3d>): Float64Array {
  const near = list.filter(
    (v) => Number.isFinite(v.px) && Math.hypot(v.px - player.x, v.pz - player.z) <= KINEMATIC_RADIUS_M,
  );
  const out = new Float64Array(near.length * KINEMATIC_STRIDE);
  near.forEach((v, i) => {
    const t = VEHICLE_TYPES[v.type] as VehicleTypeInfo;
    out.set([v.seq, v.px, v.py, v.pz, v.yaw, v.v, t.lengthM, t.widthM, t.heightM], i * KINEMATIC_STRIDE);
  });
  return out;
}

export function createTrafficRuntime(
  params: TrafficParams,
  lamp: (code: number) => 'G' | 'Y' | 'R',
  crossingsNear?: (x: number, z: number, r: number) => readonly CrossBand[],
): TrafficRuntime {
  const graph = createLaneGraph();
  const grid = new Map<number, number[]>();
  let player: Vec3d | undefined;
  const key = (gx: number, gz: number) => gx * 100003 + gz;
  const pedNear = (x: number, z: number, r: number): boolean => {
    if (player && Math.hypot(player.x - x, player.z - z) < r) return true;
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = grid.get(key(gx + dx, gz + dz));
        if (!a) continue;
        for (let i = 0; i < a.length; i += 2)
          if (Math.hypot((a[i] as number) - x, (a[i + 1] as number) - z) < r) return true;
      }
    return false;
  };
  const sim = createTrafficSim({ graph, params, lamp, pedNear, ...(crossingsNear ? { crossingsNear } : {}) });
  return {
    addCell(k, lanes) {
      const g = parseLanes(new Uint8Array(lanes));
      if (!g.ok) return;
      const { ix, iz } = unpackCellKey(k);
      graph.addCell(k, g.value, { x: ix * 256, y: 0, z: iz * 256 });
    },
    removeCell(k) {
      sim.dropLanes(graph.removeCell(k));
    },
    setPlayer(pos, fwd) {
      player = { ...pos };
      sim.setPlayer(pos, fwd);
    },
    setPedestrians(buf, count, anchor) {
      grid.clear();
      for (let i = 0; i < count; i++) {
        const x = (buf[i * STRIDE] as number) + anchor.x;
        const z = (buf[i * STRIDE + 2] as number) + anchor.z;
        const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
        const a = grid.get(k);
        if (a) a.push(x, z);
        else grid.set(k, [x, z]);
      }
    },
    step: (dt, gameMs, out, anchor) => sim.step(dt, gameMs, out, anchor),
    stats: () => ({ ...sim.stats(), lanes: graph.stats().lanes, cells: graph.stats().cells }),
    kinematics: () => (player ? kinematicRecords(sim.vehicles(), player) : new Float64Array(0)),
  };
}
