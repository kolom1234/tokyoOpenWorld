// IDM(Intelligent Driver Model, 10 §5.1, M06-T05): a = a·[1 − (v/v0)^δ − (s*/s)²], s* = s0 + vT + v·Δv / (2√(ab)).
// 앞차 없음 = 간격 ∞. 감속은 −9 m/s²에서 자른다(비상 제동 한계).
export interface IdmParams {
  /** 안전 시간 간격 T(s)·최대 가속 a·편한 감속 b(m/s²)·정지 간격 s0(m)·지수 δ. */
  T: number;
  a: number;
  b: number;
  s0: number;
  delta: number;
}

export const IDM_DEFAULT: IdmParams = { T: 1.5, a: 1.2, b: 2.0, s0: 2.0, delta: 4 };
const MAX_BRAKE = -9;

/** v = 지금 속력, v0 = 원하는 속력, gap = 앞차(또는 정지 지점)까지 순간격(m), dv = v − 앞차 속력. */
export function idmAccel(v: number, v0: number, gap: number, dv: number, p: IdmParams = IDM_DEFAULT): number {
  const free = 1 - (v / Math.max(v0, 0.1)) ** p.delta;
  if (!Number.isFinite(gap)) return Math.max(MAX_BRAKE, p.a * free);
  const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
  const g = Math.max(gap, 0.1);
  return Math.max(MAX_BRAKE, p.a * (free - (sStar / g) ** 2));
}
