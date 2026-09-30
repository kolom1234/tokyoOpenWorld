// 전선 메시(M05-T03): 경간마다 포물선 처짐(카테너리 근사 y = lerp − 4·sag·t(1−t)) 8토막, 토막마다 십자 리본 2장(수평·수직).
// 위치 = 중심선, `_OFF` = 모서리 방향 — 렌더가 폭을 max(3 cm, 거리 비례 ≈ 1 px)로 편다(얇은 선이 TAAU에 사라지지 않게).
// 셀 로컬 좌표. decals.mesh의 두 번째 프리미티브(머티리얼 power_wire, 양면)로 들어간다. see ADR-0051
import type { V2 } from './context.ts';
import type { WireSpan } from './poles.ts';

const SEGMENTS = 8;

export interface WireBuf {
  /** 중심선 위치(셀 로컬) — 리본 폭은 렌더가 `_OFF` × 폭(거리 비례 최소 ≈ 1 px)으로 편다. */
  pos: number[];
  nrm: number[];
  /** 리본 모서리 오프셋 방향(단위 × ±1). */
  off: number[];
  idx: number[];
}

export function emptyWires(): WireBuf {
  return { pos: [], nrm: [], off: [], idx: [] };
}

/** 토막 p→q 리본 한 장: 오프셋 방향 o(±), 법선 n. */
function ribbon(
  w: WireBuf,
  p: readonly number[],
  q: readonly number[],
  o: readonly number[],
  n: readonly number[],
): void {
  const base = w.pos.length / 3;
  for (const [v, sgn] of [
    [p, -1],
    [q, -1],
    [q, 1],
    [p, 1],
  ] as const) {
    w.pos.push(v[0] as number, v[1] as number, v[2] as number);
    w.nrm.push(n[0] as number, n[1] as number, n[2] as number);
    w.off.push((o[0] as number) * sgn, (o[1] as number) * sgn, (o[2] as number) * sgn);
  }
  w.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** 경간 1개를 w에 추가. groundAt = 셀 로컬 지면 높이(끝점 아래). ox/oz = 셀 원점 WF. 반환 = 삼각형 수. */
export function addWire(
  w: WireBuf,
  s: WireSpan,
  ox: number,
  oz: number,
  groundAt: (x: number, z: number) => number,
): number {
  const a: V2 = [s.a[0] - ox, s.a[1] - oz];
  const b: V2 = [s.b[0] - ox, s.b[1] - oz];
  const ya = groundAt(a[0], a[1]) + s.ha;
  const yb = groundAt(b[0], b[1]) + s.hb;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1) return 0;
  const side = [-(b[1] - a[1]) / L, 0, (b[0] - a[0]) / L];
  const at = (t: number): number[] => [
    a[0] + (b[0] - a[0]) * t,
    ya + (yb - ya) * t - 4 * s.sag * t * (1 - t),
    a[1] + (b[1] - a[1]) * t,
  ];
  for (let i = 0; i < SEGMENTS; i++) {
    const p = at(i / SEGMENTS);
    const q = at((i + 1) / SEGMENTS);
    ribbon(w, p, q, side, [0, 1, 0]);
    ribbon(w, p, q, [0, 1, 0], side);
  }
  return SEGMENTS * 4;
}
