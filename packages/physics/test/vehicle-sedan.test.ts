// M08-T01 수락(08 §6): 가상 소형 세단(content/vehicles/sedan.json) — 평지 0→100 km/h 10–13 s, 60 km/h 급제동 거리 건조 14–20 m · 젖은 노면에서 증가.
// 같은 스레드 워커 코어 + 실제 Jolt(120 Hz), 메인 60 fps. 바닥 = 정적 상자(길이 1.6 km). 조향 +1 = 오른쪽(yaw 감소), 후진, ABS 동작.
import { createEventBus, createLogger, type Vec3d } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import SEDAN from '../../../content/vehicles/sedan.json' with { type: 'json' };
import { createInlineTransport, createPhysics, type SedanParams, type VehicleInput } from '../src/index.ts';

const log = createLogger({ level: 'warn' });
const O: Vec3d = { x: 1000, y: 0, z: 1000 };
const P = SEDAN as unknown as SedanParams;
/** 수치 기록(PR 표·ADR). */
const report = (line: string): void =>
  void process.stdout.write(`[sedan] ${line}
`);
const IDLE: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false };

async function track(wet = 0) {
  const lb = createInlineTransport();
  const clock = { ms: 10_000 };
  const phys = createPhysics({
    bus: createEventBus(log),
    log,
    transport: lb,
    originWF: O,
    config: { isolation: 'shared' },
    now: () => clock.ms,
  });
  await lb.flush();
  await phys.ready;
  phys.debugSpawnBox({ x: O.x, y: -0.5, z: O.z - 700 }, { x: 40, y: 0.5, z: 800 }, false);
  phys.setSurfaceWetness(wet);
  const car = phys.spawnVehicle('sedan', { x: O.x, y: 0.05, z: O.z }, 0, P);
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const frame = async (input: VehicleInput) => {
    phys.setVehicleInput(car, input);
    clock.ms += 1000 / 60;
    sys.update({} as never);
    await lb.flush();
  };
  const state = () => phys.vehicleState(car);
  const pose = () => phys.pose(car);
  // 내려앉기 1 s.
  for (let i = 0; i < 60; i++) await frame(IDLE);
  return { frame, state, pose, phys, car, t: () => clock.ms / 1000 };
}

/** 정지에서 풀 스로틀 → 목표 속력까지 걸린 시간(s). */
async function accelerate(s: Awaited<ReturnType<typeof track>>, kmh: number, maxS = 30): Promise<number> {
  const t0 = s.t();
  while (s.t() - t0 < maxS) {
    await s.frame({ ...IDLE, throttle: 1 });
    if ((s.state()?.speedMs ?? 0) * 3.6 >= kmh) return s.t() - t0;
  }
  return Number.POSITIVE_INFINITY;
}

/** 지금 속력에서 풀 브레이크 → 멈출 때까지 이동 거리(m). */
async function brakeDistance(s: Awaited<ReturnType<typeof track>>): Promise<{ d: number; abs: boolean }> {
  const p0 = { ...(s.pose()?.posWF ?? O) };
  let abs = false;
  for (let i = 0; i < 60 * 10; i++) {
    await s.frame({ ...IDLE, brake: 1 });
    abs ||= s.state()?.abs ?? false;
    if (Math.abs(s.state()?.speedMs ?? 0) < 0.05) break;
  }
  const p = s.pose()?.posWF ?? O;
  return { d: Math.hypot(p.x - p0.x, p.z - p0.z), abs };
}

describe('sedan (M08-T01)', () => {
  it('0→100 km/h in 10–13 s, gears shift up, RPM within range', async () => {
    const s = await track();
    expect(s.pose()?.posWF.y ?? -1).toBeGreaterThan(-0.05);
    const t = await accelerate(s, 100);
    const st = s.state();
    report(`0-100 ${t.toFixed(2)} s, gear ${st?.gear}, rpm ${Math.round(st?.rpm ?? 0)}`);
    expect(t).toBeGreaterThanOrEqual(10);
    expect(t).toBeLessThanOrEqual(13);
    expect(st?.gear ?? 0).toBeGreaterThanOrEqual(3);
    expect(st?.rpm ?? 0).toBeLessThanOrEqual(P.engine.maxRpm + 1);
    // 직진 유지(조향 0): 옆으로 0.5 m 안.
    expect(Math.abs((s.pose()?.posWF.x ?? 0) - O.x)).toBeLessThan(0.5);
  }, 60_000);

  it('60 km/h full braking: dry 14–20 m, wet longer', async () => {
    const out: number[] = [];
    for (const wet of [0, 1]) {
      const s = await track(wet);
      await accelerate(s, 60);
      const b = await brakeDistance(s);
      report(`brake 60 ${wet ? 'wet' : 'dry'} ${b.d.toFixed(2)} m abs ${b.abs}`);
      out.push(b.d);
    }
    expect(out[0]).toBeGreaterThanOrEqual(14);
    expect(out[0]).toBeLessThanOrEqual(20);
    expect(out[1] ?? 0).toBeGreaterThan((out[0] ?? 0) + 1);
  }, 60_000);

  it('steer +1 turns right (yaw decreases), reverse drives backwards', async () => {
    const s = await track();
    for (let i = 0; i < 120; i++) await s.frame({ ...IDLE, throttle: 0.5 });
    for (let i = 0; i < 90; i++) await s.frame({ ...IDLE, throttle: 0.3, steer: 1 });
    const q = s.pose()?.quat ?? { x: 0, y: 0, z: 0, w: 1 };
    const yaw = 2 * Math.atan2(q.y, q.w);
    expect(yaw).toBeLessThan(-0.2);
    // 멈춘 뒤 후진.
    for (let i = 0; i < 240; i++) await s.frame({ ...IDLE, brake: 1 });
    for (let i = 0; i < 120; i++) await s.frame({ ...IDLE, throttle: 0.6, reverse: true });
    expect(s.state()?.speedMs ?? 0).toBeLessThan(-1);
    expect(s.state()?.gear ?? 0).toBeLessThan(0);
  }, 60_000);
});
