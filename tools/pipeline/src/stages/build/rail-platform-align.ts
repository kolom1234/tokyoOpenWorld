// 승강장 높이 맞춤(M07-T06 — ADR-0081): 섬식 승강장 하나를 두 선로가 쓰는데 DEM 표본 레일 높이가 선로마다 달라(하라주쿠 내회·외회 1.3 m)
// 한쪽 열차 바닥이 승강장보다 1.4 m 높았다(걸어서 탈 수 없음). 승강장마다 정차 선로들의 레일 윗면 평균을 목표로 승강장 길이(+ 여유 20 m) 안은 목표 높이,
// 바깥 RAMP_M에 걸쳐 원래 높이로 선형 복귀. 승강장 구간이 기울어 있으면(하라주쿠 ≈ 1 % — 칸 끝이 승강장보다 1.2 m 위·아래) 평평하게 편다. 승강장 topY = 목표 + PLATFORM_TOP_M.
import type { RailPlatformMeta, RailTrackMeta } from '@sanpo/tile-format';

export const ALIGN_MARGIN_M = 20;
export const RAMP_M = 120;

export interface AlignReport {
  platforms: number;
  maxShiftM: number;
}

function railTop(pts: readonly number[], t: RailTrackMeta, s: number): number {
  const k = Math.min(t.ptCount - 1, Math.max(0, Math.round(s / t.stepM)));
  return pts[(t.ptOffset + k) * 3 + 1] as number;
}

/** pts(xyz 평탄 배열)의 y를 제자리에서 고친다. platformTopM = 레일 윗면 위 승강장 높이. */
export function alignPlatformRails(
  tracks: readonly RailTrackMeta[],
  pts: number[],
  platforms: RailPlatformMeta[],
  platformTopM: number,
): AlignReport {
  const uses = platforms.map(() => [] as { t: RailTrackMeta; s: number; len: number }[]);
  for (const t of tracks)
    for (const st of t.stops)
      if (st.platform !== undefined) uses[st.platform]?.push({ t, s: st.s, len: st.platformLengthM });
  let maxShift = 0;
  let n = 0;
  uses.forEach((list, pi) => {
    if (list.length === 0) return;
    const target = list.reduce((a, u) => a + railTop(pts, u.t, u.s), 0) / list.length;
    (platforms[pi] as RailPlatformMeta).topY = Math.round((target + platformTopM) * 100) / 100;
    n++;
    for (const u of list) {
      const half = u.len / 2 + ALIGN_MARGIN_M;
      // 승강장 구간은 목표 높이로 평평하게(기울어진 선로도 — 역은 수평), 바깥은 원래 높이로 선형 복귀.
      for (let k = 0; k < u.t.ptCount; k++) {
        const d = Math.abs(k * u.t.stepM - u.s);
        const w = d <= half ? 1 : Math.max(0, 1 - (d - half) / RAMP_M);
        if (w <= 0) continue;
        const i = (u.t.ptOffset + k) * 3 + 1;
        const dy = (target - (pts[i] as number)) * w;
        maxShift = Math.max(maxShift, Math.abs(dy));
        pts[i] = (pts[i] as number) + dy;
      }
    }
  });
  return { platforms: n, maxShiftM: Math.round(maxShift * 100) / 100 };
}
