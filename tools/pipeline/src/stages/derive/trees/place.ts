// 나무 배치 문맥(M05-T04): 셀 소유·표면 높이·장애물(건물·도로·소품) 검사 → TreeRecord + 줄기 콜라이더(원기둥, 관목 = 둥근 덤불 원기둥). see ADR-0052
import { JCOL_MATERIAL, type JcolShape, type TreeRecord, type TreeSpeciesName } from '@sanpo/tile-format';
import type { RoadIndex } from '../roads.ts';
import { sizeOf, speciesId } from './species.ts';

export type V2 = [number, number];

export interface TreeCtx {
  cellId: string;
  ox: number;
  oz: number;
  roads: RoadIndex;
  /** 셀 로컬 표면 높이(보도 윗면 또는 지형). */
  surfaceAt: (x: number, z: number) => number | undefined;
  inIntersection: (x: number, z: number) => boolean;
  /** 건물 발자국 안(WF). */
  inBuilding: (x: number, z: number) => boolean;
  /** 소품 위치(WF) — 가로수는 1.5 m 안에 두지 않는다. */
  avoid: readonly V2[];
  out: TreeRecord[];
  colliders: JcolShape[];
  left: number;
  trimmed: number;
}

/** 줄기 콜라이더 높이(m) — 첫 가지 아래만(걷기·차량 충돌용). */
const TRUNK_M = 3;
/** 건물 벽과 최소 간격(m). */
const WALL_CLEAR_M = 1;

export function owns(c: TreeCtx, p: V2): boolean {
  return p[0] >= c.ox && p[0] < c.ox + 256 && p[1] >= c.oz && p[1] < c.oz + 256;
}

/** 건물 안·벽 1 m 안이면 참. */
export function nearBuilding(c: TreeCtx, p: V2): boolean {
  if (c.inBuilding(p[0], p[1])) return true;
  for (const [dx, dz] of [
    [WALL_CLEAR_M, 0],
    [-WALL_CLEAR_M, 0],
    [0, WALL_CLEAR_M],
    [0, -WALL_CLEAR_M],
  ] as const)
    if (c.inBuilding(p[0] + dx, p[1] + dz)) return true;
  return false;
}

export function nearProp(c: TreeCtx, p: V2, r = 1.5): boolean {
  return c.avoid.some(
    (q) => Math.abs(q[0] - p[0]) < r && Math.abs(q[1] - p[1]) < r && Math.hypot(q[0] - p[0], q[1] - p[1]) < r,
  );
}

function trunkCollider(
  species: TreeSpeciesName,
  x: number,
  y: number,
  z: number,
  height: number,
  crownR: number,
): JcolShape {
  const base = {
    layer: 0,
    material: JCOL_MATERIAL.wood,
    flags: 0,
    quat: [0, 0, 0, 1] as [number, number, number, number],
  };
  if (species === 'shrub') {
    const r = Math.max(0.3, crownR * 0.7);
    return {
      ...base,
      kind: 'cylinder',
      posLocal: [x, y + height / 2, z],
      halfHeight: height / 2,
      radius: Math.min(r, height / 2),
    };
  }
  const hh = Math.min(TRUNK_M, height * 0.4) / 2;
  return { ...base, kind: 'cylinder', posLocal: [x, y + hh, z], halfHeight: hh, radius: Math.max(0.12, height * 0.02) };
}

/** 나무 1그루(소유·높이·예산 검사). u = 크기 난수 0..1, seed = 변형 번호. 반환 = 놓았는지. */
export function plant(
  c: TreeCtx,
  species: TreeSpeciesName,
  p: V2,
  u: number,
  seed: number,
  tagHeight?: string,
  scale = 1,
): boolean {
  if (!owns(c, p)) return false;
  const lx = p[0] - c.ox;
  const lz = p[1] - c.oz;
  const y = c.surfaceAt(lx, lz);
  if (y === undefined) return false;
  if (c.left <= 0) {
    c.trimmed++;
    return false;
  }
  c.left--;
  const { height, crownR } = sizeOf(species, u, tagHeight, scale);
  c.out.push({ species: speciesId(species), seed: seed & 0xff, x: lx, y, z: lz, height, crownR });
  c.colliders.push(trunkCollider(species, lx, y, lz, height, crownR));
  return true;
}
