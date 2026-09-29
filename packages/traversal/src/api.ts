// @sanpo/traversal 공개 계약: 컨텍스트·모드·서비스. freecam(M01-T06) + walk(M04-T03, physics 필요). see docs/modules/traversal.md, docs/09-traversal.md §6
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
  Vec3,
  Vec3d,
} from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { PhysicsService } from '@sanpo/physics';

/**
 * 모드 컨텍스트. physics가 없으면 `requires: ['physics']` 모드(walk…) 진입 불가 — freecam만.
 * 요구조건은 전환 요청 때마다 다시 본다(월드 로드 뒤 생기는 physics는 getter로 넘긴다).
 */
export interface TraversalContext {
  input: InputService;
  bus: EventBus;
  log: Logger;
  ground: GroundQuery;
  physics?: PhysicsService | undefined;
  trains?: () => ReadonlyArray<TrainInfo>;
}
export interface HudHints {
  promptKey?: I18nKey;
  speedKmh?: number;
  nextStationId?: string;
  gear?: string;
  rpm?: number;
}
/** 플레이어 바디가 있는 모드(walk…)의 출력. 없으면 카메라 위치·방위를 플레이어로 본다(freecam). */
export interface ModePlayer {
  posWF: Vec3d;
  velWF: Vec3;
  yawRad: number;
}
export interface ModeOutput {
  camera: CameraState;
  interest: InterestPoint[];
  hud: HudHints;
  player?: ModePlayer;
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
/**
 * walk 진입 파라미터: 도착 기준점(보통 직전 카메라). 바디가 returnToBodyM 안에 있으면 바디로 복귀(09 §1 — freecam C 복귀),
 * 아니면 기준점 아래 가장 가까운 지면(TERRAIN 레이 — 지붕·건물 안 제외)에 캐릭터를 놓는다.
 */
export interface WalkParams {
  posWF: Vec3d;
  yawRad: number;
  pitchRad?: number;
}
export type WalkView = 'first' | 'third';
export interface WalkSettings {
  /** X(Pace) 순환 걸음 단계(m/s): 걷기·빠른 걸음·조깅(08 §5). */
  paceSpeedsMs: readonly number[];
  /** Shift(유지) 달리기(m/s). */
  sprintMs: number;
  /** 눈높이(m, 발 기준). */
  eyeHeightM: number;
  headBob: boolean;
  /** 헤드밥 진폭(m, 걷기 1.35 m/s 기준 — 속도에 비례, 최대 1.5배). */
  bobVerticalM: number;
  bobLateralM: number;
  /** 시선 스무딩 시간 상수(s). */
  lookSmoothingS: number;
  /** 발 높이 변화(연석·계단) 카메라 스무딩 비율(1/s). 0.6 m 넘는 변화·공중은 즉시. */
  eyeFollowPerS: number;
  thirdPerson: {
    shoulderM: number;
    distanceM: number;
    minDistanceM: number;
    maxDistanceM: number;
    pivotHeightM: number;
  };
  /** freecam → walk 복귀 때 바디가 이 수평 거리 안이면 바디로, 아니면 카메라 아래에 새로 놓는다. */
  returnToBodyM: number;
  view: WalkView;
}
export interface TraversalSettings {
  /** 마우스 감도(rad/CSS px). */
  lookRadPerPx: number;
  fovDeg: number;
  nearM: number;
  freecam: FreecamSettings;
  walk: WalkSettings;
}
export interface TraversalOptions {
  settings?: DeepPartial<TraversalSettings>;
  /** 시작 모드(physics가 없으면 'freecam'만 가능). */
  initial?: { mode: ModeId; params?: unknown };
}
export interface TraversalService extends SystemProvider {
  readonly mode: ModeId;
  readonly player: Readonly<PlayerState>;
  /** 이번 프레임 카메라(WF float64). phase 20 이후 확정. */
  readonly camera: Readonly<CameraState>;
  readonly hud: Readonly<HudHints>;
  readonly interest: ReadonlyArray<InterestPoint>;
  /** walk 시점(1인칭·3인칭 — V). */
  readonly view: WalkView;
  /** requires 미충족·미등록 모드는 false. */
  request(to: ModeId, params?: unknown): boolean;
  /** M02 이전: 즉시 이동 후 resolve(스트리밍 대기·transition 모드는 M02-T05 이후). */
  teleport(posWF: Readonly<Vec3d>, yawRad: number): Promise<void>;
  register(mode: TraversalMode): void;
}
