// 지도 타일 기하(M10-T03): 타일 정수 좌표 사각형(버퍼 포함)으로 면(Sutherland–Hodgman)·선(선분 자르기·분할) 자르기, Douglas–Peucker 단순화. 순수 함수(테스트).
export type Pts = number[];

/** 열린 선 단순화(끝점 고정). pts = [x0, y0, …]. */
export function simplifyLine(pts: Pts, tol: number): Pts {
  const n = pts.length / 2;
  if (n <= 2 || tol <= 0) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = pts[a * 2] as number;
    const ay = pts[a * 2 + 1] as number;
    const bx = pts[b * 2] as number;
    const by = pts[b * 2 + 1] as number;
    const len = Math.hypot(bx - ax, by - ay);
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] as number;
      const py = pts[i * 2 + 1] as number;
      const d =
        len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: Pts = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2] as number, pts[i * 2 + 1] as number);
  return out;
}

type Edge = (x: number, y: number) => number;

/** 다각형 한 변(경계 값 v, 축 0 = x·1 = y, keepBelow = v 이하 쪽 유지)으로 자르기. */
function clipEdge(ring: Pts, axis: 0 | 1, v: number, keepBelow: boolean): Pts {
  const out: Pts = [];
  const n = ring.length / 2;
  const side: Edge = (x, y) => ((axis === 0 ? x : y) - v) * (keepBelow ? -1 : 1);
  for (let i = 0; i < n; i++) {
    const ax = ring[i * 2] as number;
    const ay = ring[i * 2 + 1] as number;
    const j = (i + 1) % n;
    const bx = ring[j * 2] as number;
    const by = ring[j * 2 + 1] as number;
    const sa = side(ax, ay);
    const sb = side(bx, by);
    if (sa >= 0) out.push(ax, ay);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return out;
}

/** 면 링 → [lo, hi] 상자 안(닫힘 점 없음). 3점 미만이면 빈 배열. */
export function clipRing(ring: Pts, lo: number, hi: number): Pts {
  let r = ring;
  r = clipEdge(r, 0, lo, false);
  if (r.length) r = clipEdge(r, 0, hi, true);
  if (r.length) r = clipEdge(r, 1, lo, false);
  if (r.length) r = clipEdge(r, 1, hi, true);
  return r.length >= 6 ? r : [];
}

/** 선분 자르기(Liang–Barsky) — null = 상자 밖. */
function clipSeg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  lo: number,
  hi: number,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - lo],
    [dx, hi - ax],
    [-dy, ay - lo],
    [dy, hi - ay],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1];
}

/** 선 → 상자 안 조각들. */
export function clipLine(pts: Pts, lo: number, hi: number): Pts[] {
  const parts: Pts[] = [];
  let cur: Pts = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const s = clipSeg(pts[i] as number, pts[i + 1] as number, pts[i + 2] as number, pts[i + 3] as number, lo, hi);
    if (!s) {
      if (cur.length >= 4) parts.push(cur);
      cur = [];
      continue;
    }
    const [x0, y0, x1, y1] = s;
    const lx = cur[cur.length - 2];
    const ly = cur[cur.length - 1];
    if (cur.length === 0 || lx !== x0 || ly !== y0) {
      if (cur.length >= 4) parts.push(cur);
      cur = [x0, y0];
    }
    cur.push(x1, y1);
    if (x1 !== pts[i + 2] || y1 !== pts[i + 3]) {
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 4) parts.push(cur);
  return parts;
}

/** 정수 좌표로 반올림 + 연속 중복 점 제거. */
export function quantize(pts: Pts): Pts {
  const out: Pts = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = Math.round(pts[i] as number);
    const y = Math.round(pts[i + 1] as number);
    if (out.length && out[out.length - 2] === x && out[out.length - 1] === y) continue;
    out.push(x, y);
  }
  return out;
}

/** 신발끈 넓이(화면 좌표 y 아래 — 양수 = 시계 방향). */
export function ringArea(r: Pts): number {
  let s = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += (r[i * 2] as number) * (r[j * 2 + 1] as number) - (r[j * 2] as number) * (r[i * 2 + 1] as number);
  }
  return s / 2;
}

/** MVT 규약 방향: 바깥 = 양(시계), 구멍 = 음. */
export function orient(r: Pts, outer: boolean): Pts {
  const a = ringArea(r);
  if (outer === a > 0) return r;
  const out: Pts = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i] as number, r[i + 1] as number);
  return out;
}
