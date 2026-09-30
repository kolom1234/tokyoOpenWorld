// M05-T03 소품 콜라이더: JCOL 프리미티브(원기둥·상자, 회전 포함)를 64 m 블록별 합성 셰이프로 묶어도 위치·회전·크기가 그대로 맞는다(레이 ±2 cm).
import { createEventBus, createLogger, packCellKey } from '@sanpo/core';
import { JCOL_MATERIAL, type JcolShape, writeJcol } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { PhysicsTransport } from '../src/api.ts';
import { createPhysics } from '../src/index.ts';
import type { ToWorker } from '../src/internal/protocol.ts';
import { PRIMITIVES_PER_JOB } from '../src/internal/worker/cell-colliders.ts';
import { createPhysicsCore } from '../src/internal/worker/core.ts';

const log = createLogger({ level: 'warn' });

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

const base = { layer: 0, material: JCOL_MATERIAL.metal, flags: 0 };

/** 전주 60개(원기둥 반높이 5.5, 반지름 0.17 — 블록 두 개에 걸침) + 45° 돌린 상자 1개. */
function shapes(): JcolShape[] {
  const out: JcolShape[] = [];
  for (let i = 0; i < 60; i++)
    out.push({
      ...base,
      kind: 'cylinder',
      posLocal: [4 + i * 2, 5.5, 20],
      quat: [0, 0, 0, 1],
      halfHeight: 5.5,
      radius: 0.17,
    });
  const s = Math.sin(Math.PI / 8);
  const c = Math.cos(Math.PI / 8);
  out.push({ ...base, kind: 'box', posLocal: [100, 0.4, 100], quat: [0, s, 0, c], halfExtents: [2, 0.4, 0.05] });
  return out;
}

describe('prop colliders', () => {
  it('group primitives into compound bodies without moving them', async () => {
    expect(PRIMITIVES_PER_JOB).toBeGreaterThan(8);
    const lb = loopback();
    const clock = { ms: 0 };
    const phys = createPhysics({
      bus: createEventBus(log),
      log,
      transport: lb.transport,
      originWF: { x: 0, y: 0, z: 0 },
      config: { isolation: 'degraded' },
      now: () => clock.ms,
    });
    await lb.flush();
    await phys.ready;
    const key = packCellKey(0, 1, 0);
    const jcol = writeJcol(shapes());
    phys.addCell(key, { x: 256, y: 0, z: 0 }, jcol.slice().buffer, undefined);
    const sys = phys.systems()[0];
    for (let t = 0; t < 50 && !phys.hasCell(key); t++) {
      clock.ms += 1000 / 60;
      sys?.update({} as never);
      await lb.flush();
    }
    expect(phys.hasCell(key)).toBe(true);
    // 원기둥 윗면(y = 11) — 두 블록(x < 64, x ≥ 64) 모두.
    for (const x of [4, 60, 70, 122]) {
      const hit = await phys.raycast({ x: 256 + x, y: 50, z: 20 }, { x: 0, y: -1, z: 0 }, 100);
      await lb.flush();
      expect(hit?.posWF.y ?? Number.NaN).toBeCloseTo(11, 1);
    }
    // 원기둥 옆면: x = 4 전주 중심에서 −X 쪽 반지름 0.17.
    const side = await phys.raycast({ x: 256, y: 3, z: 20 }, { x: 1, y: 0, z: 0 }, 10);
    await lb.flush();
    expect(side?.distance ?? Number.NaN).toBeCloseTo(4 - 0.17, 1);
    // 45° 상자: 긴 축이 (1, 0, −1)/√2 → 중심에서 +X로 쏘면 두께 0.05/sin45 ≈ 0.071 m 뒤 면에 맞는다.
    const box = await phys.raycast({ x: 256 + 95, y: 0.4, z: 100 }, { x: 1, y: 0, z: 0 }, 10);
    await lb.flush();
    expect(box?.distance ?? Number.NaN).toBeCloseTo(5 - 0.05 / Math.SQRT1_2, 1);
    phys.dispose();
  }, 30_000);
});
