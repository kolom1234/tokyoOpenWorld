// 우선순위 점수: 발밑 셀 최우선, 부모 선행, 뷰 쐐기·teleport·weight 배율, 결정론. see docs/06-world-streaming.md §4, ADR-0021
import { type CellKey, cellIdString, unpackCellKey } from '@sanpo/core';
import { cellBoundsWF, cellOf, parentOf } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STREAMING_CONFIG as CFG } from '../src/internal/config.ts';
import { inViewWedge, preparePoints } from '../src/internal/geometry.ts';
import { computeDesired } from '../src/internal/interest.ts';
import { rankCells, scoreCells } from '../src/internal/priority.ts';
import { frame, key, point, synthIndex, worldMiniIndex } from './helpers.ts';

const INDEX = synthIndex();
const NONE: ReadonlySet<CellKey> = new Set();
const NORTH = { x: 0, y: 0, z: -1 };

function candidates(f: ReturnType<typeof frame>): CellKey[] {
  return [...computeDesired(INDEX, f, NONE, CFG.interest).load];
}

describe('foot cell', () => {
  it('ranks the player L0 cell first even with parents pending, a camera elsewhere and a view wedge away', () => {
    const player = point('player', 1000, 0, 500);
    const camera = point('camera', 1020, 5, 510, { forward: { x: 1, y: 0, z: 0 } }); // 동쪽을 봄
    const f = frame('drive', [player, camera]);
    const ranked = rankCells(candidates(f), f, CFG);
    expect(ranked[0]?.key).toBe(cellOf(0, 1000, 500));
    expect(ranked[0]?.score).toBe(CFG.priority.footScore);
    expect(ranked.slice(1).every((r) => r.score >= 0)).toBe(true);
  });

  it('a teleport destination is also a foot cell', () => {
    const f = frame('walk', [point('player', 0, 0, 0), point('teleport', 5000, 0, -3000)]);
    const scores = scoreCells([cellOf(0, 0, 0), cellOf(0, 5000, -3000), cellOf(0, 300, 0)], f, CFG);
    expect([...scores]).toEqual([-1, -1, expect.any(Number)]);
  });

  it('camera-only (freecam) has no foot cell — the camera cell still comes first after its parents', () => {
    const f = frame('freecam', [point('camera', 100, 50, -60, { forward: NORTH })]);
    const ranked = rankCells(candidates(f), f, CFG);
    expect(ranked.map((r) => cellIdString(r.key)).slice(0, 4)).toEqual(['L3_0_-1', 'L2_0_-1', 'L1_0_-1', 'L0_0_-1']);
  });
});

describe('parent first', () => {
  it('every candidate scores after its pending parent (boot order L3 → L2 → L1 → L0 after the foot cell)', () => {
    const f = frame('walk', [point('player', 100, 0, -60), point('camera', 104, 2, -55, { forward: NORTH })]);
    const cand = candidates(f);
    const ranked = rankCells(cand, f, CFG);
    const pos = new Map(ranked.map((r, i) => [r.key, i]));
    const scores = new Map(ranked.map((r) => [r.key, r.score]));
    let checked = 0;
    for (const k of cand) {
      const p = parentOf(k);
      if (p === null || !pos.has(p) || k === cellOf(0, 100, -60)) continue;
      expect(scores.get(p)).toBeLessThan(scores.get(k) ?? Number.NaN);
      expect(pos.get(p)).toBeLessThan(pos.get(k) ?? -1);
      checked++;
    }
    expect(checked).toBeGreaterThan(80);
    expect(ranked.slice(0, 4).map((r) => cellIdString(r.key))).toEqual(['L0_0_-1', 'L3_0_-1', 'L2_0_-1', 'L1_0_-1']);
  });

  it('a far child is pulled behind its parent even if the parent itself is far', () => {
    const f = frame('walk', [point('player', 0, 0, 0)]);
    // 가까운 L0 자식(부모 L1_0_0이 후보) vs 부모 없는 목록.
    const child = key(0, 1, 1);
    const alone = scoreCells([child], f, CFG)[0] ?? Number.NaN;
    const withParent = scoreCells([child, key(1, 0, 0)], f, CFG);
    expect(withParent[0]).toBeGreaterThanOrEqual((withParent[1] ?? 0) + CFG.priority.parentEpsilon);
    expect(withParent[0]).toBeGreaterThanOrEqual(alone);
    // 부모가 후보에 없으면(이미 요청됨·live·failed) 제약 없음.
    expect(alone).toBeCloseTo(Math.hypot(256, 256) / 256, 9);
  });
});

describe('score factors', () => {
  const origin = frame('walk', [point('camera', 128, 0, 0, { forward: NORTH })]);
  const ahead = key(0, 0, -2); // 북쪽
  const behind = key(0, 0, 1); // 남쪽 — 수평 거리 동일(256 m)
  it('in-view cells get ×0.5', () => {
    const [a, b] = scoreCells([ahead, behind], origin, CFG);
    expect(a).toBeCloseTo((b ?? 0) * CFG.priority.inViewFactor, 9);
  });

  it('teleport points ×0.05 and weight divide the distance', () => {
    const f = frame('walk', [point('camera', 0.5, 0, 0.5), point('teleport', 4000.5, 0, 0.5)]);
    const nearTeleport = key(0, 17, 0); // 텔레포트 셀(15) 동쪽 2칸
    const s = scoreCells([nearTeleport], f, CFG)[0] ?? 0;
    const d = 4352 - 4000.5; // 텔레포트~셀 AABB 거리
    expect(s).toBeCloseTo((d * CFG.priority.teleportFactor) / 256, 9);
    const heavy = frame('walk', [point('camera', 128, 0, 0, { weight: 4 })]);
    expect(scoreCells([behind], heavy, CFG)[0]).toBeCloseTo(256 / 4 / 256, 9);
  });

  it('is deterministic: ties break by key, independent of input order', () => {
    const f = frame('walk', [point('player', 128, 0, 128)]);
    const cand = candidates(f);
    const a = rankCells(cand, f, CFG);
    const b = rankCells([...cand].reverse(), f, CFG);
    expect(b).toEqual(a);
  });

  it('world-mini: foot cell L0_-1_0 first at the spawn', () => {
    const mini = worldMiniIndex();
    const f = frame('walk', [point('player', -22.3, 30, 8.6), point('camera', -22.3, 32, 12.6, { forward: NORTH })]);
    const cand = [...computeDesired(mini, f, NONE, CFG.interest).load];
    const ranked = rankCells(cand, f, CFG).map((x) => cellIdString(x.key));
    expect(ranked[0]).toBe('L0_-1_0');
    expect(ranked).toHaveLength(4);
  });
});

describe('inViewWedge', () => {
  const [cam] = preparePoints(frame('freecam', [point('camera', 0, 0, 0, { forward: NORTH })]), CFG.interest);
  if (!cam) throw new Error('no point');
  const half = (30 * Math.PI) / 180;
  const box = (minX: number, minZ: number, maxX: number, maxZ: number) => ({ minX, minZ, maxX, maxZ });
  it('corner inside, behind, apex inside', () => {
    expect(inViewWedge(box(-10, -600, 10, -500), cam, half)).toBe(true);
    expect(inViewWedge(box(-10, 500, 10, 600), cam, half)).toBe(false);
    expect(inViewWedge(box(-5, -5, 5, 5), cam, half)).toBe(true);
    expect(inViewWedge(box(400, -100, 500, -50), cam, half)).toBe(false); // 동쪽 옆
  });
  it('wide box straddling the wedge with every corner outside is still in view (boundary rays)', () => {
    expect(inViewWedge(box(-1000, -600, 1000, -500), cam, half)).toBe(true);
  });
  it('no forward → never in view', () => {
    const [p] = preparePoints(frame('walk', [point('player', 0, 0, 0)]), CFG.interest);
    expect(p && inViewWedge(cellBoundsWF(key(0, 0, -1)), p, half)).toBe(false);
    expect(unpackCellKey(key(0, 0, -1)).iz).toBe(-1);
  });
});
