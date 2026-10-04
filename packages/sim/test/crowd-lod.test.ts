// M06-T04 수락(ADR-0064): world-mini 실데이터에서 tier A(DetourCrowd, 80 m) + B(흐름, 250 m) 총 1,000명 유지, 플레이어가 움직여 A↔B 승강격이 일어나도
// 같은 사람(순번)의 그려지는 위치가 틱 사이에 튀지 않는다(80 m 경계 팝핑 — 수치 판정, 육안은 골든 영상), 틱 p95 ≤ 12 ms.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { init } from '@recast-navigation/core';
import { packCellKey } from '@sanpo/core';
import { gunzip, readTkc } from '@sanpo/tile-format';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CrowdParams } from '../src/api.ts';
import { createCrowdSim } from '../src/internal/crowd/crowd-sim.ts';
import { createNavWorld, type NavWorld } from '../src/internal/crowd/nav-world.ts';

const MINI = resolve(import.meta.dirname, '../../../tests/fixtures/world-mini');
const params = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../content/sim/crowd.json'), 'utf8'),
) as CrowdParams;
// 시험은 시간대 곡선 없이(배율 1) — 목표 = maxA + maxB = 1,000.
const flat: CrowdParams = {
  ...params,
  density: { diurnal: new Array(24).fill(1), hotspots: params.density?.hotspots ?? [] },
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
    const raw = await gunzip(t.value.section('nav.bin') as Uint8Array);
    if (!raw.ok) throw new Error('gunzip');
    nav.addCell(packCellKey(0, ix, iz), raw.value);
  }
  return nav;
}

describe('crowd tier A + B and LOD hand-off (world-mini)', () => {
  let nav: NavWorld;
  beforeAll(async () => {
    nav = await loadMini();
  });

  it('keeps 1,000 pedestrians (A 250 + B) around a standing player, tick p95 ≤ 12 ms', () => {
    const sim = createCrowdSim(nav, flat, () => 'W');
    const out = new Float32Array(1000 * 8);
    const pl = { x: -40, y: 0, z: 30 };
    sim.setPlayer(pl, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    const totals: number[] = [];
    const ticks: number[] = [];
    for (let k = 0; k < 30 * 60; k++) {
      const t0 = performance.now();
      sim.step(1 / 30, 0, out, { x: 0, y: 0, z: 0 });
      ticks.push(performance.now() - t0);
      const st = sim.stats();
      if (k > 30 * 5) totals.push(st.agents + st.flow);
    }
    const sorted = ticks.slice(60).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const st = sim.stats();
    // A = 80 m 안 밀도대로(최대 250 — 10 §4.2), 나머지는 B.
    expect(st.agents).toBeGreaterThan(50);
    expect(st.agents).toBeLessThanOrEqual(250);
    expect(Math.min(...totals), `p95 ${p95.toFixed(2)} ms ${JSON.stringify(st)}`).toBeGreaterThanOrEqual(950);
    expect(Math.max(...totals)).toBeLessThanOrEqual(1000);
    expect(p95).toBeLessThanOrEqual(12);
    sim.destroy();
  }, 60_000);

  it('hands agents across 80 m (A ↔ B) without position jumps while the player walks', () => {
    const sim = createCrowdSim(nav, flat, () => 'W');
    const out = new Float32Array(1000 * 8);
    const dt = 1 / 30;
    // 플레이어: 스크램블 서쪽 보도에서 동쪽으로 1.4 m/s(60 s ≈ 84 m) — 뒤쪽 사람은 85 m 밖으로(강등), 앞쪽은 75 m 안으로(승격).
    const start = { x: -60, y: 0, z: 10 };
    let prev = new Map<number, { tier: 'A' | 'B'; x: number; z: number }>();
    let handoffs = 0;
    let worstHandoff = 0;
    let worstStep = 0;
    for (let k = 0; k < 30 * 60; k++) {
      sim.setPlayer({ x: start.x + 1.4 * k * dt, y: 0, z: start.z }, { x: 1.4, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      sim.step(dt, 0, out, { x: 0, y: 0, z: 0 });
      const now = new Map(sim.peds().map((p) => [p.seq, p]));
      for (const [seq, p] of now) {
        const q = prev.get(seq);
        if (!q) continue;
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (q.tier !== p.tier) {
          handoffs++;
          worstHandoff = Math.max(worstHandoff, d);
        } else if (p.tier === 'B') worstStep = Math.max(worstStep, d);
      }
      prev = now;
    }
    expect(handoffs).toBeGreaterThan(20);
    // 한 틱(1/30 s)에 사람이 갈 수 있는 거리(≤ 1.55 × 1.35 m/s ≈ 0.07 m) + Detour 충돌 밀림 여유.
    expect(worstHandoff, `handoffs ${handoffs}`).toBeLessThan(0.25);
    expect(worstStep).toBeLessThan(0.25);
    sim.destroy();
  }, 60_000);
});
