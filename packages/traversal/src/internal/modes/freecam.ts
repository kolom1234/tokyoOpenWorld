// freecam 모드(드론/포토): input 'fly' 컨텍스트 → FreeRig 적분 → (physics 있으면) 지오메트리 진입 방지(free-guard.ts) → CameraState.
// physics 없이도 동작(가드 생략). see docs/09-traversal.md §2 freecam
import type { CameraState, FrameContext, ModeId } from '@sanpo/core';
import type { FreecamParams, ModeOutput, TraversalContext, TraversalMode, TraversalSettings } from '../../api.ts';
import { createFreeGuard, type FreeGuard, resetFreeGuard, stepFreeGuard } from '../camera/free-guard.ts';
import { clampPitch, createFreeRigState, type FreeRigIntent, rigQuat, stepFreeRig } from '../camera/free-rig.ts';

const MS_TO_KMH = 3.6;

function isFreecamParams(p: unknown): p is FreecamParams {
  const q = p as Partial<FreecamParams> | undefined;
  return typeof q?.posWF?.x === 'number' && typeof q.yawRad === 'number' && typeof q.pitchRad === 'number';
}

function readIntent(ctx: TraversalContext, lookRadPerPx: number): FreeRigIntent {
  const s = ctx.input.state;
  return {
    moveX: s.axis('moveX'),
    moveY: s.axis('moveY'),
    fly: s.axis('fly'),
    yawDeltaRad: -s.axis('lookX') * lookRadPerPx,
    pitchDeltaRad: -s.axis('lookY') * lookRadPerPx,
    wheelNotches: s.axis('wheel'),
    sprint: s.pressed('sprint'),
  };
}

export interface FreecamMode extends TraversalMode {
  /** 지오메트리 진입 방지 상태(디버그·테스트). */
  readonly guard: Readonly<FreeGuard>;
}

export function createFreecamMode(settings: Readonly<TraversalSettings>): FreecamMode {
  const cfg = settings.freecam;
  const rig = createFreeRigState({ x: 0, y: 0, z: 0 }, 0, 0, cfg.startSpeedMs);
  const guard = createFreeGuard();
  const camera: CameraState = {
    posWF: rig.posWF,
    quat: { x: 0, y: 0, z: 0, w: 1 },
    fovDeg: settings.fovDeg,
    near: settings.nearM,
  };
  const output: ModeOutput = {
    camera,
    interest: [{ posWF: rig.posWF, velWF: rig.velWF, weight: 1, kind: 'camera' }],
    hud: { speedKmh: 0 },
  };

  return {
    id: 'freecam',
    requires: [],
    guard,
    enter(ctx: TraversalContext, _from: ModeId, params?: unknown) {
      ctx.input.setContext('fly');
      if (isFreecamParams(params)) {
        Object.assign(rig.posWF, params.posWF);
        rig.yawRad = params.yawRad;
        rig.pitchRad = clampPitch(params.pitchRad);
      }
      rig.velWF.x = rig.velWF.y = rig.velWF.z = 0;
      rigQuat(camera.quat, rig.yawRad, rig.pitchRad);
      resetFreeGuard(guard);
    },
    update(frame: FrameContext, ctx: TraversalContext) {
      const ground = ctx.ground.groundHeightAt(rig.posWF.x, rig.posWF.z);
      stepFreeRig(rig, readIntent(ctx, settings.lookRadPerPx), frame.dtReal, cfg, ground);
      stepFreeGuard(guard, rig, ctx.physics);
      rigQuat(camera.quat, rig.yawRad, rig.pitchRad);
      output.hud.speedKmh = Math.hypot(rig.velWF.x, rig.velWF.y, rig.velWF.z) * MS_TO_KMH;
      return output;
    },
    exit() {
      rig.velWF.x = rig.velWF.y = rig.velWF.z = 0;
    },
    teleport(posWF, yawRad) {
      Object.assign(rig.posWF, posWF);
      rig.yawRad = yawRad;
      rig.velWF.x = rig.velWF.y = rig.velWF.z = 0;
      rigQuat(camera.quat, rig.yawRad, rig.pitchRad);
      resetFreeGuard(guard);
    },
  };
}
