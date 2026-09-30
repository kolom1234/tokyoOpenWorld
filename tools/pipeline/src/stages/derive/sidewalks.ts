// 보행면 윗면(M05-T01): 보도·교통섬 폴리곤(이 셀 조각) → earcut → 삼각형을 2 m 격자 칸으로 잘라(볼록 조각 부채꼴) 높이 = 성형 윗면(쌍선형) + 6 mm.
// 격자 칸 자르기 = 칸 경계 교점이 양쪽 조각에서 같아 T-접합 없이 지형 곡률을 따른다(삼각형 한 변 ≤ 2.83 m). 정점은 0.1 mm로 합친다.
// 감기 = 위(+Y)에서 CCW. see docs/04-data-pipeline.md §4.3
import earcut from 'earcut';
import type { RoadRecord } from '../../readers/plateau/types.ts';

/** 윗면을 성형 지형(같은 높이 샘플) 위로 띄우는 양(m) — RTIN 3 mm 허용 오차 + 위치 양자화 ±2 mm보다 커서 z-파이팅·관통이 없다. */
export const TOP_OFFSET_M = 0.008;
/** 윗면 조각 격자(m): 4 m = 2 m 대비 삼각형 ≈ 40 %(곡률 오차는 보도 안쪽 지형을 연석 높이만큼 낮춰 흡수). */
const CELL_M = 4;
/** 연석·치마 조각 간격(m, curbs.ts) — 조각 끝마다 지형 맞춤(0.5 m: 1 m 대비 옹벽·급경사 간극 절반). 윗면 가장자리는 세분하지 않는다(삼각형 +140 %). */
export const EDGE_PIECE_M = 0.5;
const KEY_M = 1e-4;

export type HeightAt = (x: number, z: number) => number;

export interface MeshBuf {
  pos: number[];
  idx: number[];
  /** 정점 법선. */
  nrm: number[];
  /** 정점 `_SURF`. */
  surf: number[];
}

export function emptyMesh(): MeshBuf {
  return { pos: [], idx: [], nrm: [], surf: [] };
}

type P = [number, number];

/** 볼록 다각형을 축 정렬 반평면(axis 0 = x, 1 = z; keep ≥ v 또는 ≤ v)으로 자르기(Sutherland–Hodgman). */
function clipHalf(poly: P[], axis: 0 | 1, v: number, keepAbove: boolean): P[] {
  const out: P[] = [];
  const inside = (p: P): boolean => (keepAbove ? p[axis] >= v : p[axis] <= v);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as P;
    const b = poly[(i + 1) % poly.length] as P;
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (v - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function clipToCell(tri: P[], cx: number, cz: number): P[] {
  let p = clipHalf(tri, 0, cx, true);
  p = clipHalf(p, 0, cx + CELL_M, false);
  p = clipHalf(p, 1, cz, true);
  return clipHalf(p, 1, cz + CELL_M, false);
}

/** 위에서 본 CCW(법선 +Y): (b−a)×(c−a)의 y = (bz−az)(cx−ax) − (bx−ax)(cz−az) > 0. */
function upward(a: P, b: P, c: P): boolean {
  return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
}

export interface TopWriter {
  vertex(x: number, z: number): number;
}

/** 로컬 (x, z) → 정점 번호(0.1 mm 격자로 합침). 높이·법선은 heightAt에서. */
export function topWriter(m: MeshBuf, heightAt: HeightAt, surf: number): TopWriter {
  const map = new Map<string, number>();
  const e = 0.5;
  return {
    vertex(x, z) {
      const k = `${Math.round(x / KEY_M)},${Math.round(z / KEY_M)},${surf}`;
      let i = map.get(k);
      if (i !== undefined) return i;
      i = m.pos.length / 3;
      map.set(k, i);
      m.pos.push(x, heightAt(x, z) + TOP_OFFSET_M, z);
      const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      const len = Math.hypot(gx, 1, gz);
      m.nrm.push(-gx / len, 1 / len, -gz / len);
      m.surf.push(surf);
      return i;
    },
  };
}

function emitConvex(m: MeshBuf, w: TopWriter, poly: P[]): void {
  if (poly.length < 3) return;
  const ids = poly.map((p) => w.vertex(p[0], p[1]));
  for (let k = 1; k + 1 < poly.length; k++) {
    const [a, b, c] = [poly[0] as P, poly[k] as P, poly[k + 1] as P];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area < 1e-8) continue;
    const [ia, ib, ic] = [ids[0] as number, ids[k] as number, ids[k + 1] as number];
    if (ia === ib || ib === ic || ia === ic) continue;
    if (upward(a, b, c)) m.idx.push(ia, ib, ic);
    else m.idx.push(ia, ic, ib);
  }
}

/** 폴리곤 하나(WF 링, 셀 원점 ox·oz) → 윗면 삼각형. */
export function addWalkTop(m: MeshBuf, w: TopWriter, r: RoadRecord, ox: number, oz: number): void {
  const flat: number[] = [];
  const holes: number[] = [];
  for (const ring of r.polygonWF) {
    if (flat.length > 0) holes.push(flat.length / 2);
    for (let i = 0; i < ring.length; i += 3) flat.push((ring[i] as number) - ox, (ring[i + 2] as number) - oz);
  }
  const tris = earcut(flat, holes.length > 0 ? holes : undefined, 2);
  const at = (i: number): P => [flat[i * 2] as number, flat[i * 2 + 1] as number];
  for (let t = 0; t < tris.length; t += 3) {
    const tri = [at(tris[t] as number), at(tris[t + 1] as number), at(tris[t + 2] as number)];
    const xs = tri.map((p) => p[0]);
    const zs = tri.map((p) => p[1]);
    for (let cz = Math.floor(Math.min(...zs) / CELL_M) * CELL_M; cz < Math.max(...zs); cz += CELL_M) {
      for (let cx = Math.floor(Math.min(...xs) / CELL_M) * CELL_M; cx < Math.max(...xs); cx += CELL_M) {
        emitConvex(m, w, clipToCell(tri, cx, cz));
      }
    }
  }
}
