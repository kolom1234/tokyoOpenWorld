// M04-T01 수락: 박스 낙하 — 호스트 보간 포즈가 워커 스냅샷 값과 일치(스냅샷 시각에서 정확히, 사이에서는 선형), 공유(SAB)·비격리(postMessage) 모두.
// 워커 대신 같은 스레드 전송(loopback)으로 워커 코어를 돌린다(Jolt wasm-compat single — Node).
import { createEventBus, createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import type { PhysicsTransport } from '../src/api.ts';
import { anchorOf, createPhysics } from '../src/index.ts';
import type { ToWorker } from '../src/internal/protocol.ts';
import { createPhysicsCore } from '../src/internal/worker/core.ts';

function loopback(): { transport: PhysicsTransport; flush(): Promise<void> } {
  let handler: ((d: unknown) => void) | undefined;
  const core = createPhysicsCore((msg) => handler?.(msg));
  let pending: Promise<void> = Promise.resolve();
  return {
    transport: {
      post(m) {
        pending = core.handle(m as ToWorker);
      },
      onMessage(h) {
        handler = h;
        return () => {
          handler = undefined;
        };
      },
      terminate() {},
    },
    flush: () => pending,
  };
}

const log = createLogger({ level: 'warn' });
const ORIGIN = { x: 3000, y: 0, z: -2000 };
const frame = {} as never;

async function dropBox(isolation: 'shared' | 'degraded') {
  const lb = loopback();
  const clock = { ms: 10_000 };
  const phys = createPhysics({
    bus: createEventBus(log),
    log,
    transport: lb.transport,
    originWF: ORIGIN,
    config: { isolation },
    now: () => clock.ms,
  });
  await lb.flush();
  await phys.ready;
  phys.debugSpawnBox({ x: 3000, y: -0.5, z: -2000 }, { x: 20, y: 0.5, z: 20 }, false);
  const box = phys.debugSpawnBox({ x: 3000.5, y: 10, z: -2000.25 }, { x: 0.5, y: 0.5, z: 0.5 }, true);
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const tick = async () => {
    clock.ms += 1000 / 60;
    sys.update(frame);
    await lb.flush();
  };
  return { phys, box, clock, tick, sys };
}

describe.each(['shared', 'degraded'] as const)('physics worker (%s)', (isolation) => {
  it('drops a box onto the floor and the interpolated pose matches the worker snapshots', async () => {
    const { phys, box, clock, tick } = await dropBox(isolation);
    expect(phys.isolation).toBe(isolation);
    expect(phys.stats().anchorWF).toEqual(anchorOf(ORIGIN, 1024));
    const ys: number[] = [];
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      await tick();
      const s = phys.stats();
      times.push(s.simTimeS);
      // 렌더 시각 = 스냅샷 시각이 되도록 시계를 맞춰 보간값 = 워커값을 확인.
      const saved = clock.ms;
      clock.ms = (s.simTimeS + 1 / 60 + 1 / 120) * 1000;
      const p = phys.pose(box);
      clock.ms = saved;
      if (p) ys.push(p.posWF.y);
    }
    expect(ys.length).toBeGreaterThan(15);
    // 자유 낙하: 떨어지는 중(단조 감소), x·z는 그대로(WF — 앵커 왕복).
    for (let i = 1; i < ys.length; i++) expect(ys[i] as number).toBeLessThanOrEqual(ys[i - 1] as number);
    expect(phys.pose(box)?.posWF.x).toBeCloseTo(3000.5, 4);
    expect(phys.pose(box)?.posWF.z).toBeCloseTo(-2000.25, 4);
    // 60 Hz 프레임마다 120 Hz 스텝 2개(SAB는 워커보다 한 프레임 늦게 읽는다 → 앞 두 표본 제외).
    expect((times.at(-1) as number) - (times[2] as number)).toBeCloseTo(17 / 60, 2);

    // 보간: 두 스냅샷 사이 시각이면 두 값 사이(선형).
    const t1 = phys.stats().simTimeS;
    clock.ms = (t1 + 1 / 60 + 1 / 120) * 1000;
    const y1 = phys.pose(box)?.posWF.y as number;
    await tick();
    const t2 = phys.stats().simTimeS;
    clock.ms = (t2 + 1 / 60 + 1 / 120) * 1000;
    const y2 = phys.pose(box)?.posWF.y as number;
    clock.ms = ((t1 + t2) / 2 + 1 / 60 + 1 / 120) * 1000;
    expect(phys.pose(box)?.posWF.y).toBeCloseTo((y1 + y2) / 2, 9);

    // 3 s 뒤 바닥(윗면 y = 0) 위에 정지: 중심 ≈ 0.5(침투 여유 ≈ 2 cm).
    for (let i = 0; i < 180; i++) await tick();
    const rest = phys.pose(box);
    expect(rest?.posWF.y).toBeGreaterThan(0.46);
    expect(rest?.posWF.y).toBeLessThan(0.51);
    expect(Math.abs(rest?.linVel.y ?? 1)).toBeLessThan(0.05);
    expect(phys.stats().steps).toBeGreaterThan(395);
    phys.dispose();
  }, 30_000);
});

describe('physics service', () => {
  it('reuses slots with a new generation and ignores stale handles', async () => {
    const { phys, box, tick } = await dropBox('degraded');
    await tick();
    expect(phys.pose(box)).toBeDefined();
    phys.despawn(box);
    const again = phys.debugSpawnBox({ x: 3000, y: 5, z: -2000 }, { x: 0.2, y: 0.2, z: 0.2 }, true);
    await tick();
    await tick();
    expect(again).not.toBe(box);
    expect(again & 127).toBe(box & 127);
    expect(phys.pose(box)).toBeUndefined();
    expect(phys.pose(again)?.posWF.y).toBeGreaterThan(4);
    expect(phys.stats().bodies).toBe(2);
    phys.dispose();
  }, 30_000);
});
