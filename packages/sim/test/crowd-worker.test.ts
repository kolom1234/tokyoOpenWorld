// sim.worker 구성 요소(M06-T01): SAB 인스턴스 버퍼 이중 영역·게시, 더미 보행자 결정론·원 궤도·접선 yaw·위상.
import { describe, expect, it } from 'vitest';
import { CLIP, createDummyAgents, stepDummy } from '../src/internal/crowd/dummy.ts';
import { allocInstanceSab, instanceReader, instanceWriter, STRIDE } from '../src/internal/worker/instance-buffer.ts';

const params = {
  gaitCycleM: 1.45,
  idleLoopS: 6,
  dummy: { count: 200, minRadiusM: 4, maxRadiusM: 100, idleShare: 0.1, phoneShare: 0.05 },
};

describe('sim worker crowd', () => {
  it('publishes into the back region and flips front atomically', () => {
    const sab = allocInstanceSab(4);
    const w = instanceWriter(sab, 4);
    const r = instanceReader(sab, 4);
    w.back().set([1, 2, 3, 0, 0, 0, 7, 0], 0);
    expect(r.count()).toBe(0);
    w.publish(1, { x: 256, y: 0, z: -512 }, 1234.5);
    expect(r.seq()).toBe(1);
    expect(r.count()).toBe(1);
    expect(r.data[0]).toBe(1);
    expect(r.data[6]).toBe(7);
    expect(r.anchorWF()).toEqual({ x: 256, y: 0, z: -512 });
    expect(r.tickAbsMs()).toBe(1234.5);
    // 다음 틱은 다른 영역에 — 읽던 영역은 그대로.
    const front = r.data;
    w.back().set([9, 9, 9, 0, 0, 0, 0, 0], 0);
    expect(front[0]).toBe(1);
    w.publish(1, { x: 256, y: 0, z: -512 }, 1300);
    expect(r.data[0]).toBe(9);
    expect(r.data).not.toBe(front);
  });

  it('creates the same dummy crowd for the same seed and walks agents along their circles', () => {
    const a = createDummyAgents(params);
    const b = createDummyAgents(params);
    expect(a).toEqual(b);
    const walkers = a.filter((x) => x.omega !== 0);
    expect(a.filter((x) => x.clip === CLIP.idle || x.clip === CLIP.phone).length).toBeGreaterThan(10);
    const center = { x: 100, y: 20, z: -50 };
    const anchor = { x: 0, y: 0, z: 0 };
    const out = new Float32Array(params.dummy.count * STRIDE);
    const n = stepDummy(a, params, 0.1, center, anchor, out);
    expect(n).toBe(params.dummy.count);
    const i = a.indexOf(walkers[0] as (typeof a)[number]);
    const ag = a[i] as (typeof a)[number];
    const x = out[i * STRIDE] as number;
    const z = out[i * STRIDE + 2] as number;
    expect(Math.hypot(x - center.x, z - center.z)).toBeCloseTo(ag.radius, 3);
    // yaw 전방(−sin, −cos)이 반경과 수직(접선).
    const yaw = out[i * STRIDE + 3] as number;
    const radial = [(x - center.x) / ag.radius, (z - center.z) / ag.radius];
    expect(Math.abs(-Math.sin(yaw) * (radial[0] ?? 0) - Math.cos(yaw) * (radial[1] ?? 0))).toBeLessThan(1e-3);
    // anim = 클립 + 속력/10, rate = 속력 ÷ 주기.
    expect(Math.floor(out[i * STRIDE + 4] as number)).toBe(ag.clip);
    expect(out[i * STRIDE + 7]).toBeCloseTo(ag.speed / params.gaitCycleM, 5);
  });
});
