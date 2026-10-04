// 군중 밀도(10 §4.1, M06-T03): tier A 목표 수 = maxA × 시간대 곡선[JST 시] × 날씨(맑음 1 — M09), 스폰 위치 가중 = 핫스팟 배율(원 안 1 → 중심 mult, 선형).
// 조정값 = content/sim/crowd.json(density). 핫스팟 배치·대기 공간 튜닝은 T07.
import type { CrowdParams } from '../../api.ts';

/** 게임 시각 → JST 시(0–23). */
export const hourJst = (ms: number): number => Math.floor((((ms / 3_600_000 + 9) % 24) + 24) % 24);

export function tierATarget(p: CrowdParams, gameMs: number): number {
  const a = p.agents;
  if (!a) return 0;
  const k = p.density?.diurnal[hourJst(gameMs)] ?? 1;
  return Math.max(0, Math.min(a.maxA, Math.round(a.maxA * k)));
}

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
