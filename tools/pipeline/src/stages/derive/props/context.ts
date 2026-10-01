// 소품 배치 공용(M05-T03): 카탈로그(content/props/catalog.json), 배치 문맥(셀 소유·표면 높이·결정론 난수), 인스턴스·콜라이더 모으기.
// 인스턴스 = (x, y, z, yaw, scale) 셀 로컬, yaw = +Y축 반시계(0 = 정면 −Z… 렌더 모델 규약: 로컬 +Z = 정면, yaw = atan2(fx, fz)). see ADR-0051
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng, hash32, type Rng, WORLD_SEED } from '@sanpo/core';
import { JCOL_MATERIAL, type JcolShape, PROP_TYPE, type PropBatch, type PropTypeName } from '@sanpo/tile-format';
import type { RoadIndex } from '../roads.ts';

export type ColliderSpec =
  | { kind: 'cylinder'; halfHeight: number; radius: number; material: keyof typeof JCOL_MATERIAL }
  | { kind: 'box'; halfExtents: [number, number, number]; material: keyof typeof JCOL_MATERIAL };

export interface PropSpec {
  collider?: ColliderSpec;
  place?: Record<string, unknown>;
}

export interface PropCatalog {
  types: Record<PropTypeName, PropSpec>;
  budget: { maxInstancesPerCell: number };
}

export function readCatalog(repoRoot: string): PropCatalog {
  return JSON.parse(readFileSync(join(repoRoot, 'content/props/catalog.json'), 'utf8')) as PropCatalog;
}

export type V2 = [number, number];

export interface PlaceCtx {
  catalog: PropCatalog;
  cellId: string;
  /** 셀 원점 WF. 입력 좌표는 WF, 출력은 셀 로컬. */
  ox: number;
  oz: number;
  roads: RoadIndex;
  /** 표면 높이(셀 로컬): 보도 = 보도 윗면, 그 밖 = 지형 메시. */
  surfaceAt: (x: number, z: number) => number | undefined;
  inIntersection: (x: number, z: number) => boolean;
  /** 건물 발자국 안(WF, 셀 + 여유 창). */
  inBuilding: (x: number, z: number) => boolean;
  out: Map<number, number[]>;
  colliders: JcolShape[];
  /** 남은 예산(인스턴스). 0이면 place가 거절하고 trimmed를 센다 — 배치 순서 = 우선순위. */
  left: number;
  trimmed: number;
}

/** 결정론 난수: hash32(WORLD_SEED, cellId, 'props', 층, 번호) — CLAUDE.md 규칙 10. */
export function rngFor(c: PlaceCtx, layer: string, index: number | string): Rng {
  return createRng(hash32(WORLD_SEED, c.cellId, 'props', layer, index));
}

export function owns(c: PlaceCtx, p: V2): boolean {
  return p[0] >= c.ox && p[0] < c.ox + 256 && p[1] >= c.oz && p[1] < c.oz + 256;
}

/** 정면 방향(WF xz) → yaw(로컬 +Z가 그 방향을 보게). */
export const yawOf = (f: V2): number => Math.atan2(f[0], f[1]);

/** 인스턴스 1개 + 콜라이더(카탈로그). 소유·높이 없으면 건너뛴다. 반환 = 놓았는지. */
export function place(c: PlaceCtx, type: PropTypeName, p: V2, yaw: number, scale = 1): boolean {
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
  const id = PROP_TYPE[type];
  const list = c.out.get(id) ?? [];
  list.push(lx, y, lz, yaw, scale);
  c.out.set(id, list);
  const col = c.catalog.types[type]?.collider;
  if (col) c.colliders.push(colliderShape(col, lx, y, lz, yaw, scale));
  return true;
}

function colliderShape(col: ColliderSpec, x: number, y: number, z: number, yaw: number, s: number): JcolShape {
  const q: [number, number, number, number] = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const base = { layer: 0, material: JCOL_MATERIAL[col.material], flags: 0, quat: q };
  if (col.kind === 'cylinder')
    return {
      ...base,
      kind: 'cylinder',
      posLocal: [x, y + col.halfHeight * s, z],
      halfHeight: col.halfHeight * s,
      radius: col.radius * s,
    };
  const [hx, hy, hz] = col.halfExtents;
  return { ...base, kind: 'box', posLocal: [x, y + hy * s, z], halfExtents: [hx * s, hy * s, hz * s] };
}

export function batchesOf(out: Map<number, number[]>): PropBatch[] {
  return [...out]
    .filter(([, v]) => v.length > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([typeId, v]) => ({ typeId, transforms: Float32Array.from(v) }));
}

/** 점 p에서 방향 v로 차도가 끝나는 거리(m, 0.25 m 행진 + 이분 5회 ≈ 8 mm, ≤ max). */
export function toRoadEdge(c: Pick<PlaceCtx, 'roads'>, p: V2, v: V2, max = 15): number {
  const road = (s: number): boolean => c.roads.classify(p[0] + v[0] * s, p[1] + v[1] * s) === 'road';
  let s = 0;
  while (s < max && road(s + 0.25)) s += 0.25;
  if (s >= max) return max;
  let hi = s + 0.25;
  for (let k = 0; k < 5; k++) {
    const mid = (s + hi) / 2;
    if (road(mid)) s = mid;
    else hi = mid;
  }
  return s;
}

/** p 둘레(≤ r m)에서 가장 가까운 차도 방향(단위, 없으면 undefined) — 소품 정면을 차도 쪽으로. */
export function towardRoad(c: PlaceCtx, p: V2, r = 8): V2 | undefined {
  for (let d = 0.5; d <= r; d += 0.5) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      const q: V2 = [Math.cos(a), Math.sin(a)];
      if (c.roads.classify(p[0] + q[0] * d, p[1] + q[1] * d) === 'road') return q;
    }
  }
  return undefined;
}
