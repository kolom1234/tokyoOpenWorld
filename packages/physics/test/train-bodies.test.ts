// M07-T04 수락(08 §8): 열차 칸 = TRAIN 키네마틱 합성 바디 — 주행(가속 0.83 m/s² → 15 m/s, 곡선 포함) 중 차내에 선 캐릭터 미끄러짐 0,
// 차내 보행 중 벽·닫힌 문 관통 0, 정차 중 열린 문으로 승강장 → 차내 승차, 닫힌 문은 막힘. 같은 스레드 워커 코어 + 실제 Jolt, 60 fps 메인 프레임.
import { createEventBus, createLogger, TRAIN_BODY_STRIDE, TRAIN_CAR_TYPES, type Vec3d } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { createInlineTransport, createPhysics } from '../src/index.ts';

const log = createLogger({ level: 'warn' });
const O = { x: 1000, y: 0, z: -500 };
const CAR = TRAIN_CAR_TYPES[0] as (typeof TRAIN_CAR_TYPES)[number];
const R = 0.25;
const WALL_T = 0.08;

interface CarPose {
  x: number;
  z: number;
  yaw: number;
  doors: number;
}

async function scene() {
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
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const send = (c: CarPose): void => {
    const d = new Float64Array(TRAIN_BODY_STRIDE);
    d.set([7, c.x, O.y, c.z, c.yaw, 0, 0, 0, c.doors, 0]);
    phys.setTrainCars(d);
  };
  const frame = async () => {
    clock.ms += 1000 / 60;
    sys.update({} as never);
    await lb.flush();
  };
  return { phys, send, frame };
}

/** WF → 칸 로컬(−Z 앞, +X 오른쪽). */
function local(p: Readonly<Vec3d>, c: CarPose): { x: number; y: number; z: number } {
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const cs = Math.cos(c.yaw);
  const sn = Math.sin(c.yaw);
  return { x: dx * cs - dz * sn, y: p.y - O.y, z: dx * sn + dz * cs };
}

/** 주행 곡선: 0.83 m/s²로 15 m/s까지 → 등속, 4 s 뒤부터 반경 300 m 좌곡선(yaw = 거리 / R). */
function poseAt(t: number): CarPose {
  const ta = 15 / 0.83;
  const s = t < ta ? 0.5 * 0.83 * t * t : 0.5 * 0.83 * ta * ta + 15 * (t - ta);
  const s0 = 0.5 * 0.83 * 16;
  if (s <= s0) return { x: O.x, z: O.z - s, yaw: 0, doors: 0 };
  const a = (s - s0) / 300;
  return { x: O.x - 300 * (1 - Math.cos(a)), z: O.z - s0 - 300 * Math.sin(a), yaw: a, doors: 0 };
}

describe('train car bodies', () => {
  it('carries a standing passenger without slipping while accelerating and curving', async () => {
    const { phys, send, frame } = await scene();
    send(poseAt(0));
    await frame();
    const ch = phys.spawnCharacter({ x: O.x + 0.3, y: CAR.floorM + 0.05, z: O.z - 1 }, 0);
    for (let k = 0; k < 30; k++) {
      send(poseAt(0));
      await frame();
    }
    const at = (t: number) => local(phys.pose(ch)?.posWF ?? O, poseAt(t));
    const start = at(0);
    expect(start.y).toBeCloseTo(CAR.floorM, 1);
    let maxSlip = 0;
    for (let k = 1; k <= 60 * 12; k++) {
      const t = k / 60;
      send(poseAt(t));
      await frame();
      // 포즈는 보간 지연(≈ 25 ms)만큼 뒤 — 같은 시각의 칸으로 비교.
      const p = at(Math.max(0, t - 0.025));
      maxSlip = Math.max(maxSlip, Math.hypot(p.x - start.x, p.z - start.z));
    }
    expect(phys.stats().trainBodies).toBe(1);
    expect(maxSlip).toBeLessThan(0.05);
  });

  it('stops a passenger walking into the closed door or end wall at speed (no penetration)', async () => {
    const { phys, send, frame } = await scene();
    send(poseAt(0));
    await frame();
    const z0 = CAR.doorsZ[1] as number;
    const ch = phys.spawnCharacter({ x: O.x, y: CAR.floorM + 0.05, z: O.z + z0 }, 0);
    for (let k = 0; k < 30; k++) {
      send(poseAt(0));
      await frame();
    }
    /** 칸 로컬 방향(lx, lz) × 속력 → WF 상대 속도(바닥 기준 입력). */
    const walk = (c: CarPose, lx: number, lz: number) => ({
      x: lx * Math.cos(c.yaw) + lz * Math.sin(c.yaw),
      y: 0,
      z: lz * Math.cos(c.yaw) - lx * Math.sin(c.yaw),
    });
    let t = 0;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    // 가속·곡선 주행 중: 4–8 s 오른쪽 닫힌 문으로 1.4 m/s, 8–9 s 통로로, 9–16 s 앞 끝벽으로.
    for (let k = 0; k < 60 * 16; k++) {
      t += 1 / 60;
      const c = poseAt(t);
      send(c);
      const toDoor = t > 4 && t <= 8;
      const move = toDoor ? walk(c, 1.4, 0) : t <= 9 ? walk(c, -1.4, 0) : walk(c, 0, -1.4);
      if (t > 4) phys.setCharacterInput(ch, { moveWF: move, yawRad: c.yaw });
      await frame();
      const p = local(phys.pose(ch)?.posWF ?? O, poseAt(Math.max(0, t - 0.025)));
      if (toDoor) maxX = Math.max(maxX, p.x);
      else if (t > 9) minZ = Math.min(minZ, p.z);
    }
    // 닫힌 문 안쪽 면 = W/2 − 두께 → 캡슐 축 ≤ 그 − 반경(실제로 문에 닿았는지도).
    expect(maxX).toBeLessThanOrEqual(CAR.widthM / 2 - WALL_T - R + 0.03);
    expect(maxX).toBeGreaterThan(CAR.widthM / 2 - WALL_T - R - 0.1);
    expect(minZ).toBeGreaterThanOrEqual(-(CAR.lengthM / 2 - 0.25) + WALL_T + R - 0.03);
    expect(minZ).toBeLessThan(-(CAR.lengthM / 2 - 0.25) + WALL_T + R + 0.15);
  });

  it('boards from the platform through an open door, and a closed door blocks', async () => {
    for (const doors of [-1, 0]) {
      const { phys, send, frame } = await scene();
      const car: CarPose = { x: O.x, z: O.z, yaw: 0, doors };
      // 승강장(왼쪽 = −X): 윗면 레일 + 1.1 m, 가장자리 x −1.6.
      phys.setStaticGroup('platform', { boxes: Float64Array.from([O.x - 5.3, O.y + 0.55, O.z, 3.7, 0.55, 30, 0, 7]) });
      send(car);
      await frame();
      const zd = CAR.doorsZ[1] as number;
      const ch = phys.spawnCharacter({ x: O.x - 3.5, y: O.y + 1.15, z: O.z + zd }, 0);
      for (let k = 0; k < 60 * 4; k++) {
        send(car);
        phys.setCharacterInput(ch, { moveWF: { x: 1.3, y: 0, z: 0 }, yawRad: -Math.PI / 2 });
        await frame();
      }
      const p = local(phys.pose(ch)?.posWF ?? O, car);
      if (doors === -1) {
        expect(p.x, 'inside the car').toBeGreaterThan(-CAR.widthM / 2 + 0.5);
        expect(p.y, 'on the car floor').toBeCloseTo(CAR.floorM, 1);
      } else expect(p.x, 'stopped by the closed door').toBeLessThanOrEqual(-CAR.widthM / 2 - R + 0.03);
    }
  });
});
