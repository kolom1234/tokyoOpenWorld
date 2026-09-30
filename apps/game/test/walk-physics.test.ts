// M04-T04 수락(합성): 실제 Jolt(같은 스레드 전송) + traversal walk + 가짜 입력 — 0.15 m 연석 오르내림에서 1인칭 카메라 프레임당 변화 < 3 cm,
// 챌면 0.18 m 계단 오르기(카메라 < 3 cm/프레임, 끊김 없음). 실제 연석·육교 데이터는 M05-T01·교량 태스크(ADR-0044).
import { createEventBus, createLogger, type FrameContext } from '@sanpo/core';
import type { ActionState, AxisAction, ButtonAction, InputContext, InputService } from '@sanpo/input';
import { createInlineTransport, createPhysics } from '@sanpo/physics';
import { createTraversal } from '@sanpo/traversal';
import { describe, expect, it } from 'vitest';

const log = createLogger({ level: 'warn' });
const O = { x: 1000, y: 20, z: -1000 };

function fakeInput() {
  let context: InputContext = 'fly';
  const axes: Partial<Record<AxisAction, number>> = {};
  const hits = new Set<ButtonAction>();
  const state: ActionState = {
    axis: (a) => axes[a] ?? 0,
    pressed: (a) => hits.has(a),
    justPressed: (a) => hits.has(a),
  };
  const input = {
    state,
    get context() {
      return context;
    },
    pointerLocked: false,
    gamepadConnected: false,
    setContext: (c: InputContext) => {
      context = c;
    },
    rebind: () => undefined,
    bindings: () => ({ walk: {}, vehicle: {}, fly: {}, ui: {} }),
    dispose: () => undefined,
    systems: () => [],
  } as InputService;
  return { input, axes, hits };
}

async function setup() {
  const lb = createInlineTransport();
  const clock = { ms: 50_000 };
  const bus = createEventBus(log);
  const physics = createPhysics({ bus, log, transport: lb, originWF: O, now: () => clock.ms });
  await lb.flush();
  await physics.ready;
  // 바닥(윗면 y = 20), 동쪽 x +5… 연석 0.15 m, x +20… 계단(챌면 0.18·디딤 0.3) 5단 + 층계참.
  physics.debugSpawnBox({ x: O.x, y: O.y - 0.5, z: O.z }, { x: 60, y: 0.5, z: 20 }, false);
  physics.debugSpawnBox({ x: O.x + 12.5, y: O.y + 0.075, z: O.z }, { x: 7.5, y: 0.075, z: 20 }, false);
  for (let i = 0; i < 5; i++) {
    const h = 0.15 + 0.18 * (i + 1);
    physics.debugSpawnBox(
      { x: O.x + 20 + 0.3 * i + 0.15, y: O.y + h / 2, z: O.z },
      { x: 0.15, y: h / 2, z: 20 },
      false,
    );
  }
  physics.debugSpawnBox({ x: O.x + 30, y: O.y + 0.525, z: O.z }, { x: 8.5, y: 0.525, z: 20 }, false);
  const inp = fakeInput();
  const t = createTraversal(
    { input: inp.input, bus, log, ground: { groundHeightAt: () => O.y }, physics },
    {
      initial: {
        mode: 'freecam',
        params: { posWF: { x: O.x, y: O.y + 1.6, z: O.z }, yawRad: -Math.PI / 2, pitchRad: 0 },
      },
    },
  );
  const systems = [...t.systems(), ...physics.systems()].sort((a, b) => a.phase - b.phase);
  const frame = (dt: number): FrameContext => ({
    frameIndex: 0,
    dtReal: dt,
    dtGame: dt,
    gameTimeMs: 0,
    camera: t.camera,
    player: t.player,
  });
  const tick = async (dt = 1 / 60) => {
    clock.ms += dt * 1000;
    for (const s of systems) s.update(frame(dt));
    await lb.flush();
    inp.hits.clear();
  };
  return { t, physics, tick, ...inp };
}

describe('walk on curbs and stairs (real physics + traversal)', () => {
  it('first-person camera moves < 3 cm per frame over a 0.15 m curb and 0.18 m steps', async () => {
    const s = await setup();
    await s.tick();
    // 스폰은 하늘 레이(TERRAIN)가 필요 — 테스트 바닥은 STATIC_WORLD라 teleport로 직접 놓는다.
    s.hits.add('freeCam');
    await s.tick();
    await s.t.teleport({ x: O.x + 1, y: O.y + 0.02, z: O.z }, -Math.PI / 2);
    for (let i = 0; i < 20; i++) await s.tick();
    expect(s.t.mode).toBe('walk');
    expect(s.t.camera.posWF.y).toBeCloseTo(O.y + 1.6, 2);
    s.axes.moveY = 1;
    const cams: number[] = [];
    const feet: number[] = [];
    for (let i = 0; i < 60 * 24; i++) {
      await s.tick();
      cams.push(s.t.camera.posWF.y);
      feet.push(s.t.player.posWF.y);
      if (s.t.player.posWF.x > O.x + 30) break;
    }
    let maxStep = 0;
    for (let i = 1; i < cams.length; i++)
      maxStep = Math.max(maxStep, Math.abs((cams[i] as number) - (cams[i - 1] as number)));
    expect(s.t.player.posWF.x).toBeGreaterThan(O.x + 30);
    expect(s.t.player.posWF.y).toBeCloseTo(O.y + 1.05, 1);
    expect(maxStep).toBeLessThan(0.03);
    // 연석을 넘은 뒤 눈높이 = 연석 + 1.6.
    const onCurb = feet.findIndex((y) => y > O.y + 0.14);
    expect(onCurb).toBeGreaterThan(0);
    expect(cams[onCurb + 60] as number).toBeCloseTo(O.y + 0.15 + 1.6, 1);
    s.physics.dispose();
  });
});
