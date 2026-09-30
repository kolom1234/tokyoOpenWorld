// M04-T04(08 §5, ADR-0044): 실제 Jolt + JCOL 셀 콜라이더 — 계단(챌면 0.18 m) 오르내림 끊김 없음, 램프 프록시(flags bit0) 매끈한 오르기·지면 재질,
// 에스컬레이터(SENSOR 박스 flags bit2) 0.5 m/s 운반·걸어 오르기 +0.6 m/s 한도, 지면 재질 스냅샷.
import { createEventBus, createLogger, packCellKey } from '@sanpo/core';
import { JCOL_FLAG, JCOL_MATERIAL, type JcolShape, writeJcol } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { createInlineTransport, createPhysics } from '../src/index.ts';
import { rotate } from '../src/internal/worker/escalators.ts';

const log = createLogger({ level: 'warn' });
const O = { x: 3000, y: 0, z: -2000 };
const Z = 128;
const ID: [number, number, number, number] = [0, 0, 0, 1];
const STEP_H = 0.18;
const STEP_D = 0.3;
const STEPS = 10;
const TOP = STEP_H * STEPS;

function box(
  center: [number, number, number],
  half: [number, number, number],
  material: number = JCOL_MATERIAL.concrete,
): JcolShape {
  return { kind: 'box', layer: 0, material, flags: 0, posLocal: center, quat: ID, halfExtents: half };
}

/** x0에서 x1까지 0 → TOP으로 오르는 면(삼각형 2개, 폭 z ± 2). */
function ramp(x0: number, x1: number, material: number, flags: number): JcolShape {
  const v = [x0, 0, Z - 2, x1, TOP, Z - 2, x1, TOP, Z + 2, x0, 0, Z + 2];
  return {
    kind: 'triMesh',
    layer: 0,
    material,
    flags,
    posLocal: [0, 0, 0],
    quat: ID,
    vertices: new Float32Array(v),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

function quatAxis(ax: [number, number, number], a: number): [number, number, number, number] {
  const s = Math.sin(a / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)];
}

function quatMul(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = a as [number, number, number, number];
  const [bx, by, bz, bw] = b as [number, number, number, number];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** 30° 에스컬레이터: 금속 경사면(x 60 → 60 + TOP/tan30) + 진행 방향 +x·위 SENSOR 박스(양 끝 승강장 쪽으로 0.5 m씩 더 — 빗 판). */
const ESC_RUN = TOP / Math.tan(Math.PI / 6);
function escalator(): JcolShape[] {
  const q = quatMul(quatAxis([0, 1, 0], Math.PI / 2), quatAxis([1, 0, 0], -Math.PI / 6));
  const len = Math.hypot(ESC_RUN, TOP);
  return [
    ramp(60, 60 + ESC_RUN, JCOL_MATERIAL.metal, 0),
    {
      kind: 'box',
      layer: 7,
      material: JCOL_MATERIAL.metal,
      flags: JCOL_FLAG.escalator,
      posLocal: [60 + ESC_RUN / 2, TOP / 2 + 0.4, Z],
      quat: q,
      halfExtents: [1, 0.8, len / 2 + 0.5],
    },
  ];
}

function sceneJcol(): ArrayBuffer {
  const shapes: JcolShape[] = [box([128, -0.5, 128], [128, 0.5, 128])];
  // 계단: x 20 + 0.3·i, 챌면 0.18 m, 위 층계참 x 23–30.
  for (let i = 0; i < STEPS; i++) {
    const h = STEP_H * (i + 1);
    shapes.push(box([20 + STEP_D * i + STEP_D / 2, h / 2, Z], [STEP_D / 2, h / 2, 2]));
  }
  shapes.push(box([26.5, TOP / 2, Z], [3.5, TOP / 2, 2]));
  // 램프 프록시(렌더는 계단, 충돌은 경사면 — 타일): x 40 → 46, 위 층계참.
  shapes.push(ramp(40, 46, JCOL_MATERIAL.tile, JCOL_FLAG.rampProxy));
  shapes.push(box([49, TOP / 2, Z], [3, TOP / 2, 2]));
  shapes.push(...escalator());
  shapes.push(box([60 + ESC_RUN + 3, TOP / 2, Z], [3, TOP / 2, 2]));
  const bytes = writeJcol(shapes);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function scene() {
  const lb = createInlineTransport();
  const clock = { ms: 10_000 };
  const phys = createPhysics({ bus: createEventBus(log), log, transport: lb, originWF: O, now: () => clock.ms });
  await lb.flush();
  await phys.ready;
  const key = packCellKey(0, 11, -8);
  phys.addCell(key, { ...O }, sceneJcol(), undefined);
  const sys = phys.systems()[0];
  if (!sys) throw new Error('no system');
  const tick = async () => {
    clock.ms += 1000 / 60;
    sys.update({} as never);
    await lb.flush();
  };
  for (let i = 0; i < 30 && !phys.hasCell(key); i++) await tick();
  expect(phys.hasCell(key)).toBe(true);
  const ch = phys.spawnCharacter({ x: O.x + 10, y: 0.02, z: O.z + Z }, -Math.PI / 2);
  const pose = () => {
    const p = phys.pose(ch);
    if (!p) throw new Error('no pose');
    return { ...p, posWF: { ...p.posWF }, linVel: { ...p.linVel } };
  };
  /** seconds 동안 매 프레임 포즈 기록. */
  const run = async (seconds: number) => {
    const out: ReturnType<typeof pose>[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      await tick();
      const p = phys.pose(ch);
      if (p) out.push({ ...p, posWF: { ...p.posWF }, linVel: { ...p.linVel } });
    }
    return out;
  };
  const move = (vx: number) => phys.setCharacterInput(ch, { moveWF: { x: vx, y: 0, z: 0 } });
  const place = async (x: number, y = 0.02) => {
    phys.teleport(ch, { x: O.x + x, y, z: O.z + Z }, -Math.PI / 2);
    move(0);
    await run(0.3);
  };
  return { phys, run, move, pose, place };
}

const lx = (p: { posWF: { x: number } }) => p.posWF.x - O.x;

describe('stairs, ramp proxy, escalator, ground material', () => {
  it('walks up and down 0.18 m steps without hitches', async () => {
    const s = await scene();
    await s.run(0.3);
    expect(s.pose().groundMaterial).toBe(JCOL_MATERIAL.concrete);
    s.move(1.35);
    const up = await s.run(12);
    const top = s.pose();
    expect(top.posWF.y).toBeCloseTo(TOP, 1);
    expect(lx(top)).toBeGreaterThan(24);
    // 계단 구간(x 20–23): 1/6 s 창 수평 속도 ≥ 0.9 m/s(걷기의 2/3 — 챌면 모서리에서 잠깐 느려질 뿐 멈추지 않음), 높이는 내려가지 않음(2 cm 허용).
    const stairs = up.filter((p) => lx(p) > 20.2 && lx(p) < 22.8);
    expect(stairs.length).toBeGreaterThan(60);
    for (let i = 10; i < stairs.length; i++) {
      const a = stairs[i - 10] as (typeof stairs)[0];
      const b = stairs[i] as (typeof stairs)[0];
      expect((lx(b) - lx(a)) / (10 / 60)).toBeGreaterThan(0.9);
      expect(b.posWF.y).toBeGreaterThan(a.posWF.y - 0.02);
    }
    s.move(-1.35);
    const down = await s.run(12);
    expect(s.pose().posWF.y).toBeCloseTo(0, 1);
    const stairsDown = down.filter((p) => lx(p) > 20.2 && lx(p) < 22.8);
    for (let i = 10; i < stairsDown.length; i++) {
      const a = stairsDown[i - 10] as (typeof stairsDown)[0];
      const b = stairsDown[i] as (typeof stairsDown)[0];
      expect((lx(a) - lx(b)) / (10 / 60)).toBeGreaterThan(0.9);
    }
    // 내려오는 동안 접지 유지(바닥 붙기 0.5 m ≥ 챌면).
    expect(stairsDown.filter((p) => !p.grounded).length).toBeLessThan(stairsDown.length * 0.1);
    s.phys.dispose();
  });

  it('climbs a ramp proxy smoothly and reports its material', async () => {
    const s = await scene();
    await s.place(36);
    s.move(1.35);
    const up = await s.run(9);
    expect(s.pose().posWF.y).toBeCloseTo(TOP, 1);
    const onRamp = up.filter((p) => lx(p) > 40.5 && lx(p) < 45.5);
    expect(onRamp.every((p) => p.grounded)).toBe(true);
    expect(onRamp.some((p) => p.groundMaterial === JCOL_MATERIAL.tile)).toBe(true);
    // 경사 16.7°: 프레임 사이 높이 변화 ≤ 1 cm(계단 튐 없음).
    for (let i = 1; i < onRamp.length; i++) {
      const dy = (onRamp[i] as (typeof onRamp)[0]).posWF.y - (onRamp[i - 1] as (typeof onRamp)[0]).posWF.y;
      expect(Math.abs(dy)).toBeLessThan(0.01);
    }
    s.phys.dispose();
  });

  it('carries a standing character up the escalator at 0.5 m/s and caps walking at +0.6 m/s', async () => {
    const q = quatMul(quatAxis([0, 1, 0], Math.PI / 2), quatAxis([1, 0, 0], -Math.PI / 6));
    const d = rotate(q, [0, 0, 1]);
    expect(d[0]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    expect(d[1]).toBeCloseTo(0.5, 6);
    const s = await scene();
    await s.place(58.5);
    s.move(1.35);
    await s.run(1.2);
    s.move(0);
    const ride = await s.run(3);
    // 운반 중 떠오르지 않는다: 발 = 경사면 + r·(sec 30° − 1) ≈ 3.9 cm + 여유(패딩 2 cm) 안.
    for (const p of ride.filter((q) => lx(q) > 60.2 && lx(q) < 60 + ESC_RUN - 0.2)) {
      const dy = p.posWF.y - ((lx(p) - 60) / ESC_RUN) * TOP;
      expect(dy).toBeGreaterThan(-0.01);
      expect(dy).toBeLessThan(0.07);
    }
    const on = ride.filter((p) => p.escalator && lx(p) > 60.5 && lx(p) < 62.5);
    expect(on.length).toBeGreaterThan(30);
    const a = on[0] as (typeof on)[0];
    const b = on[on.length - 1] as (typeof on)[0];
    const t = (on.length - 1) / 60;
    const along = Math.hypot(lx(b) - lx(a), b.posWF.y - a.posWF.y) / t;
    expect(along).toBeGreaterThan(0.45);
    expect(along).toBeLessThan(0.55);
    expect(b.groundMaterial).toBe(JCOL_MATERIAL.metal);
    // 걸어 오르기: 수평 원하는 속도 1.35 → 0.6으로 제한 + 구간 0.5.
    s.move(1.35);
    const walk = await s.run(1);
    const w = walk.filter((p) => p.escalator);
    const last = w[w.length - 1] as (typeof w)[0];
    expect(Math.hypot(last.linVel.x, last.linVel.y, last.linVel.z)).toBeLessThan(0.5 + 0.6 + 0.05);
    await s.run(4);
    expect(s.pose().posWF.y).toBeCloseTo(TOP, 1);
    expect(s.pose().escalator).toBe(false);
    s.phys.dispose();
  });
});
