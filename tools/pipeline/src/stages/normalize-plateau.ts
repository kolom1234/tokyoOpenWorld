// normalize 단계(PLATEAU): CityGML → WF 레코드 → L0 셀 버킷 → data/normalized/{buildings,roads}/<cellId>.ndjson.gz. see docs/04-data-pipeline.md §4.2
// 규칙: 건물은 중심점 셀에만(분할 금지), 도로면은 셀 경계에서 클리핑. 셀 파일 내부는 id 오름차순(결정론).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, cellIdString, type Logger, unpackCellKey } from '@sanpo/core';
import { type CellBoundsWF, cellBoundsWF, cellOf, jisMesh3CodesInBBox, lonLatBBoxOfWF } from '@sanpo/geo';
import { writeNdjsonGz } from '../lib/ndjson-gz.ts';
import { clipRingsToRect } from '../lib/polygon.ts';
import { centroidXZ } from '../readers/plateau/geometry.ts';
import type { NormalizedFeature, PlateauReader, RoadRecord } from '../readers/plateau/index.ts';

/** normalize가 읽는 PLATEAU 레이어(파일명 `<mesh>_<layer>_<epsg>_op.gml`). */
const LAYERS = ['bldg', 'tran'] as const;

export interface NormalizePlateauInput {
  sourceId: string;
  /** 압축 해제된 원천 루트(그 아래 `udx/<layer>/*.gml`). */
  rawRoot: string;
  cells: readonly CellKey[];
  /** 보통 `data/normalized`. */
  outDir: string;
  reader: PlateauReader;
  log: Logger;
}

export interface NormalizePlateauResult {
  files: string[];
  features: number;
  buildings: number;
  roadPieces: number;
  written: string[];
}

type Bucket = Map<string, string>; // id → JSON 줄

/** 대상 셀을 덮는 3차 메시의 bldg/tran 파일(정렬). */
export function plateauFilesForCells(rawRoot: string, cells: readonly CellKey[]): string[] {
  const codes = new Set<string>();
  for (const k of cells) for (const c of jisMesh3CodesInBBox(lonLatBBoxOfWF(cellBoundsWF(k)))) codes.add(c);
  const files: string[] = [];
  for (const layer of LAYERS) {
    const dir = join(rawRoot, 'udx', layer);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const m = /^(\d{8})_[a-z]+_\d+_op\.gml$/.exec(name);
      if (m && codes.has(m[1] as string)) files.push(join(dir, name));
    }
  }
  return files;
}

function overlaps(r: RoadRecord, b: CellBoundsWF): boolean {
  const outer = r.polygonWF[0] ?? [];
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i + 2 < outer.length; i += 3) {
    minX = Math.min(minX, outer[i] as number);
    maxX = Math.max(maxX, outer[i] as number);
    minZ = Math.min(minZ, outer[i + 2] as number);
    maxZ = Math.max(maxZ, outer[i + 2] as number);
  }
  return maxX > b.minX && minX < b.maxX && maxZ > b.minZ && minZ < b.maxZ;
}

function bucketOf(m: Map<CellKey, Bucket>, k: CellKey): Bucket {
  const found = m.get(k);
  if (found) return found;
  const b: Bucket = new Map();
  m.set(k, b);
  return b;
}

/** 레코드 1개를 셀 버킷에 넣는다. 반환 = 넣은 조각 수. 같은 id가 이미 있으면(구 경계 중복 등) 먼저 온 것 유지. */
function place(f: NormalizedFeature, targets: Map<CellKey, CellBoundsWF>, out: Map<CellKey, Bucket>): number {
  if (f.layer === 'buildings') {
    const c = centroidXZ(f.surfaces.map((s) => s.ringsWF));
    const k = c ? cellOf(0, c.x, c.z) : null;
    if (k === null || !targets.has(k)) return 0;
    const b = bucketOf(out, k);
    if (!b.has(f.gmlId)) b.set(f.gmlId, JSON.stringify(f));
    return 1;
  }
  let n = 0;
  for (const [k, bounds] of targets) {
    if (!overlaps(f, bounds)) continue;
    const clipped = clipRingsToRect(f.polygonWF, bounds);
    if (!clipped) continue;
    const b = bucketOf(out, k);
    if (!b.has(f.id)) b.set(f.id, JSON.stringify({ ...f, polygonWF: clipped }));
    n++;
  }
  return n;
}

function flush(outDir: string, layer: string, buckets: Map<CellKey, Bucket>): string[] {
  const written: string[] = [];
  for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
    const bucket = buckets.get(k) as Bucket;
    const lines = [...bucket.keys()].sort().map((id) => bucket.get(id) as string);
    const path = join(outDir, layer, `${cellIdString(k)}.ndjson.gz`);
    if (writeNdjsonGz(path, lines)) written.push(path);
  }
  return written;
}

export async function normalizePlateau(input: NormalizePlateauInput): Promise<NormalizePlateauResult> {
  const { log, reader } = input;
  const targets = new Map(input.cells.map((k) => [k, cellBoundsWF(k)] as const));
  for (const k of input.cells) {
    if (unpackCellKey(k).level !== 0) throw new RangeError(`normalizePlateau: L0 cells only (${cellIdString(k)})`);
  }
  const files = plateauFilesForCells(input.rawRoot, input.cells);
  const buildings = new Map<CellKey, Bucket>();
  const roads = new Map<CellKey, Bucket>();
  const res: NormalizePlateauResult = { files, features: 0, buildings: 0, roadPieces: 0, written: [] };
  for (const file of files) {
    const t0 = performance.now();
    for await (const f of reader.read(file, { sourceId: input.sourceId })) {
      res.features++;
      const n = place(f, targets, f.layer === 'buildings' ? buildings : roads);
      if (f.layer === 'buildings') res.buildings += n;
      else res.roadPieces += n;
    }
    log.info(`${reader.name} ${file} ${Math.round(performance.now() - t0)} ms`);
  }
  res.written = [...flush(input.outDir, 'buildings', buildings), ...flush(input.outDir, 'roads', roads)];
  return res;
}
