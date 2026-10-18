// 운전 계기·탑승 안내(M08 임시 DOM → M10-T02 UI HUD): drive·cycle 중 계기 모델(속도·기어·RPM·등화·ABS/TCS/AEB·제한 속도·정지선·역주행·보도)을 shell/hud-state로,
// walk 중 운전석 문 앞이면 탑승 안내(hud.enterable). 하차 실패·적신호 통과는 알림(번역 키). 게임 로직 없음 — traversal hud만 읽는다.
import type { GameSystem, Vec3d } from '@sanpo/core';
import type { DriveHud, TraversalService } from '@sanpo/traversal';
import type { DriveModel } from '@sanpo/ui';
import { setDrive, setPrompt } from '../shell/hud-state.ts';
import { notice } from '../station/hud.ts';
import type { DriveGuide } from './traffic-guide.ts';

const RPM_MAX = 6500;

/** 탑승 안내(가상 브랜드 — 실제 운영사 아님): 카셰어 SANPO Car · 공유자전거 SANPO Cycle. */
function enterPrompt(doc: Document, kind: 'sedan' | 'bicycle' | undefined): void {
  setPrompt(doc, 'vehicle', kind ? { key: kind === 'bicycle' ? 'hud.prompt.rideBike' : 'hud.prompt.driveCar' } : null);
}

/** traversal 계기 + 교통 안내 → UI 계기 모델. */
export function driveModel(d: DriveHud, g: Readonly<DriveGuide> | undefined): DriveModel {
  return {
    kind: d.kind,
    speedKmh: d.speedKmh,
    gear: d.gear,
    rpm: Math.max(0, Math.min(1, d.rpm / RPM_MAX)),
    lights: d.lights,
    indicator: d.indicator,
    braking: d.braking,
    abs: d.abs,
    tcs: d.tcs,
    aeb: d.aeb,
    sidewalk: d.sidewalk,
    limitKmh: g?.limitKmh ?? null,
    stop: g?.stop ?? null,
    wrongWay: g?.wrongWay ?? false,
  };
}

/** phase 67(HUD). */
export function driveHudSystem(
  doc: Document,
  traversal: TraversalService,
  guide?: { update(pos: Readonly<Vec3d>, yawRad: number, dtS: number): DriveGuide },
): GameSystem {
  let lastExit: DriveHud['exit'] = 'ready';
  return {
    id: 'wiring.driveHud',
    phase: 67,
    update(f) {
      const d = traversal.mode === 'drive' || traversal.mode === 'cycle' ? traversal.hud.drive : undefined;
      const g = d ? guide?.update(traversal.player.posWF, traversal.player.yawRad, f.dtReal) : undefined;
      setDrive(doc, d ? driveModel(d, g) : null);
      if (g?.ranRed) notice(doc, { key: 'hud.notice.ranRed' });
      enterPrompt(doc, traversal.mode === 'walk' ? traversal.hud.enterable : undefined);
      const exit = d?.exit ?? 'ready';
      if (exit !== lastExit) {
        if (exit === 'moving') notice(doc, { key: 'hud.notice.exitMoving' });
        else if (exit === 'blocked') notice(doc, { key: 'hud.notice.exitBlocked' });
      }
      lastExit = exit;
    },
    dispose() {
      setDrive(doc, null);
      setPrompt(doc, 'vehicle', null);
    },
  };
}
