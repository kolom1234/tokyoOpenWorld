// @sanpo/core 공개 계약(타입·인터페이스·상수). 구현은 internal/*, 재수출은 index.ts. see docs/modules/core.md
import type { EventMap, EventName } from './events.ts';

export type { EventMap, EventName } from './events.ts';

// ── 수학 (docs/15-conventions.md §4) ──

/** WF 좌표(미터, float64 논리). +X=동, +Y=위, -Z=북. */
export interface Vec3d {
  x: number;
  y: number;
  z: number;
}
/** Vec3d와 같은 형태. 의미상 float32 공간(렌더·물리 로컬, 속도·방향). */
export type Vec3 = Vec3d;
/** 단위 쿼터니언(x,y,z,w). */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ── Result (docs/15-conventions.md §5) ──

/** 복구 가능 오류 반환 타입. 예외는 프로그래밍 오류에만 사용. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// ── 셀 키 (docs/01-architecture.md §8) ──

/** 53-bit 안전 정수. 레이아웃: `level * 2^32 + (ix + 32768) * 2^16 + (iz + 32768)`. */
export type CellKey = number;
export type CellLevel = 0 | 1 | 2 | 3;
/** `cellIdString` 형식 문자열, 예: "L0_-1_0". */
export type CellId = string;

// ── 이벤트 버스 (docs/01-architecture.md §6) ──

export type Unsubscribe = () => void;
/** 동기 dispatch. 핸들러 예외는 로깅 후 격리(다른 핸들러는 계속 실행). */
export interface EventBus {
  on<K extends EventName>(k: K, h: (p: EventMap[K]) => void): Unsubscribe;
  emit<K extends EventName>(k: K, p: EventMap[K]): void;
}

// ── 로깅 ──

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/** 로그 출력 대상. 기본 싱크는 console(이 패키지 내부에서만 허용). */
export type LogSink = (level: LogLevel, tag: string, args: readonly unknown[]) => void;
export interface Logger {
  debug(...a: unknown[]): void;
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
  /** 스코프 태그를 덧붙인 하위 로거. 예: `log.child('streaming')` → 태그 "streaming". */
  child(tag: string): Logger;
}
export interface LoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
}

// ── 프레임 루프 (docs/01-architecture.md §5) ──

export interface CameraState {
  posWF: Vec3d;
  quat: Quat;
  fovDeg: number;
  near: number;
}
export interface PlayerState {
  posWF: Vec3d;
  velWF: Vec3;
  yawRad: number;
  mode: string;
}
/** 플레이어 아바타 표시(traversal 출력 → render.setAvatar, M04-T05). posWF = 발, yaw 0 = −Z(도북). opacity < 1 = 근접 디더 페이드. */
export interface AvatarState {
  visible: boolean;
  posWF: Vec3d;
  yawRad: number;
  /** 수평 속력(m/s) — 대기·걷기·달리기 블렌드. */
  speedMs: number;
  grounded: boolean;
  opacity: number;
}
export interface FrameContext {
  frameIndex: number;
  /** s, clamp [0, 0.1] */
  dtReal: number;
  /** s, dtReal × timeScale */
  dtGame: number;
  /** Unix ms (JST 표시는 UI에서) */
  gameTimeMs: number;
  camera: Readonly<CameraState>;
  player: Readonly<PlayerState>;
}
export interface GameSystem {
  readonly id: string;
  readonly phase: number;
  init?(): Promise<void>;
  update(f: FrameContext): void;
  dispose(): void;
}
/** 서비스는 하나 이상의 GameSystem(phase가 다를 수 있음)을 제공한다. 예: render → [renderPrep(70), render(80)] */
export interface SystemProvider {
  systems(): readonly GameSystem[];
}
/** Scheduler가 FrameContext를 채우는 출처. apps/game이 부트 시 1회 등록한다. */
export interface FrameSource {
  camera(): CameraState;
  player(): PlayerState;
  gameTimeMs(): number;
  timeScale(): number;
}
export interface Scheduler {
  /** phase 오름차순(동일 phase는 등록 순) 실행 목록에 추가. id 중복은 프로그래밍 오류(throw). */
  add(p: GameSystem | SystemProvider): void;
  /** id의 시스템을 제거하고 dispose() 호출. 없으면 무시. */
  remove(id: string): void;
  setFrameSource(src: FrameSource): void;
  /** 등록된 시스템 중 init이 있는 것을 phase 순으로 순차 실행. */
  init(): Promise<void>;
  /** nowMs: 단조 증가 시각(ms, 예: performance.now()). 첫 tick의 dtReal은 0. */
  tick(nowMs: number): void;
}
export interface SchedulerDeps {
  log: Logger;
  /** 단조 시계(ms). tick 인자가 없을 때의 기준이며 시스템 update 시간 측정에 사용. */
  clock: () => number;
}

// ── 결정론 (docs/15-conventions.md §7) ──

export interface Rng {
  /** [0, 1) 균등 실수(32-bit 해상도). */
  next(): number;
  /** [min, maxExcl) 정수. */
  int(min: number, maxExcl: number): number;
  /** 배열 원소 1개. 빈 배열은 프로그래밍 오류(throw). */
  pick<T>(a: readonly T[]): T;
}
/** 결정론 시드 루트 ("SANP"). 모든 절차 시드는 `hash32(WORLD_SEED, …parts)`. */
export const WORLD_SEED = 0x53414e50;

// ── 설정 ──

/** 설정 오버라이드 형태. 배열은 통째 교체 단위, `undefined` 값은 "지정 안 함"(mergeConfig가 무시). */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> | undefined }
    : T;

// ── 워커 감독 (docs/15-conventions.md §5–6) ──

/** 워커 생성 팩토리. 재시작 시 다시 호출된다. */
export type WorkerFactory = () => Worker;
export interface SupervisorOptions {
  /** 연속 재시작 허용 횟수. 초과 시 워커는 'failed' 상태로 멈춘다. */
  maxRestarts?: number;
  /** 첫 재시작 지연(ms). 이후 2배씩 증가. */
  backoffMs?: number;
}
/** 워커가 오류를 메인에 알리는 메시지. fatal이면 감독자가 재시작, 아니면 경고 로그만. 감독자가 가로채며 onMessage로 전달되지 않는다. */
export interface WorkerErrorMessage {
  t: 'worker/error';
  message: string;
  fatal: boolean;
}
export type SupervisedWorkerState = 'running' | 'restarting' | 'failed' | 'terminated';
export interface SupervisedWorker {
  readonly name: string;
  state(): SupervisedWorkerState;
  /** 현재 워커로 전송. running이 아니면 false. */
  post(msg: unknown, transfer?: Transferable[]): boolean;
  /** 메시지 핸들러(재시작 후에도 유지). */
  onMessage(h: (data: unknown) => void): Unsubscribe;
  /** 재시작 완료 시 호출(상태 재전송용). */
  onRestart(h: (restartCount: number) => void): Unsubscribe;
  terminate(): void;
}
export interface WorkerSupervisor {
  spawn(name: string, factory: WorkerFactory): SupervisedWorker;
  /** 감독 중인 모든 워커 종료. */
  dispose(): void;
}
export interface WorkerSupervisorDeps {
  log: Logger;
  options?: SupervisorOptions;
  /** 지연 실행(테스트 주입용). 기본 setTimeout. */
  setTimer?: (fn: () => void, ms: number) => void;
}

// ── 공유 어휘 타입 (여러 레이어가 사용 → core 소속, 01-architecture §4) ──

export type ModeId = 'walk' | 'drive' | 'cycle' | 'train' | 'freecam' | 'transition';
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
/** "area.key" 형식 */
export type I18nKey = string;
export interface InterestPoint {
  posWF: Vec3d;
  velWF?: Vec3;
  forward?: Vec3;
  weight: number;
  kind: 'camera' | 'player' | 'lookahead' | 'teleport';
}
export interface WeatherParams {
  cloudCover: number;
  rainMmH: number;
  fog: number;
  windMs: number;
  windDirDeg: number;
  snow: number;
  /** 노면 젖음 0(마름)..1(흠뻑) — 비 누적·건조(sim 날씨 M06). render 젖음 셰이딩 입력(07 §8). */
  wetness: number;
  temperatureC?: number;
}
export interface SeasonParams {
  dayOfYear: number;
  foliageTint: number;
  bloom: number;
  leafDensity: number;
  outfitPalette: number;
}
/** sim이 계산, render/audio가 소비. */
export interface EnvironmentState {
  gameTimeMs: number;
  sunDirWF: Vec3;
  moonDirWF: Vec3;
  sunIlluminanceLux: number;
  moonPhase: number;
  weather: WeatherParams;
  season: SeasonParams;
  wind: Vec3;
}
/**
 * sim 워커가 `WF − anchorWF`(float32)로 기록 → render가 `anchorWF − renderOrigin`(float64) 오프셋을 더해 사용.
 * data: SAB, stride 8 = x,y,z(=WF−anchorWF), yaw, anim, phase, variant, flags
 */
export interface SharedInstanceBuffer {
  data: Float32Array;
  stride: 8;
  anchorWF(): Vec3d;
  count(): number;
  seq(): number;
}
/** 가상 차종(M06-T06, ADR-0066 — 실존 차명·로고·번호판 없음): sim 스폰·render 모델·physics 상자가 공유. 순서 = 차량 variant 하위 3비트(추가만). */
export interface VehicleTypeInfo {
  name: string;
  lengthM: number;
  widthM: number;
  heightM: number;
  /** 스폰 비율(합 1). */
  share: number;
}
export const VEHICLE_TYPES: readonly VehicleTypeInfo[] = [
  { name: 'sedan', lengthM: 4.6, widthM: 1.76, heightM: 1.45, share: 0.26 },
  { name: 'taxi', lengthM: 4.7, widthM: 1.7, heightM: 1.55, share: 0.24 },
  { name: 'kei', lengthM: 3.4, widthM: 1.48, heightM: 1.66, share: 0.16 },
  { name: 'keiTruck', lengthM: 3.4, widthM: 1.48, heightM: 1.78, share: 0.08 },
  { name: 'minivan', lengthM: 4.7, widthM: 1.7, heightM: 1.86, share: 0.14 },
  { name: 'deliveryTruck', lengthM: 6.6, widthM: 2.1, heightM: 3.0, share: 0.08 },
  { name: 'bus', lengthM: 10.5, widthM: 2.5, heightM: 3.1, share: 0.04 },
];
/**
 * sim → physics 키네마틱 프레임(M06-T06, 08 §8 직결 MessagePort, 30 Hz): 플레이어 60 m 안 차량. data = 레코드 KINEMATIC_STRIDE f64 —
 * id, x, y, z(WF 차체 바닥 중심), yaw(전방 = (−sin, −cos)), 속력(m/s, 전방), 길이, 폭, 높이. atMs = 틱 절대 시각(timeOrigin + now).
 */
export const KINEMATIC_STRIDE = 9;
export interface KinematicFrame {
  t: 'kin';
  atMs: number;
  data: Float64Array;
}
export interface GroundQuery {
  /** WF x,z(m) → 지면 높이 y(m). 미적재 셀이면 undefined. */
  groundHeightAt(x: number, z: number): number | undefined;
}
/** sim 제공, traversal·ui 소비. */
export interface TrainInfo {
  tripId: string;
  lineId: string;
  cars: number;
  carLengthM: number;
  headPosWF: Vec3d;
  headingRad: number;
  speedMs: number;
  stoppedAtStationId: string | null;
  doorsOpen: boolean;
  nextStationId: string | null;
  seats: ReadonlyArray<{ id: string; car: number; posLocal: [number, number, number] }>;
}
