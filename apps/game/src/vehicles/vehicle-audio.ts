// 탈것 소리 입력(M08-T04, ADR-0090): drive·cycle 중 physics vehicleState + traversal HUD → audio VehicleAudioState, 벨(HUD bell 횟수가 바뀌면 핸들 높이에서 울림).
import type { AudioService, VehicleAudioState } from '@sanpo/audio';
import type { PhysicsService, VehicleState } from '@sanpo/physics';
import type { TraversalService } from '@sanpo/traversal';

/** 횡 슬립각(deg) 정규화 — 이 각이면 끽 소리 최대 쪽. */
const SLIP_LAT_DEG = 12;
const BELL_UP_M = 1.1;

/** 가장 미끄러지는 바퀴 0..1. */
export function wheelSlip(v: Pick<VehicleState, 'wheels'>): number {
  let s = 0;
  for (const w of v.wheels) s = Math.max(s, Math.abs(w.slipLong), Math.abs(w.slipLatDeg) / SLIP_LAT_DEG);
  return Math.min(1, s);
}

export function vehicleAudioOf(
  t: TraversalService,
  physics: PhysicsService | undefined,
  wetness: number,
): VehicleAudioState | null {
  const d = t.mode === 'drive' || t.mode === 'cycle' ? t.hud.drive : undefined;
  const v = d && physics?.vehicleState(d.vehicle);
  if (!d || !v) return null;
  return {
    kind: d.kind === 'bicycle' ? 'bicycle' : 'car',
    rpm: v.rpm,
    throttle: v.throttle,
    speedMs: v.speedMs,
    shifting: v.shifting,
    slip: wheelSlip(v),
    wetness,
    surface: v.wheels[0]?.contactMaterial ?? 1,
    interior: d.view === 'cockpit',
  };
}

/** 프레임마다: 탈것 소리 + 벨. */
export function createVehicleAudio(
  audio: AudioService,
): (t: TraversalService, ph: PhysicsService | undefined, wet: number) => void {
  let bell = -1;
  return (t, ph, wet) => {
    audio.setVehicleState(vehicleAudioOf(t, ph, wet));
    const n = t.hud.drive?.bell ?? -1;
    if (n > bell && bell >= 0 && t.mode === 'cycle') {
      const p = t.player.posWF;
      audio.playAt('bicycleBell', { x: p.x, y: p.y + BELL_UP_M, z: p.z });
    }
    bell = n;
  };
}
