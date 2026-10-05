// 내비 월드(M06-T03, ADR-0063): sim.worker 안 타일 Detour NavMesh(원점 0, 64 m 타일 = 파이프라인 nav.bin 타일 좌표 그대로) —
// 셀 nav.bin(gzip 해제 바이트) → 타일 addTile(메시가 데이터 소유, DT_TILE_FREE_DATA)·removeTile, 횡단보도 기록은 id로 참조 계수(셀 경계를 넘는 횡단 중복).
import { NavMesh, NavMeshParams, NavMeshQuery, QueryFilter, UnsignedCharArray } from '@recast-navigation/core';
import { NAV_AREA, NAV_FLAG, NAV_TILE_M, type NavCrossing, type NavTile, parseNav } from '@sanpo/tile-format';

/** Detour 타일 비트: 타일 1024(10) + 폴리곤 4096(12) = 22비트(32비트 참조의 염 10비트). */
const MAX_TILES = 1024;
const MAX_POLYS = 4096;
const DT_TILE_FREE_DATA = 1;
const DT_SUCCESS = 1 << 30;

export interface CrossingRec extends NavCrossing {
  /** a→b 단위(xz)·길이. */
  ux: number;
  uz: number;
  len: number;
}

/** 필터: walk = 보도·생활도로·보행로(횡단 불가), all = + 횡단. 비용 = 보도 1·보행로 1.3·생활도로 2.5·횡단 1.2. */
export function configureFilter(f: QueryFilter, allowCross: boolean): void {
  f.includeFlags = allowCross ? NAV_FLAG.walk | NAV_FLAG.cross : NAV_FLAG.walk;
  f.excludeFlags = 0;
  f.setAreaCost(NAV_AREA.sidewalk, 1);
  f.setAreaCost(NAV_AREA.open, 1.3);
  f.setAreaCost(NAV_AREA.street, 2.5);
  f.setAreaCost(NAV_AREA.crossing, 1.2);
}

export interface NavWorld {
  readonly navMesh: NavMesh;
  readonly query: NavMeshQuery;
  readonly walkFilter: QueryFilter;
  readonly allFilter: QueryFilter;
  /** 셀 nav.bin(gzip 해제) 적재. 실패 타일은 건너뛰고 수를 돌려준다. */
  addCell(key: number, bytes: Uint8Array): { tiles: number; failed: number };
  removeCell(key: number): void;
  hasCell(key: number): boolean;
  crossingsNear(x: number, z: number, r: number): CrossingRec[];
  crossing(id: number): CrossingRec | undefined;
  stats(): { cells: number; tiles: number; crossings: number };
  destroy(): void;
}

function toRec(c: NavCrossing): CrossingRec {
  const dx = c.b[0] - c.a[0];
  const dz = c.b[2] - c.a[2];
  const len = Math.hypot(dx, dz) || 1;
  return { ...c, ux: dx / len, uz: dz / len, len };
}

/** 타일 바이트 → addTile(메시가 데이터 소유). 같은 좌표에 남은 타일(셀 재적재)은 먼저 지운다. */
function addTiles(navMesh: NavMesh, tiles: readonly NavTile[]): { refs: number[]; failed: number } {
  const refs: number[] = [];
  let failed = 0;
  for (const t of tiles) {
    const old = navMesh.getTileRefAt(t.tx, t.tz, 0);
    if (old) navMesh.removeTile(old);
    const arr = new UnsignedCharArray();
    arr.copy(t.data);
    const r = navMesh.addTile(arr, DT_TILE_FREE_DATA, 0);
    if ((r.status & DT_SUCCESS) === 0) {
      failed++;
      arr.destroy();
    } else refs.push(r.tileRef);
  }
  return { refs, failed };
}

function recsNear(all: Iterable<{ rec: CrossingRec }>, x: number, z: number, r: number): CrossingRec[] {
  const out: CrossingRec[] = [];
  for (const { rec } of all) {
    const mx = (rec.a[0] + rec.b[0]) / 2;
    const mz = (rec.a[2] + rec.b[2]) / 2;
    if (Math.hypot(mx - x, mz - z) <= r + rec.len / 2) out.push(rec);
  }
  return out;
}

export function createNavWorld(): NavWorld {
  const navMesh = new NavMesh();
  const params = NavMeshParams.create({
    orig: { x: 0, y: 0, z: 0 },
    tileWidth: NAV_TILE_M,
    tileHeight: NAV_TILE_M,
    maxTiles: MAX_TILES,
    maxPolys: MAX_POLYS,
  });
  if (!navMesh.initTiled(params)) throw new Error('nav: initTiled failed');
  const query = new NavMeshQuery(navMesh, { maxNodes: 4096 });
  const walkFilter = new QueryFilter();
  configureFilter(walkFilter, false);
  const allFilter = new QueryFilter();
  configureFilter(allFilter, true);
  const cells = new Map<number, { tiles: number[]; crossings: number[] }>();
  const crossings = new Map<number, { rec: CrossingRec; refs: number }>();
  let tileCount = 0;
  return {
    navMesh,
    query,
    walkFilter,
    allFilter,
    addCell(key, bytes) {
      if (cells.has(key)) return { tiles: 0, failed: 0 };
      const nav = parseNav(bytes);
      if (!nav.ok) return { tiles: 0, failed: 1 };
      const { refs, failed } = addTiles(navMesh, nav.value.tiles);
      tileCount += refs.length;
      for (const c of nav.value.crossings) {
        const e = crossings.get(c.id);
        if (e) e.refs++;
        else crossings.set(c.id, { rec: toRec(c), refs: 1 });
      }
      cells.set(key, { tiles: refs, crossings: nav.value.crossings.map((c) => c.id) });
      return { tiles: refs.length, failed };
    },
    removeCell(key) {
      const c = cells.get(key);
      if (!c) return;
      for (const ref of c.tiles) navMesh.removeTile(ref);
      tileCount -= c.tiles.length;
      for (const id of c.crossings) {
        const e = crossings.get(id);
        if (e && --e.refs <= 0) crossings.delete(id);
      }
      cells.delete(key);
    },
    hasCell: (key) => cells.has(key),
    crossingsNear: (x, z, r) => recsNear(crossings.values(), x, z, r),
    crossing: (id) => crossings.get(id)?.rec,
    stats: () => ({ cells: cells.size, tiles: tileCount, crossings: crossings.size }),
    destroy() {
      query.destroy();
      navMesh.destroy();
    },
  };
}
