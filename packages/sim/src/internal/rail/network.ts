// 철도 망 런타임(M07-T03, ADR-0072): rail.bin(RailNetwork) → 선로별 표본 보간. 칸 자세 = 앞·뒤 대차 위치(선로 위 s ± 대차 반간격)의
// 가운데(곡선에서 차체가 안쪽으로 — 실제와 같다)·yaw(뒤 → 앞)·pitch. 터널 플래그 = 그리지 않음(10 §6.3).
import { RAIL_FLAG, type RailNetwork, type RailTrackMeta } from '@sanpo/tile-format';

export interface TrackRt {
  meta: RailTrackMeta;
  /** 표본 제한속도(m/s) — tripLegs 입력. */
  limits: Float32Array;
}

export interface RailRt {
  net: RailNetwork;
  tracks: Map<string, TrackRt>;
}

export function createRailRt(net: RailNetwork): RailRt {
  const tracks = new Map<string, TrackRt>();
  for (const meta of net.tracks)
    tracks.set(meta.id, { meta, limits: net.speed.subarray(meta.ptOffset, meta.ptOffset + meta.ptCount) });
  return { net, tracks };
}

/** 선로 위 s(잘림)의 WF 위치(표본 선형 보간) → out[o..o+2]. */
export function pointAt(rt: RailRt, t: RailTrackMeta, s: number, out: Float64Array | number[], o = 0): void {
  const n = t.ptCount;
  const x = Math.min(Math.max(s / t.stepM, 0), n - 1);
  const k = Math.min(n - 2, Math.floor(x));
  const f = x - k;
  const P = rt.net.points;
  const a = (t.ptOffset + k) * 3;
  const b = a + 3;
  out[o] = (P[a] as number) + ((P[b] as number) - (P[a] as number)) * f;
  out[o + 1] = (P[a + 1] as number) + ((P[b + 1] as number) - (P[a + 1] as number)) * f;
  out[o + 2] = (P[a + 2] as number) + ((P[b + 2] as number) - (P[a + 2] as number)) * f;
}

/** 표본 s가 터널인가. */
export function inTunnel(rt: RailRt, t: RailTrackMeta, s: number): boolean {
  const k = Math.min(t.ptCount - 1, Math.max(0, Math.round(s / t.stepM)));
  return ((rt.net.flags[t.ptOffset + k] as number) & RAIL_FLAG.tunnel) !== 0;
}

export interface CarPose {
  x: number;
  y: number;
  z: number;
  /** 전방(진행 방향) = (−sin yaw, 0, −cos yaw) — 차량·보행자와 같은 규약. */
  yaw: number;
  /** 앞(−Z 로컬)이 높으면 +. */
  pitch: number;
}

const fa = new Float64Array(3);
const fb = new Float64Array(3);

/** 칸 중심 s·대차 반간격 b → 자세(대차 두 점의 가운데, 레일 윗면 높이). */
export function carPose(rt: RailRt, t: RailTrackMeta, s: number, b: number, out: CarPose): CarPose {
  pointAt(rt, t, s + b, fa);
  pointAt(rt, t, s - b, fb);
  const dx = (fa[0] as number) - (fb[0] as number);
  const dy = (fa[1] as number) - (fb[1] as number);
  const dz = (fa[2] as number) - (fb[2] as number);
  out.x = ((fa[0] as number) + (fb[0] as number)) / 2;
  out.y = ((fa[1] as number) + (fb[1] as number)) / 2;
  out.z = ((fa[2] as number) + (fb[2] as number)) / 2;
  out.yaw = Math.atan2(-dx, -dz);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-9);
  return out;
}
