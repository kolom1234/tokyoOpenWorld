// @sanpo/traversal 공개 계약: 컨텍스트·모드·서비스. M01-T06 = freecam만(physics 없음). see docs/modules/traversal.md, docs/09-traversal.md §6
import type {
  CameraState,
  DeepPartial,
  EventBus,
  FrameContext,
  GroundQuery,
  I18nKey,
  InterestPoint,
  Logger,
  ModeId,
  PlayerState,
  SystemProvider,
  TrainInfo,
  Vec3d,
} from '@sanpo/core';
import type { InputService } from '@sanpo/input';

/** M04에서 `physics?: PhysicsService`가 추가된다(그 전에는 `requires: ['physics']` 모드 진입 불가 — freecam만). */
export interface TraversalContext {
  input: InputService;
  bus: EventBus;
  log: Logger;
  ground: GroundQuery;
  trains?: () => ReadonlyArray<TrainInfo>;
}
export interface HudHints {
  promptKey?: I18nKey;
  speedKmh?: number;
  nextStationId?: string;
  gear?: string;
  rpm?: number;
}
export interface ModeOutput {
  camera: CameraState;
  interest: InterestPoint[];
  hud: HudHints;
}
export type ModeRequirement = 'physics' | 'trains';
export interface TraversalMode {
  readonly id: ModeId;
  readonly requires: ReadonlyArray<ModeRequirement>;
  enter(ctx: TraversalContext, from: ModeId, params?: unknown): void;
  update(frame: FrameContext, ctx: TraversalContext): ModeOutput;
  exit(ctx: TraversalContext, to: ModeId): void;
  /** 즉시 위치 이동(모드 유지). 없으면 teleport는 이 모드에서 무시된다. */
  teleport?(posWF: Readonly<Vec3d>, yawRad: number): void;
}
/** freecam 진입 파라미터(없으면 직전 포즈 유지). yaw: +Y축 반시계(위에서 봄), 0 = −Z(도북). pitch: 위 +. */
export interface FreecamParams {
  posWF: Vec3d;
  yawRad: number;
  pitchRad: number;
}
export interface FreecamSettings {
  /** 관성 감쇠(1/s) — 목표 속도로 수렴하는 지수 계수(09 §3 FreeRig). */
  dampingPerS: number;
  minSpeedMs: number;
  maxSpeedMs: number;
  startSpeedMs: number;
  /** 휠 1노치당 속도 배율. */
  speedStepPerNotch: number;
  /** Shift(유지) 속도 배율. */
  sprintMultiplier: number;
  /** WF y(T.P. m) 상한. */
  maxAltitudeM: number;
  /** 지면 위 최소 높이(physics 이전 soft 충돌 대용, 지면 모를 때는 미적용). */
  minClearanceM: number;
}
export interface TraversalSettings {
  /** 마우스 감도(rad/CSS px). */
  lookRadPerPx: number;
  fovDeg: number;
  nearM: number;
  freecam: FreecamSettings;
}
export interface TraversalOptions {
  settings?: DeepPartial<TraversalSettings>;
  /** 시작 모드(M04 전에는 'freecam'만 가능). */
  initial?: { mode: ModeId; params?: unknown };
}
export interface TraversalService extends SystemProvider {
  readonly mode: ModeId;
  readonly player: Readonly<PlayerState>;
  /** 이번 프레임 카메라(WF float64). phase 20 이후 확정. */
  readonly camera: Readonly<CameraState>;
  readonly hud: Readonly<HudHints>;
  readonly interest: ReadonlyArray<InterestPoint>;
  /** requires 미충족·미등록 모드는 false. */
  request(to: ModeId, params?: unknown): boolean;
  /** M02 이전: 즉시 이동 후 resolve(스트리밍 대기·transition 모드는 M02-T05 이후). */
  teleport(posWF: Readonly<Vec3d>, yawRad: number): Promise<void>;
  register(mode: TraversalMode): void;
}
