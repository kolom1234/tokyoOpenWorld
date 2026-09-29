// biome-ignore-all lint/style/noNonNullAssertion: 광선 교차 계산은 길이 3 고정 배열 인덱스.
// M04-T02 수락: world-mini 셀 콜라이더(collision.bin + terrain.height) 적재 — 적재 틱 ≤ 8 ms, 레이캐스트가 지면(높이장 샘플)·건물 벽(JCOL 삼각형, CPU 광선 교차)을 ±5 cm로 맞힌다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, createEventBus, createLogger, packCellKey, type Vec3d } from '@sanpo/core';
import {
  gunzip,
  type HeightfieldData,
  type JcolTriMesh,
  parseHeightfield,
  parseJcol,
  readTkc,
} from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { PhysicsTransport } from '../src/api.ts';
import { createPhysics } from '../src/index.ts';
import type { ToWorker } from '../src/internal/protocol.ts';
import { MAX_JOB_TRIS, meshSlice } from '../src/internal/worker/cell-colliders.ts';
import { createPhysicsCore } from '../src/internal/worker/core.ts';

const MINI = join(import.meta.dirname, '../../../tests/fixtures/world-mini/L0');
const CELL = 256;

interface CellData {
  key: CellKey;
  ix: number;
  iz: number;
  originWF: Vec3d;
  jcol: ArrayBuffer;
  hf: HeightfieldData;
}

async function section(bytes: Uint8Array | undefined): Promise<Uint8Array> {
  if (!bytes) throw new Error('missing section');
  const r = await gunzip(bytes);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

async function loadCells(): Promise<CellData[]> {
  const out: CellData[] = [];
  for (const ixs of readdirSync(MINI)) {
    for (const f of readdirSync(join(MINI, ixs))) {
      const ix = Number(ixs);
      const iz = Number(f.replace('.tkc', ''));
      const r = readTkc(new Uint8Array(readFileSync(join(MINI, ixs, f))));
      if (!r.ok) throw new Error(r.error.message);
      const hf = parseHeightfield(await section(r.value.section('terrain.height')));
      if (!hf.ok) throw new Error(hf.error.message);
      const col = await section(r.value.section('collision.bin'));
      out.push({
        key: packCellKey(0, ix, iz),
        ix,
        iz,
        originWF: { x: ix * CELL, y: 0, z: iz * CELL },
        jcol: col.slice().buffer,
        hf: hf.value,
      });
    }
  }
  return out;
}

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

/** Möller–Trumbore: 광선 × JCOL 삼각형(셀 로컬) → 가장 가까운 t. */
function rayMesh(o: readonly number[], d: readonly number[], m: JcolTriMesh): number {
  let best = Number.POSITIVE_INFINITY;
  const v = m.vertices;
  const p = (i: number, k: number): number =>
    (v[(m.indices[i] as number) * 3 + k] as number) + (m.posLocal[k] as number);
  for (let t = 0; t < m.indices.length; t += 3) {
    const e1 = [0, 1, 2].map((k) => p(t + 1, k) - p(t, k));
    const e2 = [0, 1, 2].map((k) => p(t + 2, k) - p(t, k));
    const h = [d[1]! * e2[2]! - d[2]! * e2[1]!, d[2]! * e2[0]! - d[0]! * e2[2]!, d[0]! * e2[1]! - d[1]! * e2[0]!];
    const a = e1[0]! * h[0]! + e1[1]! * h[1]! + e1[2]! * h[2]!;
    if (Math.abs(a) < 1e-9) continue;
    const s = [0, 1, 2].map((k) => (o[k] as number) - p(t, k));
    const u = (s[0]! * h[0]! + s[1]! * h[1]! + s[2]! * h[2]!) / a;
    if (u < 0 || u > 1) continue;
    const q = [s[1]! * e1[2]! - s[2]! * e1[1]!, s[2]! * e1[0]! - s[0]! * e1[2]!, s[0]! * e1[1]! - s[1]! * e1[0]!];
    const w = (d[0]! * q[0]! + d[1]! * q[1]! + d[2]! * q[2]!) / a;
    if (w < 0 || u + w > 1) continue;
    const dist = (e2[0]! * q[0]! + e2[1]! * q[1]! + e2[2]! * q[2]!) / a;
    if (dist > 1e-6 && dist < best) best = dist;
  }
  return best;
}

const log = createLogger({ level: 'warn' });

describe('meshSlice', () => {
  it('keeps only the vertices used by the triangle range, remapped in first-use order', () => {
    const v = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 2, 0, 2]);
    const idx = new Uint32Array([0, 1, 2, 1, 3, 2, 3, 4, 2]);
    expect(meshSlice(v, idx, 0, 3)).toEqual({ vertices: v, indices: idx });
    const s = meshSlice(v, idx, 1, 3);
    expect([...s.indices]).toEqual([0, 1, 2, 1, 3, 2]);
    expect([...s.vertices]).toEqual([1, 0, 0, 1, 0, 1, 0, 0, 1, 2, 0, 2]);
    expect(MAX_JOB_TRIS).toBeLessThanOrEqual(1000);
  });
});

describe('cell colliders (world-mini)', () => {
  it('loads 4 cells over several budgeted ticks and raycasts ground/walls within 5 cm', async () => {
    const cells = await loadCells();
    expect(cells.length).toBe(4);
    const lb = loopback();
    const clock = { ms: 0 };
    const phys = createPhysics({
      bus: createEventBus(log),
      log,
      transport: lb.transport,
      originWF: { x: 0, y: 15, z: 0 },
      config: { isolation: 'degraded' },
      now: () => clock.ms,
    });
    await lb.flush();
    await phys.ready;
    for (const c of cells) phys.addCell(c.key, c.originWF, c.jcol.slice(0), { ...c.hf, data: c.hf.data.slice() });
    const sys = phys.systems()[0];
    let ticks = 0;
    while (cells.some((c) => !phys.hasCell(c.key)) && ticks < 200) {
      clock.ms += 1000 / 60;
      sys?.update({} as never);
      await lb.flush();
      ticks++;
    }
    expect(cells.every((c) => phys.hasCell(c.key))).toBe(true);
    const st = phys.stats();
    // 적재가 여러 틱에 나뉘었다(예산 4 ms, 작업 = 높이장 4×4 타일·≤ 600 삼각형 조각 — 타일 이음새(64·128) 레이 포함). 틱 시간(≤ 8 ms) 판정은 실제 브라우저에서 —
    // 병렬 vitest의 CPU 경합·GC로 Node 시간은 흔들린다(ADR-0042).
    expect(ticks).toBeGreaterThan(10);
    expect(st.colliderCells).toBe(4);

    // 지면: 정수 샘플 위치 수직 레이 → 높이장 값(±5 cm).
    const errs: number[] = [];
    for (const c of cells) {
      for (const [sx, sz] of [
        [10, 10],
        [128, 64],
        [128, 128],
        [64, 128],
        [200, 240],
      ] as const) {
        const want = c.hf.minH + (c.hf.data[sz * c.hf.size + sx] as number) * c.hf.step;
        const hit = await phys.raycast(
          { x: c.originWF.x + sx, y: 400, z: c.originWF.z + sz },
          { x: 0, y: -1, z: 0 },
          800,
        );
        await lb.flush();
        if (hit && hit.layer === 1) errs.push(Math.abs(hit.posWF.y - want));
      }
    }
    expect(errs.length).toBeGreaterThan(4);
    expect(Math.max(...errs)).toBeLessThanOrEqual(0.05);

    // 벽: 건물 높이에서 수평 레이 → JCOL 삼각형과의 CPU 교차 거리(±5 cm).
    const wallErr: number[] = [];
    for (const c of cells) {
      const shapes = parseJcol(new Uint8Array(c.jcol));
      if (!shapes.ok) throw new Error('jcol');
      const meshes = shapes.value.filter((s): s is JcolTriMesh => s.kind === 'triMesh');
      for (let i = 0; i < 6; i++) {
        const o = [8 + i * 40, 30 + i * 3, 128];
        const d = [1, 0, 0.1 * (i - 3)];
        const n = Math.hypot(d[0]!, d[1]!, d[2]!);
        const dn = d.map((x) => x / n);
        const cpu = Math.min(...meshes.map((m) => rayMesh(o, dn, m)));
        if (!Number.isFinite(cpu) || cpu > 200) continue;
        const hit = await phys.raycast(
          { x: c.originWF.x + o[0]!, y: o[1]!, z: c.originWF.z + o[2]! },
          { x: dn[0]!, y: dn[1]!, z: dn[2]! },
          200,
        );
        await lb.flush();
        if (hit && hit.layer === 0) wallErr.push(Math.abs(hit.distance - cpu));
      }
    }
    expect(wallErr.length).toBeGreaterThan(5);
    expect(Math.max(...wallErr)).toBeLessThanOrEqual(0.05);

    // 제거 → 레이가 더는 맞지 않는다.
    for (const c of cells) phys.removeCell(c.key);
    clock.ms += 17;
    sys?.update({} as never);
    await lb.flush();
    const c0 = cells[0] as CellData;
    expect(
      await phys.raycast({ x: c0.originWF.x + 10, y: 400, z: c0.originWF.z + 10 }, { x: 0, y: -1, z: 0 }, 800),
    ).toBeNull();
    phys.dispose();
  }, 60_000);
});
