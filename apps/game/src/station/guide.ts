// 역 근접 안내(M07-T06 후속 → M10-T01 UI HUD): 걷는 중 가까운 출구를 찾아 화면 위 안내(종류·역·출구·거리·시선 기준 방향 — 글은 @sanpo/ui가 3개 언어로).
// 거리 쪽(승강장 밖, 개찰구 80 m 안) → gate, 개찰구를 지나 계단 15 m 안 → stairs, 승강장(표식 60 m 안·높이 ±3 m) → platformExit. 순수 함수.
import type { Vec3d } from '@sanpo/core';
import type { GuideModel } from '@sanpo/ui';
import { type AccessFile, forwardOf, rad } from './layout.ts';

const GATE_R = 80;
const STAIRS_R = 15;
const PLATFORM_R = 60;
const DY_STREET = 8;
const DY_PLATFORM = 3;
const ARROWS = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'] as const;

/** 시선 yaw 기준 목표 방향(도, 0 = 앞, + = 왼쪽, 45° 단위). */
export function arrowDegTo(from: Vec3d, to: readonly number[], yawRad: number): number {
  const b = Math.atan2(-((to[0] as number) - from.x), -((to[2] as number) - from.z));
  let rel = b - yawRad;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const k = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
  return k * 45;
}

/** 시선 yaw 기준 목표 방향 화살표(yaw 반시계 + = 왼쪽). */
export function arrowTo(from: Vec3d, to: readonly number[], yawRad: number): string {
  return ARROWS[arrowDegTo(from, to, yawRad) / 45] as string;
}

const flat = (a: Vec3d, p: readonly number[]) => Math.hypot(a.x - (p[0] as number), a.z - (p[2] as number));

/** 지금 보일 안내(없으면 null). onPlatform = 발이 승강장 윗면 위(거리·승강장 높이 차가 1.6–2.2 m뿐이라 높이로 가르지 않는다). */
export function guideModel(access: AccessFile, p: Vec3d, yawRad: number, onPlatform: boolean): GuideModel | null {
  let best: GuideModel | null = null;
  const offer = (g: GuideModel) => {
    if (!best || g.distanceM < best.distanceM) best = g;
  };
  for (const s of access.stations)
    for (const e of s.exits) {
      const g = e.gate.posWF;
      const f = forwardOf(rad(e.gate.yawDeg));
      const past = (p.x - (g[0] as number)) * f.x + (p.z - (g[2] as number)) * f.z > 0.4;
      const base = { station: s.name, exit: e.name };
      const dg = flat(p, g);
      const ds = flat(p, e.stairs.posWF);
      if (!onPlatform && Math.abs(p.y - (g[1] as number)) < DY_STREET) {
        if (past && ds <= STAIRS_R)
          offer({
            ...base,
            kind: 'stairs',
            distanceM: Math.round(ds),
            arrowDeg: arrowDegTo(p, e.stairs.posWF, yawRad),
          });
        else if (!past && dg <= GATE_R)
          offer({ ...base, kind: 'gate', distanceM: Math.round(dg), arrowDeg: arrowDegTo(p, g, yawRad) });
      }
      const pf = e.platform.posWF;
      const dp = flat(p, pf);
      if (onPlatform && Math.abs(p.y - (pf[1] as number)) < DY_PLATFORM && dp <= PLATFORM_R)
        offer({ ...base, kind: 'platformExit', distanceM: Math.round(dp), arrowDeg: arrowDegTo(p, pf, yawRad) });
    }
  return best;
}
