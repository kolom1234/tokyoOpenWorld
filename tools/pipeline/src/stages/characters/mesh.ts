// 캐릭터 결합 메시(ADR-0057): FBX 스킨 메시(면별 정점) → 현재 자세(편 손)로 스키닝한 모델 공간 위치·법선, 리그 23뼈 가중치(u8 합 255),
// 부위(몸·머리·머리털) → 아틀라스 사분면 UV(이미지 위→아래), 정점 용접, LOD(meshopt 속성 단순화).

import { MeshoptSimplifier } from 'meshoptimizer';
import { type Material, Matrix3, Matrix4, Vector3 } from 'three';
import type { FbxAvatar } from './fbx.ts';
import { CM, rigIndexOf } from './rig.ts';

/** 부위 = 아틀라스 사분면(열·행, 위→아래): 몸 (0,0)·머리 (1,0)·머리털 (0,1). (1,1)은 비움. */
export const PART_QUADRANT: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];

export interface CharMesh {
  pos: Float32Array;
  nrm: Float32Array;
  /** 아틀라스 UV(0–1, v = 이미지 위에서 아래). */
  uv: Float32Array;
  /** 부위별 원본 UV(0–1, 위→아래) — 아틀라스 덮임 마스크용. */
  partUv: Float32Array;
  part: Uint8Array;
  joints: Uint8Array;
  weights: Uint8Array;
  /** lods[0] = 전체. */
  lods: Uint32Array[];
  feetY: number;
  heightM: number;
}

function partOf(material: Material | undefined): number {
  const n = material?.name ?? '';
  if (/_head$/.test(n)) return 1;
  if (/_opacity$/.test(n)) return 2;
  if (/_body$/.test(n)) return 0;
  throw new Error(`rocketbox: unknown material ${n}`);
}

interface RawVertex {
  p: [number, number, number];
  n: [number, number, number];
  uv: [number, number];
  part: number;
  j: number[];
  w: number[];
}

/** 리그 번호별 가중치 합 → 상위 4개(같으면 번호 순), u8 합 정확히 255. */
export function quantizeTop4(acc: ReadonlyMap<number, number>): { j: number[]; w: number[] } {
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
  const j = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  let left = 255;
  top.forEach(([r, x], k) => {
    j[k] = r;
    const q = k === top.length - 1 ? left : Math.min(left, Math.round((x / sum) * 255));
    w[k] = q;
    left -= q;
  });
  return { j, w };
}

/** 원본 4개 영향 → 리그 번호(가장 가까운 남긴 조상)별 합 → quantizeTop4. */
function rigWeights(av: FbxAvatar, si: ArrayLike<number>, sw: ArrayLike<number>): { j: number[]; w: number[] } {
  const acc = new Map<number, number>();
  const bones = av.mesh.skeleton.bones;
  for (let k = 0; k < 4; k++) {
    const w = sw[k] ?? 0;
    const b = bones[si[k] ?? 0];
    if (w <= 0 || !b) continue;
    const r = rigIndexOf(b);
    acc.set(r, (acc.get(r) ?? 0) + w);
  }
  return quantizeTop4(acc);
}

/** 현재 뼈 자세로 스키닝한 면별 정점(모델 공간 m). */
function skinnedVertices(av: FbxAvatar): RawVertex[] {
  const { mesh } = av;
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const partAt = new Uint8Array(pos.count);
  for (const gr of g.groups) partAt.fill(partOf(mats[gr.materialIndex ?? 0]), gr.start, gr.start + gr.count);
  const pre = new Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
  const bones = mesh.skeleton.bones;
  const K = bones.map((b, i) =>
    new Matrix4().multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[i] as Matrix4),
  );
  const out: RawVertex[] = [];
  const m = new Matrix4();
  const tmp = new Matrix4();
  const n3 = new Matrix3();
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const ji = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
    const wi = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    for (let k = 0; k < 4; k++) {
      const w = wi[k] ?? 0;
      if (w <= 0) continue;
      tmp.copy(K[ji[k] ?? 0] as Matrix4).multiplyScalar(w);
      for (let e = 0; e < 16; e++) m.elements[e] = (m.elements[e] ?? 0) + (tmp.elements[e] ?? 0);
    }
    m.premultiply(pre).multiply(mesh.bindMatrix);
    p.fromBufferAttribute(pos, i).applyMatrix4(m).multiplyScalar(CM);
    n.fromBufferAttribute(nrm, i).applyMatrix3(n3.getNormalMatrix(m)).normalize();
    const u = Math.min(Math.max(uv.getX(i), 0), 1);
    const v = 1 - Math.min(Math.max(uv.getY(i), 0), 1);
    out.push({ p: [p.x, p.y, p.z], n: [n.x, n.y, n.z], uv: [u, v], part: partAt[i] ?? 0, ...rigWeights(av, ji, wi) });
  }
  return out;
}

function weld(raw: readonly RawVertex[]): { verts: RawVertex[]; idx: Uint32Array } {
  const map = new Map<string, number>();
  const verts: RawVertex[] = [];
  const idx = new Uint32Array(raw.length);
  raw.forEach((v, i) => {
    const key = [
      ...v.p.map((x) => Math.round(x * 1e5)),
      ...v.n.map((x) => Math.round(x * 1e3)),
      ...v.uv.map((x) => Math.round(x * 1e5)),
      v.part,
      ...v.j,
      ...v.w,
    ].join(',');
    let k = map.get(key);
    if (k === undefined) {
      k = verts.length;
      map.set(key, k);
      verts.push(v);
    }
    idx[i] = k;
  });
  return { verts, idx };
}

/** LOD 단순화: 위치 + 법선(0.5) + 아틀라스 UV(2) 오차, 부위 경계는 UV 이음매로 저절로 갈린다. */
function simplifyTo(
  idx: Uint32Array,
  pos: Float32Array,
  nrm: Float32Array,
  uv: Float32Array,
  maxTris: number,
): Uint32Array {
  if (maxTris <= 0 || idx.length / 3 <= maxTris) return idx;
  const count = pos.length / 3;
  const attrs = new Float32Array(count * 5);
  for (let i = 0; i < count; i++) {
    attrs.set(nrm.subarray(i * 3, i * 3 + 3), i * 5);
    attrs.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3);
  }
  const [out] = MeshoptSimplifier.simplifyWithAttributes(
    idx,
    pos,
    3,
    attrs,
    5,
    [0.5, 0.5, 0.5, 2, 2],
    null,
    maxTris * 3,
    0.2,
  );
  return out;
}

export async function buildCharMesh(av: FbxAvatar, lodTris: readonly number[]): Promise<CharMesh> {
  await MeshoptSimplifier.ready;
  const { verts, idx } = weld(skinnedVertices(av));
  const n = verts.length;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const partUv = new Float32Array(n * 2);
  const part = new Uint8Array(n);
  const joints = new Uint8Array(n * 4);
  const weights = new Uint8Array(n * 4);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  verts.forEach((v, i) => {
    pos.set(v.p, i * 3);
    nrm.set(v.n, i * 3);
    partUv.set(v.uv, i * 2);
    const [qx, qy] = PART_QUADRANT[v.part] ?? [0, 0];
    uv[i * 2] = (qx + v.uv[0]) / 2;
    uv[i * 2 + 1] = (qy + v.uv[1]) / 2;
    part[i] = v.part;
    joints.set(v.j, i * 4);
    weights.set(v.w, i * 4);
    minY = Math.min(minY, v.p[1]);
    maxY = Math.max(maxY, v.p[1]);
  });
  const lods = lodTris.map((t) => simplifyTo(idx, pos, nrm, uv, t));
  return { pos, nrm, uv, partUv, part, joints, weights, lods, feetY: minY, heightM: maxY - minY };
}
