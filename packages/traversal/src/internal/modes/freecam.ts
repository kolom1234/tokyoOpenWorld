// freecam 모드(드론/포토): input 'fly' 컨텍스트 → FreeRig 적분 → (physics 있으면) 지오메트리 진입 방지(free-guard.ts) → CameraState.
// physics 없이도 동작(가드 생략). G(land, ADR-0083) = 컨텍스트 landing(카메라 위치)이 준 안전한 자리에 walk(exact)로 — 실패 이유는 hud.landing.
// see docs/09-traversal.md §2 freecam
import type { CameraState, FrameContext, ModeId } from '@sanpo/core';
import type {
  FreecamParams,
  ModeOutput,
  TraversalContext,
  TraversalMode,
  TraversalSettings,
  WalkParams,
} from '../../api.ts';
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

/** G 내리기 상태: seq = 시도 번호(모드 진입·새 시도마다 — 늦은 결과 버림), next = 다음 프레임 walk 요청. */
interface LandState {
  seq: number;
  pending: boolean;
  next: WalkParams | undefined;
}

/** 진행 중 시도 버림(모드 진입·나감). */
function cancelLanding(st: LandState): void {
  st.seq++;
  st.pending = false;
  st.next = undefined;
}

function startLanding(
  ctx: TraversalContext,
  posWF: FreecamParams['posWF'],
  yawRad: number,
  st: LandState,
  out: ModeOutput,
): void {
  const seq = ++st.seq;
  if (!ctx.landing || !ctx.physics) {
    out.hud.landing = { seq, state: 'failed', reason: 'not-ready' };
    return;
  }
  st.pending = true;
  out.hud.landing = { seq, state: 'searching' };
  const fail = (reason: 'not-ready'): void => {
    if (seq !== st.seq) return;
    st.pending = false;
    out.hud.landing = { seq, state: 'failed', reason };
  };
  ctx.landing({ ...posWF }).then(
    (r) => {
      if (seq !== st.seq) return;
      st.pending = false;
      if (r.ok) st.next = { posWF: { ...r.posWF }, yawRad, pitchRad: 0, exact: true };
      else out.hud.landing = { seq, state: 'failed', reason: r.reason };
    },
    () => fail('not-ready'),
  );
}

export interface FreecamMode extends TraversalMode {
  /** 지오메트리 진입 방지 상태(디버그·테스트). */
  readonly guard: Readonly<FreeGuard>;
}

export function createFreecamMode(settings: Readonly<TraversalSettings>): FreecamMode {
  const cfg = settings.freecam;
  const rig = createFreeRigState({ x: 0, y: 0, z: 0 }, 0, 0, cfg.startSpeedMs);
  const guard = createFreeGuard();
  const land: LandState = { seq: 0, pending: false, next: undefined };
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
      cancelLanding(land);
      delete output.hud.landing;
    },
    update(frame: FrameContext, ctx: TraversalContext) {
      delete output.next;
      if (land.next) {
        output.next = { mode: 'walk', params: land.next };
        land.next = undefined;
      } else if (ctx.input.state.justPressed('land') && !land.pending)
        startLanding(ctx, rig.posWF, rig.yawRad, land, output);
      const ground = ctx.ground.groundHeightAt(rig.posWF.x, rig.posWF.z);
      stepFreeRig(rig, readIntent(ctx, settings.lookRadPerPx), frame.dtReal, cfg, ground);
      stepFreeGuard(guard, rig, ctx.physics);
      rigQuat(camera.quat, rig.yawRad, rig.pitchRad);
      output.hud.speedKmh = Math.hypot(rig.velWF.x, rig.velWF.y, rig.velWF.z) * MS_TO_KMH;
      return output;
    },
    exit() {
      rig.velWF.x = rig.velWF.y = rig.velWF.z = 0;
      cancelLanding(land);
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
