// 관심점 → 원하는 셀 집합: 모드·고도별 셀 수, 히스테리시스, 진행 방향 가중, 상주 한도. see docs/06-world-streaming.md §3, ADR-0021
import { type CellKey, cellIdString, type ModeId } from '@sanpo/core';
import { cellBoundsWF } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STREAMING_CONFIG as CFG } from '../src/internal/config.ts';
import { preparePoints } from '../src/internal/geometry.ts';
import {
  computeDesired,
  countByLevel,
  l0RadiusM,
  l1RadiusM,
  nearestDistanceM,
  planEvictions,
} from '../src/internal/interest.ts';
import { bruteCircleCount, frame, key, point, synthIndex, worldMiniIndex } from './helpers.ts';

const IC = CFG.interest;
const INDEX = synthIndex();
const ALL: ReadonlySet<CellKey> = new Set([0, 1, 2, 3].flatMap((l) => INDEX.keysAt(l as 0 | 1 | 2 | 3)));
const NONE: ReadonlySet<CellKey> = new Set();
// 셀 경계와 겹치지 않는 임의 위치(L0_0_-1 안).
const P = { x: 100, z: -60 };

function desired(mode: ModeId, altM: number, resident = NONE, extra = {}) {
  return computeDesired(INDEX, frame(mode, [point('camera', P.x, altM, P.z, extra)]), resident, IC);
}

describe('radii', () => {
  it('L0 radius by mode, freecam altitude term, quality scale and 768 m clamp', () => {
    const r = (mode: ModeId, alt = 0, tier: 'low' | 'high' | 'ultra' = 'high') => l0RadiusM({ mode, tier }, alt, IC);
    expect([r('walk'), r('cycle'), r('drive'), r('train'), r('transition')]).toEqual([384, 448, 640, 768, 384]);
    expect([r('freecam', 0), r('freecam', 100), r('freecam', 300)]).toEqual([384, 434, 534]);
    expect(r('walk', 0, 'low')).toBe(288);
    expect(r('drive', 0, 'ultra')).toBe(768); // 800 → 클램프
    expect(r('walk', 500)).toBe(384); // 고도항은 freecam만
  });

  it('L1 radius extends above 300 m and clamps at 3.5 km', () => {
    expect([0, 300, 400, 800, 1000].map((a) => l1RadiusM(a, IC))).toEqual([3000, 3000, 3100, 3500, 3500]);
  });
});

describe('desired cell counts (load / max resident = load ∪ keep with everything resident)', () => {
  // [모드, 고도, L0..L3 로드 수, L0..L3 최대 상주 수] — P 위치 기준. 다른 위치 범위는 ADR-0021 표.
  const table: [ModeId, number, number[], number[]][] = [
    ['walk', 0, [14, 37, 36, 16], [22, 58, 60, 16]],
    ['cycle', 0, [17, 37, 36, 16], [23, 58, 60, 16]],
    ['drive', 0, [30, 37, 36, 16], [43, 58, 60, 16]],
    ['train', 0, [42, 37, 36, 16], [60, 58, 60, 16]],
    ['freecam', 0, [14, 37, 36, 16], [22, 58, 60, 16]],
    ['freecam', 100, [17, 37, 36, 16], [23, 58, 60, 16]],
    ['freecam', 300, [23, 37, 36, 16], [31, 58, 60, 16]],
    ['freecam', 350, [9, 40, 36, 16], [36, 60, 60, 16]],
    ['freecam', 500, [9, 47, 36, 16], [25, 62, 60, 16]],
    ['freecam', 1000, [9, 52, 36, 16], [25, 79, 60, 16]],
  ];
  it.each(table)('%s @ %i m', (mode, alt, load, resident) => {
    const d = desired(mode, alt);
    expect(countByLevel(d.load)).toEqual(load);
    expect(d.keep.size).toBe(0); // 상주 셀이 없으면 유지 대상도 없다
    const all = desired(mode, alt, ALL);
    expect(countByLevel([...all.load, ...all.keep])).toEqual(resident);
    // 한도(소프트 리밋) ≥ 최대 상주 수.
    for (const [l, n] of resident.entries()) expect(n).toBeLessThanOrEqual(CFG.residentMax[l] ?? 0);
  });

  it('circle counts match a brute-force scan of every indexed cell', () => {
    for (const mode of ['walk', 'cycle', 'drive', 'train'] as const) {
      const r0 = l0RadiusM({ mode, tier: 'high' }, 0, IC);
      const d = desired(mode, 0, ALL);
      const [n0, n1, n2] = countByLevel(d.load);
      expect(n0).toBe(bruteCircleCount(INDEX, 0, P.x, P.z, r0));
      expect(n1).toBe(bruteCircleCount(INDEX, 1, P.x, P.z, 3000));
      expect(n2).toBe(bruteCircleCount(INDEX, 2, P.x, P.z, 12_000));
      expect(countByLevel([...d.load, ...d.keep])[0]).toBe(bruteCircleCount(INDEX, 0, P.x, P.z, r0 * 1.25));
    }
  });

  it('high altitude keeps only the 3×3 under the camera for L0', () => {
    const d = desired('freecam', 600);
    const l0 = [...d.load].filter((k) => k < 2 ** 32).map(cellIdString);
    expect(l0.sort()).toEqual(
      ['L0_-1_-2', 'L0_0_-2', 'L0_1_-2', 'L0_-1_-1', 'L0_0_-1', 'L0_1_-1', 'L0_-1_0', 'L0_0_0', 'L0_1_0'].sort(),
    );
  });

  it('uses ground height for altitude (camera 350 m T.P. over 60 m ground = 290 m AGL → circle)', () => {
    const f = { ...frame('freecam', [point('camera', P.x, 350, P.z)]), groundHeightAt: () => 60 };
    expect(countByLevel(computeDesired(INDEX, f, NONE, IC).load)[0]).toBe(23);
  });

  it('only loads cells that exist in cells.idx and always loads every L3 cell', () => {
    const mini = worldMiniIndex();
    const spawn = frame('walk', [point('player', -22.3, 30, 8.6)]);
    expect([...computeDesired(mini, spawn, NONE, IC).load].map(cellIdString).sort()).toEqual(
      ['L0_-1_-1', 'L0_-1_0', 'L0_0_-1', 'L0_0_0'].sort(),
    );
    expect(countByLevel(computeDesired(INDEX, frame('walk', []), NONE, IC).load)).toEqual([0, 0, 0, 16]);
  });
});

describe('hysteresis', () => {
  const near = key(0, 1, 0); // 수평 거리 hypot(156, 60) ≈ 167 m → 로드 반경 안
  /** P와의 수평 거리가 (dMin, dMax]인 첫 L0 셀. */
  function l0At(dMin: number, dMax: number): CellKey {
    for (const k of INDEX.keysAt(0)) {
      const b = cellBoundsWF(k);
      const d = Math.hypot(Math.max(b.minX - P.x, 0, P.x - b.maxX), Math.max(b.minZ - P.z, 0, P.z - b.maxZ));
      if (d > dMin && d <= dMax) return k;
    }
    throw new Error('no cell');
  }

  it('keeps a resident cell in the band, never requests it, and drops it past the release radius', () => {
    const inBand = l0At(384, 480);
    const outside = l0At(480, 600);
    const fresh = desired('walk', 0);
    expect(fresh.load.has(inBand)).toBe(false);
    expect(fresh.keep.has(inBand)).toBe(false);
    const held = desired('walk', 0, new Set([inBand, outside, near]));
    expect(held.keep.has(inBand)).toBe(true);
    expect(held.keep.has(outside)).toBe(false);
    expect(held.load.has(near)).toBe(true);
    expect(held.keep.has(near)).toBe(false); // load와 keep은 서로소
  });

  it('altitude switch has hysteresis: circle cells survive 300–375 m, evicted above 375 m except 5×5', () => {
    const lowResident = new Set(desired('freecam', 290).load);
    const at350 = desired('freecam', 350, lowResident);
    expect(countByLevel([...at350.load, ...at350.keep])[0]).toBe(countByLevel(lowResident)[0]);
    const at400 = desired('freecam', 400, lowResident);
    const kept0 = countByLevel([...at400.load, ...at400.keep])[0];
    expect(kept0).toBeLessThanOrEqual(25);
    expect(countByLevel(at400.load)[0]).toBe(9);
  });
});

describe('train direction weighting (L0 only)', () => {
  const vel = { x: 0, y: 0, z: -25 }; // 북쪽으로 25 m/s
  it('shrinks the L0 set behind the train but not ahead, and leaves L1/L2 alone', () => {
    const moving = desired('train', 0, NONE, { velWF: vel });
    const still = desired('train', 0);
    const ahead = key(0, 0, -4); // 북쪽 708 m (가중 없음)
    const behind = key(0, 0, 2); // 남쪽 572 m × 1.5 = 858 m > 768
    expect(still.load.has(ahead) && still.load.has(behind)).toBe(true);
    expect(moving.load.has(ahead)).toBe(true);
    expect(moving.load.has(behind)).toBe(false);
    expect(countByLevel(moving.load)).toEqual([35, 37, 36, 16]);
    // 5 m/s 이하는 가중 없음.
    expect(countByLevel(desired('train', 0, NONE, { velWF: { x: 0, y: 0, z: -5 } }).load)[0]).toBe(42);
  });
});

describe('planEvictions (soft limit)', () => {
  const f = frame('walk', [point('player', P.x, 0, P.z)]);
  it('evicts everything outside load ∪ keep', () => {
    const far = key(0, 30, 30);
    const d = computeDesired(INDEX, f, new Set([far]), IC);
    expect(planEvictions([far], d, f, CFG)).toEqual({ evict: [far], overLimit: [0, 0, 0, 0] });
  });

  it('over the limit, drops band cells farthest-first and never load-radius cells', () => {
    const resident = new Set(computeDesired(INDEX, f, ALL, IC).keep);
    for (const k of computeDesired(INDEX, f, NONE, IC).load) resident.add(k);
    const d = computeDesired(INDEX, f, resident, IC);
    const cfg = { ...CFG, residentMax: [16, 80, 64, 16] as const };
    const plan = planEvictions(resident, d, f, cfg);
    // L0: 로드 14 + 유지 8 = 22 → 한도 16 → 유지 셀 6개 해제(가장 먼 것부터).
    expect(plan.evict).toHaveLength(6);
    for (const k of plan.evict) expect(d.keep.has(k)).toBe(true);
    const dist = (k: CellKey) => nearestDistanceM(k, preparePoints(f, IC));
    const survivors = [...d.keep].filter((k) => k < 2 ** 32 && !plan.evict.includes(k));
    expect(Math.min(...plan.evict.map(dist))).toBeGreaterThanOrEqual(Math.max(...survivors.map(dist)));
    const tight = planEvictions(resident, d, f, { ...CFG, residentMax: [10, 80, 64, 16] });
    expect(tight.evict).toHaveLength(8);
    expect(tight.overLimit).toEqual([4, 0, 0, 0]);
  });
});
