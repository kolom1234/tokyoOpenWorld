// 임시 셀 로더(M02-T05에서 삭제): world-mini TKC → CellPayload(glb 파싱·양자화 해제), 높이장 지면 조회, 시작 시점.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packCellKey } from '@sanpo/core';
import { readTkc } from '@sanpo/tile-format';
import { forwardOf } from '@sanpo/traversal';
import { describe, expect, it } from 'vitest';
import { createLocalGround, decodeLocalCell, sampleHeightfield } from '../src/debug/local-cells.ts';
import { SCRAMBLE_SQUARE_LOOK_WF, START_HEIGHT_AGL_M, startFreecamPose } from '../src/start-view.ts';
import type { LoadedCell } from '../src/world-load.ts';

const FIXTURE = resolve(import.meta.dirname, '../../../tests/fixtures/world-mini/L0');

function loadCell(ix: number, iz: number): LoadedCell {
  const bytes = new Uint8Array(readFileSync(join(FIXTURE, String(ix), `${iz}.tkc`)));
  const r = readTkc(bytes);
  if (!r.ok) throw new Error(r.error.message);
  return { key: packCellKey(0, ix, iz), id: `L0_${ix}_${iz}`, bytes: bytes.byteLength, sections: [], tkc: r.value };
}

describe('decodeLocalCell (world-mini L0_0_0)', async () => {
  const r = await decodeLocalCell(loadCell(0, 0));
  if (!r.ok) throw new Error(r.error);
  const p = r.value;

  it('dequantizes buildings to cell-local float32 and keeps the Scramble Square roof at ≈ 245.6 m T.P.', () => {
    const prim = p.meshes.buildings?.primitives[0];
    expect(prim?.materialId).toBe('facade_default');
    const pos = prim?.attributes.POSITION;
    expect(pos?.array).toBeInstanceOf(Float32Array);
    expect(prim?.boundsLocal.max[1]).toBeCloseTo(245.586, 1);
    let maxY = Number.NEGATIVE_INFINITY;
    const a = pos?.array as Float32Array;
    for (let i = 1; i < a.length; i += 3) maxY = Math.max(maxY, a[i] ?? 0);
    expect(maxY).toBeCloseTo(245.586, 1);
    // 지면(TP ≈ 14.6 m) 대비 약 231 m — "Scramble Square ≈ 230 m급"
    expect(maxY - 14.6).toBeGreaterThan(225);
    expect(Object.keys(prim?.attributes ?? {}).sort()).toEqual([
      'NORMAL',
      'POSITION',
      'TEXCOORD_0',
      '_BLDG',
      '_FACADE',
    ]);
    const n = prim?.attributes.NORMAL;
    expect(n?.array).toBeInstanceOf(Int8Array);
    expect((n?.array as Int8Array | undefined)?.length).toBe(a.length); // 인터리브(stride 4) → 밀집 3성분
  });

  it('keeps terrain positions as-is (float32, identity node) with a Uint16/32 index', () => {
    const prim = p.meshes.terrain?.primitives[0];
    expect(prim?.materialId).toBe('terrain_ground');
    expect(prim?.attributes.POSITION?.array).toBeInstanceOf(Float32Array);
    expect(prim?.index).toBeDefined();
    expect(prim?.boundsLocal.min[0]).toBe(0);
    expect(prim?.boundsLocal.max[2]).toBe(256);
    expect(p.originWF).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.heightfield?.size).toBe(257);
  });
});

describe('local ground + start view', async () => {
  const ground = createLocalGround();
  for (const [ix, iz] of [
    [-1, -1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ] as const) {
    const r = await decodeLocalCell(loadCell(ix, iz));
    if (!r.ok || !r.value.heightfield) throw new Error('decode');
    ground.addCell(r.value.key, r.value.originWF, r.value.heightfield);
  }

  it('samples terrain height bilinearly; undefined outside loaded cells', () => {
    const h = ground.groundHeightAt(-22.3, 8.6);
    expect(h).toBeGreaterThan(10);
    expect(h).toBeLessThan(20);
    expect(ground.groundHeightAt(600, 0)).toBeUndefined();
    const hf = { size: 3, minH: 0, step: 1, data: new Uint16Array([0, 0, 0, 0, 10, 0, 0, 0, 0]) };
    expect(sampleHeightfield(hf, 128, 128)).toBe(10);
    expect(sampleHeightfield(hf, 64, 128)).toBe(5);
    expect(sampleHeightfield(hf, -5, 999)).toBe(0);
  });

  it('starts 60 m above ground near the crossing, looking at Scramble Square', () => {
    const pose = startFreecamPose(ground);
    const g = ground.groundHeightAt(pose.posWF.x, pose.posWF.z) ?? 0;
    expect(pose.posWF.y - g).toBeCloseTo(START_HEIGHT_AGL_M, 9);
    expect(Math.hypot(pose.posWF.x + 22.3, pose.posWF.z - 8.6)).toBeLessThan(60);
    const f = forwardOf(pose.yawRad, pose.pitchRad);
    const to = SCRAMBLE_SQUARE_LOOK_WF;
    const d = Math.hypot(to.x - pose.posWF.x, to.y - pose.posWF.y, to.z - pose.posWF.z);
    expect(f.x).toBeCloseTo((to.x - pose.posWF.x) / d, 9);
    expect(f.z).toBeCloseTo((to.z - pose.posWF.z) / d, 9);
    // 지면 미적재 시 기본 표고(15 m) + 60 m
    expect(startFreecamPose({ groundHeightAt: () => undefined }).posWF.y).toBe(75);
  });
});
