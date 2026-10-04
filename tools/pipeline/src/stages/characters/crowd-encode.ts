// 군중 팩 인코딩(M06-T01, ADR-0057): 정점 스트림(위치 f32·법선 snorm8·UV unorm16·관절·가중치 unorm8) + LOD 인덱스(u16) → meshopt 압축,
// 뼈 팔레트(프레임 × 뼈마다 사원수 + 이동, half float RGBA 2텍셀)는 뼈-우선 순서로 meshopt(시간 연속성 → 압축), 런타임이 프레임-우선 텍스처로 재배열.

import { MeshoptEncoder } from 'meshoptimizer';
import { type Matrix4, Quaternion } from 'three';
import type { CharMesh } from './mesh.ts';
import type { SampledClip } from './pose.ts';
import { paletteOf } from './rig.ts';

/** float32 → IEEE half(반올림, 비정규·무한 처리). */
export function toHalf(v: number): number {
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  f[0] = v;
  const x = u[0] as number;
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  const mant = x & 0x7fffff;
  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    const m = (mant | 0x800000) >> (1 - exp);
    return sign | ((m + 0x1000) >> 13);
  }
  const h = sign | (exp << 10) | ((mant + 0x1000) >> 13);
  return h;
}

export interface VertexStreams {
  position: Float32Array;
  normal: Int8Array;
  uv: Uint16Array;
  joints: Uint8Array;
  weights: Uint8Array;
}

export function vertexStreams(m: CharMesh): VertexStreams {
  const n = m.pos.length / 3;
  const normal = new Int8Array(n * 4);
  const uv = new Uint16Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) normal[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, m.nrm[i * 3 + k] ?? 0)) * 127);
    for (let k = 0; k < 2; k++) uv[i * 2 + k] = Math.round(Math.max(0, Math.min(1, m.uv[i * 2 + k] ?? 0)) * 65535);
  }
  return { position: m.pos, normal, uv, joints: m.joints, weights: m.weights };
}

const bytesOf = (a: ArrayBufferView): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** 스트림 → meshopt 정점 코덱(stride = 원소 바이트 × 성분). */
export function encodeStream(a: ArrayBufferView, count: number, stride: number): Uint8Array {
  return MeshoptEncoder.encodeVertexBuffer(bytesOf(a), count, stride);
}

export function encodeIndices(idx: Uint32Array): Uint8Array {
  const u16 = Uint16Array.from(idx);
  return MeshoptEncoder.encodeIndexBuffer(bytesOf(u16), u16.length, 2);
}

/**
 * 클립들 → 팔레트(뼈-우선): [뼈 j][클립 c 프레임 f] 마다 half 8개(q.xyzw, t.xyz, 0). 반환 = Uint16Array(뼈 × 총 프레임 × 8).
 * restWorld = 결합 메시 휴지 자세의 리그 월드(모델 공간) — K = 현재 × 휴지⁻¹.
 */
export function paletteHalf(clips: readonly SampledClip[], restWorld: readonly Matrix4[]): Uint16Array {
  const restInv = restWorld.map((m) => m.clone().invert());
  const bones = restWorld.length;
  const frames = clips.reduce((s, c) => s + c.frames, 0);
  const out = new Uint16Array(bones * frames * 8);
  let f0 = 0;
  for (const c of clips) {
    for (let f = 0; f < c.frames; f++) {
      const pal = paletteOf(c.worlds[f] as Matrix4[], restInv);
      pal.forEach(({ q, t }, j) => {
        const qq = q.w < 0 ? new Quaternion(-q.x, -q.y, -q.z, -q.w) : q;
        const o = (j * frames + f0 + f) * 8;
        out.set([toHalf(qq.x), toHalf(qq.y), toHalf(qq.z), toHalf(qq.w), toHalf(t.x), toHalf(t.y), toHalf(t.z), 0], o);
      });
    }
    f0 += c.frames;
  }
  return out;
}
