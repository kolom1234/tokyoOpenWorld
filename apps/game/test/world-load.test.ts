// 월드 데이터 로드: 커밋된 world-mini 픽스처를 가짜 fetch로 서빙 → 매니페스트·원점·cells.idx·스폰 주변 셀 확인, 실패 분류. see docs/modules/game.md

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cellIdString } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { parseFlags, startWorld } from '../src/boot.ts';
import { checkManifest, loadWorld, WORLD_MINI_BASE_URL } from '../src/world-load.ts';
import type { WorldStatus } from '../src/world-status.ts';

const FIXTURE = resolve(import.meta.dirname, '../../../tests/fixtures/world-mini');
const INDEX_HTML = '<!doctype html><html></html>';

/** `/fixtures/world-mini/*` → 픽스처 파일, 그 외·없는 파일 → SPA 폴백(200 HTML, Workers not_found_handling과 같음). */
function fixtureFetch(patch: (path: string, body: Uint8Array) => Uint8Array = (_p, b) => b) {
  const seen: string[] = [];
  const fn = async (url: string): Promise<Response> => {
    seen.push(url);
    if (!url.startsWith(`${WORLD_MINI_BASE_URL}/`)) return new Response(INDEX_HTML, { status: 200 });
    const rel = url.slice(WORLD_MINI_BASE_URL.length + 1);
    try {
      return new Response(patch(rel, new Uint8Array(readFileSync(join(FIXTURE, rel)))).slice());
    } catch {
      return new Response(INDEX_HTML, { status: 200 });
    }
  };
  return { fn, seen };
}

describe('loadWorld (world-mini fixture)', () => {
  it('loads the manifest and index and lists the 4 spawn-area cells (no cell fetch — streaming does that)', async () => {
    const { fn, seen } = fixtureFetch();
    const r = await loadWorld(WORLD_MINI_BASE_URL, 'fixture', fn);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.indexed).toBe(4);
    expect(r.value.cellsIndex.size).toBe(4);
    expect(r.value.spawnCells.map(cellIdString)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
    expect(seen).toEqual(['/fixtures/world-mini/world.json', '/fixtures/world-mini/cells.idx']);
  });

  it('rejects a missing fixture served as SPA fallback, origin/format mismatch and size mismatch', async () => {
    expect(await loadWorld('/fixtures/nope', 'fixture', fixtureFetch().fn)).toMatchObject({ ok: false });
    const world = JSON.parse(readFileSync(join(FIXTURE, 'world.json'), 'utf8'));
    expect(checkManifest(JSON.stringify({ ...world, crs: { ...world.crs, E0: 0 } }))).toMatchObject({ ok: false });
    expect(checkManifest(JSON.stringify({ ...world, formatVersion: 2 }))).toMatchObject({ ok: false });
    expect(checkManifest(JSON.stringify(world))).toMatchObject({ ok: true });
    const truncated = fixtureFetch((p, b) => (p.endsWith('cells.idx') ? b.subarray(0, 20) : b));
    const r = await loadWorld(WORLD_MINI_BASE_URL, 'fixture', truncated.fn);
    expect(r.ok ? '' : r.error).toMatch(/cells\.idx: truncated/);
  });
});

describe('startWorld', () => {
  it('?world=mini skips the API and reports loaded', async () => {
    const flags = parseFlags('?world=mini&debug=1');
    expect(flags).toEqual({ debug: true, world: 'mini' });
    const states: WorldStatus[] = [];
    const { fn, seen } = fixtureFetch();
    const loaded = await startWorld(flags, (s) => states.push(s), fn);
    expect(loaded?.spawnCells.map(cellIdString)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
    expect(loaded?.spawnWF).toEqual({ x: -22.3, y: 0, z: 8.6 });
    expect(loaded?.spawnYawRad).toBe(0);
    expect(seen.some((u) => u.startsWith('/api/'))).toBe(false);
    expect(states).toEqual([{ kind: 'loaded', source: 'fixture', buildId: expect.any(String), cells: 4, indexed: 4 }]);
  });

  it('without the flag asks the API and stops when there is no build', async () => {
    const states: WorldStatus[] = [];
    const api = async () => Response.json({ error: 'no_build' }, { status: 404 });
    await startWorld(parseFlags(''), (s) => states.push(s), api);
    expect(states).toEqual([{ kind: 'no-build' }]);
    expect(parseFlags('?world=full')).toEqual({ debug: false });
  });
});
