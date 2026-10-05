// 셀 내비메시(M06-T03, 04 §4.3 "보행 그래프 + 내비메시", ADR-0063): 보행면 분류(nav/surface) → 64 m Recast 타일 16개(nav/recast-tile)
// + 횡단보도 기록(WF 끝점·반폭·보행 신호 코드) → nav.bin(gzip). 높이 = 보도 윗면(roads.mesh와 같은 식) 또는 성형 지면.
import { hash32 } from '@sanpo/core';
import {
  gzip,
  type JcolShape,
  NAV_AREA,
  NAV_NO_SIGNAL,
  NAV_TILE_M,
  type NavCrossing,
  type NavTile,
  writeNav,
} from '@sanpo/tile-format';
import type { CrossBand } from './markings/crosswalk.ts';
import { type SampleGrid, sampleX, sampleZ } from './nav/raster.ts';
import { buildNavTile, initRecast, NAV_BORDER_VX, NAV_CS, type NavTriangles } from './nav/recast-tile.ts';
import { type NavSurfaceInput, navAreas } from './nav/surface.ts';

export interface NavCellInput extends Omit<NavSurfaceInput, 'crossings' | 'obstacles' | 'obstacleRings'> {
  /** 셀 L0 (ix, iz). */
  ix: number;
  iz: number;
  bands: readonly CrossBand[];
  /** 소품·나무 콜라이더(셀 로컬). 원기둥·캡슐 = 원, 상자 = 회전 사각형. */
  colliders: readonly JcolShape[];
  /** 높이(셀 로컬 x, z): 보도 윗면·그 밖 지면. */
  walkTop: (x: number, z: number) => number;
  ground: (x: number, z: number) => number;
  /** 신호 횡단 띠 → 보행 신호 코드(signal-sites signalCode). */
  signalOf: (b: CrossBand) => number;
}

export interface NavCellStats {
  tiles: number;
  bytes: number;
  crossings: number;
  signalCrossings: number;
  /** area별 표본 수(0.5 m²): sidewalk·street·crossing·open. */
  samples: [number, number, number, number];
}

const OBSTACLE_MARGIN_M = 0.05;

function obstaclesOf(colliders: readonly JcolShape[], ox: number, oz: number) {
  const discs: { x: number; z: number; r: number }[] = [];
  const rings: number[][] = [];
  for (const c of colliders) {
    const x = c.posLocal[0] + ox;
    const z = c.posLocal[2] + oz;
    if (c.kind === 'cylinder' || c.kind === 'capsule') discs.push({ x, z, r: c.radius + OBSTACLE_MARGIN_M });
    else if (c.kind === 'box') {
      const [qx, qy, qz, qw] = c.quat;
      void qx;
      void qz;
      const yaw = 2 * Math.atan2(qy, qw);
      const [hx, , hz] = c.halfExtents.map((h) => h + OBSTACLE_MARGIN_M) as [number, number, number];
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      // 로컬 (u, w) → WF: 회전 Y(yaw) — x' = u cos + w sin, z' = −u sin + w cos.
      const corner = (u: number, w: number): [number, number] => [x + u * cs + w * sn, z - u * sn + w * cs];
      rings.push([...corner(-hx, -hz), ...corner(hx, -hz), ...corner(hx, hz), ...corner(-hx, hz)]);
    }
  }
  return { discs, rings };
}

/** 타일(± 테두리 + 표본 반 칸) 안 표본 → 사각형 2삼각형(꼭짓점 높이 = area별 높이 함수). */
function tileTriangles(g: SampleGrid, area: Uint8Array, i: NavCellInput, tx: number, tz: number): NavTriangles {
  const pad = NAV_BORDER_VX * NAV_CS + g.step;
  const x0 = tx * NAV_TILE_M - pad;
  const x1 = (tx + 1) * NAV_TILE_M + pad;
  const z0 = tz * NAV_TILE_M - pad;
  const z1 = (tz + 1) * NAV_TILE_M + pad;
  const pos: number[] = [];
  const idx: number[] = [];
  const areas: number[] = [];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const h = g.step / 2;
  const i0 = Math.max(0, Math.floor((x0 - g.x0) / g.step));
  const i1 = Math.min(g.n - 1, Math.ceil((x1 - g.x0) / g.step));
  const j0 = Math.max(0, Math.floor((z0 - g.z0) / g.step));
  const j1 = Math.min(g.n - 1, Math.ceil((z1 - g.z0) / g.step));
  for (let j = j0; j <= j1; j++)
    for (let ii = i0; ii <= i1; ii++) {
      const a = area[j * g.n + ii] as number;
      if (a === 0) continue;
      const cx = sampleX(g, ii) - i.ox;
      const cz = sampleZ(g, j) - i.oz;
      const hf = a === NAV_AREA.sidewalk ? i.walkTop : i.ground;
      const base = pos.length / 3;
      for (const [dx, dz] of [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ] as const) {
        const y = hf(cx + dx, cz + dz);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pos.push(cx + dx + i.ox, y, cz + dz + i.oz);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      areas.push(a, a);
    }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), areas: Uint8Array.from(areas), minY, maxY };
}

function crossingsOf(i: NavCellInput): NavCrossing[] {
  const out: NavCrossing[] = [];
  const seen = new Set<number>();
  for (const b of i.bands) {
    const id = hash32(
      Math.round(b.a[0] * 10),
      Math.round(b.a[1] * 10),
      Math.round(b.b[0] * 10),
      Math.round(b.b[1] * 10),
    );
    if (seen.has(id)) continue;
    seen.add(id);
    const ya = i.ground(b.a[0] - i.ox, b.a[1] - i.oz);
    const yb = i.ground(b.b[0] - i.ox, b.b[1] - i.oz);
    out.push({
      id,
      a: [b.a[0], ya, b.a[1]],
      b: [b.b[0], yb, b.b[1]],
      halfWidth: b.half,
      signal: b.signal ? i.signalOf(b) : NAV_NO_SIGNAL,
    });
  }
  return out;
}

/** 셀 하나 → nav.bin(gzip) + 통계. 걷는 면이 전혀 없으면 bytes = null. */
export async function buildNavCell(i: NavCellInput): Promise<{ bytes: Uint8Array | null; stats: NavCellStats }> {
  await initRecast();
  const obs = obstaclesOf(i.colliders, i.ox, i.oz);
  const crossings = i.bands.map((b) => ({ ax: b.a[0], az: b.a[1], bx: b.b[0], bz: b.b[1], half: b.half }));
  const { grid, area } = navAreas({ ...i, crossings, obstacles: obs.discs, obstacleRings: obs.rings });
  const samples: NavCellStats['samples'] = [0, 0, 0, 0];
  for (const a of area) if (a > 0) samples[a - 1] = (samples[a - 1] as number) + 1;
  const tiles: NavTile[] = [];
  for (let j = 0; j < 4; j++)
    for (let k = 0; k < 4; k++) {
      const tx = i.ix * 4 + k;
      const tz = i.iz * 4 + j;
      const data = buildNavTile(tileTriangles(grid, area, i, tx, tz), tx, tz);
      if (data) tiles.push({ tx, tz, data });
    }
  const cross = crossingsOf(i);
  const stats: NavCellStats = {
    tiles: tiles.length,
    bytes: 0,
    crossings: cross.length,
    signalCrossings: cross.filter((c) => c.signal !== NAV_NO_SIGNAL).length,
    samples,
  };
  if (tiles.length === 0) return { bytes: null, stats };
  const bytes = await gzip(writeNav({ tiles, crossings: cross }));
  stats.bytes = bytes.byteLength;
  return { bytes, stats };
}
