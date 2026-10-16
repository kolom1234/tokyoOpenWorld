// 역 근접 안내(M07-T06 후속 — 임시 HUD, M08 지도·HUD가 대체): 걷는 중 가까운 출구를 찾아 화면 위 안내 글(방향 화살표 = 시선 기준, 거리 m).
// 거리 쪽(승강장 밖, 개찰구 80 m 안) → "개찰구 ↗ 32 m", 개찰구를 지나 계단 15 m 안 → "계단(F) ↑ 6 m", 승강장(표식 60 m 안·높이 ±3 m) → "출구 계단(F) ← 20 m". 순수 함수.
import type { Vec3d } from '@sanpo/core';
import { type AccessFile, forwardOf, rad } from './layout.ts';

const GATE_R = 80;
const STAIRS_R = 15;
const PLATFORM_R = 60;
const DY_STREET = 8;
const DY_PLATFORM = 3;
const ARROWS = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'] as const;

/** 시선 yaw 기준 목표 방향 화살표(yaw 반시계 + = 왼쪽). */
export function arrowTo(from: Vec3d, to: readonly number[], yawRad: number): string {
  const b = Math.atan2(-((to[0] as number) - from.x), -((to[2] as number) - from.z));
  let rel = b - yawRad;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const k = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
  return ARROWS[k] as string;
}

const flat = (a: Vec3d, p: readonly number[]) => Math.hypot(a.x - (p[0] as number), a.z - (p[2] as number));

/** 지금 보일 안내(없으면 null). onPlatform = 발이 승강장 윗면 위(거리·승강장 높이 차가 1.6–2.2 m뿐이라 높이로 가르지 않는다). */
export function guideText(access: AccessFile, p: Vec3d, yawRad: number, onPlatform: boolean): string | null {
  let best: { d: number; text: string } | null = null;
  const offer = (d: number, text: string) => {
    if (!best || d < best.d) best = { d, text };
  };
  for (const s of access.stations)
    for (const e of s.exits) {
      const g = e.gate.posWF;
      const f = forwardOf(rad(e.gate.yawDeg));
      const past = (p.x - (g[0] as number)) * f.x + (p.z - (g[2] as number)) * f.z > 0.4;
      const name = `${s.name.ko}역 ${e.name.ko} (${s.name.ja} ${e.name.ja})`;
      const dg = flat(p, g);
      const ds = flat(p, e.stairs.posWF);
      if (!onPlatform && Math.abs(p.y - (g[1] as number)) < DY_STREET) {
        if (past && ds <= STAIRS_R)
          offer(ds, `계단 ${arrowTo(p, e.stairs.posWF, yawRad)} ${Math.round(ds)} m — F로 승강장 · ${name}`);
        else if (!past && dg <= GATE_R) offer(dg, `개찰구 ${arrowTo(p, g, yawRad)} ${Math.round(dg)} m — ${name}`);
      }
      const pf = e.platform.posWF;
      const dp = flat(p, pf);
      if (onPlatform && Math.abs(p.y - (pf[1] as number)) < DY_PLATFORM && dp <= PLATFORM_R)
        offer(dp, `출구 계단 ${arrowTo(p, pf, yawRad)} ${Math.round(dp)} m — F로 ${e.name.ko} (${e.name.ja})`);
    }
  return (best as { text: string } | null)?.text ?? null;
}
