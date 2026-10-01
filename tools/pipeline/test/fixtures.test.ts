// 커밋된 픽스처 검사: world-mini는 현재 스키마·리더·경계 규칙을 통과, plateau-mini 1셀 빌드는 결정론 + 스냅샷(expected.json) 일치. see docs/14-testing-perf.md §1
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLogger } from '@sanpo/core';
import { cellOf } from '@sanpo/geo';
import Ajv2020 from 'ajv/dist/2020.js';
import { afterAll, describe, expect, it } from 'vitest';
import { PLATEAU_MINI_CELL, plateauMiniSnapshot, WORLD_MINI_AREA } from '../src/stages/fixture.ts';
import { validateBuild } from '../src/stages/validate.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIX = join(REPO, 'tests/fixtures');
const LOCK_IDS = new Set(
  (JSON.parse(readFileSync(join(REPO, 'data/sources.lock.json'), 'utf8')) as { sources: { id: string }[] }).sources.map(
    (s) => s.id,
  ),
);
const log = createLogger({ level: 'warn' }).child('fixtures');
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));

function attributionValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  ajv.addFormat('uri', /^https?:\/\/\S+$/);
  return ajv.compile(readJson(join(REPO, 'schemas/attribution.schema.json')) as object);
}

describe('world-mini', () => {
  const dir = join(FIX, 'world-mini');

  it('passes validate: schemas, hashes, budgets, 4 seams', async () => {
    const r = await validateBuild(dir, join(REPO, 'schemas'), LOCK_IDS);
    expect(r.errors).toEqual([]);
    expect(r.cells.map((c) => c.id)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
    expect(r.seams).toEqual({ pairs: 4, heightSamples: 4 * 257, meshVertices: 4 * 257 });
    expect(r.cells.reduce((a, c) => a + c.buildings, 0)).toBeGreaterThan(300);
  });

  it('declares the 2×2 area and spawns in the Scramble crossing cell', () => {
    const w = readJson(join(dir, 'world.json')) as { areas: unknown[]; spawn: { posWF: number[] } };
    expect(w.areas).toEqual([WORLD_MINI_AREA]);
    const [x, , z] = w.spawn.posWF as [number, number, number];
    expect(cellOf(0, x, z)).toBe(PLATEAU_MINI_CELL);
  });

  it('ships PLATEAU·GSI attribution', () => {
    const a = readJson(join(dir, 'ATTRIBUTION.json')) as { entries: { id: string }[] };
    const v = attributionValidator();
    expect(v(a), JSON.stringify(v.errors)).toBe(true);
    expect(a.entries.map((e) => e.id).sort()).toEqual(['gsi-dem', 'osm-kanto', 'plateau-shibuya']);
  });
});

describe('plateau-mini', () => {
  const dir = join(FIX, 'plateau-mini');
  const work = mkdtempSync(join(tmpdir(), 'sanpo-plateau-mini-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it('builds one cell deterministically and matches expected.json', async () => {
    const a = await plateauMiniSnapshot(dir, join(work, 'a'), log);
    const b = await plateauMiniSnapshot(dir, join(work, 'b'), log);
    const tkc = (w: string): Buffer => readFileSync(join(work, w, 'build/L0/-1/0.tkc'));
    expect(tkc('b').equals(tkc('a'))).toBe(true);
    expect(b).toEqual(a);
    expect(a).toEqual(readJson(join(dir, 'expected.json')));
    expect(a.buildings).toBe(5);
    expect(a.roadPieces).toBeGreaterThan(0);
  });

  it('ships attribution for the raw excerpts', () => {
    const v = attributionValidator();
    expect(v(readJson(join(dir, 'ATTRIBUTION.json'))), JSON.stringify(v.errors)).toBe(true);
  });
});
