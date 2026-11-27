// 상공 군중 처음 채우기(M12-T08): 자유비행 카메라가 지면보다 150 m 넘게 높아도 스폰 후보가 걷는 면에 닿아 처음 채우기가 끝난다
// (항공 골든뷰 ready = crowd.filled). 사람은 지면(내비) 높이에, 지상과 같은 틱 안에 채워진다.
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

/** 서 있는 카메라(높이 y) 아래 처음 채우기: 끝난 틱(없으면 -1)·최종 인원·tier A 높이 범위. */
function fillAt(nav: NavWorld, y: number, maxTicks: number) {
  const sim = createCrowdSim(nav, flat, () => 'W');
  const out = new Float32Array(1000 * 8);
  sim.setPlayer({ x: -40, y, z: 30 }, { x: 0, y: 0, z: 0 }, { x: 0, y: -0.7, z: -0.7 });
  let filledAt = -1;
  for (let k = 0; k < maxTicks && filledAt < 0; k++) {
    sim.step(1 / 30, 0, out, { x: 0, y: 0, z: 0 });
    if (sim.stats().filled) filledAt = k;
  }
  const st = sim.stats();
  const ys = sim.positions().map((p) => p.y);
  const res = { filledAt, total: st.agents + st.flow, minY: Math.min(...ys), maxY: Math.max(...ys) };
  sim.destroy();
  return res;
}

describe('crowd first fill under a high camera (M12-T08)', () => {
  let nav: NavWorld;
  beforeAll(async () => {
    nav = await loadMini();
  });

  it('fills at 400 m and 1,000 m as fast as on the ground, with people on the walk surface', () => {
    const ground = fillAt(nav, 0, 30 * 20);
    expect(ground.filledAt).toBeGreaterThanOrEqual(0);
    for (const y of [400, 1000]) {
      const high = fillAt(nav, y, 30 * 20);
      expect(high.filledAt, `filled at y=${y}`).toBeGreaterThanOrEqual(0);
      expect(high.filledAt).toBeLessThanOrEqual(ground.filledAt * 2 + 30);
      expect(high.total).toBeGreaterThanOrEqual(900);
      // 걷는 면(world-mini 시부야 저지대) — 카메라 높이가 아니다.
      expect(high.maxY).toBeLessThan(ground.maxY + 20);
      expect(high.minY).toBeGreaterThan(ground.minY - 20);
    }
  });
});
