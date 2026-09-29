// createTraversal: FSM + 기본 모드(freecam·walk) 등록 + phase 20 시스템(C키 freecam 토글 → 활성 모드 update → 카메라·관심점·HUD·플레이어). see docs/modules/traversal.md
import {
  type CameraState,
  type GameSystem,
  type ModeId,
  mergeConfig,
  type PlayerState,
  quatCopy,
  type Vec3,
  vec3ApplyQuat,
  vec3Copy,
} from '@sanpo/core';
import type { ModeOutput, TraversalContext, TraversalOptions, TraversalService } from '../api.ts';
import { createModeFsm, type ModeFsm } from './fsm.ts';
import { createFreecamMode } from './modes/freecam.ts';
import { createWalkMode } from './modes/walk.ts';
import { DEFAULT_TRAVERSAL_SETTINGS } from './settings.ts';

/** 01-architecture §5: traversal = phase 20(physics 이전에 의도·카메라 목표). traversalPost(35)는 M04. */
export const TRAVERSAL_PHASE = 20;

const CAMERA_FORWARD: Readonly<Vec3> = { x: 0, y: 0, z: -1 };
const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/** 카메라 회전의 수평 방위(yaw: +Y축 반시계, 0 = −Z). 수직을 볼 때도 피치 ±89° 제한으로 정의된다. */
function yawOfQuat(q: CameraState['quat']): number {
  const f = vec3ApplyQuat(scratch, CAMERA_FORWARD, q);
  return Math.atan2(-f.x, -f.z);
}

function pitchOfQuat(q: CameraState['quat']): number {
  const f = vec3ApplyQuat(scratch, CAMERA_FORWARD, q);
  return Math.asin(Math.max(-1, Math.min(1, f.y)));
}

/**
 * C: freecam ↔ 직전 모드(없으면 walk). 전환 파라미터 = 지금 카메라(freecam은 그 자리에서 시작, walk는 바디 복귀 또는 그 아래 지면).
 * 진입 불가(physics 없음)면 그대로 유지.
 */
function handleFreecamToggle(fsm: ModeFsm, ctx: TraversalContext, camera: Readonly<CameraState>): void {
  if (!ctx.input.state.justPressed('freeCam')) return;
  const params = { posWF: { ...camera.posWF }, yawRad: yawOfQuat(camera.quat), pitchRad: pitchOfQuat(camera.quat) };
  if (fsm.current?.id !== 'freecam') fsm.request('freecam', params);
  else fsm.request(fsm.previous ?? 'walk', params);
}

interface OutputState {
  readonly camera: CameraState;
  readonly player: PlayerState;
  readonly last: ModeOutput;
  apply(o: ModeOutput, mode: ModeId): void;
}

/** 서비스가 노출하는 카메라·플레이어(참조 고정 — FrameSource가 같은 객체를 계속 읽는다). */
function createOutputState(fovDeg: number, near: number, mode: ModeId): OutputState {
  const camera: CameraState = { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg, near };
  const player: PlayerState = { posWF: { x: 0, y: 0, z: 0 }, velWF: { x: 0, y: 0, z: 0 }, yawRad: 0, mode };
  let last: ModeOutput = { camera, interest: [], hud: {} };
  return {
    camera,
    player,
    get last() {
      return last;
    },
    apply(o, id) {
      last = o;
      vec3Copy(camera.posWF, o.camera.posWF);
      quatCopy(camera.quat, o.camera.quat);
      camera.fovDeg = o.camera.fovDeg;
      camera.near = o.camera.near;
      // 바디가 없는 모드(freecam)는 카메라 위치·방위를 플레이어로 보고한다(스트리밍 관심점·물리 반경·HUD용).
      if (o.player) {
        vec3Copy(player.posWF, o.player.posWF);
        vec3Copy(player.velWF, o.player.velWF);
        player.yawRad = o.player.yawRad;
      } else {
        vec3Copy(player.posWF, o.camera.posWF);
        player.velWF.x = player.velWF.y = player.velWF.z = 0;
        player.yawRad = yawOfQuat(o.camera.quat);
      }
      player.mode = id;
    },
  };
}

export function createTraversal(ctx: TraversalContext, opts: TraversalOptions = {}): TraversalService {
  const settings = mergeConfig(DEFAULT_TRAVERSAL_SETTINGS, opts.settings ?? {});
  const fsm = createModeFsm(ctx);
  fsm.register(createFreecamMode(settings));
  const walk = createWalkMode(settings);
  fsm.register(walk);
  const initial = opts.initial ?? { mode: 'freecam' };
  if (!fsm.request(initial.mode, initial.params))
    throw new Error(`traversal: initial mode '${initial.mode}' unavailable`);

  const out = createOutputState(settings.fovDeg, settings.nearM, initial.mode);

  const system: GameSystem = {
    id: 'traversal',
    phase: TRAVERSAL_PHASE,
    update(frame) {
      handleFreecamToggle(fsm, ctx, out.camera);
      const mode = fsm.current;
      if (mode !== undefined) out.apply(mode.update(frame, ctx), mode.id);
    },
    dispose() {},
  };

  return {
    get mode() {
      return fsm.current?.id ?? initial.mode;
    },
    player: out.player,
    camera: out.camera,
    get hud() {
      return out.last.hud;
    },
    get interest() {
      return out.last.interest;
    },
    get view() {
      return walk.view;
    },
    request: (to, params) => fsm.request(to, params),
    teleport(posWF, yawRad) {
      fsm.current?.teleport?.(posWF, yawRad);
      return Promise.resolve();
    },
    register: (mode) => fsm.register(mode),
    systems: () => [system],
  };
}
