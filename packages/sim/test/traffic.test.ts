// M06-T05 수락(ADR-0065): world-mini 실데이터 차선(메이지도리 = 제한 50 km/h 간선 포함)에서 10분(게임 시각 = 신호 계획 그대로) 시뮬레이션 —
// 교착 0, 적신호 통과 0, 메이지도리 평균 속도 = 제한속도의 40–80 %. 차선 그래프 셀 병합(포털 노드)·IDM 단위도 함께.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KINEMATIC_STRIDE, packCellKey, VEHICLE_TYPES } from '@sanpo/core';
import { gunzip, type NavCrossing, parseLanes, parseNav, readTkc } from '@sanpo/tile-format';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SignalPlansFile } from '../src/api.ts';
import { signalState } from '../src/internal/signals/controller.ts';
import { compilePlans } from '../src/internal/signals/plans.ts';
import { idmAccel } from '../src/internal/traffic/idm.ts';
import { createLaneGraph, type LaneGraph } from '../src/internal/traffic/lane-graph.ts';
import { createTrafficSim } from '../src/internal/traffic/traffic-sim.ts';
import { KINEMATIC_RADIUS_M, kinematicRecords } from '../src/internal/worker/traffic-runtime.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const MINI = join(REPO, 'tests/fixtures/world-mini');
const plans = compilePlans(
  JSON.parse(readFileSync(join(REPO, 'content/sim/signal-plans.json'), 'utf8')) as SignalPlansFile,
);
const CELLS = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0],
] as const;

async function loadCrossings(): Promise<NavCrossing[]> {
  const out = new Map<number, NavCrossing>();
  for (const [ix, iz] of CELLS) {
    const t = readTkc(new Uint8Array(readFileSync(join(MINI, `L0/${ix}/${iz}.tkc`))));
    if (!t.ok) throw new Error(t.error.message);
    const raw = await gunzip(t.value.section('nav.bin') as Uint8Array);
    if (!raw.ok) throw new Error('gunzip');
    const nav = parseNav(raw.value);
    if (!nav.ok) throw new Error(nav.error.message);
    for (const c of nav.value.crossings) out.set(c.id, c);
  }
  return [...out.values()];
}

/** 점이 횡단보도 띠(중심선 ± 반폭) 안인가. */
function onCrossing(x: number, z: number, cs: readonly NavCrossing[]): boolean {
  return cs.some((c) => {
    const ux = c.b[0] - c.a[0];
    const uz = c.b[2] - c.a[2];
    const t = Math.min(Math.max(((x - c.a[0]) * ux + (z - c.a[2]) * uz) / (ux * ux + uz * uz || 1), 0), 1);
    return Math.hypot(x - c.a[0] - ux * t, z - c.a[2] - uz * t) < c.halfWidth;
  });
}

async function loadGraph(): Promise<LaneGraph> {
  const g = createLaneGraph();
  for (const [ix, iz] of CELLS) {
    const t = readTkc(new Uint8Array(readFileSync(join(MINI, `L0/${ix}/${iz}.tkc`))));
    if (!t.ok) throw new Error(t.error.message);
    const raw = await gunzip(t.value.section('lanes.bin') as Uint8Array);
    if (!raw.ok) throw new Error('gunzip');
    const chunk = parseLanes(raw.value);
    if (!chunk.ok) throw new Error(chunk.error.message);
    g.addCell(packCellKey(0, ix, iz), chunk.value, { x: ix * 256, y: 0, z: iz * 256 });
  }
  return g;
}

describe('traffic (world-mini lanes)', () => {
  let g: LaneGraph;
  let crossings: NavCrossing[];
  beforeAll(async () => {
    g = await loadGraph();
    crossings = await loadCrossings();
  });

  it('IDM: free road accelerates toward v0, closing on a stopped leader brakes', () => {
    expect(idmAccel(0, 13.9, Number.POSITIVE_INFINITY, 0)).toBeCloseTo(1.2, 3);
    expect(idmAccel(13.9, 13.9, Number.POSITIVE_INFINITY, 0)).toBeCloseTo(0, 3);
    expect(idmAccel(10, 13.9, 15, 10)).toBeLessThan(-2);
  });

  it('merges cell chunks through portal nodes into a connected graph', () => {
    const st = g.stats();
    expect(st.cells).toBe(4);
    expect(st.lanes).toBeGreaterThan(200);
    let dead = 0;
    let roads = 0;
    for (const l of g.lanes) {
      if (!l || l.kind !== 0) continue;
      roads++;
      if (g.successors(l).length === 0) dead++;
    }
    // 막다른 끝 = 영역(512 m) 가장자리로 나가는 차선뿐.
    expect(dead / roads).toBeLessThan(0.25);
  });

  it('kinematic frame (M06-T06): only vehicles within 60 m of the player, shared vehicle dimensions', () => {
    const sim = createTrafficSim({
      graph: g,
      params: {
        maxVehicles: 60,
        spawnM: 400,
        despawnM: 500,
        farM: 250,
        spawnsPerTick: 3,
        diurnal: new Array(24).fill(1),
      },
      lamp: () => 'G',
      pedNear: () => false,
    });
    const player = { x: 0, y: 0, z: 0 };
    sim.setPlayer(player);
    const out = new Float32Array(160 * 8);
    // 출력 차체 중심은 틱마다 연속(차선 넘김 때 튀지 않음 — 물리 키네마틱 바디가 캐릭터를 순간 덮치지 않게).
    const last = new Map<number, [number, number]>();
    let jump = 0;
    for (let k = 0; k < 30 * 20; k++) {
      sim.step(1 / 30, 1_759_546_800_000 + k * 33, out, { x: 0, y: 0, z: 0 });
      for (const v of sim.vehicles()) {
        const q = last.get(v.seq);
        if (q) jump = Math.max(jump, Math.hypot(v.px - q[0], v.pz - q[1]) - v.v / 30);
        last.set(v.seq, [v.px, v.pz]);
      }
    }
    expect(jump).toBeLessThan(0.3);
    const near = sim.vehicles().filter((v) => Math.hypot(v.px - player.x, v.pz - player.z) <= KINEMATIC_RADIUS_M);
    const rec = kinematicRecords(sim.vehicles(), player);
    expect(near.length).toBeGreaterThan(0);
    expect(rec.length).toBe(near.length * KINEMATIC_STRIDE);
    for (let o = 0; o < rec.length; o += KINEMATIC_STRIDE) {
      const v = near.find((n) => n.seq === rec[o]);
      expect(v).toBeDefined();
      expect(Math.hypot((rec[o + 1] as number) - player.x, (rec[o + 3] as number) - player.z)).toBeLessThanOrEqual(60);
      expect(rec[o + 6]).toBe(VEHICLE_TYPES[v?.type ?? 0]?.lengthM);
      expect(rec[o + 8]).toBe(VEHICLE_TYPES[v?.type ?? 0]?.heightM);
    }
  });

  it('crosswalks (M06-T06): vehicles waiting at a red light do not stand on a crosswalk', () => {
    const run = (withCrossings: boolean) => {
      let gameS = 1_759_546_800;
      const sim = createTrafficSim({
        graph: g,
        params: {
          maxVehicles: 40,
          spawnM: 400,
          despawnM: 500,
          farM: 250,
          spawnsPerTick: 3,
          diurnal: new Array(24).fill(1),
        },
        lamp: (code) => signalState(plans, code, gameS).vehicle,
        pedNear: () => false,
        ...(withCrossings
          ? {
              crossingsNear: (x: number, z: number, r: number) =>
                crossings.filter(
                  (c) =>
                    Math.hypot((c.a[0] + c.b[0]) / 2 - x, (c.a[2] + c.b[2]) / 2 - z) <
                    r + Math.hypot(c.b[0] - c.a[0], c.b[2] - c.a[2]) / 2,
                ),
            }
          : {}),
      });
      sim.setPlayer({ x: 0, y: 0, z: 0 });
      const out = new Float32Array(160 * 8);
      const pt = { x: 0, y: 0, z: 0, dx: 1, dz: 0 };
      let stopped = 0;
      let onCross = 0;
      let green = 0;
      for (let k = 0; k < 30 * 300; k++) {
        gameS += 1 / 30;
        sim.step(1 / 30, gameS * 1000, out, { x: 0, y: 0, z: 0 });
        if (k % 15 !== 0) continue;
        for (const v of sim.vehicles()) {
          // 신호 정지선 30 m 안에서 멈춘 차(대기열 선두·뒤 포함).
          if (v.v > 0.1 || v.lane.signal === 0xffffffff || v.lane.length - v.s > 30) continue;
          // 녹색인데 선 차(출구 막힘 — 횡단보도 진입 뒤 막히면 띠 안에 남을 수 있다, 0.3 %)는 따로 센다.
          if (signalState(plans, v.lane.signal, gameS).vehicle === 'G') {
            green++;
            continue;
          }
          stopped++;
          let hit = false;
          for (let s = Math.max(0, v.s - v.len); s <= v.s && !hit; s += 0.5) {
            g.pointAt(v.lane, s, pt);
            hit = onCrossing(pt.x, pt.z, crossings);
          }
          if (hit) onCross++;
        }
      }
      return { stopped, onCross, green, st: sim.stats() };
    };
    const before = run(false);
    const after = run(true);
    const info = JSON.stringify({
      green: after.green,
      before: [before.stopped, before.onCross],
      after: [after.stopped, after.onCross],
      st: after.st,
    });
    expect(before.onCross, info).toBeGreaterThan(0);
    expect(after.stopped, info).toBeGreaterThan(100);
    expect(after.onCross, info).toBe(0);
    expect(after.st.violations, info).toBe(0);
    expect(after.st.deadlocks, info).toBe(0);
  }, 120_000);

  it('10 minutes: no deadlock, no red-light running, Meiji-dori mean speed ratio recorded (target 40–80 %)', () => {
    let gameS = 1_759_546_800; // 2026-10-04 12:00 JST
    const sim = createTrafficSim({
      graph: g,
      params: {
        maxVehicles: 40,
        spawnM: 400,
        despawnM: 500,
        farM: 250,
        spawnsPerTick: 3,
        diurnal: new Array(24).fill(1),
      },
      lamp: (code) => signalState(plans, code, gameS).vehicle,
      pedNear: () => false,
      // 메이지도리 = 제한 50 km/h 도로 차선(world-mini에서 50 km/h는 明治通り뿐).
      measure: (l) => l.kind === 0 && Math.abs(l.speed * 3.6 - 50) < 0.5,
    });
    sim.setPlayer({ x: 0, y: 0, z: 0 });
    const out = new Float32Array(160 * 8);
    const dt = 1 / 30;
    let maxN = 0;
    for (let k = 0; k < 30 * 600; k++) {
      gameS += dt;
      sim.step(dt, gameS * 1000, out, { x: 0, y: 0, z: 0 });
      maxN = Math.max(maxN, sim.stats().vehicles);
    }
    const st = sim.stats();
    const ratio = st.distM / Math.max(1, st.limitM);
    const info = `${JSON.stringify(st)} ratio ${ratio.toFixed(2)} max ${maxN}`;
    expect(st.deadlocks, info).toBe(0);
    expect(st.violations, info).toBe(0);
    expect(maxN, info).toBeGreaterThanOrEqual(38);
    // 목표 40–80 %(ADR-0069): 120 s 주기만이면 0.36(신호 없으면 0.82 — 손실은 적신호 대기·대기열), 간선 × 작은 길 교차로 minor 계획(100 s)으로 0.41.
    expect(ratio, info).toBeGreaterThanOrEqual(0.4);
    expect(ratio, info).toBeLessThanOrEqual(0.8);
  }, 120_000);
});
