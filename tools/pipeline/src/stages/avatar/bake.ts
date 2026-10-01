// 아바타 메시 굽기(M05 결정 2): Quaternius UBC 베이스 캐릭터의 프리미티브(몸·머리털·눈)를 하나로 합치고, 텍스처 대신 정점색(COLOR_0)을 굽는다 —
// 기본색 텍스처를 UV에서 쌍선형 표본(sRGB → 선형) + 스킨 가중치로 옷 영역(셔츠·바지·신발)을 칠한다(베이스 메시는 속옷 차림이라 도심 보행에 맞게).
// 텍스처가 없어 GLB가 작고(≈ 1 MB) 머티리얼 1개 = 드로우콜 1. see docs/adr/0048-quaternius-avatar.md
import type { Accessor, Document, Primitive } from '@gltf-transform/core';
import type { DecodedPng } from '../../lib/png.ts';

/** 옷 영역: 관절 이름 → 영역. 나머지(머리·목·아래팔·손) = 피부(텍스처 색). */
export type Region = 'shirt' | 'trousers' | 'shoes';
const REGION_OF: Readonly<Record<string, Region>> = {
  spine_01: 'shirt',
  spine_02: 'shirt',
  spine_03: 'shirt',
  clavicle_l: 'shirt',
  clavicle_r: 'shirt',
  upperarm_l: 'shirt',
  upperarm_r: 'shirt',
  pelvis: 'trousers',
  thigh_l: 'trousers',
  thigh_r: 'trousers',
  calf_l: 'trousers',
  calf_r: 'trousers',
  foot_l: 'shoes',
  foot_r: 'shoes',
  ball_l: 'shoes',
  ball_r: 'shoes',
  ball_leaf_l: 'shoes',
  ball_leaf_r: 'shoes',
};

/** 옷 색(sRGB) — 반팔 남색 셔츠·짙은 회색 바지·흰 운동화(가상, 로고 없음). */
export const OUTFIT_SRGB: Readonly<Record<Region, readonly [number, number, number]>> = {
  shirt: [0x3a, 0x4d, 0x6b],
  trousers: [0x2f, 0x32, 0x38],
  shoes: [0xdc, 0xdc, 0xd8],
};
/** 옷 덮임 경계(영역 가중치 합의 smoothstep 구간) — 팔꿈치·목에서 소매·깃 경계를 좁힌다. */
const EDGE_LO = 0.35;
const EDGE_HI = 0.65;

export const srgbToLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

/** UV(0–1, v 아래 +) 쌍선형 표본 → 선형 RGB. 가장자리는 자름. */
export function sampleLinear(img: DecodedPng, u: number, v: number, out: number[]): void {
  const x = Math.min(Math.max(u * img.width - 0.5, 0), img.width - 1);
  const y = Math.min(Math.max(v * img.height - 0.5, 0), img.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const c = img.channels;
  for (let k = 0; k < 3; k++) {
    const at = (px: number, py: number): number => srgbToLinear(img.data[(py * img.width + px) * c + k] ?? 0);
    const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
    const bot = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
    out[k] = top * (1 - fy) + bot * fy;
  }
}

/** 정점 하나의 옷 영역(가중치 합 최대)과 덮임(0–1). */
export function outfitAt(jointNames: readonly string[], joints: ArrayLike<number>, weights: ArrayLike<number>) {
  const sum: Record<Region, number> = { shirt: 0, trousers: 0, shoes: 0 };
  for (let i = 0; i < 4; i++) {
    const r = REGION_OF[jointNames[joints[i] ?? 0] ?? ''];
    if (r) sum[r] += weights[i] ?? 0;
  }
  let best: Region = 'shirt';
  for (const r of ['trousers', 'shoes'] as const) if (sum[r] > sum[best]) best = r;
  const cover = smoothstep(EDGE_LO, EDGE_HI, sum.shirt + sum.trousers + sum.shoes);
  return { region: best, cover };
}

export interface BakeInput {
  prim: Primitive;
  /** 이 프리미티브 머티리얼의 기본색 텍스처(없으면 흰색). */
  baseColor: DecodedPng | undefined;
  /** 옷 영역을 칠할지(몸 메시만). */
  outfit: boolean;
  /** 다른 파일(머리털)의 관절 번호 → 몸 스킨 관절 번호(이름으로 맞춤). 없으면 그대로. */
  jointRemap?: readonly number[];
  /** 텍스처 색에 곱할 색(sRGB) — 머리털 텍스처는 회색조(원본 셰이더가 색을 입힌다). */
  tintSrgb?: readonly [number, number, number];
}

/** 머리털·눈썹 색(sRGB, 짙은 갈색). */
export const HAIR_SRGB: readonly [number, number, number] = [0x3a, 0x2c, 0x22];

interface Arrays {
  pos: number[];
  nrm: number[];
  col: number[];
  jnt: number[];
  wgt: number[];
  idx: number[];
}

function bakeOne(a: Arrays, b: BakeInput, jointNames: readonly string[]): void {
  const get = (s: string): Accessor => {
    const acc = b.prim.getAttribute(s);
    if (!acc) throw new Error(`avatar: primitive without ${s}`);
    return acc;
  };
  const [pos, nrm, uv, jnt, wgt] = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].map(get) as Accessor[];
  const base = a.pos.length / 3;
  const e: number[] = [];
  const j: number[] = [];
  const w: number[] = [];
  const tex = [1, 1, 1];
  for (let i = 0; i < (pos as Accessor).getCount(); i++) {
    a.pos.push(...(pos as Accessor).getElement(i, e));
    a.nrm.push(...(nrm as Accessor).getElement(i, e));
    (jnt as Accessor).getElement(i, j);
    if (b.jointRemap) for (let k = 0; k < j.length; k++) j[k] = b.jointRemap[j[k] ?? 0] ?? 0;
    (wgt as Accessor).getElement(i, w);
    a.jnt.push(...j);
    a.wgt.push(...w);
    const [u, v] = (uv as Accessor).getElement(i, e);
    if (b.baseColor) sampleLinear(b.baseColor, u ?? 0, v ?? 0, tex);
    if (b.tintSrgb) for (let k = 0; k < 3; k++) tex[k] = (tex[k] ?? 1) * srgbToLinear(b.tintSrgb[k] ?? 255);
    const o = b.outfit ? outfitAt(jointNames, j, w) : { region: 'shirt' as Region, cover: 0 };
    const cloth = OUTFIT_SRGB[o.region];
    for (let k = 0; k < 3; k++) a.col.push((tex[k] ?? 1) * (1 - o.cover) + srgbToLinear(cloth[k] ?? 0) * o.cover);
    a.col.push(1);
  }
  const ind = b.prim.getIndices();
  if (!ind) throw new Error('avatar: non-indexed primitive');
  for (let i = 0; i < ind.getCount(); i++) a.idx.push(base + ind.getScalar(i));
}

/** 가중치 4개 → u8 정규화(합 = 255 정확히 — 반올림 오차는 가장 큰 가중치에). */
export function quantizeWeights(w: readonly number[]): number[] {
  const out: number[] = [];
  for (let v = 0; v < w.length; v += 4) {
    const q = [0, 1, 2, 3].map((k) => Math.round((w[v + k] ?? 0) * 255));
    const big = q.indexOf(Math.max(...q));
    q[big] = (q[big] ?? 0) + 255 - q.reduce((s, x) => s + x, 0);
    out.push(...q);
  }
  return out;
}

/**
 * 프리미티브들을 하나로(위치·법선 f32, 정점색 u16 정규화 RGBA, 관절·가중치 u8(가중치 정규화), 인덱스 u16/u32). 같은 스킨이어야 한다(관절 번호 공유).
 * 반환 프리미티브는 새 머티리얼(흰 기본색 × 정점색) 하나.
 */
export function mergeAndBake(doc: Document, inputs: readonly BakeInput[], jointNames: readonly string[]): Primitive {
  const a: Arrays = { pos: [], nrm: [], col: [], jnt: [], wgt: [], idx: [] };
  for (const b of inputs) bakeOne(a, b, jointNames);
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const acc = (type: 'VEC3' | 'VEC4' | 'SCALAR', arr: ArrayLike<number>, ctor: 'f32' | 'u16' | 'u8' | 'u32') => {
    const data =
      ctor === 'f32'
        ? new Float32Array(arr)
        : ctor === 'u16'
          ? new Uint16Array(arr)
          : ctor === 'u8'
            ? new Uint8Array(arr)
            : new Uint32Array(arr);
    return doc.createAccessor().setType(type).setArray(data).setBuffer(buffer);
  };
  const color16 = a.col.map((c) => Math.round(Math.min(Math.max(c, 0), 1) * 65535));
  const nVerts = a.pos.length / 3;
  const material = doc
    .createMaterial('M_Avatar')
    .setBaseColorFactor([1, 1, 1, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', a.pos, 'f32'))
    .setAttribute('NORMAL', acc('VEC3', a.nrm, 'f32'))
    .setAttribute('COLOR_0', acc('VEC4', color16, 'u16').setNormalized(true))
    .setAttribute('JOINTS_0', acc('VEC4', a.jnt, 'u8'))
    .setAttribute('WEIGHTS_0', acc('VEC4', quantizeWeights(a.wgt), 'u8').setNormalized(true))
    .setIndices(acc('SCALAR', a.idx, nVerts > 65535 ? 'u32' : 'u16'))
    .setMaterial(material);
}
