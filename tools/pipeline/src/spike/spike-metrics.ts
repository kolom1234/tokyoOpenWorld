// M01-T02 스파이크 비교 지표: 보존(gml:id·속성·면 종류·텍스처·도로 기능), 좌표 일치, 규모. see docs/adr/0007-plateau-reader.md
import { classifyByNormal, polygonArea3D } from '../readers/plateau/geometry.ts';
import type { BuildingRecord, NormalizedFeature, RingsWF, RoadRecord, SurfaceKind } from '../readers/plateau/types.ts';

export interface RunStats {
  reader: string;
  files: number;
  featuresTotal: number;
  featuresInRegion: number;
  wallMs: number;
  nodeMaxRssMB: number;
  region: { minX: number; minZ: number; maxX: number; maxZ: number };
}

interface Side {
  features: NormalizedFeature[];
  stats: RunStats;
}

function bbox(rings: readonly RingsWF[]): number[] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const rs of rings) {
    for (const r of rs) {
      for (let i = 0; i + 2 < r.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = r[i + k] as number;
          b[k] = Math.min(b[k] as number, v);
          b[k + 3] = Math.max(b[k + 3] as number, v);
        }
      }
    }
  }
  return b;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function areaByKind(bs: readonly BuildingRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bs) for (const s of b.surfaces) out[s.kind] = (out[s.kind] ?? 0) + polygonArea3D(s.ringsWF);
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] as number);
  return out;
}

/** B안의 의미 면 종류를 법선 분류(A안이 할 수 있는 최선)와 비교 → 법선 분류가 틀리는 면적 비율. */
function normalClassificationError(bs: readonly BuildingRecord[]): Record<string, number> {
  const wrong: Record<string, number> = {};
  let total = 0;
  let wrongTotal = 0;
  for (const b of bs) {
    for (const s of b.surfaces) {
      const a = polygonArea3D(s.ringsWF);
      total += a;
      const guess: SurfaceKind = classifyByNormal(s.ringsWF);
      if (guess !== s.kind) {
        wrongTotal += a;
        const key = `${s.kind}->${guess}`;
        wrong[key] = (wrong[key] ?? 0) + a;
      }
    }
  }
  for (const k of Object.keys(wrong)) wrong[k] = Math.round(wrong[k] as number);
  return { ...wrong, wrongShare: r2((wrongTotal / Math.max(total, 1)) * 100) };
}

function compareBuildings(a: BuildingRecord[], b: BuildingRecord[], usage: Map<string, string>): unknown {
  const byIdA = new Map(a.map((x) => [x.gmlId, x]));
  const common = b.filter((x) => byIdA.has(x.gmlId));
  const eq = { height: 0, storeys: 0, usageName: 0, buildingId: 0 };
  let maxBboxDiffM = 0;
  for (const bb of common) {
    const aa = byIdA.get(bb.gmlId) as BuildingRecord;
    if (aa.measuredHeightM === bb.measuredHeightM) eq.height++;
    if (aa.storeys === bb.storeys) eq.storeys++;
    if (aa.usage === (bb.usage === null ? null : (usage.get(bb.usage) ?? bb.usage))) eq.usageName++;
    if (aa.buildingId === bb.buildingId) eq.buildingId++;
    const ba = bbox(aa.surfaces.map((s) => s.ringsWF));
    // A(gpkg Building 레이어)에는 BuildingInstallation이 없으므로 B도 제외하고 비교.
    const bb2 = bbox(bb.surfaces.filter((s) => s.kind !== 'installation').map((s) => s.ringsWF));
    for (let k = 0; k < 6; k++) maxBboxDiffM = Math.max(maxBboxDiffM, Math.abs((ba[k] as number) - (bb2[k] as number)));
  }
  const verts = (bs: BuildingRecord[]): number =>
    bs.reduce((n, x) => n + x.surfaces.reduce((m, s) => m + s.ringsWF.reduce((k, r) => k + r.length / 3, 0), 0), 0);
  const lodB: Record<string, number> = {};
  for (const x of b) lodB[`lod${x.lod}`] = (lodB[`lod${x.lod}`] ?? 0) + 1;
  return {
    count: { a: a.length, b: b.length, common: common.length },
    attrEqualAmongCommon: eq,
    maxBboxDiffM: r2(maxBboxDiffM),
    vertices: { a: verts(a), b: verts(b) },
    surfaces: { a: a.reduce((n, x) => n + x.surfaces.length, 0), b: b.reduce((n, x) => n + x.surfaces.length, 0) },
    areaByKindM2: { a: areaByKind(a), b: areaByKind(b) },
    normalClassOnB: normalClassificationError(b),
    lodB,
    texturedSurfaces: {
      a: a.reduce((n, x) => n + x.surfaces.filter((s) => s.tex).length, 0),
      b: b.reduce((n, x) => n + x.surfaces.filter((s) => s.tex).length, 0),
    },
  };
}

function compareRoads(a: RoadRecord[], b: RoadRecord[]): unknown {
  const summarize = (rs: RoadRecord[]): Record<string, unknown> => {
    const byFn: Record<string, number> = {};
    const byLod: Record<string, number> = {};
    let area = 0;
    for (const r of rs) {
      const m2 = polygonArea3D(r.polygonWF);
      area += m2;
      byFn[r.function] = Math.round((byFn[r.function] ?? 0) + m2);
      byLod[`lod${r.lod}`] = (byLod[`lod${r.lod}`] ?? 0) + 1;
    }
    return {
      records: rs.length,
      roads: new Set(rs.map((r) => r.roadId)).size,
      areaM2: Math.round(area),
      areaByFunctionM2: byFn,
      byLod,
    };
  };
  return { a: summarize(a), b: summarize(b) };
}

export function compareOutputs(a: Side, b: Side, usage: Map<string, string>): unknown {
  const pick = <L extends NormalizedFeature['layer']>(s: Side, layer: L) =>
    s.features.filter((f): f is Extract<NormalizedFeature, { layer: L }> => f.layer === layer);
  return {
    run: { a: a.stats, b: b.stats },
    buildings: compareBuildings(pick(a, 'buildings'), pick(b, 'buildings'), usage),
    roads: compareRoads(pick(a, 'roads'), pick(b, 'roads')),
  };
}
