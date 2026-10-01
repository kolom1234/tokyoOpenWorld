// 글리프 윤곽 래스터라이저(M05-T06 간판 아틀라스): 경로 명령(M·L·Q·C·Z, opentype.js 형식) → 꺾은선 → 0이 아닌 감기 규칙 채우기.
// 픽셀 행마다 하위 주사선 SUB개, 주사선마다 교차 구간의 가로 덮임을 정확히(양끝 분수) 누적 → 0..1 덮임(안티에일리어싱). 결정론(부동소수 순서 고정).

export type PathCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

const SUB = 5;
/** 곡선 꺾기 분할 수(글자 높이 ~100 px에서 충분). */
const CURVE_STEPS = 10;

/** 경로 → 닫힌 꺾은선들([x0, y0, x1, y1, …]). */
export function flatten(cmds: readonly PathCommand[]): number[][] {
  const polys: number[][] = [];
  let cur: number[] = [];
  let [px, py] = [0, 0];
  const close = (): void => {
    if (cur.length >= 6) polys.push(cur);
    cur = [];
  };
  for (const c of cmds) {
    if (c.type === 'M') {
      close();
      cur = [c.x, c.y];
      [px, py] = [c.x, c.y];
    } else if (c.type === 'L') {
      cur.push(c.x, c.y);
      [px, py] = [c.x, c.y];
    } else if (c.type === 'Q') {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        cur.push(u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y);
      }
      [px, py] = [c.x, c.y];
    } else if (c.type === 'C') {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        const [a, b, d, e] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        cur.push(a * px + b * c.x1 + d * c.x2 + e * c.x, a * py + b * c.y1 + d * c.y2 + e * c.y);
      }
      [px, py] = [c.x, c.y];
    } else close();
  }
  close();
  return polys;
}

/** 다각형들(0이 아닌 감기) → 덮임을 out(w × h, 행 우선)에 max로 합친다. */
export function fillPolygons(polys: readonly number[][], out: Float32Array, w: number, h: number): void {
  const edges: [number, number, number, number, number][] = [];
  for (const p of polys) {
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [x0, y0, x1, y1] = [p[i * 2] as number, p[i * 2 + 1] as number, p[j * 2] as number, p[j * 2 + 1] as number];
      if (y0 === y1) continue;
      edges.push(y0 < y1 ? [x0, y0, x1, y1, 1] : [x1, y1, x0, y0, -1]);
    }
  }
  const row = new Float32Array(w + 1);
  const xs: [number, number][] = [];
  for (let py = 0; py < h; py++) {
    row.fill(0);
    for (let s = 0; s < SUB; s++) {
      const y = py + (s + 0.5) / SUB;
      xs.length = 0;
      for (const [x0, y0, x1, y1, d] of edges) {
        if (y < y0 || y >= y1) continue;
        xs.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), d]);
      }
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let k = 0; k + 1 < xs.length; k++) {
        wind += (xs[k] as [number, number])[1];
        if (wind !== 0) addSpan(row, w, (xs[k] as [number, number])[0], (xs[k + 1] as [number, number])[0]);
      }
    }
    for (let x = 0; x < w; x++) {
      const v = Math.min(1, (row[x] as number) / SUB);
      const k = py * w + x;
      if (v > (out[k] as number)) out[k] = v;
    }
  }
}

/** [a, b) 가로 구간 덮임을 픽셀별로 더한다(양끝 분수). */
function addSpan(row: Float32Array, w: number, a: number, b: number): void {
  const lo = Math.max(0, a);
  const hi = Math.min(w, b);
  if (hi <= lo) return;
  const i0 = Math.floor(lo);
  const i1 = Math.floor(hi);
  if (i0 === i1) {
    row[i0] = (row[i0] as number) + (hi - lo);
    return;
  }
  row[i0] = (row[i0] as number) + (i0 + 1 - lo);
  for (let i = i0 + 1; i < i1; i++) row[i] = (row[i] as number) + 1;
  if (i1 < w) row[i1] = (row[i1] as number) + (hi - i1);
}
