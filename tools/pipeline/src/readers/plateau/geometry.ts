// PLATEAU 기하 공통 유틸: EPSG:6697 좌표열 → WF 링, 면 법선 분류, 중심점. see docs/04-data-pipeline.md §4.2
import { lonLatToWF } from '@sanpo/geo';
import type { RingsWF, SurfaceKind } from './types.ts';

/** 정규화 좌표 반올림 단위(1 mm) — 결정론·크기 절감. PLATEAU 원천 정밀도(≈ cm)보다 충분히 작다. */
const WF_QUANTUM_M = 1e-3;
/** |n̂y| 가 이 값 이상이면 수평면(지붕/바닥)으로 본다 ≈ 경사 75° 이하. LOD1·nusamai(면 종류 소실) 분류용. */
const HORIZONTAL_NY = 0.25;

function q(v: number): number {
  const r = Math.round(v / WF_QUANTUM_M) * WF_QUANTUM_M;
  return Math.abs(r) < WF_QUANTUM_M / 2 ? 0 : Number(r.toFixed(3));
}

/**
 * EPSG:6697 좌표 `[lat, lon, h, lat, lon, h, …]`(축순서 주의: 위도 먼저) → WF 평면 배열.
 * 닫힘 중복점(마지막 = 처음)은 제거한다. 3개 미만 정점이면 빈 배열.
 */
export function latLonHToWF(values: ArrayLike<number>): number[] {
  const n = Math.floor(values.length / 3);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const lat = values[i * 3] as number;
    const lon = values[i * 3 + 1] as number;
    const h = values[i * 3 + 2] as number;
    const p = lonLatToWF({ lon, lat }, h);
    out.push(q(p.x), q(p.y), q(p.z));
  }
  dropClosingPoint(out, 3);
  return out.length >= 9 ? out : [];
}

/** 경도·위도 순 `[lon, lat, h, …]`(GeoJSON/nusamai 출력) → WF. */
export function lonLatHToWF(values: ArrayLike<number>): number[] {
  const swapped: number[] = [];
  for (let i = 0; i + 2 < values.length; i += 3) {
    swapped.push(values[i + 1] as number, values[i] as number, values[i + 2] as number);
  }
  return latLonHToWF(swapped);
}

/** 공백 구분 posList 텍스트 → 숫자 배열(비유한 값이 있으면 null). */
export function parsePosList(text: string): number[] | null {
  const parts = text.trim().split(/\s+/);
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const v = Number(parts[i]);
    if (!Number.isFinite(v)) return null;
    out[i] = v;
  }
  return out;
}

/** `[a0, a1, …]`에서 stride 단위 마지막 원소가 첫 원소와 같으면 제거. */
export function dropClosingPoint(flat: number[], stride: number): void {
  const n = flat.length;
  if (n < stride * 2) return;
  for (let k = 0; k < stride; k++) {
    if (flat[k] !== flat[n - stride + k]) return;
  }
  flat.length = n - stride;
}

/** Newell 법선(정규화 전). 크기 = 링 면적 × 2. */
export function newellNormal(ringWF: readonly number[]): [number, number, number] {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const n = ringWF.length / 3;
  const at = (k: number): number => ringWF[k] as number;
  for (let i = 0; i < n; i++) {
    const a = i * 3;
    const b = ((i + 1) % n) * 3;
    nx += (at(a + 1) - at(b + 1)) * (at(a + 2) + at(b + 2));
    ny += (at(a + 2) - at(b + 2)) * (at(a) + at(b));
    nz += (at(a) - at(b)) * (at(a + 1) + at(b + 1));
  }
  return [nx, ny, nz];
}

/** 법선의 y 성분 비율 n̂y ∈ [-1, 1]. 퇴화 링은 0. */
export function ringNormalY(ringWF: readonly number[]): number {
  const [nx, ny, nz] = newellNormal(ringWF);
  const len = Math.hypot(nx, ny, nz);
  return len > 0 ? ny / len : 0;
}

/** 폴리곤 면적(m²): 외곽 − 구멍. */
export function polygonArea3D(rings: RingsWF): number {
  let area = 0;
  rings.forEach((r, i) => {
    area += (i === 0 ? 0.5 : -0.5) * Math.hypot(...newellNormal(r));
  });
  return area;
}

/** 면 종류가 없는 기하(LOD1 Solid, nusamai 병합 출력)를 법선으로 분류. */
export function classifyByNormal(rings: RingsWF): SurfaceKind {
  const outer = rings[0];
  if (!outer) return 'wall';
  const ny = ringNormalY(outer);
  if (ny >= HORIZONTAL_NY) return 'roof';
  if (ny <= -HORIZONTAL_NY) return 'ground';
  return 'wall';
}

/** 외곽 링 정점 평균(x, z). 셀 버킷팅용(docs/04 §4.2: 중심점이 속한 L0 셀). */
export function centroidXZ(ringsList: readonly RingsWF[]): { x: number; z: number } | null {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const rings of ringsList) {
    const outer = rings[0];
    if (!outer) continue;
    for (let i = 0; i + 2 < outer.length; i += 3) {
      sx += outer[i] as number;
      sz += outer[i + 2] as number;
      n++;
    }
  }
  return n > 0 ? { x: sx / n, z: sz / n } : null;
}
