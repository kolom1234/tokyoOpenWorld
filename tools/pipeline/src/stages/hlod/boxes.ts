// 원경 건물 기하: 방향 사각형 박스(LOD1 박스, 벽 4 + 지붕, 바닥 없음)와 격자 블록 매스(작은 건물 묶음). 평면 법선·벽 UV는 L0 규칙과 같다.
// see docs/04-data-pipeline.md §4.5 (L2 LOD1 박스, L3 블록 매스)
import { type Obb, obbCorners, type P2 } from '../../lib/geom2d.ts';
import type { MeshStream } from './child-split.ts';
import { type FarBuilding, floorsOf, nightFlags } from './far-buildings.ts';

const INT8_MAX = 127;
type V3 = [number, number, number];
/** 박스 바닥을 지면 아래로 내려 경사지에서 뜨지 않게(m). */
export const BOX_SINK_M = 2;

/** 사각형(4 정점, y 동일 아님 가능) 하나 → 2 삼각형, 법선 방향 want(단위)와 맞게 감기. */
function quad(
  s: MeshStream,
  v: readonly [number, number, number][],
  want: readonly number[],
  uv: number[],
  facade: readonly number[],
): void {
  const base = s.count;
  const n = want.map((c) => Math.round(c * INT8_MAX));
  for (const p of v) {
    s.pos.push(...p);
    s.nrm.push(...n);
    s.facade.push(...facade);
  }
  s.uv.push(...uv);
  const [a, b, c] = v as unknown as [V3, V3, V3];
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const ok = cr[0] * (want[0] as number) + cr[1] * (want[1] as number) + cr[2] * (want[2] as number) > 0;
  if (ok) s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else s.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/** 수평 사각형(반시계 네 모서리) 기둥: y0..y1, 부모 로컬 원점(ox, oz) 기준. */
export function addPrism(
  s: MeshStream,
  corners: readonly P2[],
  y0: number,
  y1: number,
  ox: number,
  oz: number,
  facade: readonly number[],
): void {
  const c = corners.map(([x, z]) => [x - ox, z - oz] as const);
  const cx = c.reduce((a, p) => a + p[0], 0) / c.length;
  const cz = c.reduce((a, p) => a + p[1], 0) / c.length;
  let u = 0;
  for (let i = 0; i < c.length; i++) {
    const [ax, az] = c[i] as readonly [number, number];
    const [bx, bz] = c[(i + 1) % c.length] as readonly [number, number];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    // 바깥 법선 = 변에 수직, 중심 반대쪽
    let [nx, nz] = [(bz - az) / len, -(bx - ax) / len];
    if (((ax + bx) / 2 - cx) * nx + ((az + bz) / 2 - cz) * nz < 0) [nx, nz] = [-nx, -nz];
    const v: [number, number, number][] = [
      [ax, y0, az],
      [bx, y0, bz],
      [bx, y1, bz],
      [ax, y1, az],
    ];
    quad(s, v, [nx, 0, nz], [u, y0, u + len, y0, u + len, y1, u, y1], facade);
    u += len;
  }
  const roof = c.map(([x, z]) => [x, y1, z] as [number, number, number]);
  quad(
    s,
    roof,
    [0, 1, 0],
    roof.flatMap(([x, , z]) => [x, z]),
    facade,
  );
}

/** 원경 건물 1동 → OBB 박스. */
export function addFarBox(s: MeshStream, b: FarBuilding, ox: number, oz: number): void {
  const facade = [0, floorsOf(b.storeys, b.h), 0, nightFlags(b.usage, b.id)];
  addPrism(s, obbCorners(b.obb), b.y0 - BOX_SINK_M, b.y0 + b.h, ox, oz, facade);
}

export interface MassCell {
  /** 격자 칸 북서 모서리(WF). */
  x0: number;
  z0: number;
  size: number;
  /** 바닥 면적 합(m²), 면적 가중 높이 합, 최저 바닥, 면적 가중 용도 투표. */
  area: number;
  hArea: number;
  y0: number;
  usage: Map<string, number>;
  n: number;
}

/** 격자 칸(size m, WF 원점 정렬)별 작은 건물 누적. 키 = "ix,iz". */
export function accumulateMasses(buildings: Iterable<FarBuilding>, size: number): Map<string, MassCell> {
  const out = new Map<string, MassCell>();
  for (const b of buildings) {
    const ix = Math.floor(b.cx / size);
    const iz = Math.floor(b.cz / size);
    const k = `${ix},${iz}`;
    let m = out.get(k);
    if (!m) {
      m = {
        x0: ix * size,
        z0: iz * size,
        size,
        area: 0,
        hArea: 0,
        y0: Number.POSITIVE_INFINITY,
        usage: new Map(),
        n: 0,
      };
      out.set(k, m);
    }
    m.area += b.area;
    m.hArea += b.area * b.h;
    m.y0 = Math.min(m.y0, b.y0);
    const u = b.usage ?? '';
    m.usage.set(u, (m.usage.get(u) ?? 0) + b.area);
    m.n++;
  }
  return out;
}

/** 이보다 성긴 칸(바닥 면적 / 칸 면적)은 매스를 만들지 않는다. */
export const MASS_MIN_COVERAGE = 0.03;

/**
 * 블록 매스 1개: 칸 중심 정사각형, 한 변 = size·√(피복률)(≤ 0.9·size), 높이 = 면적 가중 평균.
 * 반환 = 만들었는가.
 */
export function addMass(s: MeshStream, m: MassCell, ox: number, oz: number): boolean {
  const cover = m.area / (m.size * m.size);
  if (cover < MASS_MIN_COVERAGE) return false;
  const h = m.hArea / m.area;
  const half = (Math.min(Math.sqrt(cover), 0.9) * m.size) / 2;
  const cx = m.x0 + m.size / 2;
  const cz = m.z0 + m.size / 2;
  const obb: Obb = { cx, cz, ux: 1, uz: 0, hu: half, hv: half };
  const usage = [...m.usage.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] || null;
  const facade = [0, floorsOf(null, h), 0, nightFlags(usage, `mass:${m.x0},${m.z0},${m.size}`)];
  addPrism(s, obbCorners(obb), m.y0 - BOX_SINK_M, m.y0 + h, ox, oz, facade);
  return true;
}
