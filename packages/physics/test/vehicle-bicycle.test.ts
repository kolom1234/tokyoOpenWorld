// M08-T03 수락(08 §7): 생활형 자전거(content/vehicles/bicycle.json) — 평지 최고 속력 22–26 km/h, 1 m/s 저속(조향 흔들기 포함) 넘어짐 0,
// 멈춰 서면 발 딛기(롤 ≈ 0). 같은 스레드 워커 코어 + 실제 Jolt(120 Hz), 메인 60 fps, 바닥 = 정적 상자.
import { createEventBus, createLogger, type Quat, type Vec3d } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import BIKE from '../../../content/vehicles/bicycle.json' with { type: 'json' };
import { type BicycleParams, createInlineTransport, createPhysics, type VehicleInput } from '../src/index.ts';

const log = createLogger({ level: 'warn' });
const O: Vec3d = { x: 2000, y: 0, z: 2000 };
const P = BIKE as unknown as BicycleParams;
const IDLE: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false };
const report = (line: string): void => void process.stdout.write(`[bicycle] ${line}\n`);

/** 차체 롤(deg): 차체 오른쪽 축의 y 성분. */
function rollDeg(q: Readonly<Quat>): number {
  // 로컬 +X를 회전 → y 성분 = 2(xy + wz).
  const ry = 2 * (q.x * q.y + q.w * q.z);
  return (Math.asin(Math.max(-1, Math.min(1, ry))) * 180) / Math.PI;
}

async function track() {
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
  phys.debugSpawnBox({ x: O.x, y: -0.5, z: O.z - 300 }, { x: 60, y: 0.5, z: 400 }, false);
  const bike = phys.spawnVehicle('bicycle', { x: O.x, y: 0.03, z: O.z }, 0, P);
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const frame = async (input: VehicleInput) => {
    phys.setVehicleInput(bike, input);
    clock.ms += 1000 / 60;
    sys.update({} as never);
    await lb.flush();
  };
  for (let i = 0; i < 60; i++) await frame(IDLE);
  return { frame, phys, bike };
}

describe('bicycle (M08-T03)', () => {
  it('flat top speed 22–26 km/h with full pedalling, upright', async () => {
    const s = await track();
    let maxRoll = 0;
    for (let i = 0; i < 60 * 25; i++) {
      await s.frame({ ...IDLE, throttle: 1 });
      maxRoll = Math.max(maxRoll, Math.abs(rollDeg(s.phys.pose(s.bike)?.quat ?? { x: 0, y: 0, z: 0, w: 1 })));
    }
    const kmh = (s.phys.vehicleState(s.bike)?.speedMs ?? 0) * 3.6;
    report(`top ${kmh.toFixed(1)} km/h, max roll ${maxRoll.toFixed(1)}°`);
    expect(kmh).toBeGreaterThanOrEqual(22);
    expect(kmh).toBeLessThanOrEqual(26);
    expect(maxRoll).toBeLessThan(10);
  }, 60_000);

  it('1 m/s for 20 s with steering wobble: never falls; stopped = foot down', async () => {
    const s = await track();
    let maxRoll = 0;
    let vSum = 0;
    let n = 0;
    for (let i = 0; i < 60 * 20; i++) {
      const v = s.phys.vehicleState(s.bike)?.speedMs ?? 0;
      const throttle = Math.min(1, Math.max(0, (1 - v) * 0.8 + 0.05));
      const steer = 0.5 * Math.sin(i / 40);
      await s.frame({ ...IDLE, throttle, steer, brake: v > 1.2 ? 0.3 : 0 });
      if (i > 180) {
        vSum += v;
        n++;
        maxRoll = Math.max(maxRoll, Math.abs(rollDeg(s.phys.pose(s.bike)?.quat ?? { x: 0, y: 0, z: 0, w: 1 })));
      }
    }
    for (let i = 0; i < 60 * 4; i++) await s.frame({ ...IDLE, brake: 1 });
    const still = Math.abs(rollDeg(s.phys.pose(s.bike)?.quat ?? { x: 0, y: 0, z: 0, w: 1 }));
    report(
      `low speed avg ${(vSum / n).toFixed(2)} m/s, max roll ${maxRoll.toFixed(1)}°, stopped roll ${still.toFixed(1)}°`,
    );
    expect(vSum / n).toBeGreaterThan(0.7);
    expect(maxRoll).toBeLessThan(20);
    expect(still).toBeLessThan(5);
  }, 60_000);
});
