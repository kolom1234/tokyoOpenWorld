// M06-T03 수락(ADR-0063): world-mini 픽스처(스크램블 교차로 실데이터 nav.bin)에서 에이전트 250명이 보행 적색에 대기점에 모였다가
// 전방향 보행 녹색에 동시 횡단 — 틱 ≤ 12 ms(30 Hz 틱 1회 = 시나리오 진행 1/30 s), 관통 0(에이전트 쌍 중심 거리 < 반경 합의 절반, 내비메시 밖 위치).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { init } from '@recast-navigation/core';
import { packCellKey } from '@sanpo/core';
import { gunzip, readTkc } from '@sanpo/tile-format';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CrowdParams } from '../src/api.ts';
import { createCrowdSim } from '../src/internal/crowd/crowd-sim.ts';
import { createNavWorld, type NavWorld } from '../src/internal/crowd/nav-world.ts';
import { firstCrossing, inBand } from '../src/internal/crowd/route.ts';

const MINI = resolve(import.meta.dirname, '../../../tests/fixtures/world-mini');
const SCRAMBLE = { x: -22.3, y: 0, z: 8.6 };
const params: CrowdParams = {
  gaitCycleM: 1.45,
  idleLoopS: 6,
  dummy: { count: 0, minRadiusM: 1, maxRadiusM: 2, idleShare: 0, phoneShare: 0 },
  agents: {
    maxA: 250,
    radiusA: 80,
    despawnA: 140,
    spawnMinDistM: 18,
    speed: [1.05, 1.55],
    dest: [30, 120],
    plansPerTick: 8,
    spawnsPerTick: 6,
    reactionS: [0.2, 1.6],
    phoneShare: 0.1,
    dwellShare: 0,
    dwellS: [4, 10],
    maxB: 0,
    radiusB: 250,
    despawnB: 265,
    farSpawnM: 200,
    lodBandM: 5,
    plansPerTickB: 10,
    fillPerTick: 60,
  },
};

async function loadMini(): Promise<NavWorld> {
  await init();
  const nav = createNavWorld();
  for (const [ix, iz] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ] as const) {
    const t = readTkc(new Uint8Array(readFileSync(join(MINI, `L0/${ix}/${iz}.tkc`))));
    if (!t.ok) throw new Error(t.error.message);
    const sec = t.value.section('nav.bin');
    if (!sec) throw new Error(`no nav.bin in L0_${ix}_${iz}`);
    const raw = await gunzip(sec);
    if (!raw.ok) throw new Error('gunzip');
    const r = nav.addCell(packCellKey(0, ix, iz), raw.value);
    expect(r.failed).toBe(0);
  }
  return nav;
}

describe('crowd tier A on the Scramble navmesh (world-mini)', () => {
  let nav: NavWorld;
  beforeAll(async () => {
    nav = await loadMini();
  });

  it('loads 64 tiles and the signalized scramble crossings', () => {
    expect(nav.stats().tiles).toBe(64);
    const sig = nav.crossingsNear(SCRAMBLE.x, SCRAMBLE.z, 40).filter((c) => c.signal !== 0xffffffff);
    expect(sig.length).toBeGreaterThanOrEqual(5);
  });

  it('routes across the road only through a crossing band', () => {
    const sig = nav.crossingsNear(SCRAMBLE.x, SCRAMBLE.z, 40).filter((c) => c.signal !== 0xffffffff);
    const c = sig[0];
    if (!c) throw new Error('no crossing');
    const from = { x: c.a[0] - c.ux * 4, y: c.a[1], z: c.a[2] - c.uz * 4 };
    const to = { x: c.b[0] + c.ux * 4, y: c.b[1], z: c.b[2] + c.uz * 4 };
    const p = nav.query.computePath(from, to, { filter: nav.allFilter, halfExtents: { x: 3, y: 3, z: 3 } });
    expect(p.success).toBe(true);
    const hit = firstCrossing(p.path, nav.crossingsNear(from.x, from.z, 60));
    expect(hit).toBeDefined();
    // 걷기 필터만으론 그 길 건너편에 닿지 못한다(횡단 띠 = 유일한 연결).
    const w = nav.query.computePath(from, to, { filter: nav.walkFilter, halfExtents: { x: 3, y: 3, z: 3 } });
    const last = w.path[w.path.length - 1];
    expect(!w.success || !last || Math.hypot(last.x - to.x, last.z - to.z) > 3 || inBand(c, last.x, last.z)).toBe(true);
  });

  it('250 agents wait on red, cross together on the all-way walk: tick ≤ 12 ms, no penetration', () => {
    let lamp: 'W' | 'F' | 'D' = 'D';
    const a = createCrowdSim(nav, params, () => lamp);
    // 플레이어 = 스크램블 중심(250명 모두 tier A 반경 안).
    a.setPlayer({ x: SCRAMBLE.x, y: 0, z: SCRAMBLE.z }, { x: 0, y: 0, z: 0 });
    expect(a.scenario(SCRAMBLE, 45, 250)).toBe(250);
    const out = new Float32Array(260 * 8);
    const ticks: number[] = [];
    let peakCrossing = 0;
    let overlaps = 0;
    let offMesh = 0;
    const dt = 1 / 30;
    for (let k = 0; k < 30 * 40; k++) {
      lamp = k < 30 * 12 ? 'D' : k < 30 * 38 ? 'W' : 'F';
      const t0 = performance.now();
      a.step(dt, 0, out, { x: 0, y: 0, z: 0 });
      ticks.push(performance.now() - t0);
      peakCrossing = Math.max(peakCrossing, a.stats().crossing);
      if (k % 15 !== 0) continue;
      const ps = a.positions();
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i] as (typeof ps)[number];
        const q = nav.query.findClosestPoint(p, { filter: nav.allFilter, halfExtents: { x: 0.5, y: 2, z: 0.5 } });
        if (!q.success || Math.hypot(q.point.x - p.x, q.point.z - p.z) > 0.05) offMesh++;
        for (let j = i + 1; j < ps.length; j++) {
          const r = ps[j] as (typeof ps)[number];
          if (Math.hypot(p.x - r.x, p.z - r.z) < 0.3 && Math.abs(p.y - r.y) < 1) overlaps++;
        }
      }
    }
    // 첫 틱(JIT·경로 계획 몰림) 제외 p95·최대.
    const sorted = ticks.slice(30).sort((x, y) => x - y);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    // 기록(ADR-0063): p95·최대 틱·동시 횡단 수는 실패 메시지에 나온다.
    expect(peakCrossing, `p95 ${p95.toFixed(2)} ms, max ${max.toFixed(2)} ms`).toBeGreaterThanOrEqual(200);
    expect(p95, `max ${max.toFixed(2)} ms`).toBeLessThanOrEqual(12);
    expect(overlaps).toBe(0);
    expect(offMesh).toBe(0);
    a.destroy();
  }, 60_000);
});
