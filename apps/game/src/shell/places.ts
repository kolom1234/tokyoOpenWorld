// HUD 지명(M10-T02): live L0 셀 meta.json placeNames(e-Stat 町丁 — 셀 로컬 폴리곤) → WF 폴리곤 색인 → 점-폴리곤 조회(포함 중 가장 작은 면적 — 飛び地·안쪽 町).
// 메타는 셀이 붙을 때 requestSections로 한 번(캐시 재사용), 해제되면 버린다. 조회는 HUD 10 Hz(1 m 안 이동이면 앞 결과).
import type { CellKey } from '@sanpo/core';
import type { CellMeta } from '@sanpo/tile-format';
import type { LocalName } from '@sanpo/ui';

interface PlacePoly {
  code: string;
  name: LocalName;
  pts: Float64Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  area: number;
}

/** 짝수-홀수 규칙(pts = x0, z0, x1, z1, …). */
export function pointInPolygon(pts: Float64Array, x: number, z: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2] as number;
    const zi = pts[i * 2 + 1] as number;
    const xj = pts[j * 2] as number;
    const zj = pts[j * 2 + 1] as number;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polyOf(code: string, name: LocalName, local: readonly [number, number][], ox: number, oz: number): PlacePoly {
  const pts = new Float64Array(local.length * 2);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let area = 0;
  local.forEach(([lx, lz], i) => {
    const x = lx + ox;
    const z = lz + oz;
    pts[i * 2] = x;
    pts[i * 2 + 1] = z;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    const [nx, nz] = local[(i + 1) % local.length] as [number, number];
    area += lx * nz - nx * lz;
  });
  return { code, name, pts, minX, maxX, minZ, maxZ, area: Math.abs(area / 2) };
}

export interface PlaceIndex {
  add(key: CellKey, originX: number, originZ: number, meta: Pick<CellMeta, 'placeNames'>): void;
  remove(key: CellKey): void;
  has(key: CellKey): boolean;
  /** WF (x, z)의 지명(없으면 null). */
  at(x: number, z: number): LocalName | null;
  readonly cells: number;
}

export function createPlaceIndex(): PlaceIndex {
  const byCell = new Map<CellKey, PlacePoly[]>();
  let last: { x: number; z: number; name: LocalName | null } | undefined;
  return {
    add(key, ox, oz, meta) {
      const polys = (meta.placeNames ?? []).map((p) =>
        polyOf(
          p.code,
          {
            ja: p.nameI18n.ja ?? '',
            en: p.nameI18n.en ?? p.nameI18n.ja ?? '',
            ko: p.nameI18n.ko ?? p.nameI18n.ja ?? '',
          },
          p.polygonLocal,
          ox,
          oz,
        ),
      );
      byCell.set(key, polys);
      last = undefined;
    },
    has: (key) => byCell.has(key),
    remove(key) {
      byCell.delete(key);
      last = undefined;
    },
    at(x, z) {
      if (last && Math.hypot(last.x - x, last.z - z) < 1) return last.name;
      let best: PlacePoly | undefined;
      for (const polys of byCell.values())
        for (const p of polys) {
          if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
          if ((!best || p.area < best.area) && pointInPolygon(p.pts, x, z)) best = p;
        }
      last = { x, z, name: best?.name ?? null };
      return last.name;
    },
    get cells() {
      return byCell.size;
    },
  };
}
