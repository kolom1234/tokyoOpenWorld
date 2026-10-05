// L1 HLOD(1024 m = L0 4×4): 영역 안 자식 = L0 정규화 건물(LOD2/3 면) 병합 → meshopt simplify 25% + dem_1m 4 m 지형,
// 영역 밖 자식 = 23구 원경 박스 + 원경 DEM. 소품 없음, 나무 임포스터는 나무 레이어(M04) 이후. 랜드마크는 L0와 같은 셸·부품(대체 건물 대신).
// see docs/04-data-pipeline.md §4.5
import { type CellKey, unpackCellKey } from '@sanpo/core';
import { cellBoundsWF } from '@sanpo/geo';
import { MeshoptSimplifier } from 'meshoptimizer';
import { triangulateRings } from '../../lib/triangulate.ts';
import type { BuildingRecord, SurfaceKind } from '../../readers/plateau/types.ts';
import type { DemWindow } from '../build/dem-window.ts';
import { facadeParams } from '../build/facade-params.ts';
import { emitLandmarks, LStream, type OverrideSet } from '../build/overrides/index.ts';
import { addFarBox } from './boxes.ts';
import {
  addTerrainPatch,
  type ChildGeometry,
  childKeys,
  emptyChildren,
  type HeightFn,
  type MeshStream,
  patchOf,
} from './child-split.ts';
import { type FarDem, farDemHeight } from './dem-far.ts';
import { type FarBuilding, floorsOf, nightFlags } from './far-buildings.ts';

export const L1_PARAMS = { terrainError: 0.25, skirt: 4, ratio: 0.25, errorM: 2, budgetBytes: 3_000_000 } as const;
const RENDER_KINDS: ReadonlySet<SurfaceKind> = new Set(['roof', 'wall', 'installation']);
const WALL_NY = 0.7;
const INT8_MAX = 127;
/** 용접 격자(m) — 같은 건물 안에서만 정점을 합친다(건물 간 병합 금지 → _FACADE 모호성 없음). */
const WELD_M = 0.01;

export interface L1Sources {
  /** 영역 안 L0 셀의 정규화 건물(없으면 영역 밖 자식). */
  l0Buildings(key: CellKey): BuildingRecord[] | undefined;
  /** dem_1m 창(L1 셀 ± 4 m) — 영역 안 자식 지형. */
  dem1m: DemWindow | undefined;
  farDem: FarDem;
  /** L1 셀과 겹치는 원경 건물(영역 밖 자식용). */
  far: readonly FarBuilding[];
  /** 랜드마크 — 대체 건물 대신 L0와 같은 셸·부품(멀리서 상자 → 가까이서 텐트로 바뀌던 것, M07 사전 ⓪). */
  overrides?: OverrideSet;
}

function demHeight(d: DemWindow): HeightFn {
  return (x, z) => {
    const c = Math.min(Math.max(Math.round(x - d.x0), 0), d.width - 1);
    const r = Math.min(Math.max(Math.round(z - d.z0), 0), d.height - 1);
    return d.values[r * d.width + c] as number;
  };
}

interface Welded {
  pos: number[];
  bldg: number[];
  idx: number[];
}

/** 건물 렌더 면 삼각분할 → 건물 단위 용접(부모 로컬 좌표). */
function weldBuildings(recs: readonly BuildingRecord[], ox: number, oz: number): Welded {
  const w: Welded = { pos: [], bldg: [], idx: [] };
  const seen = new Map<string, number>();
  for (const [bi, b] of recs.entries()) {
    for (const s of b.surfaces) {
      if (!RENDER_KINDS.has(s.kind)) continue;
      const rings = s.ringsWF.map((r) => r.map((v, i) => v - (i % 3 === 0 ? ox : i % 3 === 2 ? oz : 0)));
      const t = triangulateRings(rings);
      if (!t) continue;
      const vid: number[] = [];
      for (let i = 0; i < t.vertices.length; i += 3) {
        const [x, y, z] = [t.vertices[i], t.vertices[i + 1], t.vertices[i + 2]] as [number, number, number];
        const key = `${bi}:${Math.round(x / WELD_M)},${Math.round(y / WELD_M)},${Math.round(z / WELD_M)}`;
        let v = seen.get(key);
        if (v === undefined) {
          v = w.bldg.length;
          seen.set(key, v);
          w.pos.push(x, y, z);
          w.bldg.push(bi);
        }
        vid.push(v);
      }
      for (const k of t.triangles) w.idx.push(vid[k] as number);
    }
  }
  return w;
}

/** 삼각형 1개(평면 법선, L0와 같은 UV 규칙) → stream. 퇴화면 건너뜀. */
function flatTri(s: MeshStream, p: readonly [number, number, number][], facade: readonly number[]): void {
  const [a, b, c] = p as [[number, number, number], [number, number, number], [number, number, number]];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(n[0] as number, n[1] as number, n[2] as number);
  if (len < 1e-6) return;
  const [nx, ny, nz] = n.map((v) => v / len) as [number, number, number];
  const wall = Math.abs(ny) < WALL_NY;
  const th = Math.hypot(nz, nx) || 1;
  const [tx, tz] = [nz / th, -nx / th];
  const base = s.count;
  for (const [x, y, z] of p) {
    s.pos.push(x, y, z);
    s.nrm.push(Math.round(nx * INT8_MAX), Math.round(ny * INT8_MAX), Math.round(nz * INT8_MAX));
    if (wall) s.uv.push(x * tx + z * tz, y);
    else s.uv.push(x, z);
    s.facade.push(...facade);
  }
  s.idx.push(base, base + 1, base + 2);
}

/** 자식 1개 건물: 용접 → simplify(ratio, 절대 오차 상한) → 평면 법선으로 풀어 기록. 반환 = (원래, 결과) 삼각형 수. */
export function addSimplifiedBuildings(
  s: MeshStream,
  recs: readonly BuildingRecord[],
  ox: number,
  oz: number,
  ratio: number,
  errorM: number,
): [number, number] {
  const sorted = [...recs].sort((a, b) => (a.gmlId < b.gmlId ? -1 : a.gmlId > b.gmlId ? 1 : 0));
  const w = weldBuildings(sorted, ox, oz);
  if (w.idx.length === 0) return [0, 0];
  const target = Math.max(3, Math.floor((w.idx.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(Uint32Array.from(w.idx), Float32Array.from(w.pos), 3, target, errorM, [
    'ErrorAbsolute',
    'Prune',
  ]);
  const facades = sorted.map((b) => {
    const h = b.measuredHeightM ?? 10;
    const floors = floorsOf(b.storeys, h);
    const f = facadeParams({ id: b.gmlId, usage: b.usage, heightM: h, floors });
    return [f[0], floors, f[2], nightFlags(b.usage, b.gmlId)];
  });
  const at = (v: number): [number, number, number] => [
    w.pos[v * 3] as number,
    w.pos[v * 3 + 1] as number,
    w.pos[v * 3 + 2] as number,
  ];
  for (let i = 0; i < out.length; i += 3) {
    const [a, b, c] = [out[i], out[i + 1], out[i + 2]] as [number, number, number];
    flatTri(s, [at(a), at(b), at(c)], facades[w.bldg[a] as number] as number[]);
  }
  return [w.idx.length / 3, out.length / 3];
}

/** 자식 L0 셀의 랜드마크(셸 + 부품, 셀 로컬) — L0 overrides.mesh와 같은 함수. */
function landmarksOf(set: OverrideSet, recs: readonly BuildingRecord[], child: CellKey, dem: DemWindow) {
  const { ix, iz } = unpackCellKey(child);
  const [cox, coz] = [ix * 256, iz * 256];
  const h = demHeight(dem);
  const stream = new LStream();
  const { renderSkip } = emitLandmarks(set, recs, [cox, 0, coz], (x, z) => h(x + cox, z + coz), stream, new LStream());
  return { stream, skip: renderSkip, ox: cox, oz: coz };
}

/** 랜드마크 삼각형 → HLOD 건물 스트림(평면 법선, 공공 건물 파사드 — 원경 단색). 반환 = 삼각형 수. */
function addLandmarkTris(s: MeshStream, lm: LStream, dx: number, dz: number): number {
  const f = facadeParams({ id: 'landmark', usage: '421', heightM: 20, floors: 0 });
  const facade = [f[0], 0, f[2], 0];
  const at = (v: number): [number, number, number] => [
    (lm.pos[v * 3] as number) + dx,
    lm.pos[v * 3 + 1] as number,
    (lm.pos[v * 3 + 2] as number) + dz,
  ];
  for (let i = 0; i < lm.idx.length; i += 3)
    flatTri(s, [at(lm.idx[i] as number), at(lm.idx[i + 1] as number), at(lm.idx[i + 2] as number)], facade);
  return lm.idx.length / 3;
}

/** 원경 건물 중 셀(중심점) 안의 것. */
export function farIn(far: readonly FarBuilding[], key: CellKey): FarBuilding[] {
  const b = cellBoundsWF(key);
  return far.filter((f) => f.cx >= b.minX && f.cx < b.maxX && f.cz >= b.minZ && f.cz < b.maxZ);
}

export interface L1Result {
  children: ChildGeometry[];
  inside: number;
  srcTris: number;
  tris: number;
}

/** L1 셀 1개의 자식별 기하. ratio로 건물 단순화 비율(예산 초과 시 호출자가 낮춰 다시 부른다). */
export async function buildL1(key: CellKey, src: L1Sources, ratio: number = L1_PARAMS.ratio): Promise<L1Result> {
  await MeshoptSimplifier.ready;
  const { ix, iz } = unpackCellKey(key);
  const [ox, oz] = [ix * 1024, iz * 1024];
  const children = emptyChildren();
  const farH: HeightFn = (x, z) => farDemHeight(src.farDem, x, z);
  const res: L1Result = { children, inside: 0, srcTris: 0, tris: 0 };
  for (const [ci, child] of childKeys(key).entries()) {
    const g = children[ci] as ChildGeometry;
    const recs = src.l0Buildings(child);
    const inside = recs !== undefined && src.dem1m !== undefined;
    const h = inside && src.dem1m ? demHeight(src.dem1m) : farH;
    addTerrainPatch(g.terrain, h, patchOf(key, child, L1_PARAMS.terrainError, L1_PARAMS.skirt));
    if (inside && recs) {
      const lm = src.overrides && src.dem1m ? landmarksOf(src.overrides, recs, child, src.dem1m) : undefined;
      const kept = lm ? recs.filter((r) => !lm.skip.has(r.gmlId)) : recs;
      const [a, b] = addSimplifiedBuildings(g.buildings, kept, ox, oz, ratio, L1_PARAMS.errorM);
      if (lm) res.tris += addLandmarkTris(g.buildings, lm.stream, lm.ox - ox, lm.oz - oz);
      res.srcTris += a;
      res.tris += b;
      res.inside++;
    } else {
      for (const f of farIn(src.far, child)) addFarBox(g.buildings, f, ox, oz);
    }
  }
  return res;
}
