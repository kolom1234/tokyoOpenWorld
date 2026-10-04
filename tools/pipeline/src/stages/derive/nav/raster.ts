// 내비 입력 래스터(M06-T03, ADR-0063): 셀 창(−2 … 258 m) 0.5 m 표본 격자에 다각형을 스캔라인으로 채운다 — 표본 중심 판정이라 경계가 1 m 래스터보다 정확.
// 링 = 평평한 좌표 배열(stride 2 = OSM xz, 3 = PLATEAU xyz), 짝-홀 규칙(구멍 포함). see docs/04-data-pipeline.md §4.3

/** 표본 격자: 표본 (i, j) 중심 = WF (x0 + (i + 0.5)·step, z0 + (j + 0.5)·step), 행 우선 `[j·n + i]`. */
export interface SampleGrid {
  x0: number;
  z0: number;
  step: number;
  n: number;
}

export const sampleX = (g: SampleGrid, i: number): number => g.x0 + (i + 0.5) * g.step;
export const sampleZ = (g: SampleGrid, j: number): number => g.z0 + (j + 0.5) * g.step;

/** 링들(짝-홀)을 채운다: 표본 중심이 안이면 cb(k). */
export function scanFill(
  rings: readonly (readonly number[])[],
  stride: 2 | 3,
  g: SampleGrid,
  cb: (k: number) => void,
): void {
  const zOff = stride - 1;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const r of rings)
    for (let p = zOff; p < r.length; p += stride) {
      z0 = Math.min(z0, r[p] as number);
      z1 = Math.max(z1, r[p] as number);
    }
  const j0 = Math.max(0, Math.ceil((z0 - g.z0) / g.step - 0.5));
  const j1 = Math.min(g.n - 1, Math.floor((z1 - g.z0) / g.step - 0.5));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const z = sampleZ(g, j);
    xs.length = 0;
    for (const r of rings) {
      const m = r.length / stride;
      for (let a = 0, b = m - 1; a < m; b = a++) {
        const za = r[a * stride + zOff] as number;
        const zb = r[b * stride + zOff] as number;
        if (za > z === zb > z) continue;
        const xa = r[a * stride] as number;
        const xb = r[b * stride] as number;
        xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(((xs[k] as number) - g.x0) / g.step - 0.5));
      const i1 = Math.min(g.n - 1, Math.floor(((xs[k + 1] as number) - g.x0) / g.step - 0.5));
      for (let i = i0; i <= i1; i++) cb(j * g.n + i);
    }
  }
}

/** 선분 a→b의 반폭 half 띠(직사각형, 끝 둥글리지 않음) 링(xz). */
export function bandRing(ax: number, az: number, bx: number, bz: number, half: number): number[] {
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const nx = (-(bz - az) / L) * half;
  const nz = ((bx - ax) / L) * half;
  return [ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz];
}

/** 원(중심·반경) 안 표본. */
export function fillDisc(cx: number, cz: number, r: number, g: SampleGrid, cb: (k: number) => void): void {
  const i0 = Math.max(0, Math.ceil((cx - r - g.x0) / g.step - 0.5));
  const i1 = Math.min(g.n - 1, Math.floor((cx + r - g.x0) / g.step - 0.5));
  const j0 = Math.max(0, Math.ceil((cz - r - g.z0) / g.step - 0.5));
  const j1 = Math.min(g.n - 1, Math.floor((cz + r - g.z0) / g.step - 0.5));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) if (Math.hypot(sampleX(g, i) - cx, sampleZ(g, j) - cz) <= r) cb(j * g.n + i);
}

/** 꺾은선(xz)을 반폭 half로 채운다(선분 띠 + 꼭짓점 원). */
export function fillPolyline(xz: readonly number[], half: number, g: SampleGrid, cb: (k: number) => void): void {
  for (let p = 0; p + 1 < xz.length; p += 2) {
    const ax = xz[p] as number;
    const az = xz[p + 1] as number;
    fillDisc(ax, az, half, g, cb);
    if (p + 3 < xz.length) scanFill([bandRing(ax, az, xz[p + 2] as number, xz[p + 3] as number, half)], 2, g, cb);
  }
}
