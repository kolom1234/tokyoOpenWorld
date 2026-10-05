# @sanpo/core
Layer: L0 | Depends: (none) | Used by: 모든 패키지·앱·툴

## Purpose
엔진 공통 기반: 타입(수학·Result·셀키), 이벤트 버스, 로거, 스케줄러, 결정론적 난수/해시, 설정 병합, 워커 감독.
three.js·DOM 비의존(워커·Node에서도 import 가능).

## Public API (src/api.ts 타입 + index.ts 함수)
```ts
// ── 타입 (api.ts) ──
export interface Vec3d { x: number; y: number; z: number }      // WF float64
export type Vec3 = Vec3d; export interface Quat { x: number; y: number; z: number; w: number }
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export type CellKey = number; export type CellLevel = 0|1|2|3; export type CellId = string;   // "L0_-1_0"
export type { EventMap, EventName } from './events.ts';           // 이벤트 목록은 events.ts에만
export interface EventBus { on<K extends EventName>(k: K, h: (p: EventMap[K]) => void): Unsubscribe; emit<K extends EventName>(k: K, p: EventMap[K]): void }
export type LogLevel = 'debug'|'info'|'warn'|'error'; export type LogSink = (level: LogLevel, tag: string, args: readonly unknown[]) => void;
export interface Logger { debug/info/warn/error(...a: unknown[]): void; child(tag: string): Logger }   // 태그 "a/b"
export interface LoggerOptions { level?: LogLevel; sink?: LogSink }
export interface GameSystem { readonly id: string; readonly phase: number; init?(): Promise<void>; update(f: FrameContext): void; dispose(): void }
export interface SystemProvider { systems(): readonly GameSystem[] }   // 서비스는 이것을 구현(여러 phase 가능)
export interface FrameSource { camera(): CameraState; player(): PlayerState; gameTimeMs(): number; timeScale(): number }
export interface FrameContext { frameIndex: number; dtReal: number; dtGame: number; gameTimeMs: number; camera: Readonly<CameraState>; player: Readonly<PlayerState> }
export interface CameraState { posWF: Vec3d; quat: Quat; fovDeg: number; near: number }
export interface AvatarState { visible; posWF(발); yawRad; speedMs; grounded; opacity }   // traversal → render.setAvatar(M04-T05, ADR-0045)
export interface PlayerState { posWF: Vec3d; velWF: Vec3; yawRad: number; mode: string }
export interface Scheduler { add(p: GameSystem | SystemProvider): void; remove(id: string): void; setFrameSource(src: FrameSource): void; init(): Promise<void>; tick(nowMs: number): void }
export interface SchedulerDeps { log: Logger; clock: () => number }   // clock: 시스템별 update 시간 측정(ms)
export interface Rng { next(): number; int(min: number, maxExcl: number): number; pick<T>(a: readonly T[]): T }
export type DeepPartial<T>;                                            // 배열=통째 교체, undefined=미지정
export interface WorkerErrorMessage { t: 'worker/error'; message: string; fatal: boolean }   // 워커→메인 오류 보고
export type WorkerFactory = () => Worker; export interface SupervisorOptions { maxRestarts?: number; backoffMs?: number }
export interface SupervisedWorker { name; state(): 'running'|'restarting'|'failed'|'terminated'; post(msg, transfer?): boolean;
  onMessage(h): Unsubscribe; onRestart(h: (n: number) => void): Unsubscribe; terminate(): void }
export interface WorkerSupervisor { spawn(name: string, factory: WorkerFactory): SupervisedWorker; dispose(): void }
export interface WorkerSupervisorDeps { log: Logger; options?: SupervisorOptions; setTimer?: (fn: () => void, ms: number) => void }
// ── 공유 어휘 타입 (여러 레이어가 사용 → core 소속, 01-architecture §4) ──
export type Unsubscribe = () => void;
export type ModeId = 'walk' | 'drive' | 'cycle' | 'train' | 'freecam' | 'transition';
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type I18nKey = string;                      // "area.key" 형식
export interface InterestPoint { posWF: Vec3d; velWF?: Vec3; forward?: Vec3; weight: number; kind: 'camera' | 'player' | 'lookahead' | 'teleport' }
export interface WeatherParams { cloudCover: number; rainMmH: number; fog: number; windMs: number; windDirDeg: number; snow: number; wetness: number /* 노면 젖음 0..1, M03-T06 */; temperatureC?: number }
export interface SeasonParams { dayOfYear: number; foliageTint: number; bloom: number; leafDensity: number; outfitPalette: number }
export interface EnvironmentState { gameTimeMs: number; sunDirWF: Vec3; moonDirWF: Vec3; sunIlluminanceLux: number; moonPhase: number;
  weather: WeatherParams; season: SeasonParams; wind: Vec3 }   // sim이 계산, render/audio가 소비
export interface SharedInstanceBuffer { data: Float32Array /* SAB, stride 8: x,y,z(=WF−anchorWF), yaw, anim, phase, variant, flags */; stride: 8; anchorWF(): Vec3d; count(): number; seq(): number }
export interface GroundQuery { groundHeightAt(x: number, z: number): number | undefined }
export interface TrainInfo { tripId: string; lineId: string; cars: number; carLengthM: number; headPosWF: Vec3d; headingRad: number; speedMs: number;
  stoppedAtStationId: string | null; doorsOpen: boolean; nextStationId: string | null;
  seats: ReadonlyArray<{ id: string; car: number; posLocal: [number, number, number] }> }   // sim 제공, traversal·ui 소비
export const WORLD_SEED = 0x53414e50;              // "SANP" — 결정론 시드 루트
export interface VehicleTypeInfo { name; lengthM; widthM; heightM; share }   // M06-T06(ADR-0066): 가상 차종 7종 — sim 스폰·render 모델·physics 상자 공유
export const VEHICLE_TYPES: readonly VehicleTypeInfo[]   // sedan·taxi·kei·keiTruck·minivan·deliveryTruck·bus(순서 = 차량 variant 하위 3비트, 추가만)
export const KINEMATIC_STRIDE = 9;
export interface KinematicFrame { t: 'kin'; atMs: number /* 틱 절대 시각 */; data: Float64Array /* id, x,y,z(WF 바닥 중심), yaw, 속력, 길이, 폭, 높이 */ }   // sim → physics 직결 포트(08 §8)
export const RAIL_ACCEL = 0.83; RAIL_DECEL = 0.97;   // 열차 가감속 m/s²(10 §6.2)
export interface RunProfile { s0; s1; step; v: Float32Array; t: Float64Array; duration }   // 열차 주행 곡선(M07-T02, ADR-0071) — 시간표 컴파일러·sim 공용
export interface TrainCarTypeInfo { name; lengthM; widthM; doorsZ; doorWidthM; floorM; doorTopM; ceilingM; roofM; cabM }; TRAIN_CAR_TYPES   // M07-T04(ADR-0073): 20 m 통근형·16 m 지하철형 — sim·render·physics 공유
export const TRAIN_BODY_STRIDE = 10;   // 칸 물리 레코드: id, x,y,z(WF 레일 윗면), yaw, pitch, 차형, 종류, 문, 예약 — sim → physics

// ── 함수 (index.ts ← internal/*) ──
packCellKey(level, ix, iz): CellKey; unpackCellKey(k); cellIdString(k): CellId      // 범위 밖 → RangeError
createRng(seed): Rng; hash32(...parts: Array<string|number>): number                 // ADR-0012
createEventBus(log); createLogger(opts?); createScheduler(deps); MAX_DT_REAL_S = 0.1
mergeConfig<T>(defaults: T, ...overrides: NoInfer<DeepPartial<T>>[]): T               // 입력 불변, __proto__ 등 차단
createWorkerSupervisor(deps): WorkerSupervisor
ok(v); err(e); unwrapOr(r, fb); mapResult(r, f)
// math (out 파라미터 기록 후 out 반환, 할당 없음; out이 입력과 같아도 안전)
vec3(x?,y?,z?); vec3Set/Copy/Add/Sub/Scale/AddScaled/Cross/Normalize/Lerp/ApplyQuat(out, …); vec3Dot/Length/LengthSq/Distance/DistanceSq(a, b?)
quatIdentity(); quatSet/Copy/FromAxisAngle/FromYaw/Multiply/Normalize/Slerp(out, …); clamp; lerp; degToRad; radToDeg
// 열차 곡선(M07-T02, ADR-0071): 제한속도 표본 → 전진 가속·후진 감속 통과 → 사다리꼴 시간. profileAt ↔ timeAtS 역함수
computeRunProfile(limits, stepM, s0, s1, vStart = 0, vEnd = 0, accel?, decel?): RunProfile; profileAt(p, dt): {s, v}; timeAtS(p, s): number
tripLegs(limits, stepM, from, to, stopS[]): RunProfile[]   // 정차 n → 곡선 n+1, from < 첫 정차 = 진입 속도(제한), = 시발(0); 끝도 같다. RAIL_STOP_EPS_M = 0.01
```
- 이벤트 맵은 `src/events.ts`에만 정의 (01-architecture §6). api.ts ↔ events.ts는 type-only 순환(ADR-0013).

## Invariants
- 외부 런타임 의존 0 (devDependencies 제외).
- `Scheduler.tick`은 dtReal을 [0, 0.1] s로 클램프(첫 tick = 0). 동일 phase는 등록 순. 시스템 예외는 로깅 후 격리.
- tick 중 `add`는 다음 프레임부터, `remove`는 즉시(dispose 후 같은 프레임에서도 update 안 함).
- 시스템 update > 4 ms면 warn(시스템별 300프레임에 1회).
- EventBus: 동기 dispatch, 핸들러 예외 격리, emit 중 구독한 핸들러는 다음 emit부터.
- WorkerSupervisor: onerror 또는 `WorkerErrorMessage{fatal:true}` → terminate 후 `backoffMs·2^n` 재시작, 정상 메시지 수신 시 n 리셋, n ≥ maxRestarts면 'failed'.
- `createRng` 동일 시드 → 동일 수열(플랫폼 무관, 32-bit 정수 연산만).
- `SharedInstanceBuffer` 좌표: sim 워커가 `WF − anchorWF`(float32)로 기록 → render가 `anchorWF − renderOrigin`(float64) 오프셋을 더해 사용.
- `packCellKey`는 53-bit 안전 정수. 레이아웃: `level * 2^32 + (ix + 32768) * 2^16 + (iz + 32768)`.

## Files
| 파일 | 책임 |
|---|---|
| src/api.ts | 공개 타입·WORLD_SEED |
| src/index.ts | api 재수출 + 팩토리/순수 함수 재수출 |
| src/events.ts | EventMap 정의 |
| src/internal/event-bus.ts | 동기 dispatch, 예외 격리 |
| src/internal/logger.ts | 레벨·스코프·싱크 |
| src/internal/scheduler.ts | phase 정렬 실행, 프레임 컨텍스트 |
| src/internal/rng.ts / hash.ts | 결정론 난수·해시 |
| src/internal/result.ts | Result 헬퍼 |
| src/internal/cell-key.ts | 셀 키 pack/unpack/string |
| src/internal/math.ts | Vec3d/Quat 연산(할당 최소화 out 파라미터) |
| src/internal/config.ts | 딥 머지 |
| src/internal/worker-supervisor.ts | 워커 생성·오류·재시작 |
| src/internal/rail-profile.ts | 열차 주행 곡선·트립 구간(M07, 시간표·sim 공용) |

## Tests
`test/*.test.ts`: rng 재현성·골든 값(스냅숏), hash32 구분성, cellKey 왕복(±2^15 경계·음수), 스케줄러 순서·클램프·격리·예산 경고,
이벤트 예외 격리·구독 해제, 로거 레벨/태그, mergeConfig(불변·오염 차단), math, WorkerSupervisor(가짜 워커로 재시작·백오프·한도).

## Status
구현 완료 (M00-T02, 2026-09-27). 외부 런타임 의존 0.

## Gotchas
- 셀키 레이아웃 변경 = 캐시·세이브 호환 파괴 → ADR 필요.
- hash32/rng 골든 스냅숏 변경 = 모든 절차 배치 변경 → 스냅숏 덮어쓰기 금지, 새 ADR (ADR-0012).
- `Worker` 타입은 DOM lib 의존(타입만). Node 툴에서 쓰려면 호환 객체를 factory로 감싼다.
