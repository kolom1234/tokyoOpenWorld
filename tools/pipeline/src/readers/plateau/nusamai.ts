// A안 PlateauReader(스파이크 비교용): nusamai CLI → GeoPackage(EPSG:6697) → ogr2ogr GeoJSONSeq → 레코드. see docs/adr/0007-plateau-reader.md
// 파이프라인 컨테이너(tools/pipeline/Dockerfile) 안에서만 동작(nusamai, ogr2ogr 필요).
// 한계(ADR-0007): gpkg/glTF 싱크는 테마면(Wall/Roof…)·TrafficArea를 부모 피처 MultiPolygon으로 병합 →
// 면 종류는 법선으로 추정, 도로 기능(차도/보도/섬)·선택 LOD·텍스처 UV는 소실.
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { classifyByNormal, lonLatHToWF } from './geometry.ts';
import type { NormalizedFeature, PlateauReader, PlateauReadOptions, RingsWF } from './types.ts';

const run = promisify(execFile);
/** nusamai 출력 CRS: JGD2011 지리 3D(경도·위도·T.P. 표고). 기본값(4979)은 지오이드로 타원체고 변환하므로 피한다. */
const OUTPUT_EPSG = '6697';
/** nusamai는 채택 LOD를 속성으로 남기지 않는다(max_lod). 비교 편의상 LOD2로 표기. */
const ASSUMED_LOD = 2;
/** GeoJSONSeq(RFC 8142) 레코드 구분자 U+001E. */
const RECORD_SEPARATOR = '\u001e';

type Json = Record<string, unknown>;
interface GeoFeature {
  properties: Json;
  geometry: { type: string; coordinates: number[][][][] } | null;
}

export function createNusamaiReader(): PlateauReader {
  return {
    name: 'nusamai',
    async *read(file: string, opts: PlateauReadOptions): AsyncIterable<NormalizedFeature> {
      const dir = await mkdtemp(join(tmpdir(), 'sanpo-nusamai-'));
      try {
        const gpkg = join(dir, `${basename(file, '.gml')}.gpkg`);
        await run('nusamai', ['--sink', 'gpkg', '--epsg', OUTPUT_EPSG, '--output', gpkg, file], {
          maxBuffer: 1 << 26,
        });
        if (basename(file).includes('_bldg_')) yield* readBuildings(gpkg, opts.sourceId);
        else if (basename(file).includes('_tran_')) yield* readRoads(gpkg, opts.sourceId);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

async function* readLayer(gpkg: string, layer: string): AsyncIterable<GeoFeature> {
  const child = spawn('ogr2ogr', ['-f', 'GeoJSONSeq', '/vsistdout/', gpkg, layer], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    const s = (line.startsWith(RECORD_SEPARATOR) ? line.slice(1) : line).trim();
    if (s) yield JSON.parse(s) as GeoFeature;
  }
}

/** uro:BuildingIDAttribute는 별도 테이블로 평탄화됨 → parentId로 조인. */
async function buildingIds(gpkg: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for await (const f of readLayer(gpkg, 'uro:BuildingIDAttribute')) {
    const parent = f.properties.parentId;
    const id = f.properties.buildingID;
    if (typeof parent === 'string' && typeof id === 'string') ids.set(parent, id);
  }
  return ids;
}

async function* readBuildings(gpkg: string, source: string): AsyncIterable<NormalizedFeature> {
  const ids = await buildingIds(gpkg);
  for await (const f of readLayer(gpkg, 'bldg:Building')) {
    const gmlId = String(f.properties.id ?? '');
    const surfaces = polygonsWF(f).map((ringsWF) => ({ kind: classifyByNormal(ringsWF), ringsWF }));
    if (surfaces.length === 0) continue;
    const usage = f.properties.usage;
    yield {
      layer: 'buildings',
      gmlId,
      buildingId: ids.get(gmlId) ?? null,
      lod: ASSUMED_LOD,
      measuredHeightM: numOrNull(f.properties.measuredHeight),
      storeys: numOrNull(f.properties.storeysAboveGround),
      storeysBelow: numOrNull(f.properties.storeysBelowGround),
      // 코드가 아니라 코드리스트 명칭(예: "業務施設")으로 해석되어 나온다.
      usage: Array.isArray(usage) ? String(usage[0]) : typeof usage === 'string' ? usage : null,
      surfaces,
      source,
    };
  }
}

async function* readRoads(gpkg: string, source: string): AsyncIterable<NormalizedFeature> {
  for await (const f of readLayer(gpkg, 'tran:Road')) {
    const roadId = String(f.properties.id ?? '');
    const fn = Array.isArray(f.properties.function) ? f.properties.function[0] : f.properties.function;
    const polys = polygonsWF(f);
    let i = 0;
    for (const polygonWF of polys) {
      yield {
        layer: 'roads',
        id: polys.length > 1 ? `${roadId}:${i++}` : roadId,
        roadId,
        lod: ASSUMED_LOD,
        function: 'other',
        functionCode: `Road:${String(fn ?? '?')}`,
        polygonWF,
        source,
      };
    }
  }
}

function polygonsWF(f: GeoFeature): RingsWF[] {
  const g = f.geometry;
  if (!g) return [];
  const polys =
    g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates as unknown as number[][][]] : [];
  const out: RingsWF[] = [];
  for (const poly of polys) {
    const rings = poly.map((ring) => lonLatHToWF(ring.flat())).filter((r) => r.length > 0);
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v !== 9999 ? v : null;
}
