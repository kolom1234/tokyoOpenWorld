// TKC → CellPayload(워커 본체 함수): 파이프라인 스냅샷 일치, 검사 오류, 섹션 선택, transfer 목록, 셀당 시간. see ADR-0022
import { readFileSync } from 'node:fs';
import { packCellKey } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { decodeCell } from '../src/internal/decode.ts';
import { abortCheck, transferList } from '../src/internal/decode-util.ts';
import {
  DECODE_SNAPSHOT,
  summarizeMeshes,
  WORLD_MINI_BUILD_ID,
  WORLD_MINI_CELLS,
  worldMiniCell,
  worldMiniIndex,
} from './helpers.ts';

const INDEX = worldMiniIndex();
const noYield = async () => undefined;
const opts = { verifyHash: true, check: abortCheck(undefined, noYield) };
const req = (ix: number, iz: number) => {
  const key = packCellKey(0, ix, iz);
  return { key, buildId: WORLD_MINI_BUILD_ID, hash32: INDEX.get(key)?.hash32 ?? 0 };
};

describe('decodeCell (world-mini)', () => {
  it('matches the pipeline decode snapshot: vertex/index counts, attribute layout and content hashes', async () => {
    const snapshot = JSON.parse(readFileSync(DECODE_SNAPSHOT, 'utf8')) as Record<string, unknown>;
    const got: Record<string, unknown> = {};
    for (const [ix, iz] of WORLD_MINI_CELLS) {
      const r = await decodeCell(worldMiniCell(ix, iz), req(ix, iz), opts);
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      got[`L0_${ix}_${iz}`] = summarizeMeshes(r.value);
    }
    expect(got).toEqual(snapshot);
  });

  it('triangle count equals header stats.tris, heightfield is 257², bounds cover positions', async () => {
    const r = await decodeCell(worldMiniCell(0, 0), req(0, 0), opts);
    if (!r.ok) throw new Error(r.error.message);
    const { meshes, heightfield, header } = r.value;
    const tris = Object.values(meshes)
      .flatMap((m) => m?.primitives ?? [])
      .reduce((a, p) => a + (p.index?.length ?? 0) / 3, 0);
    expect(tris).toBe(header.stats.tris);
    expect(heightfield?.size).toBe(257);
    expect(heightfield?.data.length).toBe(257 * 257);
    const b = meshes.buildings?.primitives[0];
    const pos = b?.attributes.POSITION?.array as Float32Array;
    let maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i] ?? 0);
    // Scramble Square 지붕 T.P. 245.6 m(M01-T06 확인값)이 이 셀에 있다.
    expect(maxY).toBeCloseTo(245.59, 1);
    expect(b?.boundsLocal.max[1]).toBeCloseTo(maxY, 3);
  });

  it('transfer list covers every array once and shares nothing with the input buffer', async () => {
    const bytes = worldMiniCell(-1, 0);
    const r = await decodeCell(bytes, req(-1, 0), opts);
    if (!r.ok) throw new Error(r.error.message);
    const list = transferList(r.value);
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain(bytes);
    // 메시(건물·보도·지형) × (속성 + index) + heightfield
    const arrays = Object.values(r.value.meshes).flatMap((m) =>
      (m?.primitives ?? []).flatMap((p) => [...Object.values(p.attributes).map((a) => a.array), p.index]),
    );
    for (const a of arrays) expect(list).toContain(a?.buffer);
    expect(list).toContain(r.value.heightfield?.data.buffer);
    // 실제 transfer가 가능한지(중복·공유 버퍼면 DataCloneError).
    const moved = structuredClone(r.value, { transfer: list });
    expect(moved.meshes.terrain?.primitives[0]?.index?.length).toBe(168774);
  });

  it('decodes only requested sections (requestSections path)', async () => {
    const r = await decodeCell(worldMiniCell(0, 0), { ...req(0, 0), sections: ['terrain.height', 'meta.json'] }, opts);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.meshes).toEqual({});
    expect(r.value.heightfield?.size).toBe(257);
    expect(Array.isArray(r.value.meta?.buildings)).toBe(true);
  });

  it('rejects hash32, cell and buildId mismatches and truncated files', async () => {
    const bad = async (bytes: ArrayBuffer, r: ReturnType<typeof req>) => {
      const out = await decodeCell(bytes, r, opts);
      return out.ok ? 'ok' : out.error.code;
    };
    expect(await bad(worldMiniCell(0, 0), { ...req(0, 0), hash32: 12345 })).toBe('mismatch');
    expect(await bad(worldMiniCell(0, 0), req(-1, 0))).toBe('mismatch'); // hash가 다른 셀 것
    expect(await bad(worldMiniCell(0, 0), { ...req(-1, 0), hash32: req(0, 0).hash32 })).toBe('mismatch'); // 헤더 셀
    expect(await bad(worldMiniCell(0, 0), { ...req(0, 0), buildId: 'other' })).toBe('mismatch');
    const cut = worldMiniCell(0, 0).slice(0, 4000); // 헤더(섹션 6개) 뒤, 첫 섹션 도중
    expect(await decodeCell(cut, { ...req(0, 0) }, { ...opts, verifyHash: false })).toMatchObject({
      ok: false,
      error: { code: 'range' },
    });
  });

  it('stops at the next stage boundary once aborted', async () => {
    const ac = new AbortController();
    let checks = 0;
    const check = abortCheck(ac.signal, async () => {
      checks++;
      if (checks === 2) ac.abort();
    });
    const r = await decodeCell(worldMiniCell(0, 0), req(0, 0), { verifyHash: false, check });
    expect(r).toMatchObject({ ok: false, error: { code: 'aborted' } });
    expect(checks).toBe(2);
  });
});
