// `pnpm pipeline trees`(M05-T04, 호스트 Node): 수종 6종 생성(ez-tree) → 잎 아틀라스 → 임포스터 굽기 → apps/game/src/assets/trees/
// {trees.glb(프리미티브 "<수종>:<lod>:<bark|leaf>", 위치 u16 공통 범위·법선 i8·UV u16), leaves.png, impostor-color.png(3 × 2 타일), trees.json}.
// 임포스터 법선은 굽지 않는다 — 런타임이 틀 안 위치로 구면 법선을 만든다(법선 PNG 1.6 MB 절약).
// 같은 입력 → 같은 바이트(ez-tree 시드·결정론 난수). see ADR-0052
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { TREE_SPECIES } from '@sanpo/tile-format';
import { encodeGlb, type GlbPrimitive } from '../../lib/gltf.ts';
import { encodePngRgba } from '../../lib/png.ts';
import { boundsOf, quantizePositions } from '../build/buildings-mesh.ts';
import { generateSpecies, LEAF_CELL, type Part, type SpeciesModel, type SpeciesName } from './generate.ts';
import { bakeImpostor, IMPOSTOR_FRAME_PX, IMPOSTOR_FRAMES, IMPOSTOR_TILE } from './impostor.ts';
import { ATLAS_SIZE, drawLeafAtlas } from './leaf-atlas.ts';

export const TREES_OUT = 'apps/game/src/assets/trees';
const ORDER: readonly SpeciesName[] = ['ginkgo', 'zelkova', 'cherry', 'camphor', 'pine', 'shrub'];
const COLS = 3;
const ROWS = 2;

function primitive(id: string, p: Part, b: ReturnType<typeof boundsOf>): GlbPrimitive {
  const { q } = quantizePositions(Array.from(p.pos), b);
  return {
    materialId: id,
    attributes: {
      POSITION: { array: q, itemSize: 3 },
      NORMAL: { array: Int8Array.from(p.nrm, (v) => Math.round(v * 127)), itemSize: 3, normalized: true },
      TEXCOORD_0: {
        array: Uint16Array.from(p.uv, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 65535)),
        itemSize: 2,
        normalized: true,
      },
    },
    indices: p.idx,
  };
}

async function encodeTrees(models: ReadonlyMap<SpeciesName, SpeciesModel>): Promise<Uint8Array> {
  const all: number[] = [];
  for (const m of models.values())
    for (const l of m.lods) for (const p of [l.bark, l.leaf]) for (const v of p.pos) all.push(v);
  const b = boundsOf(all);
  const { t, s } = quantizePositions([], b);
  const primitives: GlbPrimitive[] = [];
  for (const [name, m] of models)
    m.lods.forEach((l, lod) => {
      primitives.push(primitive(`${name}:${lod}:bark`, l.bark, b), primitive(`${name}:${lod}:leaf`, l.leaf, b));
    });
  return encodeGlb({ name: 'trees', translation: t, scale: s, primitives });
}

/** 수종 타일(512²)을 3 × 2 아틀라스에. */
function blit(dst: Uint8Array, tile: Uint8Array, index: number): void {
  const [cx, cy] = [index % COLS, Math.floor(index / COLS)];
  const W = IMPOSTOR_TILE * COLS;
  for (let y = 0; y < IMPOSTOR_TILE; y++)
    dst.set(
      tile.subarray(y * IMPOSTOR_TILE * 4, (y + 1) * IMPOSTOR_TILE * 4),
      ((cy * IMPOSTOR_TILE + y) * W + cx * IMPOSTOR_TILE) * 4,
    );
}

export interface TreesStats {
  species: Record<string, { lod0: number; lod1: number; radius: number }>;
  bytes: Record<string, number>;
}

export async function buildTreeAssets(o: { repoRoot: string; log: Logger }): Promise<TreesStats> {
  const out = join(o.repoRoot, TREES_OUT);
  mkdirSync(out, { recursive: true });
  const atlas = drawLeafAtlas();
  const models = new Map<SpeciesName, SpeciesModel>();
  const stats: TreesStats = { species: {}, bytes: {} };
  const W = IMPOSTOR_TILE * COLS;
  const color = new Uint8Array(W * IMPOSTOR_TILE * ROWS * 4);
  for (const [i, name] of ORDER.entries()) {
    const m = await generateSpecies(name);
    models.set(name, m);
    const imp = bakeImpostor(m, atlas);
    blit(color, imp.color, i);
    const tris = (k: 0 | 1) => (m.lods[k].bark.idx.length + m.lods[k].leaf.idx.length) / 3;
    stats.species[name] = { lod0: tris(0), lod1: tris(1), radius: Math.round(m.radius * 1000) / 1000 };
    o.log.info(`${name}: lod0 ${tris(0)} tris, lod1 ${tris(1)} tris, radius ${m.radius.toFixed(3)}`);
  }
  const files: Record<string, Uint8Array> = {
    'trees.glb': await encodeTrees(models),
    'leaves.png': encodePngRgba(ATLAS_SIZE, ATLAS_SIZE, atlas),
    'impostor-color.png': encodePngRgba(W, IMPOSTOR_TILE * ROWS, color),
  };
  const manifest = {
    version: 1,
    species: ORDER.map((name, i) => ({
      name,
      id: TREE_SPECIES[name],
      tile: i,
      leafCell: LEAF_CELL[name],
      radius: stats.species[name]?.radius ?? 0.6,
    })),
    impostor: { frames: IMPOSTOR_FRAMES, framePx: IMPOSTOR_FRAME_PX, tile: IMPOSTOR_TILE, cols: COLS, rows: ROWS },
  };
  files['trees.json'] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  for (const [f, bytes] of Object.entries(files)) {
    writeFileSync(join(out, f), bytes);
    stats.bytes[f] = bytes.byteLength;
  }
  o.log.info(`trees → ${TREES_OUT}: ${JSON.stringify(stats.bytes)}`);
  return stats;
}
