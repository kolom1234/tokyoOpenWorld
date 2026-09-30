// streaming 테스트 공용: 합성 cells.idx(전 레벨 격자) + 관심 프레임·브루트포스 참조 구현.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type CellKey,
  type CellLevel,
  type InterestPoint,
  type ModeId,
  packCellKey,
  type QualityTier,
} from '@sanpo/core';
import { cellBoundsWF } from '@sanpo/geo';
import {
  type CellPayload,
  type CellsIndex,
  type CellsIndexEntry,
  readCellsIndex,
  tkcHash32,
  writeCellsIndex,
} from '@sanpo/tile-format';
import { type CellIndex, parseCellIndex } from '../src/internal/cell-index.ts';
import type { InterestFrame } from '../src/internal/geometry.ts';

/** 레벨별 [min, max] 인덱스(양 축 동일, 원점 중심). L0 ±10.24 km·L1 ±10.24 km·L2 ±24.6 km·L3 ±32.8 km — 반경이 잘리지 않는 크기. */
export const SYNTH_RANGES: readonly [number, number][] = [
  [-40, 39],
  [-10, 9],
  [-6, 5],
  [-2, 1],
];

export function synthEntries(ranges: readonly [number, number][] = SYNTH_RANGES): CellsIndexEntry[] {
  const out: CellsIndexEntry[] = [];
  ranges.forEach(([lo, hi], level) => {
    for (let iz = lo; iz <= hi; iz++) {
      for (let ix = lo; ix <= hi; ix++) {
        out.push({ level: level as CellLevel, ix, iz, flags: 0, byteLength: 1000 + level, hash32: 0 });
      }
    }
  });
  return out;
}

export function synthIndex(ranges?: readonly [number, number][]): CellIndex {
  const r = parseCellIndex(writeCellsIndex(synthEntries(ranges)));
  if (!r.ok) throw new Error(`synthIndex: ${r.error.code}`);
  return r.value;
}

/** createStreaming용 파싱된 cells.idx(Map). */
export function synthCellsIndex(ranges?: readonly [number, number][]): CellsIndex {
  const r = readCellsIndex(writeCellsIndex(synthEntries(ranges)));
  if (!r.ok) throw new Error(`synthCellsIndex: ${r.error.code}`);
  return r.value;
}

export function point(
  kind: InterestPoint['kind'],
  x: number,
  y: number,
  z: number,
  extra: Partial<Omit<InterestPoint, 'posWF' | 'kind'>> = {},
): InterestPoint {
  return { posWF: { x, y, z }, weight: 1, kind, ...extra };
}

export function frame(mode: ModeId, points: InterestPoint[], tier: QualityTier = 'high'): InterestFrame {
  return { mode, tier, points, groundHeightAt: () => 0 };
}

/** 참조 구현: 인덱스의 모든 레벨 셀을 훑어 AABB 수평 거리 ≤ r 인 셀 수(진행 방향 가중 없음). */
export function bruteCircleCount(index: CellIndex, level: CellLevel, x: number, z: number, r: number): number {
  let n = 0;
  for (const key of index.keysAt(level)) {
    const b = cellBoundsWF(key);
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    if (Math.hypot(dx, dz) <= r) n++;
  }
  return n;
}

export function key(level: CellLevel, ix: number, iz: number): CellKey {
  return packCellKey(level, ix, iz);
}

/** 저장소 픽스처 월드(tests/fixtures/world-mini) 경로. */
export const WORLD_MINI = resolve(import.meta.dirname, '../../../tests/fixtures/world-mini');

/** world-mini cells.idx(L0 2×2). */
export function worldMiniIndex(): CellIndex {
  const r = parseCellIndex(readFileSync(resolve(WORLD_MINI, 'cells.idx')));
  if (!r.ok) throw new Error(`worldMiniIndex: ${r.error.code}`);
  return r.value;
}

/** world-mini world.json buildId. */
export const WORLD_MINI_BUILD_ID = (
  JSON.parse(readFileSync(resolve(WORLD_MINI, 'world.json'), 'utf8')) as { buildId: string }
).buildId;

export const WORLD_MINI_CELLS = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0],
] as const;

/** world-mini 셀 .tkc 바이트(매번 새 ArrayBuffer — transfer 가능). */
export function worldMiniCell(ix: number, iz: number): ArrayBuffer {
  const b = readFileSync(resolve(WORLD_MINI, `L0/${ix}/${iz}.tkc`));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** 파이프라인 디코드 스냅샷(tools/pipeline/test/world-mini-decode.test.ts가 기록 — 여기서는 읽기만). */
export const DECODE_SNAPSHOT = resolve(import.meta.dirname, '../../../tests/fixtures/snapshots/world-mini-decode.json');

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** 스냅샷과 같은 모양의 요약(메시 섹션만). */
export function summarizeMeshes(p: CellPayload): { tris: number; sections: Record<string, unknown> } {
  const sections: Record<string, unknown> = {};
  const slots = [
    ['buildings.mesh', p.meshes.buildings],
    ['roads.mesh', p.meshes.roads],
    ['terrain.mesh', p.meshes.terrain],
  ] as const;
  for (const [type, mesh] of slots) {
    if (!mesh) continue;
    sections[type] = mesh.primitives.map((prim) => {
      const attributes: Record<string, unknown> = {};
      for (const [name, a] of Object.entries(prim.attributes)) {
        const type = a.array.constructor.name;
        attributes[name] = { itemSize: a.itemSize, type, normalized: a.normalized, hash: tkcHash32(bytesOf(a.array)) };
      }
      const index = Uint32Array.from(prim.index ?? []);
      return {
        materialId: prim.materialId,
        vertices: (prim.attributes.POSITION?.array.byteLength ?? 0) / 12,
        indices: index.length,
        indexHash: tkcHash32(bytesOf(index)),
        attributes,
      };
    });
  }
  return { tris: p.header.stats.tris, sections };
}
