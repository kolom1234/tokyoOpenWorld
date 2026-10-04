// 군중 밀도(10 §4.1, M06-T03·T04): 목표 총수 = (maxA + maxB) × 시간대 곡선[JST 시] × 날씨(비 ×0.6), 스폰 위치 가중 = 핫스팟 배율(원 안 1 → 중심 mult, 선형).
// 조정값 = content/sim/crowd.json(density). 핫스팟 배치·대기 공간 튜닝은 T07.
import type { CrowdParams } from '../../api.ts';

/** 게임 시각 → JST 시(0–23). */
export const hourJst = (ms: number): number => Math.floor((((ms / 3_600_000 + 9) % 24) + 24) % 24);

/** 목표 총수(tier A + B) = (maxA + maxB) × 시간대 곡선[JST 시] × 날씨 등 배율. */
export function totalTarget(p: CrowdParams, gameMs: number, scale = 1): number {
  const a = p.agents;
  if (!a) return 0;
  const k = p.density?.diurnal[hourJst(gameMs)] ?? 1;
  return Math.max(0, Math.round((a.maxA + a.maxB) * k * scale));
}

/** 날씨 밀도 배율(10 §4.1): 비 ×0.6(0.5 mm/h부터). */
export const weatherScale = (rainMmH: number): number => (rainMmH >= 0.5 ? 0.6 : 1);

/** 위치(WF x·z)의 핫스팟 배율(≥ 1). */
export function hotspotWeight(p: CrowdParams, x: number, z: number): number {
  let w = 1;
  for (const h of p.density?.hotspots ?? []) {
    const d = Math.hypot(x - h.centerWF[0], z - h.centerWF[1]);
    if (d < h.radiusM) w = Math.max(w, 1 + (h.mult - 1) * (1 - d / h.radiusM));
  }
  return w;
}

export function maxHotspotWeight(p: CrowdParams): number {
  return Math.max(1, ...(p.density?.hotspots ?? []).map((h) => h.mult));
}
