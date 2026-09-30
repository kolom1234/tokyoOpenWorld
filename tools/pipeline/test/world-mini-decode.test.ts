// world-mini 셀 메시의 파이프라인 측 디코드 요약(gltf-transform) → 파일 스냅샷. 런타임 디코더(streaming 워커)가 같은 스냅샷과
// 일치해야 한다(packages/streaming/test/decode.test.ts). see docs/14-testing-perf.md §1, ADR-0022
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readTkc, tkcHash32 } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { decodeGlb } from '../src/lib/gltf.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const WORLD_MINI = join(REPO, 'tests/fixtures/world-mini');
/** 스냅샷 파일(런타임 디코더 테스트와 공유). 갱신: `pnpm vitest run tools/pipeline/test/world-mini-decode.test.ts -u`. */
export const DECODE_SNAPSHOT = join(REPO, 'tests/fixtures/snapshots/world-mini-decode.json');
const CELLS = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0],
] as const;
const MESH_SECTIONS = ['buildings.mesh', 'roads.mesh', 'terrain.mesh'] as const;

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** 셀 로컬 float32 POSITION = q × s + t (KHR_mesh_quantization, 비정규화 정수 또는 float). */
function localPositions(q: ArrayLike<number>, t: readonly number[], s: readonly number[]): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = (q[i] ?? 0) * (s[i % 3] ?? 1) + (t[i % 3] ?? 0);
  return out;
}

async function summarizeMesh(glb: Uint8Array) {
  const d = await decodeGlb(glb);
  return d.primitives.map((p) => {
    const attributes: Record<string, { itemSize: number; type: string; normalized: boolean; hash: number }> = {};
    for (const [name, a] of Object.entries(p.attributes)) {
      const arr = name === 'POSITION' ? localPositions(a.array, d.translation, d.scale) : a.array;
      const normalized = name === 'POSITION' ? false : a.normalized;
      attributes[name] = {
        itemSize: a.itemSize,
        type: arr.constructor.name,
        normalized,
        hash: tkcHash32(bytesOf(arr)),
      };
    }
    return {
      materialId: p.materialId,
      vertices: (p.attributes.POSITION?.array.length ?? 0) / 3,
      indices: p.indices.length,
      indexHash: tkcHash32(bytesOf(p.indices)),
      attributes,
    };
  });
}

describe('world-mini decode snapshot (pipeline reference)', () => {
  it('matches tests/fixtures/snapshots/world-mini-decode.json', async () => {
    const out: Record<string, unknown> = {};
    for (const [ix, iz] of CELLS) {
      const r = readTkc(new Uint8Array(readFileSync(join(WORLD_MINI, `L0/${ix}/${iz}.tkc`))));
      if (!r.ok) throw new Error(r.error.message);
      const sections: Record<string, unknown> = {};
      for (const type of MESH_SECTIONS) {
        const glb = r.value.section(type);
        if (glb) sections[type] = await summarizeMesh(glb);
      }
      out[`L0_${ix}_${iz}`] = { tris: r.value.header.stats.tris, sections };
    }
    await expect(`${JSON.stringify(out, null, 2)}\n`).toMatchFileSnapshot(DECODE_SNAPSHOT);
  });
});
