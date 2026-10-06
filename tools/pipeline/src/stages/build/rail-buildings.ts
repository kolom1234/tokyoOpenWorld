// 선로 위 건물(M07-T04, ADR-0073): PLATEAU 역 상옥·역사·선로 위 빌딩은 땅에서 지붕까지 막힌 껍질이라 열차가 그 안을 지나간다.
// - 바닥 다각형 안에 선로 표본(2 m 간격)이 3개 이상 = 선로 위 건물 → 충돌에서 뺀다(차내 캐릭터가 역 통과 중 건물 면에 밀리지 않게 — 렌더는 그대로).
// - 그중 낮은 운수·불명 용도(431·461, 높이 ≤ CANOPY_MAX_M) = 승강장 지붕 → 렌더에서도 뺀다(열차·승강장이 보이게).
import type { RailNetwork } from '@sanpo/tile-format';
import type { BuildingRecord } from '../../readers/plateau/types.ts';

export const CANOPY_MAX_M = 12;
const CANOPY_USAGE = new Set(['431', '461']);
const MIN_SAMPLES = 3;
const STRIDE = 4;
const GRID = 64;

function inRing(x: number, z: number, r: readonly number[]): boolean {
  let c = false;
  const n = r.length / 3;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi, xj, zj] = [r[i * 3] as number, r[i * 3 + 2] as number, r[j * 3] as number, r[j * 3 + 2] as number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** 선로 표본 xz 격자(64 m). */
function sampleGrid(net: RailNetwork): Map<string, number[]> {
  const g = new Map<string, number[]>();
  for (const t of net.tracks)
    for (let k = t.ptOffset; k < t.ptOffset + t.ptCount; k += STRIDE) {
      const x = net.points[k * 3] as number;
      const z = net.points[k * 3 + 2] as number;
      const key = `${Math.floor(x / GRID)},${Math.floor(z / GRID)}`;
      const a = g.get(key);
      if (a) a.push(x, z);
      else g.set(key, [x, z]);
    }
  return g;
}

export interface TrackBuildings {
  /** 선로 위(충돌 제외). */
  colliderSkip: Set<string>;
  /** 승강장 지붕(렌더·충돌 제외). */
  renderSkip: Set<string>;
}

export function trackBuildings(records: readonly BuildingRecord[], net: RailNetwork | undefined): TrackBuildings {
  const out: TrackBuildings = { colliderSkip: new Set(), renderSkip: new Set() };
  if (!net) return out;
  const grid = sampleGrid(net);
  for (const b of records) {
    const rings = b.surfaces.filter((s) => s.kind === 'ground').map((s) => s.ringsWF[0] ?? []);
    let [x0, z0, x1, z1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1e18, -1e18];
    for (const r of rings)
      for (let i = 0; i < r.length; i += 3)
        [x0, z0, x1, z1] = [
          Math.min(x0, r[i] as number),
          Math.min(z0, r[i + 2] as number),
          Math.max(x1, r[i] as number),
          Math.max(z1, r[i + 2] as number),
        ];
    let n = 0;
    for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID) && n < MIN_SAMPLES; gx++)
      for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID) && n < MIN_SAMPLES; gz++) {
        const a = grid.get(`${gx},${gz}`) ?? [];
        for (let i = 0; i < a.length && n < MIN_SAMPLES; i += 2)
          if (rings.some((r) => inRing(a[i] as number, a[i + 1] as number, r))) n++;
      }
    if (n < MIN_SAMPLES) continue;
    out.colliderSkip.add(b.gmlId);
    if (CANOPY_USAGE.has(b.usage ?? '') && (b.measuredHeightM ?? Number.POSITIVE_INFINITY) <= CANOPY_MAX_M)
      out.renderSkip.add(b.gmlId);
  }
  return out;
}
