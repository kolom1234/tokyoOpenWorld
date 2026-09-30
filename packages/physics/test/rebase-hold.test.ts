// M04-T06(08 §2·§4): 앵커 재설정 — 초점이 4096 m 넘으면 새 격자점으로, 걷는 캐릭터·정적 바디·레이 결과가 WF에서 끊김 없이 이어진다.
// hold(발밑 셀 미적재) — 발밑에 바닥이 없어도 제자리(중력·이동 없음), 풀면 떨어진다.
import { createEventBus, createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { createInlineTransport, createPhysics } from '../src/index.ts';

const log = createLogger({ level: 'warn' });

async function setup(originWF: { x: number; y: number; z: number }) {
  const lb = createInlineTransport();
  const clock = { ms: 10_000 };
  const phys = createPhysics({ bus: createEventBus(log), log, transport: lb, originWF, now: () => clock.ms });
  await lb.flush();
  await phys.ready;
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const run = async (seconds: number, each?: () => void) => {
    for (let i = 0; i < seconds * 60; i++) {
      clock.ms += 1000 / 60;
      each?.();
      sys.update({} as never);
      await lb.flush();
    }
  };
  return { phys, run };
}

describe('anchor rebase & hold', () => {
  it('rebases the anchor past 4096 m without moving anything in WF', async () => {
    const { phys, run } = await setup({ x: 0, y: 0, z: 0 });
    expect(phys.stats().anchorWF).toEqual({ x: 0, y: 0, z: 0 });
    // x 4000–4300 긴 바닥(윗면 y 20), 캐릭터가 +x로 걸어 4096 m를 넘는다.
    phys.debugSpawnBox({ x: 4150, y: 19.5, z: -10 }, { x: 200, y: 0.5, z: 20 }, false);
    const ch = phys.spawnCharacter({ x: 4094, y: 20.02, z: -10 }, -Math.PI / 2);
    phys.setCharacterInput(ch, { moveWF: { x: 1.35, y: 0, z: 0 } });
    const xs: number[] = [];
    const ys: number[] = [];
    await run(4, () => {
      const p = phys.pose(ch);
      if (!p) return;
      xs.push(p.posWF.x);
      ys.push(p.posWF.y);
      phys.setFocus(p.posWF);
    });
    const st = phys.stats();
    expect(st.rebases).toBe(1);
    expect(st.anchorWF).toEqual({ x: 4096, y: 0, z: 0 });
    // 프레임 사이 이동 ≤ 1.35/60 + 여유 — 재설정 순간에도 튐 없음, 높이 그대로.
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeLessThan(0.03);
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThan(-0.001);
    }
    for (const y of ys.slice(20)) expect(Math.abs(y - 20)).toBeLessThan(0.02);
    // 정적 바디(바닥) 레이도 같은 WF.
    const hit = await phys.raycast({ x: 4200, y: 50, z: -10 }, { x: 0, y: -1, z: 0 }, 100);
    expect(hit?.posWF.y).toBeCloseTo(20, 3);
    phys.dispose();
  });

  it('holds a character in place with no ground under it, then it falls when released', async () => {
    const { phys, run } = await setup({ x: 100, y: 0, z: 100 });
    const ch = phys.spawnCharacter({ x: 100, y: 30, z: 100 }, 0);
    phys.setCharacterInput(ch, { moveWF: { x: 1, y: 0, z: 0 }, hold: true });
    await run(1);
    const held = phys.pose(ch);
    expect(held?.posWF.y).toBeCloseTo(30, 3);
    expect(held?.posWF.x).toBeCloseTo(100, 3);
    phys.setCharacterInput(ch, { moveWF: { x: 0, y: 0, z: 0 } });
    await run(0.5);
    expect(phys.pose(ch)?.posWF.y ?? 30).toBeLessThan(29);
    phys.dispose();
  });
});
