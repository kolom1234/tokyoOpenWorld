// 열차 주행 곡선(M07-T02·T03, 10 §6.2): 선로 표본 제한속도 → 구간 [s0, s1]의 속도 v(s)(가속 0.83·감속 0.97 m/s² 전·후진 통과, 양끝 속도 지정)
// → 누적 시간 t(s). 시간표 컴파일러(파이프라인)와 sim(위치 = 시각의 순수 함수)이 같은 함수를 써서 역간 소요가 시간표와 맞는다. see ADR-0071
import { RAIL_ACCEL, RAIL_DECEL, type RunProfile } from '../api.ts';

/**
 * limits[k] = 선로 표본 k(s = k × stepM)의 제한속도. 구간 [s0, s1](s0 < s1) — 시작 vStart, 끝 vEnd(정차 = 0, 영역 밖 통과 = 제한속도).
 * 표본 사이 제한은 아래쪽 표본 값(보수적). 시간 = 사다리꼴(등가속 구간) 적분.
 */
export function computeRunProfile(
  limits: ArrayLike<number>,
  stepM: number,
  s0: number,
  s1: number,
  vStart = 0,
  vEnd = 0,
  accel = RAIL_ACCEL,
  decel = RAIL_DECEL,
): RunProfile {
  const len = Math.max(0, s1 - s0);
  const n = Math.max(2, Math.ceil(len / stepM) + 1);
  const ds = len / (n - 1);
  const lim = (k: number): number => {
    const s = s0 + k * ds;
    const a = Math.min(limits.length - 1, Math.max(0, Math.floor(s / stepM)));
    const b = Math.min(limits.length - 1, a + 1);
    return Math.min(limits[a] as number, limits[b] as number);
  };
  const v = new Float32Array(n);
  v[0] = Math.min(vStart, lim(0));
  for (let k = 1; k < n; k++) v[k] = Math.min(lim(k), Math.sqrt((v[k - 1] as number) ** 2 + 2 * accel * ds));
  v[n - 1] = Math.min(v[n - 1] as number, vEnd);
  for (let k = n - 2; k >= 0; k--)
    v[k] = Math.min(v[k] as number, Math.sqrt((v[k + 1] as number) ** 2 + 2 * decel * ds));
  const t = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    const vs = (v[k - 1] as number) + (v[k] as number);
    t[k] = (t[k - 1] as number) + (vs > 1e-6 ? (2 * ds) / vs : 0);
  }
  return { s0, s1, step: ds, v, t, duration: t[n - 1] as number };
}

/** 출발 뒤 dt(s)의 위치·속도(등가속 구간 역산, dt는 [0, duration]으로 자름). */
export function profileAt(p: RunProfile, dt: number): { s: number; v: number } {
  const n = p.t.length;
  const tt = Math.min(Math.max(dt, 0), p.duration);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((p.t[mid] as number) <= tt) lo = mid;
    else hi = mid;
  }
  const v0 = p.v[lo] as number;
  const v1 = p.v[hi] as number;
  const segT = (p.t[hi] as number) - (p.t[lo] as number);
  const tau = tt - (p.t[lo] as number);
  if (segT <= 1e-9) return { s: p.s0 + lo * p.step, v: v0 };
  const a = (v1 - v0) / segT;
  const s = Math.min(p.step, v0 * tau + 0.5 * a * tau * tau);
  return { s: p.s0 + lo * p.step + s, v: v0 + a * tau };
}

/** 위치 s(구간 안, 잘림)에 닿는 출발 뒤 시간(s) — 등가속 구간 τ = 2d / (v0 + √(v0² + 2ad)). */
export function timeAtS(p: RunProfile, s: number): number {
  const n = p.t.length;
  if (p.step <= 0 || n < 2) return 0;
  const x = Math.min(Math.max(s - p.s0, 0), p.s1 - p.s0);
  const k = Math.min(n - 2, Math.floor(x / p.step));
  const d = x - k * p.step;
  const v0 = p.v[k] as number;
  const v1 = p.v[k + 1] as number;
  const a = (v1 * v1 - v0 * v0) / (2 * p.step);
  const ve = Math.sqrt(Math.max(0, v0 * v0 + 2 * a * d));
  return (p.t[k] as number) + (v0 + ve > 1e-9 ? (2 * d) / (v0 + ve) : 0);
}

/** 정차 위치와 같다고 볼 거리(m) — 트립 시작·끝이 정차 위치면 시발·종착(속도 0). */
export const RAIL_STOP_EPS_M = 0.01;

/**
 * 트립 주행 구간(M07, ADR-0071): [from → 정차 1 → … → 정차 n → to]의 곡선 n + 1개. 시작이 첫 정차보다 앞이면 영역 밖에서
 * 달려 들어오는 것(진입 속도 = 그 점 제한속도), 첫 정차와 같으면 시발(0). 끝도 같다. 정차가 없으면 통과 한 구간.
 * 시간표 컴파일러(정차 시각 계산)와 sim(위치 = 시각의 순수 함수)이 이 함수 하나를 쓴다.
 */
export function tripLegs(
  limits: ArrayLike<number>,
  stepM: number,
  from: number,
  to: number,
  stopS: readonly number[],
): RunProfile[] {
  const limAt = (s: number): number =>
    limits[Math.min(limits.length - 1, Math.max(0, Math.floor(s / stepM)))] as number;
  const marks = [from, ...stopS, to];
  const legs: RunProfile[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const a = marks[i] as number;
    const b = marks[i + 1] as number;
    const vStart = i === 0 && (stopS.length === 0 || a < (stopS[0] as number) - RAIL_STOP_EPS_M) ? limAt(a) : 0;
    const last = i + 2 === marks.length;
    const vEnd = last && (stopS.length === 0 || b > (stopS.at(-1) as number) + RAIL_STOP_EPS_M) ? limAt(b) : 0;
    legs.push(computeRunProfile(limits, stepM, a, Math.max(a, b), vStart, vEnd));
  }
  return legs;
}
