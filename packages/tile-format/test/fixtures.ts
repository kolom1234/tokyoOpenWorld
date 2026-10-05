// 합성 픽스처(원천 데이터 없음): 결정론 셀 헤더·섹션, 원시 TKC 조립기(손상/미지 섹션 케이스용). see docs/14-testing-perf.md §1
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import {
  type CellHeaderInput,
  type CellMeta,
  gzip,
  JCOL_MATERIAL,
  type JcolShape,
  type LaneGraphChunk,
  quantizeHeightfield,
  type TkcSectionInput,
  writeHeightfield,
  writeJcol,
  writeLanes,
} from '../src/index.ts';

export const HEADER: CellHeaderInput = {
  cell: { level: 0, ix: -1, iz: 0 },
  buildId: '20261101-a1b2c3d-9f8e7d6c',
  originWF: [-256, 0, 0],
  aabbWF: { min: [-300, 18.2, -40], max: [30, 231.0, 296] },
  materials: ['asphalt_old', 'sidewalk_tile_gray'],
  stats: { tris: 312000, colliderTris: 41000, instances: 3200 },
};

/** 결정론 의사 난수 바이트(길이 n). */
export function noise(n: number, tag: string): Uint8Array {
  const rng = createRng(hash32(WORLD_SEED, 'tile-format-test', tag));
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.int(0, 256);
  return out;
}

export const SHAPES: JcolShape[] = [
  {
    kind: 'triMesh',
    layer: 0,
    material: JCOL_MATERIAL.concrete,
    flags: 0,
    posLocal: [0, 0, 0],
    quat: [0, 0, 0, 1],
    vertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 12.5, 0, 0, 12.5, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  },
  {
    kind: 'box',
    layer: 2,
    material: JCOL_MATERIAL.metal,
    flags: 0,
    posLocal: [12.25, 0.6, -3.1],
    quat: [0, 0.38268343, 0, 0.92387953],
    halfExtents: [0.4, 0.9, 0.35],
  },
  {
    kind: 'capsule',
    layer: 2,
    material: 4,
    flags: 2,
    posLocal: [5, 1, 5],
    quat: [0, 0, 0, 1],
    halfHeight: 3,
    radius: 0.1,
  },
  {
    kind: 'cylinder',
    layer: 2,
    material: 4,
    flags: 0,
    posLocal: [7, 2, 5],
    quat: [0, 0, 0, 1],
    halfHeight: 2,
    radius: 0.2,
  },
  {
    kind: 'convexHull',
    layer: 0,
    material: JCOL_MATERIAL.tile,
    flags: 1,
    posLocal: [100, 0, 100],
    quat: [0, 0, 0, 1],
    vertices: new Float32Array([0, 0, 0, 4, 0, 0, 0, 1.2, 0, 0, 0, 3]),
  },
];

export function lanesChunk(): LaneGraphChunk {
  return {
    nodes: {
      key: new Uint32Array([101, 0xdeadbeef, 103]),
      posLocal: new Float32Array([0, 0, 0, 50, 0, 0, 50, 0, 50]),
    },
    lanes: {
      id: new Uint32Array([1, 2]),
      fromNode: new Uint32Array([0, 1]),
      toNode: new Uint32Array([1, 2]),
      kind: new Uint8Array([0, 1]),
      turn: new Uint8Array([0, 2]),
      speedKmh: new Uint8Array([40, 20]),
      laneIdx: new Uint8Array([0, 1]),
      signal: new Uint32Array([1234567, 0xffffffff]),
      ptOffset: new Uint32Array([0, 2]),
      ptCount: new Uint16Array([2, 3]),
      widthCm: new Uint16Array([325, 300]),
    },
    pointsLocal: new Float32Array([0, 0, 0, 50, 0, 0, 50, 0, 0, 50, 0, 25, 50, 0, 50]),
  };
}

export const META: CellMeta = {
  buildings: [{ gmlId: 'bldg_0001', usage: '401', height: 42.5, storeys: 10, name: '合成ビル' }],
  pois: [
    {
      id: 'poi-scramble',
      kind: 'street',
      posLocal: [233.7, 0, 8.6],
      radius: 40,
      nameI18n: { ja: 'スクランブル交差点', en: 'Scramble Crossing', ko: '스크램블 교차로' },
      descriptionKey: 'poi.scramble.desc',
    },
  ],
  placeNames: [
    {
      code: '13113-0001',
      nameI18n: { ja: '道玄坂' },
      polygonLocal: [
        [0, 0],
        [256, 0],
        [256, 256],
      ],
    },
  ],
  signals: [{ intersectionId: 12, heads: [{ kind: 'vehicle', posLocal: [10, 5, 10], yaw: 1.57, group: 7 }] }],
  interactables: [{ id: 'seat-1', kind: 'seat', posLocal: [3, 0, 4], yaw: 0, radius: 1 }],
};

/** 257² 경사면(40 m → 40 m + 2.56 m), 1 cm 양자화. */
export function heightsM(): Float64Array {
  const size = 257;
  const h = new Float64Array(size * size);
  for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) h[iz * size + ix] = 40 + ix * 0.01 + iz * 0.0003;
  return h;
}

/** 등록 섹션 6종(glb는 가짜 바이트). 의도적으로 사전순이 아닌 순서. */
export async function sections(): Promise<TkcSectionInput[]> {
  const json = new TextEncoder().encode(JSON.stringify(META));
  return [
    { type: 'terrain.mesh', sources: ['gsi-dem'], data: noise(1000, 'terrain') },
    { type: 'meta.json', sources: ['plateau-shibuya', 'osm'], data: await gzip(json) },
    { type: 'collision.bin', sources: ['plateau-shibuya'], data: await gzip(writeJcol(SHAPES)) },
    { type: 'buildings.mesh', sources: ['plateau-shibuya'], data: noise(333, 'bldg') },
    {
      type: 'terrain.height',
      sources: ['gsi-dem'],
      data: await gzip(writeHeightfield(quantizeHeightfield(heightsM(), 257))),
    },
    { type: 'lanes.bin', sources: ['osm'], data: await gzip(writeLanes(lanesChunk())) },
  ];
}

export interface RawOptions {
  magic?: number;
  version?: number;
  flags?: number;
  /** 헤더 바이트 길이 필드 덮어쓰기. */
  headerLen?: number;
  total?: number;
}

/** 임의 헤더 객체 + (offset, data) 목록 → TKC 바이트(검증 없음). reader 손상 케이스 전용. */
export function rawTkc(header: object, payloads: Array<[number, Uint8Array]>, o: RawOptions = {}): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const end = Math.max(16 + json.byteLength, ...payloads.map(([off, d]) => off + d.byteLength));
  const out = new Uint8Array(o.total ?? end);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, o.magic ?? 0x31434b54, true);
  dv.setUint16(4, o.version ?? 1, true);
  dv.setUint16(6, o.flags ?? 0, true);
  dv.setUint32(8, o.headerLen ?? json.byteLength, true);
  out.set(json.subarray(0, Math.min(json.byteLength, out.byteLength - 16)), 16);
  for (const [off, d] of payloads) if (off + d.byteLength <= out.byteLength) out.set(d, off);
  return out;
}
