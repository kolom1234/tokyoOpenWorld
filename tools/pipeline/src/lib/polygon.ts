// 폴리곤 유틸: 셀 경계(축정렬 XZ 사각형) 클리핑. 도로·지형처럼 셀 경계에서 자르는 레이어용. see docs/04-data-pipeline.md §4.2, §6
import type { CellBoundsWF } from '@sanpo/geo';

/** 클리핑 후 남은 링을 버리는 최소 면적(m², XZ 투영). 경계 스침으로 생기는 퇴화 조각 제거. */
const MIN_RING_AREA_M2 = 1e-4;

type Edge = { axis: 0 | 2; limit: number; keepGreater: boolean };

function edgesOf(b: CellBoundsWF): Edge[] {
  return [
    { axis: 0, limit: b.minX, keepGreater: true },
    { axis: 0, limit: b.maxX, keepGreater: false },
    { axis: 2, limit: b.minZ, keepGreater: true },
    { axis: 2, limit: b.maxZ, keepGreater: false },
  ];
}

function inside(ring: readonly number[], i: number, e: Edge): boolean {
  const v = ring[i * 3 + e.axis] as number;
  return e.keepGreater ? v >= e.limit : v <= e.limit;
}

/** 교차점: 선분 i→j와 경계면. Y(높이)는 선형 보간, 경계 좌표는 정확히 limit(이웃 셀과 이음새 일치). */
function intersect(ring: readonly number[], i: number, j: number, e: Edge, out: number[]): void {
  const a = ring.slice(i * 3, i * 3 + 3) as [number, number, number];
  const b = ring.slice(j * 3, j * 3 + 3) as [number, number, number];
  const t = (e.limit - a[e.axis]) / (b[e.axis] - a[e.axis]);
  const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  p[e.axis] = e.limit;
  out.push(...p.map((v) => Number(v.toFixed(3))));
}

function clipEdge(ring: readonly number[], e: Edge): number[] {
  const n = ring.length / 3;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const inI = inside(ring, i, e);
    const inJ = inside(ring, j, e);
    if (inI) out.push(...ring.slice(i * 3, i * 3 + 3));
    if (inI !== inJ) intersect(ring, i, j, e, out);
  }
  return dedupe(out);
}

/** 연속 중복 정점 제거(경계 위 정점 + t=0 교차점이 겹치는 경우). 닫힘 방향(마지막 = 처음)도 검사. */
function dedupe(ring: number[]): number[] {
  const out: number[] = [];
  const n = ring.length / 3;
  for (let i = 0; i < n; i++) {
    const p = ring.slice(i * 3, i * 3 + 3);
    const m = out.length;
    if (m >= 3 && out[m - 3] === p[0] && out[m - 2] === p[1] && out[m - 1] === p[2]) continue;
    out.push(...p);
  }
  const m = out.length;
  if (m >= 6 && out[0] === out[m - 3] && out[1] === out[m - 2] && out[2] === out[m - 1]) out.length = m - 3;
  return out;
}

/** XZ 투영 면적(부호 없음). */
export function ringAreaXZ(ring: readonly number[]): number {
  let s = 0;
  const n = ring.length / 3;
  for (let i = 0; i < n; i++) {
    const j = ((i + 1) % n) * 3;
    s += (ring[i * 3] as number) * (ring[j + 2] as number) - (ring[j] as number) * (ring[i * 3 + 2] as number);
  }
  return Math.abs(s) / 2;
}

/**
 * Sutherland–Hodgman으로 링별 사각형 클리핑. 외곽이 사라지면 null, 사라진 구멍은 버린다.
 * 오목 폴리곤은 경계를 따라 폭 0인 연결 변이 생길 수 있다(삼각분할에서 면적 0 → 무해).
 */
export function clipRingsToRect(rings: readonly (readonly number[])[], b: CellBoundsWF): number[][] | null {
  const out: number[][] = [];
  for (const [k, ring] of rings.entries()) {
    let r: number[] = [...ring];
    for (const e of edgesOf(b)) {
      if (r.length < 9) break;
      r = clipEdge(r, e);
    }
    if (r.length >= 9 && ringAreaXZ(r) >= MIN_RING_AREA_M2) out.push(r);
    else if (k === 0) return null;
  }
  return out;
}
