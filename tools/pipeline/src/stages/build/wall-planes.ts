// 벽 평면 묶기(M03-T04): 같은 건물에서 같은 평면(수평 법선 방향·평면 위치)에 있는 벽 면들은 u 원점·폭을 공유한다.
// PLATEAU LOD2 벽은 세로 띠로 잘게 쪼개진 경우가 많아(한 동 160여 면), 면마다 u를 따로 잡으면 창 격자가 띠마다 어긋나 줄무늬가 된다.

/** 같은 평면으로 보는 허용 오차: 수평 법선 방향(도)·평면 위치(m). 버킷 반올림은 경계에서 거의 같은 면을 갈라 놓아(→ 창 격자 어긋난 z-파이팅) 쓰지 않는다. */
const ANGLE_TOL_DEG = 1;
const OFFSET_TOL_M = 0.15;

export interface WallFace {
  /** 면 법선(단위). */
  normal: readonly number[];
  /** 삼각분할 정점(x, y, z …, 셀 로컬). */
  vertices: readonly number[];
}

export interface WallSpan {
  /** 수평 접선(up × n) 방향 성분. */
  tx: number;
  tz: number;
  u0: number;
  u1: number;
}

function tangentOf(n: readonly number[]): [number, number] {
  const th = Math.hypot(n[2] as number, n[0] as number) || 1;
  return [(n[2] as number) / th, -(n[0] as number) / th];
}

interface Plane {
  ang: number;
  d: number;
}

function planeOf(n: readonly number[], p: readonly number[]): Plane {
  const th = Math.hypot(n[2] as number, n[0] as number) || 1;
  const ang = (Math.atan2(n[2] as number, n[0] as number) * 180) / Math.PI;
  return { ang, d: ((n[0] as number) * (p[0] as number) + (n[2] as number) * (p[2] as number)) / th };
}

function samePlane(a: Plane, b: Plane): boolean {
  const da = Math.abs(((a.ang - b.ang + 540) % 360) - 180);
  return da <= ANGLE_TOL_DEG && Math.abs(a.d - b.d) <= OFFSET_TOL_M;
}

/** 면마다(입력 순서) 공유 u 범위. 허용 오차 안의 면들을 한 군집(첫 면 기준 접선)으로 묶어 전체 정점의 min/max. */
export function wallSpans(faces: readonly WallFace[]): WallSpan[] {
  const planes = faces.map((f) => planeOf(f.normal, f.vertices));
  const cluster = new Array<number>(faces.length).fill(-1);
  const heads: number[] = [];
  faces.forEach((_, i) => {
    const hit = heads.find((h) => samePlane(planes[h] as Plane, planes[i] as Plane));
    cluster[i] = hit ?? i;
    if (hit === undefined) heads.push(i);
  });
  const spans = new Map<number, WallSpan>();
  faces.forEach((f, i) => {
    const h = cluster[i] as number;
    let sp = spans.get(h);
    if (!sp) {
      const [tx, tz] = tangentOf((faces[h] as WallFace).normal);
      sp = { tx, tz, u0: Number.POSITIVE_INFINITY, u1: Number.NEGATIVE_INFINITY };
      spans.set(h, sp);
    }
    for (let k = 0; k < f.vertices.length; k += 3) {
      const u = (f.vertices[k] as number) * sp.tx + (f.vertices[k + 2] as number) * sp.tz;
      sp.u0 = Math.min(sp.u0, u);
      sp.u1 = Math.max(sp.u1, u);
    }
  });
  return faces.map((_, i) => spans.get(cluster[i] as number) as WallSpan);
}

/** 부속물 면이 같은 건물의 어떤 벽과 동일 평면인가(법선 내적 ≥ 0.999, 평면 거리 ≤ 6 cm) — 벽에 붙은 간판판 등은 z-파이팅만 일으킨다. */
const COPLANAR_DOT = 0.999;
const COPLANAR_M = 0.06;

export function coplanarWithAny(face: WallFace, walls: readonly WallFace[]): boolean {
  const n = face.normal;
  const p = face.vertices;
  const d =
    (n[0] as number) * (p[0] as number) + (n[1] as number) * (p[1] as number) + (n[2] as number) * (p[2] as number);
  for (const w of walls) {
    const m = w.normal;
    const dot =
      (n[0] as number) * (m[0] as number) + (n[1] as number) * (m[1] as number) + (n[2] as number) * (m[2] as number);
    if (dot < COPLANAR_DOT) continue;
    const q = w.vertices;
    const dw =
      (m[0] as number) * (q[0] as number) + (m[1] as number) * (q[1] as number) + (m[2] as number) * (q[2] as number);
    if (Math.abs(d - dw) <= COPLANAR_M) return true;
  }
  return false;
}
