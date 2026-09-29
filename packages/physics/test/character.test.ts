// M04-T03 캐릭터(08 §5): 같은 스레드 워커 코어 + 실제 Jolt — 걷기 1.35 m/s 도달(가속 8 m/s²)·접지, 0.15 m 연석 오르기, 벽에서 멈춤(관통·낙하 없음).
import { createEventBus, createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import type { PhysicsTransport } from '../src/api.ts';
import { createPhysics } from '../src/index.ts';
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
const O = { x: 3000, y: 0, z: -2000 };

async function scene() {
  const lb = loopback();
  const clock = { ms: 10_000 };
  const phys = createPhysics({
    bus: createEventBus(log),
    log,
    transport: lb.transport,
    originWF: O,
    config: { isolation: 'shared' },
    now: () => clock.ms,
  });
  await lb.flush();
  await phys.ready;
  // 바닥(윗면 y 0), 동쪽 +5–15 m에 0.15 m 연석, 서쪽 −10 m에 벽.
  phys.debugSpawnBox({ x: O.x, y: -0.5, z: O.z }, { x: 20, y: 0.5, z: 20 }, false);
  phys.debugSpawnBox({ x: O.x + 10, y: 0.075, z: O.z }, { x: 5, y: 0.075, z: 20 }, false);
  phys.debugSpawnBox({ x: O.x - 10, y: 1.5, z: O.z }, { x: 0.25, y: 1.5, z: 20 }, false);
  const ch = phys.spawnCharacter({ ...O }, 0);
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const run = async (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) {
      clock.ms += 1000 / 60;
      sys.update({} as never);
      await lb.flush();
    }
  };
  const pose = () => {
    const p = phys.pose(ch);
    if (!p) throw new Error('no pose');
    return { ...p, posWF: { ...p.posWF }, linVel: { ...p.linVel } };
  };
  return { phys, ch, run, pose };
}

describe('character (CharacterVirtual)', () => {
  it('walks at 1.35 m/s on flat ground, steps onto a 0.15 m curb and stops at a wall', async () => {
    const { phys, ch, run, pose } = await scene();
    await run(0.5);
    expect(pose().grounded).toBe(true);
    expect(Math.abs(pose().posWF.y)).toBeLessThan(0.02);

    phys.setCharacterInput(ch, { moveWF: { x: 1.35, y: 0, z: 0 }, yawRad: -Math.PI / 2 });
    await run(1);
    const a = pose();
    await run(1);
    const b = pose();
    const speed = (b.posWF.x - a.posWF.x) / 1;
    expect(speed).toBeGreaterThan(1.33);
    expect(speed).toBeLessThan(1.37);
    expect(Math.abs(b.posWF.z - O.z)).toBeLessThan(1e-3);
    expect(b.grounded).toBe(true);

    // 연석(x ≥ O.x + 5): 5.2 m 더 → 윗면 0.15 m 위.
    phys.setCharacterInput(ch, { moveWF: { x: 3, y: 0, z: 0 } });
    await run(2.5);
    const c = pose();
    expect(c.posWF.x).toBeGreaterThan(O.x + 6);
    expect(c.posWF.y).toBeGreaterThan(0.14);
    expect(c.posWF.y).toBeLessThan(0.16);
    expect(c.grounded).toBe(true);

    // 서쪽 벽(면 x = O.x − 9.75): 캡슐 반경 0.25 앞에서 멈춘다, 낙하 없음.
    phys.setCharacterInput(ch, { moveWF: { x: -5, y: 0, z: 0 } });
    await run(6);
    const d = pose();
    expect(d.posWF.x).toBeGreaterThan(O.x - 9.75 + 0.2);
    expect(d.posWF.x).toBeLessThan(O.x - 9.75 + 0.35);
    expect(Math.abs(d.posWF.y)).toBeLessThan(0.02);
    expect(d.grounded).toBe(true);

    // 정지: 감속 10 m/s² → 0.6 s 안에 멈춘다.
    phys.setCharacterInput(ch, { moveWF: { x: 0, y: 0, z: 0 } });
    await run(0.6);
    expect(Math.hypot(pose().linVel.x, pose().linVel.z)).toBeLessThan(0.01);
    phys.dispose();
  });

  it('teleports a character (velocity 0) and falls under gravity when there is no ground', async () => {
    const { phys, ch, run, pose } = await scene();
    phys.teleport(ch, { x: O.x + 100, y: 5, z: O.z }, 0);
    await run(0.5);
    const p = pose();
    expect(p.grounded).toBe(false);
    expect(p.posWF.y).toBeLessThan(5 - 0.5 * 9.81 * 0.2 ** 2);
    phys.teleport(ch, { x: O.x, y: 0.5, z: O.z + 3 }, 0);
    await run(1);
    expect(pose().grounded).toBe(true);
    expect(Math.abs(pose().posWF.y)).toBeLessThan(0.02);
    phys.dispose();
  });
});
