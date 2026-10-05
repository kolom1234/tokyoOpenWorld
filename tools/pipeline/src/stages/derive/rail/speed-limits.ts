// 구간 제한속도(M07-T01, 10 §6.1): v = min(노선 최고, √(0.8 m/s² × R)) — R = 표본 ±WINDOW_M 방향 변화에서 구한 곡률 반경.
// 짧은 꺾임(분기기·OSM 꼭짓점 잡음)이 속도를 깎지 않게 창은 충분히 넓게(±15 m), 결과는 ±창 최솟값(곡선 진입 전후).
// see docs/10-simulation.md §6.1
export const LATERAL_ACCEL = 0.8;
const WINDOW_M = 15;

/** 표본 xyz(WF, 등간격 step) → 표본별 제한속도(m/s). */
export function speedLimits(xyz: Float32Array, step: number, maxMs: number): Float32Array {
  const n = xyz.length / 3;
  const w = Math.max(1, Math.round(WINDOW_M / step));
  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    heading[i] = Math.atan2(
      (xyz[b * 3 + 2] as number) - (xyz[a * 3 + 2] as number),
      (xyz[b * 3] as number) - (xyz[a * 3] as number),
    );
  }
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n - 1, i + w);
    let d = Math.abs((heading[b] as number) - (heading[a] as number)) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const len = (b - a) * step;
    const r = d > 1e-6 ? len / d : Number.POSITIVE_INFINITY;
    raw[i] = Math.min(maxMs, Math.sqrt(LATERAL_ACCEL * r));
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Number.POSITIVE_INFINITY;
    for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) m = Math.min(m, raw[k] as number);
    out[i] = m;
  }
  return out;
}
