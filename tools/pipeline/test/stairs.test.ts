// M05-T08: 교량 상판·높이 계단 명세(stairsOf — 상판 가장자리 자르기·착지판·타당성), 계단 메시·램프 프록시(emitStair), 교량 면 걷어내기(carveSurface).
import { JCOL_FLAG } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { BridgeRecord, SurfaceRecord } from '../src/readers/plateau/types.ts';
import { emitStair, RISER_MAX_M } from '../src/stages/build/overrides/bridges.ts';
import { carveSurface } from '../src/stages/build/overrides/carve.ts';
import { LStream } from '../src/stages/build/overrides/geom.ts';
import { deckHeightAt, decksOf, STAIR_MAX_RISE_M, stairsOf, walkwaysOf } from '../src/stages/derive/stairs.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

const surf = (kind: SurfaceRecord['kind'], ring: number[]): SurfaceRecord =>
  ({ kind, gmlId: null, ringsWF: [ring] }) as unknown as SurfaceRecord;

/** 상판 x 0–20, z −2–2, 높이 6 + 남쪽 가장자리(z = −2) 난간 한 장(20 m 폴리곤 1개). */
const DECK = [0, 6, -2, 20, 6, -2, 20, 6, 2, 0, 6, 2];
const PARAPET = [0, 6, -2, 20, 6, -2, 20, 7.1, -2, 0, 7.1, -2];
const BRIDGE = {
  layer: 'bridges',
  gmlId: 'brid_t',
  surfaces: [surf('roof', DECK), surf('wall', PARAPET)],
} as unknown as BridgeRecord;

const steps = (id: string, pts: [number, number][], tags: Record<string, string> = {}): OsmRecord => ({
  layer: 'osm',
  id,
  geom: 'line',
  rings: [pts.flat()],
  tags: { highway: 'steps', ...tags },
  source: 'osm-kanto' as OsmRecord['source'],
});

const OSM = [
  steps('w1', [
    [10, -12],
    [10, -1],
  ]),
  steps('w2', [
    [50, -12],
    [50, -20],
  ]), // 두 끝 모두 지형
  steps('w3', [
    [5, -4.5],
    [5, -1],
  ]), // 3.5 m에 6 m 오름(> 45°) — 다른 교량에 잘못 붙은 것
  steps(
    'w4',
    [
      [15, -12],
      [15, -1],
    ],
    { tunnel: 'yes' },
  ),
];
const CELL = { x0: 0, z0: -256 };
const ground = () => 0;

describe('stairs: decks · stairsOf', () => {
  const decks = decksOf([BRIDGE]);

  it('상판 = 평평한 roof 면, 2 m 안 스냅', () => {
    expect(decks.length).toBe(1);
    expect(deckHeightAt(decks, 10, 0)).toBe(6);
    expect(deckHeightAt(decks, 10, -3.5)).toBe(6);
    expect(deckHeightAt(decks, 10, -4.5)).toBeUndefined();
    expect(deckHeightAt(decks, 10, -3, 0)).toBeUndefined();
  });

  it('상판에 닿는 계단만(지형끼리·터널·45° 초과 제외), 아래 → 위, 상판 가장자리에서 자름, 착지판 0.5 m', () => {
    const st = stairsOf(OSM, decks, ground, CELL);
    expect(st.map((s) => s.id)).toEqual(['w1']);
    const s = st[0];
    expect(s?.y0).toBe(0);
    expect(s?.y1).toBe(6);
    expect(s?.path[0]).toEqual([10, -12]);
    const end = s?.path[s.path.length - 1] as [number, number];
    expect(end[1]).toBeGreaterThan(-2.01);
    expect(end[1]).toBeLessThan(-1.7);
    expect(s?.landing).toBe(0.5);
    expect(s?.width).toBe(2);
    expect(STAIR_MAX_RISE_M).toBe(10);
  });

  it('소유 = 선 중점 셀, cell 없으면 이웃 포함 전부(교량 면 걷어내기용)', () => {
    expect(stairsOf(OSM, decks, ground, { x0: 256, z0: -256 })).toEqual([]);
    expect(stairsOf(OSM, decks, ground).map((s) => s.id)).toEqual(['w1']);
    const w = walkwaysOf({ bridges: [BRIDGE], osm: OSM }, [0, 0, -256], ground);
    expect(w.stairs.length).toBe(1);
    expect(w.corridors.length).toBe(1);
    expect(walkwaysOf({ osm: OSM, bridgesAround: [BRIDGE] }, [0, 0, -256], ground).corridors).toEqual([]);
  });
});

describe('stairs: emitStair', () => {
  const [spec] = stairsOf(OSM, decksOf([BRIDGE]), ground, CELL);
  if (!spec) throw new Error('no stair');
  const s = new LStream();
  s.plainUv = true;
  const shapes: Parameters<typeof emitStair>[1] = [];
  const n = emitStair(s, shapes, spec, [0, 0, -256]);

  it('챌면 ≤ 0.20 m, 디딤판·챌면·옆 판·손스침·착지판 렌더', () => {
    expect(n).toBe(Math.ceil(6 / RISER_MAX_M));
    expect(6 / n).toBeLessThanOrEqual(RISER_MAX_M + 1e-9);
    expect(s.tris).toBeGreaterThan(n * 4);
    const ys = s.pos.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeGreaterThan(-0.6);
    expect(Math.max(...ys)).toBeLessThan(6 + 1.2);
  });

  it('충돌 = 램프 프록시(flags bit0, 모든 삼각형 위를 향함, 위 끝 + 착지판 평평) + 양옆 벽 박스', () => {
    const ramp = shapes[0];
    if (ramp?.kind !== 'triMesh') throw new Error('ramp');
    expect(ramp.flags & JCOL_FLAG.rampProxy).toBe(JCOL_FLAG.rampProxy);
    const v = ramp.vertices;
    for (let i = 0; i < ramp.indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => (ramp.indices[i + k] as number) * 3) as [number, number, number];
      const e1 = [
        (v[b] as number) - (v[a] as number),
        (v[b + 1] as number) - (v[a + 1] as number),
        (v[b + 2] as number) - (v[a + 2] as number),
      ];
      const e2 = [
        (v[c] as number) - (v[a] as number),
        (v[c + 1] as number) - (v[a + 1] as number),
        (v[c + 2] as number) - (v[a + 2] as number),
      ];
      const ny = (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number);
      expect(ny).toBeGreaterThan(0);
    }
    const ys = Array.from(v).filter((_, i) => i % 3 === 1);
    expect(ys.slice(-4)).toEqual([6, 6, 6, 6]);
    const boxes = shapes.filter((q) => q.kind === 'box');
    expect(boxes.length).toBe(n * 2);
  });
});

describe('stairs: carveSurface', () => {
  const corr = stairsOf(OSM, decksOf([BRIDGE]), ground);

  it('상판 윗면은 그대로, 계단 위 끝을 가로지르는 난간은 계단 폭 + 0.2 m 띠만 잘라 두 조각', () => {
    expect(carveSurface(corr, 'roof', DECK)).toBeNull();
    const cut = carveSurface(corr, 'wall', PARAPET);
    if (!cut || cut === 'drop') throw new Error('expected pieces');
    expect(cut.length).toBe(2);
    for (const r of cut)
      for (let i = 0; i < r.length; i += 3) expect(Math.abs((r[i] as number) - 10)).toBeGreaterThanOrEqual(1.1 - 1e-6);
    const xs = cut.flatMap((r) => r.filter((_, i) => i % 3 === 0));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(20);
  });

  it('통로 안 면(PLATEAU 계단 블록 벽·비탈 지붕)은 통째로 걷어내고, 통로 밖 면은 그대로', () => {
    const blockWall = [9, 0, -8, 9, 0, -6, 9, 4, -6, 9, 4, -8];
    expect(carveSurface(corr, 'wall', blockWall)).toBe('drop');
    expect(carveSurface(corr, 'roof', [9, 2, -9, 11, 2, -9, 11, 4, -6, 9, 4, -6])).toBe('drop');
    expect(carveSurface(corr, 'wall', [30, 0, -8, 30, 0, -6, 30, 4, -6, 30, 4, -8])).toBeNull();
    expect(carveSurface([], 'wall', blockWall)).toBeNull();
  });
});
