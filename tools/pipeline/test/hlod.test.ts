// HLOD(M02-T04): 자식 16영역 분할(모든 프리미티브 child ∈ 0..15, 자식 지형 = 부모 정사각형 전체, 건물 보존), 박스·매스 기하,
// L1 simplify(25%), 원경 레벨 예산, 기하 유틸(볼록 껍질·최소 사각형·PNG·dem_png). see docs/04-data-pipeline.md §4.5, docs/05 §4
import { deflateSync } from 'node:zlib';
import { type CellKey, packCellKey } from '@sanpo/core';
import { cellBoundsWF } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import { convexHull, minAreaRect, polygonArea } from '../src/lib/geom2d.ts';
import { decodeGlb } from '../src/lib/gltf.ts';
import { decodePng } from '../src/lib/png.ts';
import { overrideSetOf } from '../src/stages/build/overrides/index.ts';
import { accumulateMasses, addFarBox, addMass } from '../src/stages/hlod/boxes.ts';
import { CHILDREN, childKeys, emptyChildren, encodeHlod, MeshStream } from '../src/stages/hlod/child-split.ts';
import { demPngHeight, type FarDem, farDemHeight } from '../src/stages/hlod/dem-far.ts';
import {
  type FarBuilding,
  farBuildingOf,
  farFromRow,
  farToLine,
  nightFlags,
} from '../src/stages/hlod/far-buildings.ts';
import { addSimplifiedBuildings, buildL1 } from '../src/stages/hlod/l1.ts';
import { buildL2, L2_PARAMS } from '../src/stages/hlod/l2.ts';
import { buildL3 } from '../src/stages/hlod/l3.ts';
import { boxBuilding } from './build-fixtures.ts';

/** 완만한 경사 원경 DEM(해석적): h = 30 + 0.002x − 0.001z. */
function slopeDem(minX: number, minZ: number, size: number, step: number): FarDem {
  const n = Math.round(size / step) + 1;
  const values = new Float32Array(n * n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) values[r * n + c] = 30 + 0.002 * (minX + c * step) - 0.001 * (minZ + r * step);
  return { x0: minX, z0: minZ, step, width: n, height: n, values };
}

function far(id: string, cx: number, cz: number, w: number, d: number, h: number, usage = '402'): FarBuilding {
  return {
    id,
    cx,
    cz,
    y0: 30,
    h,
    area: w * d,
    obb: { cx, cz, ux: 1, uz: 0, hu: w / 2, hv: d / 2 },
    usage,
    storeys: null,
  };
}

/** 디코드된 hlod glb 검사: 정점 _CHILD 분포·자식별 지형 범위(양자화 역변환)·건물 삼각형 수. */
async function inspect(glb: Uint8Array, parent: CellKey) {
  const d = await decodeGlb(glb);
  const pb = cellBoundsWF(parent);
  const kids = childKeys(parent);
  const terrainChildren = new Set<number>();
  let buildingTris = 0;
  let bad = 0;
  const [tx, , tz] = d.translation;
  const s = d.scale[0];
  for (const p of d.primitives) {
    const child = p.attributes._CHILD?.array as Uint8Array | undefined;
    if (!child) {
      bad++;
      continue;
    }
    if (p.materialId === 'facade_default') buildingTris += p.indices.length / 3;
    if (p.materialId !== 'terrain_ground') continue;
    const q = p.attributes.POSITION?.array as Uint16Array;
    const box = new Map<number, [number, number, number, number]>();
    for (let v = 0; v < child.length; v++) {
      const c = child[v] as number;
      if (c >= CHILDREN) bad++;
      terrainChildren.add(c);
      const x = tx + (q[v * 3] as number) * s + pb.minX;
      const z = tz + (q[v * 3 + 2] as number) * s + pb.minZ;
      const b = box.get(c) ?? [Infinity, -Infinity, Infinity, -Infinity];
      box.set(c, [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]);
    }
    for (const [c, [x0, x1, z0, z1]] of box) {
      const cb = cellBoundsWF(kids[c] as CellKey);
      const tol = s * 1.5;
      if (
        Math.abs(x0 - cb.minX) > tol ||
        Math.abs(x1 - cb.maxX) > tol ||
        Math.abs(z0 - cb.minZ) > tol ||
        Math.abs(z1 - cb.maxZ) > tol
      )
        bad++;
    }
  }
  return { bad, terrainChildren, buildingTris, primitives: d.primitives.length };
}

describe('geom2d / png / dem_png', () => {
  it('convex hull + min-area rectangle recover a rotated rectangle', () => {
    const a = 0.3;
    const pts: [number, number][] = [];
    for (const [u, v] of [
      [-10, -4],
      [10, -4],
      [10, 4],
      [-10, 4],
      [0, 0],
      [3, 1],
    ] as const)
      pts.push([u * Math.cos(a) - v * Math.sin(a) + 5, u * Math.sin(a) + v * Math.cos(a) - 2]);
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBeCloseTo(160, 6);
    const o = minAreaRect(hull);
    expect(o.hu * o.hv * 4).toBeCloseTo(160, 6);
    expect([o.cx, o.cz].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([5, -2]);
  });

  it('decodes an 8-bit RGB PNG with filters and the GSI dem_png height code', () => {
    const w = 3;
    const rows = [
      [0, 0, 0, 1, 0, 1, 0, 0x80, 0, 0], // filter 0: (0,1,0) (0x80,0,0) → NA 이후 ↓
      [2, 0, 0, 1, 0, 0, 0, 0, 0, 0], // filter 2(Up): 위 + 0
    ];
    const raw = Uint8Array.from(rows.flatMap((r) => r.slice(0, 1 + w * 3)));
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const chunk = (type: string, body: Buffer) => {
      const b = Buffer.alloc(12 + body.length);
      b.writeUInt32BE(body.length, 0);
      b.write(type, 4, 'ascii');
      body.copy(b, 8);
      return b;
    };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const d = decodePng(png);
    expect([d.width, d.height, d.channels]).toEqual([3, 2, 3]);
    expect([...d.data.subarray(9, 18)]).toEqual([...d.data.subarray(0, 9)].map((v, i) => (i === 2 ? v + 1 : v)));
    expect(demPngHeight(0, 0, 1)).toBeCloseTo(0.01, 9);
    expect(demPngHeight(0x80, 0, 0)).toBeNaN();
    expect(demPngHeight(0xff, 0xff, 0xff)).toBeCloseTo(-0.01, 9);
    expect(demPngHeight(0, 0x0f, 0xa0)).toBeCloseTo(40, 9);
  });
});

describe('far buildings', () => {
  it('derives OBB, area, height and centroid from PLATEAU surfaces and round-trips the line format', () => {
    const f = farBuildingOf(boxBuilding('b1', 100, 50, 30, 12, 36, 45)) as FarBuilding;
    expect(f.h).toBeCloseTo(45, 6);
    expect(f.area).toBeCloseTo(360, 6);
    expect(f.obb.hu * f.obb.hv * 4).toBeCloseTo(360, 6);
    const back = farFromRow(JSON.parse(farToLine(f)));
    expect(back.id).toBe('b1');
    expect(back.cx).toBeCloseTo(f.cx, 2);
    expect(nightFlags('402', 'x') & 0xf).toBe(13);
    expect(nightFlags(null, 'x') & 0xf).toBe(6);
    expect(nightFlags('402', 'x')).toBe(nightFlags('402', 'x'));
  });

  it('box = 4 walls + roof (10 tris), outward normals; masses respect coverage', () => {
    const s = new MeshStream();
    addFarBox(s, far('a', 10, 10, 20, 10, 30), 0, 0);
    expect(s.tris).toBe(10);
    for (let t = 0; t < s.idx.length; t += 3) {
      const [a, b, c] = [s.idx[t], s.idx[t + 1], s.idx[t + 2]] as [number, number, number];
      const p = (v: number, k: number) => s.pos[v * 3 + k] as number;
      const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)];
      const e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
      const n = [
        (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number),
        (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number),
        (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number),
      ];
      const mid = [(p(a, 0) + p(b, 0) + p(c, 0)) / 3 - 10, 0, (p(a, 2) + p(b, 2) + p(c, 2)) / 3 - 10];
      const outward =
        (n[0] as number) * (mid[0] as number) + (n[2] as number) * (mid[2] as number) + ((n[1] as number) > 0 ? 1 : 0);
      expect(outward).toBeGreaterThan(0);
    }
    const masses = accumulateMasses(
      [far('m1', 5, 5, 10, 10, 9), far('m2', 40, 40, 10, 10, 15), far('m3', 200, 5, 2, 2, 5)],
      64,
    );
    const s2 = new MeshStream();
    const made = [...masses.values()].filter((m) => addMass(s2, m, 0, 0)).length;
    expect(made).toBe(1); // (0,0) 칸: 피복 200/4096 ≥ 3%, (3,0) 칸: 4/4096 < 3%
  });
});

describe('child split & levels', () => {
  const L2 = packCellKey(2, 0, 0);
  const dem = slopeDem(-8192, -8192, 32768, 32);

  it('child keys follow (iz mod 4)·4 + (ix mod 4), also for negative cells', () => {
    const k = childKeys(packCellKey(1, -1, -1));
    expect(k[0]).toBe(packCellKey(0, -4, -4));
    expect(k[5]).toBe(packCellKey(0, -3, -3));
    expect(k[15]).toBe(packCellKey(0, -1, -1));
  });

  it('L2: 2 primitives, every _CHILD ∈ 0..15, 16 terrain patches tile the parent, building tris = boxes + masses', async () => {
    const bs: FarBuilding[] = [];
    for (let i = 0; i < 400; i++)
      bs.push(far(`b${i}`, 37 + ((i * 97) % 4000), 11 + ((i * 53) % 4050), 20, 15, i % 50 === 0 ? 120 : 8));
    const r = buildL2(L2, bs, dem);
    const want = r.children.reduce((a, c) => a + c.buildings.tris, 0);
    expect(r.boxes).toBeGreaterThan(0);
    expect(r.masses).toBeGreaterThan(0);
    expect(want).toBe((r.boxes + r.masses) * 10);
    const enc = await encodeHlod(r.children);
    const got = await inspect(enc.glb, L2);
    expect(got.bad).toBe(0);
    expect([...got.terrainChildren].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
    expect(got.buildingTris).toBe(want);
    expect(got.primitives).toBe(2);
  });

  it('L2 stays ≤ 2 MB with a dense 60k-building cell; L3 masses ≤ 2 MB', async () => {
    const bs: FarBuilding[] = [];
    for (let i = 0; i < 60_000; i++) {
      const x = ((i * 7919) % 4090) + 3;
      const z = ((i * 104_729) % 4090) + 3;
      bs.push(far(`d${i}`, x, z, 10 + (i % 7), 8 + (i % 5), i % 97 === 0 ? 90 : 6 + (i % 13)));
    }
    const enc2 = await encodeHlod(buildL2(L2, bs, dem).children);
    expect(enc2.glb.byteLength).toBeLessThanOrEqual(L2_PARAMS.budgetBytes);
    const L3 = packCellKey(3, 0, 0);
    const enc3 = await encodeHlod(buildL3(L3, bs, dem).children);
    expect(enc3.glb.byteLength).toBeLessThanOrEqual(2_000_000);
    expect((await inspect(enc3.glb, L3)).bad).toBe(0);
  }, 60_000);

  it('L1: area children use simplified L0 buildings (≈ 25%), outside children use far boxes', async () => {
    const L1 = packCellKey(1, 0, 0);
    const inside = new Set([packCellKey(0, 0, 0), packCellKey(0, 1, 0)]);
    const recs = [boxBuilding('in-a', 40, 40, 30, 20, 30, 50), boxBuilding('in-b', 120, 90, 20, 20, 30, 20)];
    const r = await buildL1(L1, {
      l0Buildings: (k) => (inside.has(k) ? (k === packCellKey(0, 0, 0) ? recs : []) : undefined),
      dem1m: { x0: -4, z0: -4, width: 1033, height: 1033, values: new Float32Array(1033 * 1033).fill(30) },
      farDem: dem,
      far: [far('out', 700, 700, 20, 20, 40)],
    });
    expect(r.inside).toBe(2);
    expect(r.tris).toBeLessThanOrEqual(r.srcTris);
    const got = await inspect((await encodeHlod(r.children)).glb, L1);
    expect(got.bad).toBe(0);
    expect(got.terrainChildren.size).toBe(16);
    const outChild = r.children[10]; // (ix 2, iz 2) → 700 m
    expect(outChild?.buildings.tris).toBe(10);
  });

  it('L1: landmarks use the L0 override shape instead of the replaced PLATEAU prism (M07 pre ⓪)', async () => {
    // 체육관 상자(높이 17 m, measuredHeight 30) → 텐트(처마 6 m·능선 29·기둥 30.4). L1이 상자를 그리면 가까이 가서(L0) 모양이 바뀐다.
    const L1 = packCellKey(1, 0, 0);
    const gym = { ...boxBuilding('bldg_gym', 20, 30, 120, 60, 10, 17), lod: 1 as const, measuredHeightM: 30 };
    const overrides = overrideSetOf([
      {
        id: 'gym',
        order: 1,
        name: { ja: 'g', en: 'g' },
        replace: ['bldg_gym'],
        shell: [{ gml: 'bldg_gym', skip: true, rules: [] }],
        parts: [
          {
            type: 'tent',
            gml: 'bldg_gym',
            spine: [40, 60, 120, 60],
            eave: 6,
            ridge: 29,
            sag: 4,
            mast: 30.4,
            mastD: 3,
            mat: 'steel_dark',
          },
        ],
        reference: [],
      },
    ]);
    const base = {
      l0Buildings: (k: CellKey) => (k === packCellKey(0, 0, 0) ? [gym] : []),
      dem1m: { x0: -4, z0: -4, width: 1033, height: 1033, values: new Float32Array(1033 * 1033).fill(10) },
      farDem: dem,
      far: [],
    };
    const roofAt = (r: Awaited<ReturnType<typeof buildL1>>, x: number, z: number): number => {
      const b = r.children[0]?.buildings;
      let top = -Infinity;
      for (let i = 0; b && i < b.pos.length; i += 3)
        if (Math.abs((b.pos[i] as number) - x) < 6 && Math.abs((b.pos[i + 2] as number) - z) < 6)
          top = Math.max(top, b.pos[i + 1] as number);
      return top;
    };
    const plain = await buildL1(L1, base);
    const withLm = await buildL1(L1, { ...base, overrides });
    // 처마 근처(발자국 모서리 안쪽): 상자 = 지면 + 17 m, 텐트 = 처마 6 m 언저리.
    expect(roofAt(plain, 24, 34)).toBeCloseTo(27, 0);
    expect(roofAt(withLm, 24, 34)).toBeLessThan(10 + 12);
    // 기둥 끝은 남는다(멀리서 실루엣 높이 그대로).
    expect(Math.max(...(withLm.children[0]?.buildings.pos.filter((_, i) => i % 3 === 1) ?? []))).toBeCloseTo(40.4, 0);
  });

  it('simplify reduces a detailed roof mesh to ≈ 25% of its triangles', () => {
    // 톱니 지붕(삼각형 많음) 1동
    const ring: number[] = [];
    for (let i = 0; i <= 40; i++) ring.push(i * 2, 60 + (i % 2) * 0.05, 0);
    ring.push(80, 60, 30, 0, 60, 30);
    const rec = boxBuilding('saw', 40, 15, 80, 30, 30, 30);
    rec.surfaces.push({ kind: 'roof', ringsWF: [ring] });
    const s = new MeshStream();
    const [src, out] = addSimplifiedBuildings(s, [rec], 0, 0, 0.25, 2);
    expect(out).toBeLessThanOrEqual(Math.ceil(src * 0.25) + 2);
    expect(emptyChildren()).toHaveLength(16);
    expect(farDemHeight(dem, 0, 0)).toBeCloseTo(30, 3);
  });
});
