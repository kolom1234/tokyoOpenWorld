// 지도 타일러(M10-T03): WF 피처 → 경위도 → 웹 메르카토르 타일(z 13–16, extent 4096, 버퍼 64) → 자르기·단순화·정수화 → MVT 레이어. PMTiles는 index.ts가 쓴다.
import { wfToLonLat } from '@sanpo/geo';
import type { MvtFeature, MvtLayer, PmtilesTileInput } from '@sanpo/tile-format';
import { encodeMvt } from '@sanpo/tile-format';
import { clipLine, clipRing, orient, quantize, simplifyLine } from './clip.ts';
import type { MapFeature } from './collect.ts';

export const MAP_MIN_ZOOM = 13;
export const MAP_MAX_ZOOM = 16;
export const EXTENT = 4096;
const BUFFER = 64;
/** 레이어 그리는 순서(05 §1 / 12 §3 — 수면 → 공원 → 건물 → 도로 → 철도 → 역 → 라벨). */
export const MAP_LAYERS = ['water', 'park', 'building', 'road', 'rail', 'station', 'place'] as const;

/** 경위도 → 메르카토르 정규 좌표(0…1, y 아래). */
export function lonLatToMerc(lon: number, lat: number): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** WF xz 점 배열 → 메르카토르 정규 좌표(배정밀도). */
function toMerc(pts: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const ll = wfToLonLat({ x: pts[i] as number, y: 0, z: pts[i + 1] as number });
    const [mx, my] = lonLatToMerc(ll.lon, ll.lat);
    out.push(mx, my);
  }
  return out;
}

interface Projected {
  f: MapFeature;
  parts: number[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function project(f: MapFeature): Projected {
  const parts = f.parts.map(toMerc);
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of parts)
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i] as number);
      maxX = Math.max(maxX, p[i] as number);
      minY = Math.min(minY, p[i + 1] as number);
      maxY = Math.max(maxY, p[i + 1] as number);
    }
  return { f, parts, minX, maxX, minY, maxY };
}

/** 줌별 단순화 허용(타일 단위 — 4096/256 = 16 단위 ≈ 1 px). 최대 줌은 정밀하게. */
const tolOf = (z: number) => (z >= MAP_MAX_ZOOM ? 2 : 6);

/** 한 피처를 타일 (z, tx, ty)에 넣을 MVT 피처로(없으면 null). */
function featureInTile(p: Projected, z: number, tx: number, ty: number): MvtFeature | null {
  const scale = 2 ** z * EXTENT;
  const local = (pts: number[]) => {
    const o: number[] = [];
    for (let i = 0; i < pts.length; i += 2)
      o.push((pts[i] as number) * scale - tx * EXTENT, (pts[i + 1] as number) * scale - ty * EXTENT);
    return o;
  };
  const lo = -BUFFER;
  const hi = EXTENT + BUFFER;
  const tol = tolOf(z);
  const props = p.f.props;
  if (p.f.geom === 'point') {
    const [x, y] = local(p.parts[0] as number[]) as [number, number];
    if (x < 0 || x >= EXTENT || y < 0 || y >= EXTENT) return null;
    return { type: 1, geometry: [[Math.round(x), Math.round(y)]], properties: props };
  }
  if (p.f.geom === 'line') {
    const parts = p.parts
      .flatMap((pt) => clipLine(simplifyLine(local(pt), tol), lo, hi))
      .map(quantize)
      .filter((q) => q.length >= 4);
    return parts.length ? { type: 2, geometry: parts, properties: props } : null;
  }
  const rings: number[][] = [];
  p.parts.forEach((pt, i) => {
    if (i > 0 && rings.length === 0) return; // 바깥 링이 잘려 나감
    const closed = local(pt);
    const simple = simplifyLine([...closed, closed[0] as number, closed[1] as number], tol).slice(0, -2);
    const r = quantize(clipRing(simple, lo, hi));
    if (r.length >= 6) rings.push(orient(r, i === 0));
  });
  if (!rings.length) return null;
  return { type: 3, geometry: rings, properties: props };
}

export interface TileStats {
  tiles: number;
  bytes: number;
  byZoom: Record<number, number>;
}

/** 피처 → 줌별 타일 MVT. 빈 타일은 만들지 않는다. */
export function buildTiles(features: readonly MapFeature[]): {
  tiles: PmtilesTileInput[];
  stats: TileStats;
  bounds: [number, number, number, number];
} {
  const proj = features.map(project);
  const minX = Math.min(...proj.map((p) => p.minX));
  const maxX = Math.max(...proj.map((p) => p.maxX));
  const minY = Math.min(...proj.map((p) => p.minY));
  const maxY = Math.max(...proj.map((p) => p.maxY));
  const tiles: PmtilesTileInput[] = [];
  const stats: TileStats = { tiles: 0, bytes: 0, byZoom: {} };
  for (let z = MAP_MIN_ZOOM; z <= MAP_MAX_ZOOM; z++) {
    const n = 2 ** z;
    const buckets = new Map<string, Map<string, MvtFeature[]>>();
    for (const p of proj) {
      if (p.f.minZoom > z) continue;
      const pad = BUFFER / EXTENT;
      for (let tx = Math.floor(p.minX * n - pad); tx <= Math.floor(p.maxX * n + pad); tx++)
        for (let ty = Math.floor(p.minY * n - pad); ty <= Math.floor(p.maxY * n + pad); ty++) {
          const mf = featureInTile(p, z, tx, ty);
          if (!mf) continue;
          const key = `${tx}/${ty}`;
          let layers = buckets.get(key);
          if (!layers) {
            layers = new Map();
            buckets.set(key, layers);
          }
          const list = layers.get(p.f.layer);
          if (list) list.push(mf);
          else layers.set(p.f.layer, [mf]);
        }
    }
    for (const [key, layers] of buckets) {
      const [tx, ty] = key.split('/').map(Number) as [number, number];
      const mvt: MvtLayer[] = MAP_LAYERS.filter((l) => layers.has(l)).map((l) => ({
        name: l,
        extent: EXTENT,
        features: layers.get(l) ?? [],
      }));
      const data = encodeMvt(mvt);
      tiles.push({ z, x: tx, y: ty, data });
      stats.tiles++;
      stats.bytes += data.length;
      stats.byZoom[z] = (stats.byZoom[z] ?? 0) + 1;
    }
  }
  return { tiles, stats, bounds: [minX, minY, maxX, maxY] };
}
