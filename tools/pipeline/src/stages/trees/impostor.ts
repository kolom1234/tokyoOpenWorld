// 나무 임포스터 굽기(M05-T04, CPU 래스터 — GPU 불필요·결정론): 반팔면체 8 × 8 방향(위 반구) × 64 px 틀 = 수종당 512² 두 장.
// 색 RGBA = (명암 × 앞쪽 밝기, 잎 여부 255/0, 0, 덮임), 법선 RGBA = (월드 법선 × 0.5 + 0.5, 깊이 0..1). 잎은 잎 아틀라스 알파 0.5로 자른다.
// 틀 = 방향 d에서 수관 중심(0, 0.5, 0)을 보는 직교 투영(반지름 R 정사각). 런타임(render trees/impostor)이 같은 부호화로 틀을 고른다. see ADR-0052

import type { Part, SpeciesModel } from './generate.ts';
import { ATLAS_SIZE } from './leaf-atlas.ts';

export const IMPOSTOR_FRAMES = 8;
export const IMPOSTOR_FRAME_PX = 64;
export const IMPOSTOR_TILE = IMPOSTOR_FRAMES * IMPOSTOR_FRAME_PX;
const BARK_SHADE = 0.55;

type V3 = [number, number, number];

/** 반팔면체 복호: 틀 uv(0..1) → 위 반구 단위 방향. */
export function hemiOctDecode(u: number, v: number): V3 {
  const fx = u * 2 - 1;
  const fy = v * 2 - 1;
  const px = (fx + fy) * 0.5;
  const pz = (fx - fy) * 0.5;
  const y = 1 - Math.abs(px) - Math.abs(pz);
  const l = Math.hypot(px, y, pz);
  return [px / l, y / l, pz / l];
}

/** 반팔면체 부호화(런타임 셰이더와 같은 식): 방향(y ≥ 0으로 자름) → uv. */
export function hemiOctEncode(d: V3): [number, number] {
  const y = Math.max(d[1], 0);
  const s = Math.abs(d[0]) + y + Math.abs(d[2]);
  const px = d[0] / s;
  const pz = d[2] / s;
  return [(px + pz) * 0.5 + 0.5, (px - pz) * 0.5 + 0.5];
}

interface Frame {
  d: V3;
  r: V3;
  u: V3;
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function frameBasis(d: V3): Frame {
  const up: V3 = Math.abs(d[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  const r = norm(cross(up, d));
  return { d, r, u: cross(d, r) };
}

interface Target {
  color: Uint8Array;
  normal: Uint8Array;
  depth: Float32Array;
  /** 타일 안 틀 원점(px). */
  ox: number;
  oy: number;
}

type Sampler = (u: number, v: number) => { a: number; s: number };

/** 삼각형 하나를 틀에 래스터(정점 = 수관 중심 기준 화면 좌표·깊이). */
function rasterTri(t: Target, f: Frame, R: number, p: Part, tri: number, leaf: Sampler | undefined): void {
  const ids = [p.idx[tri * 3], p.idx[tri * 3 + 1], p.idx[tri * 3 + 2]] as number[];
  const scr = ids.map((i) => {
    const w: V3 = [p.pos[i * 3] as number, (p.pos[i * 3 + 1] as number) - 0.5, p.pos[i * 3 + 2] as number];
    return [
      ((dot(w, f.r) / R) * 0.5 + 0.5) * IMPOSTOR_FRAME_PX,
      (0.5 - (dot(w, f.u) / R) * 0.5) * IMPOSTOR_FRAME_PX,
      dot(w, f.d) / R,
    ];
  }) as [number, number, number][];
  const [a, b, c] = scr as [[number, number, number], [number, number, number], [number, number, number]];
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(IMPOSTOR_FRAME_PX - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(IMPOSTOR_FRAME_PX - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const k = (t.oy + y) * IMPOSTOR_TILE + t.ox + x;
      if (z <= (t.depth[k] as number)) continue;
      const at = (arr: Float32Array, n: number, j: number) =>
        w0 * (arr[(ids[0] as number) * n + j] as number) +
        w1 * (arr[(ids[1] as number) * n + j] as number) +
        w2 * (arr[(ids[2] as number) * n + j] as number);
      let shade = BARK_SHADE;
      if (leaf) {
        const s = leaf(at(p.uv, 2, 0), at(p.uv, 2, 1));
        if (s.a < 0.5) continue;
        shade = s.s;
      }
      let n = norm([at(p.nrm, 3, 0), at(p.nrm, 3, 1), at(p.nrm, 3, 2)]);
      if (leaf && dot(n, f.d) < 0) n = [-n[0], -n[1], -n[2]];
      t.depth[k] = z;
      const front = Math.min(Math.max(z * 0.5 + 0.5, 0), 1);
      t.color.set([Math.round(shade * (0.55 + 0.45 * front) * 255), leaf ? 255 : 0, 0, 255], k * 4);
      t.normal.set([...n.map((v) => Math.round((v * 0.5 + 0.5) * 255)), Math.round(front * 255)], k * 4);
    }
}

/** 빈 화소에 이웃 색을 번지게(알파는 0 유지) — 쌍선형 표본의 어두운 테두리 방지. */
function dilate(img: Uint8Array, size: number, passes: number): void {
  for (let p = 0; p < passes; p++) {
    const src = img.slice();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const k = (y * size + x) * 4;
        if (
          (src[k + 3] as number) > 0 ||
          (p > 0 && (src[k] as number) + (src[k + 1] as number) + (src[k + 2] as number) > 0)
        )
          continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const j = (ny * size + nx) * 4;
          if ((src[j + 3] as number) > 0 || (src[j] as number) + (src[j + 1] as number) + (src[j + 2] as number) > 0) {
            img.set(src.subarray(j, j + 3), k);
            break;
          }
        }
      }
  }
}

/** 수종 1개 → 색·법선 타일(512² RGBA 두 장). atlas = 잎 아틀라스 RGBA. */
export function bakeImpostor(model: SpeciesModel, atlas: Uint8Array): { color: Uint8Array; normal: Uint8Array } {
  const n = IMPOSTOR_TILE * IMPOSTOR_TILE;
  const color = new Uint8Array(n * 4);
  const normal = new Uint8Array(n * 4);
  const depth = new Float32Array(n).fill(-Infinity);
  const leaf: Sampler = (u, v) => {
    const x = Math.min(ATLAS_SIZE - 1, Math.max(0, Math.floor(u * ATLAS_SIZE)));
    const y = Math.min(ATLAS_SIZE - 1, Math.max(0, Math.floor((1 - v) * ATLAS_SIZE)));
    const k = (y * ATLAS_SIZE + x) * 4;
    return { a: (atlas[k + 3] as number) / 255, s: (atlas[k] as number) / 255 };
  };
  const { bark, leaf: leaves } = model.lods[0];
  for (let j = 0; j < IMPOSTOR_FRAMES; j++)
    for (let i = 0; i < IMPOSTOR_FRAMES; i++) {
      const f = frameBasis(hemiOctDecode((i + 0.5) / IMPOSTOR_FRAMES, (j + 0.5) / IMPOSTOR_FRAMES));
      const t: Target = { color, normal, depth, ox: i * IMPOSTOR_FRAME_PX, oy: j * IMPOSTOR_FRAME_PX };
      for (let k = 0; k < bark.idx.length / 3; k++) rasterTri(t, f, model.radius, bark, k, undefined);
      for (let k = 0; k < leaves.idx.length / 3; k++) rasterTri(t, f, model.radius, leaves, k, leaf);
    }
  dilate(color, IMPOSTOR_TILE, 2);
  dilate(normal, IMPOSTOR_TILE, 2);
  return { color, normal };
}
