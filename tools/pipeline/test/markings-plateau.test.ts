// PLATEAU 道路標示 우선(M06 사전 2, ADR-0058): frn 파서(1xxx만·lod3 면), 줄무늬/영역 분류·보행 방향, OSM 덮임 판정, 보정 적용, 삼각형 데칼 CCW.
import { describe, expect, it } from 'vitest';
import { type MarkingRecord, parseMarkingsString } from '../src/readers/plateau/frn-markings.ts';
import { emptyDecals, type MarkCtx, triangle } from '../src/stages/derive/markings/common.ts';
import { applyCrossingCorrections } from '../src/stages/derive/markings/corrections.ts';
import {
  coveringBand,
  isStriped,
  plateauCrosswalkBand,
  plateauMarks,
  topTriangles,
} from '../src/stages/derive/markings/plateau.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

const quad = (x0: number, z0: number, x1: number, z1: number): number[][] => [
  [x0, 0, z0, x1, 0, z0, x1, 0, z1],
  [x0, 0, z0, x1, 0, z1, x0, 0, z1],
];

/** 보행 방향 = +x(동), 막대 = z 방향 길이 w, 폭 0.45 m, 0.9 m 간격, 길이 L. */
function zebra(L: number, w: number): MarkingRecord {
  const polys: number[][] = [];
  for (let x = 0; x + 0.45 <= L; x += 0.9) polys.push(...quad(x, -w / 2, x + 0.45, w / 2));
  return { layer: 'markings', id: 'z', function: '1110', polygonsWF: polys, source: 't' };
}

describe('PLATEAU road markings', () => {
  it('parses only 1xxx road markings with lod3 surfaces', () => {
    const pos = '35.66 139.70 16.0 35.66 139.7001 16.0 35.6601 139.7001 16.0 35.66 139.70 16.0';
    const feat = (id: string, fn: string) =>
      `<frn:CityFurniture gml:id="${id}"><frn:function codeSpace="x">${fn}</frn:function><frn:lod3Geometry><gml:MultiSurface><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${pos}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></frn:lod3Geometry></frn:CityFurniture>`;
    const xml = `<core:CityModel>${feat('a', '1110')}${feat('b', '4800')}${feat('c', '1120')}</core:CityModel>`;
    const out = parseMarkingsString(xml, 'src');
    expect(out.map((r) => [r.id, r.function])).toEqual([
      ['a', '1110'],
      ['c', '1120'],
    ]);
    expect(out[0]?.polygonsWF[0]?.length).toBe(9);
  });

  it('classifies striped vs area crosswalks and recovers the walking direction', () => {
    const z = zebra(12, 6);
    expect(isStriped(topTriangles(z))).toBe(true);
    const band = plateauCrosswalkBand(z);
    expect(Math.abs(band?.u[0] ?? 0)).toBeCloseTo(1, 3);
    expect(band?.half).toBeCloseTo(3, 3);
    const area: MarkingRecord = { ...z, id: 'a', polygonsWF: quad(0, -3, 12, 3) };
    expect(isStriped(topTriangles(area))).toBe(false);
    // 영역형 + OSM 힌트(남북 보행) → 힌트 방향.
    const hinted = plateauCrosswalkBand(area, [0, 1]);
    expect(hinted?.u).toEqual([0, 1]);
  });

  it('covers an OSM crossing segment lying on the PLATEAU band and not a parallel one 10 m away', () => {
    const pm = plateauMarks([zebra(12, 6)], []);
    const onRoad = () => true;
    expect(coveringBand(pm, [-1, 0.8], [13, 0.8], onRoad)).toBeDefined();
    expect(coveringBand(pm, [-1, 10], [13, 10], onRoad)).toBeUndefined();
  });

  it('applies shift/width corrections to OSM crossings without touching others', () => {
    const r: OsmRecord = {
      id: 'w1',
      geom: 'line',
      tags: { footway: 'crossing' },
      rings: [[0, 0, 10, 0]],
    } as unknown as OsmRecord;
    const other: OsmRecord = { ...r, id: 'w2' };
    const [a, b] = applyCrossingCorrections([r, other], [{ way: 'w1', shift: [1, -2], widthM: 8 }]);
    expect(a?.rings[0]).toEqual([1, -2, 11, -2]);
    expect(a?.tags.width).toBe('8');
    expect(b).toBe(other);
    const [rot] = applyCrossingCorrections([r], [{ way: 'w1', rotateDeg: 90 }]);
    // 위에서 반시계 90°: 동(+x) → 북(−z).
    expect(rot?.rings[0]?.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([5, 5, 5, -5]);
  });

  it('emits terrain-following triangles counter-clockwise from above and subdivides long edges', () => {
    const c: MarkCtx = {
      out: emptyDecals(),
      ox: 0,
      oz: 0,
      terrainAt: () => 1,
      roads: { classify: () => 'road' } as unknown as MarkCtx['roads'],
      inIntersection: () => false,
    };
    // 시계 방향(위에서) 입력 → CCW로 뒤집어 법선 +Y.
    const n = triangle(c, [0, 0], [0, 4], [4, 0], 0);
    expect(n).toBeGreaterThan(4);
    const p = c.out.pos;
    for (let t = 0; t < c.out.idx.length; t += 3) {
      const [i, j, k] = [c.out.idx[t], c.out.idx[t + 1], c.out.idx[t + 2]] as [number, number, number];
      const cross =
        (p[j * 3]! - p[i * 3]!) * (p[k * 3 + 2]! - p[i * 3 + 2]!) -
        (p[k * 3]! - p[i * 3]!) * (p[j * 3 + 2]! - p[i * 3 + 2]!);
      expect(cross).toBeLessThan(0);
    }
    expect(p[1]).toBeCloseTo(1.02, 6);
  });
});
