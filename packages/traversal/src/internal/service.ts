// createTraversal: FSM + 기본 모드 등록 + phase 20 시스템(C키 freecam 토글 → 활성 모드 update → 카메라·관심점·HUD). see docs/modules/traversal.md
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
import { DEFAULT_TRAVERSAL_SETTINGS } from './settings.ts';

/** 01-architecture §5: traversal = phase 20(physics 이전에 의도·카메라 목표). traversalPost(35)는 M04. */
export const TRAVERSAL_PHASE = 20;

/** C: freecam ↔ 직전 모드. 직전 모드가 없거나 진입 불가(physics 없음)면 그대로 유지. */
function handleFreecamToggle(fsm: ModeFsm, ctx: TraversalContext): void {
  if (!ctx.input.state.justPressed('freeCam')) return;
  if (fsm.current?.id !== 'freecam') fsm.request('freecam');
  else if (fsm.previous !== undefined) fsm.request(fsm.previous);
}

const CAMERA_FORWARD: Readonly<Vec3> = { x: 0, y: 0, z: -1 };
const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/** 카메라 회전의 수평 방위(yaw: +Y축 반시계, 0 = −Z). 수직을 볼 때도 피치 ±89° 제한으로 정의된다. */
function yawOfQuat(q: CameraState['quat']): number {
  const f = vec3ApplyQuat(scratch, CAMERA_FORWARD, q);
  return Math.atan2(-f.x, -f.z);
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
      // physics 전(M04)에는 플레이어 바디가 없다 → 카메라 위치를 플레이어로 보고한다(스트리밍 관심점·HUD용).
      vec3Copy(player.posWF, o.camera.posWF);
      player.yawRad = yawOfQuat(o.camera.quat);
      player.mode = id;
    },
  };
}

export function createTraversal(ctx: TraversalContext, opts: TraversalOptions = {}): TraversalService {
  const settings = mergeConfig(DEFAULT_TRAVERSAL_SETTINGS, opts.settings ?? {});
  const fsm = createModeFsm(ctx);
  fsm.register(createFreecamMode(settings));
  const initial = opts.initial ?? { mode: 'freecam' };
  if (!fsm.request(initial.mode, initial.params))
    throw new Error(`traversal: initial mode '${initial.mode}' unavailable`);

  const out = createOutputState(settings.fovDeg, settings.nearM, initial.mode);

  const system: GameSystem = {
    id: 'traversal',
    phase: TRAVERSAL_PHASE,
    update(frame) {
      handleFreecamToggle(fsm, ctx);
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
    request: (to, params) => fsm.request(to, params),
    teleport(posWF, yawRad) {
      fsm.current?.teleport?.(posWF, yawRad);
      return Promise.resolve();
    },
    register: (mode) => fsm.register(mode),
    systems: () => [system],
  };
}
