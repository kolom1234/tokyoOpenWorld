// M06-T06 수락(08 §3·§8): sim 직결 포트(KinematicFrame) 차량 = NPC_KINEMATIC 상자 — 도보 캐릭터와 겹침(관통) 0.
// 같은 스레드 워커 코어 + 실제 Jolt, 60 fps 메인 프레임·30 Hz 프레임(sim 틱 흉내). 겹침 = 캡슐 축(발 위치 x,z)과 차체 사각형(차 로컬) 거리 < 반경 − 허용.
import { createEventBus, createLogger, KINEMATIC_STRIDE, type KinematicFrame, type Vec3d } from '@sanpo/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createInlineTransport, createPhysics, DEFAULT_PHYSICS_CONFIG } from '../src/index.ts';

const log = createLogger({ level: 'warn' });
const O = { x: 3000, y: 0, z: -2000 };
const SEDAN = { len: 4.6, wid: 1.76, hgt: 1.45 };
const RADIUS = 0.25;
/** 겹침 = 침투 > 0(허용 없음). 실측: 밀림 최소 간격 0.136 m, 정지 차에 걸어 들어감 0.020 m(캐릭터 패딩). */
const TOLERANCE_M = 0;

const ports: MessagePort[] = [];
afterEach(() => {
  for (const p of ports.splice(0)) p.close();
});

interface Car {
  id: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

/** 차 로컬(전방 −Z) 사각형까지 거리(안이면 음수) − 캡슐 반경 = 침투 깊이(> 0 = 겹침). */
function penetration(p: Readonly<Vec3d>, c: Car): number {
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const cs = Math.cos(c.yaw);
  const sn = Math.sin(c.yaw);
  // WF → 차 로컬: 역회전(yaw).
  const lx = dx * cs - dz * sn;
  const lz = dx * sn + dz * cs;
  const qx = Math.abs(lx) - SEDAN.wid / 2;
  const qz = Math.abs(lz) - SEDAN.len / 2;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, qz), 0);
  return RADIUS - (outside + inside);
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
  phys.debugSpawnBox({ x: O.x, y: -0.5, z: O.z }, { x: 60, y: 0.5, z: 60 }, false);
  const ch = phys.spawnCharacter({ ...O }, 0);
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const channel = new MessageChannel();
  ports.push(channel.port1, channel.port2);
  phys.connectKinematicSource(channel.port2);
  const send = (cars: readonly Car[]): void => {
    const data = new Float64Array(cars.length * KINEMATIC_STRIDE);
    for (const [i, c] of cars.entries())
      data.set([c.id, c.x, O.y, c.z, c.yaw, c.speed, SEDAN.len, SEDAN.wid, SEDAN.hgt], i * KINEMATIC_STRIDE);
    const f: KinematicFrame = { t: 'kin', atMs: performance.timeOrigin + performance.now(), data };
    channel.port1.postMessage(f, [data.buffer]);
  };
  /** 60 fps 프레임 하나(포트 메시지가 도착하도록 이벤트 루프 한 바퀴). */
  const frame = async () => {
    await new Promise((r) => setTimeout(r, 0));
    clock.ms += 1000 / 60;
    sys.update({} as never);
    await lb.flush();
  };
  const pose = () => {
    const p = phys.pose(ch);
    if (!p) throw new Error('no pose');
    return { ...p.posWF };
  };
  return { phys, ch, send, frame, pose };
}

/** pose()는 렌더 시각(지금 − 보간 지연)의 캐릭터 → 차도 같은 시각으로 되돌려 비교. */
const DELAY_S = DEFAULT_PHYSICS_CONFIG.interpolationDelayS;
const back = (c: Car): Car => ({
  ...c,
  x: c.x + Math.sin(c.yaw) * c.speed * DELAY_S,
  z: c.z + Math.cos(c.yaw) * c.speed * DELAY_S,
});

/** 차를 dt마다 전진시키며 30 Hz로 보내고, 매 프레임 최대 침투 기록. */
async function drive(s: Awaited<ReturnType<typeof scene>>, car: Car, seconds: number, move = true) {
  let worst = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < seconds * 60; i++) {
    if (move) {
      car.x -= Math.sin(car.yaw) * car.speed * (1 / 60);
      car.z -= Math.cos(car.yaw) * car.speed * (1 / 60);
    }
    if (i % 2 === 0) s.send([car]);
    await s.frame();
    worst = Math.max(worst, penetration(s.pose(), back(car)));
  }
  return worst;
}

describe('kinematic vehicles (sim → physics port)', () => {
  it('a car driving through a standing character pushes it — no overlap', async () => {
    const s = await scene();
    for (let i = 0; i < 30; i++) await s.frame();
    const start = s.pose();
    // 동쪽(+X)으로 8 m/s, 캐릭터 정면으로(가로 0).
    const car: Car = { id: 7, x: O.x - 12, z: O.z, yaw: -Math.PI / 2, speed: 8 };
    const worst = await drive(s, car, 3);
    const end = s.pose();
    expect(s.phys.stats().kinematicBodies).toBe(1);
    expect(s.phys.stats().kinematicFrames).toBeGreaterThan(80);
    expect(worst, `max penetration ${worst.toFixed(3)} m`).toBeLessThan(TOLERANCE_M);
    // 밀렸다(차 앞이나 옆으로) — 제자리 관통이 아니다.
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1);
  });

  it('a character walking into a stopped car stops at its side', async () => {
    const s = await scene();
    for (let i = 0; i < 30; i++) await s.frame();
    // 북쪽 3 m에 동서로 선 차(속력 0), 캐릭터가 북쪽(−Z)으로 걷는다.
    const car: Car = { id: 9, x: O.x, z: O.z - 3, yaw: -Math.PI / 2, speed: 0 };
    s.phys.setCharacterInput(s.ch, { moveWF: { x: 0, y: 0, z: -1.35 } });
    const worst = await drive(s, car, 4, false);
    expect(worst, `max penetration ${worst.toFixed(3)} m`).toBeLessThan(TOLERANCE_M);
    expect(s.pose().z).toBeGreaterThan(O.z - 3 + SEDAN.wid / 2);
  });

  it('removes bodies missing from the latest frame and when the source goes quiet', async () => {
    const s = await scene();
    const a: Car = { id: 1, x: O.x + 20, z: O.z, yaw: 0, speed: 0 };
    const b: Car = { id: 2, x: O.x - 20, z: O.z, yaw: 0, speed: 0 };
    s.send([a, b]);
    for (let i = 0; i < 3; i++) await s.frame();
    expect(s.phys.stats().kinematicBodies).toBe(2);
    s.send([a]);
    for (let i = 0; i < 3; i++) await s.frame();
    expect(s.phys.stats().kinematicBodies).toBe(1);
    for (let i = 0; i < 45; i++) await s.frame();
    expect(s.phys.stats().kinematicBodies).toBe(0);
  });
});
