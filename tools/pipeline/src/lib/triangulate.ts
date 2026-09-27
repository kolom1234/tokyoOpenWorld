// 3D 평면 폴리곤(외곽 + 구멍) 삼각분할: Newell 법선 → 지배 축 투영 → earcut → 법선 방향으로 감기 정렬. see docs/04-data-pipeline.md §4.4-2
import earcut from 'earcut';

export type Vec3 = [number, number, number];

export interface Triangulated {
  /** 링들을 이어 붙인 정점 `[x0, y0, z0, …]`(입력 좌표계 그대로). */
  vertices: number[];
  /** 정점 인덱스 3개씩, 법선 쪽에서 볼 때 CCW. */
  triangles: number[];
  /** 단위 법선(외곽 링의 Newell 법선 = CityGML 외향). */
  normal: Vec3;
}

/** 면적이 이보다 작으면(법선 길이 = 2×면적, m²) 퇴화로 버린다. */
const MIN_NORMAL_LEN = 1e-6;

/** 외곽 링의 Newell 법선(정규화 전, 길이 = 2 × 면적). */
export function newellNormal(ring: readonly number[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  const count = ring.length / 3;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const [ax, ay, az] = [ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2]] as number[];
    const [bx, by, bz] = [ring[j * 3], ring[j * 3 + 1], ring[j * 3 + 2]] as number[];
    n[0] += ((ay as number) - (by as number)) * ((az as number) + (bz as number));
    n[1] += ((az as number) - (bz as number)) * ((ax as number) + (bx as number));
    n[2] += ((ax as number) - (bx as number)) * ((ay as number) + (by as number));
  }
  return n;
}

/** 지배 축을 버린 2D 좌표(earcut 입력). */
function project(vertices: readonly number[], n: Vec3): number[] {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  const [u, v] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [2, 0] : [0, 1];
  const out: number[] = [];
  for (let i = 0; i < vertices.length; i += 3) out.push(vertices[i + u] as number, vertices[i + v] as number);
  return out;
}

function triNormalDot(v: readonly number[], a: number, b: number, c: number, n: Vec3): number {
  const p = (i: number, k: number): number => v[i * 3 + k] as number;
  const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)] as Vec3;
  const e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)] as Vec3;
  const cx = e1[1] * e2[2] - e1[2] * e2[1];
  const cy = e1[2] * e2[0] - e1[0] * e2[2];
  const cz = e1[0] * e2[1] - e1[1] * e2[0];
  return cx * n[0] + cy * n[1] + cz * n[2];
}

/** 링 목록(0 = 외곽, 1.. = 구멍) → 삼각형. 퇴화(면적 ≈ 0, 삼각형 없음)면 null. */
export function triangulateRings(rings: readonly (readonly number[])[]): Triangulated | null {
  const outer = rings[0];
  if (!outer || outer.length < 9) return null;
  const nRaw = newellNormal(outer);
  const len = Math.hypot(...nRaw);
  if (len < MIN_NORMAL_LEN) return null;
  const normal: Vec3 = [nRaw[0] / len, nRaw[1] / len, nRaw[2] / len];
  const vertices: number[] = [];
  const holes: number[] = [];
  for (const [i, r] of rings.entries()) {
    if (r.length < 9) continue;
    if (i > 0) holes.push(vertices.length / 3);
    vertices.push(...r);
  }
  const tris = earcut(project(vertices, normal), holes.length > 0 ? holes : undefined, 2);
  if (tris.length === 0) return null;
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]] as number[];
    if (triNormalDot(vertices, a as number, b as number, c as number, normal) < 0) {
      tris[t + 1] = c as number;
      tris[t + 2] = b as number;
    }
  }
  return { vertices, triangles: tris, normal };
}
