// sim.worker 교통 실행(M06-T05): 셀 lanes.bin → 차선 그래프(셀 원점 = 키), 교통 시뮬, 보행자 근접 = 이번 틱 군중 출력(SAB 칸) 격자 + 도로 위 플레이어.
import { type CellKey, unpackCellKey, type Vec3d } from '@sanpo/core';
import { parseLanes } from '@sanpo/tile-format';
import type { TrafficParams } from '../../api.ts';
import { createLaneGraph } from '../traffic/lane-graph.ts';
import { createTrafficSim, type TrafficStats } from '../traffic/traffic-sim.ts';
import { STRIDE } from './instance-buffer.ts';

const CELL = 4;

export interface TrafficRuntime {
  addCell(key: CellKey, lanes: ArrayBuffer): void;
  removeCell(key: CellKey): void;
  setPlayer(pos: Readonly<Vec3d>, fwd?: { x: number; z: number }): void;
  /** 군중 출력(이번 틱, WF − anchor) → 보행자 격자. */
  setPedestrians(buf: Float32Array, count: number, anchor: Readonly<Vec3d>): void;
  step(dt: number, gameMs: number, out: Float32Array, anchor: Readonly<Vec3d>): number;
  stats(): (TrafficStats & { lanes: number; cells: number }) | undefined;
}

export function createTrafficRuntime(params: TrafficParams, lamp: (code: number) => 'G' | 'Y' | 'R'): TrafficRuntime {
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
  const sim = createTrafficSim({ graph, params, lamp, pedNear });
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
  };
}
