# @sanpo/core
Layer: L0 | Depends: (none) | Used by: 모든 패키지·앱·툴

## Purpose
엔진 공통 기반: 타입(수학·Result·셀키), 이벤트 버스, 로거, 스케줄러, 결정론적 난수/해시, 설정 병합, 워커 감독.
three.js·DOM 비의존(워커·Node에서도 import 가능).

## Public API (src/api.ts)
```ts
export interface Vec3d { x: number; y: number; z: number }      // WF float64
export type Vec3 = Vec3d; export interface Quat { x: number; y: number; z: number; w: number }
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export type CellKey = number;
export function packCellKey(level: 0|1|2|3, ix: number, iz: number): CellKey;   // ix,iz ∈ [-32768, 32767]
export function unpackCellKey(k: CellKey): { level: 0|1|2|3; ix: number; iz: number };
export function cellIdString(k: CellKey): string;                                  // "L0_-1_0"
export interface EventBus { on<K extends EventName>(k: K, h: (p: EventMap[K]) => void): Unsubscribe; emit<K extends EventName>(k: K, p: EventMap[K]): void }
export interface Logger { debug(...a: unknown[]): void; info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void; child(tag: string): Logger }
export interface GameSystem { readonly id: string; readonly phase: number; init?(): Promise<void>; update(f: FrameContext): void; dispose(): void }
export interface SystemProvider { systems(): readonly GameSystem[] }   // 서비스는 이것을 구현(여러 phase 가능)
export interface FrameSource { camera(): CameraState; player(): PlayerState; gameTimeMs(): number; timeScale(): number }
export interface FrameContext { frameIndex: number; dtReal: number; dtGame: number; gameTimeMs: number; camera: Readonly<CameraState>; player: Readonly<PlayerState> }
export interface CameraState { posWF: Vec3d; quat: Quat; fovDeg: number; near: number }
export interface PlayerState { posWF: Vec3d; velWF: Vec3; yawRad: number; mode: string }
export interface Scheduler { add(p: GameSystem | SystemProvider): void; remove(id: string): void; setFrameSource(src: FrameSource): void; tick(nowMs: number): void }
export interface Rng { next(): number; int(min: number, maxExcl: number): number; pick<T>(a: readonly T[]): T }
export function createRng(seed: number): Rng;               // xoshiro128**
export function hash32(...parts: Array<string | number>): number;
export function createEventBus(log: Logger): EventBus;
export function createLogger(opts?: { level?: LogLevel; sink?: LogSink }): Logger;
export function createScheduler(deps: { log: Logger; clock: () => number }): Scheduler;
export function mergeConfig<T>(defaults: T, ...overrides: DeepPartial<T>[]): T;
export interface WorkerSupervisor { spawn(name: string, factory: () => Worker): SupervisedWorker }
// ── 공유 어휘 타입 (여러 레이어가 사용 → core 소속, 01-architecture §4) ──
export type CellId = string;                       // "L0_-1_0"
export type Unsubscribe = () => void;
export type ModeId = 'walk' | 'drive' | 'cycle' | 'train' | 'freecam' | 'transition';
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type I18nKey = string;                      // "area.key" 형식
export interface InterestPoint { posWF: Vec3d; velWF?: Vec3; forward?: Vec3; weight: number; kind: 'camera' | 'player' | 'lookahead' | 'teleport' }
export interface WeatherParams { cloudCover: number; rainMmH: number; fog: number; windMs: number; windDirDeg: number; snow: number; temperatureC?: number }
export interface SeasonParams { dayOfYear: number; foliageTint: number; bloom: number; leafDensity: number; outfitPalette: number }
export interface EnvironmentState { gameTimeMs: number; sunDirWF: Vec3; moonDirWF: Vec3; sunIlluminanceLux: number; moonPhase: number;
  weather: WeatherParams; season: SeasonParams; wind: Vec3 }   // sim이 계산, render/audio가 소비
export interface SharedInstanceBuffer { data: Float32Array /* SAB, stride 8: x,y,z(=WF−anchorWF), yaw, anim, phase, variant, flags */; stride: 8; anchorWF(): Vec3d; count(): number; seq(): number }
export interface GroundQuery { groundHeightAt(x: number, z: number): number | undefined }
export interface TrainInfo { tripId: string; lineId: string; cars: number; carLengthM: number; headPosWF: Vec3d; headingRad: number; speedMs: number;
  stoppedAtStationId: string | null; doorsOpen: boolean; nextStationId: string | null;
  seats: ReadonlyArray<{ id: string; car: number; posLocal: [number, number, number] }> }   // sim 제공, traversal·ui 소비
export const WORLD_SEED = 0x53414e50;              // "SANP" — 결정론 시드 루트
```
- 이벤트 맵은 `src/events.ts`에만 정의 (01-architecture §6).

## Invariants
- 외부 런타임 의존 0 (devDependencies 제외).
- `Scheduler.tick`은 dtReal을 [0, 0.1] s로 클램프.
- `createRng` 동일 시드 → 동일 수열(플랫폼 무관, 32-bit 정수 연산만).
- `SharedInstanceBuffer` 좌표: sim 워커가 `WF − anchorWF`(float32)로 기록 → render가 `anchorWF − renderOrigin`(float64) 오프셋을 더해 사용.
- `packCellKey`는 53-bit 안전 정수. 레이아웃: `level * 2^32 + (ix + 32768) * 2^16 + (iz + 32768)`.

## Files
| 파일 | 책임 |
|---|---|
| src/api.ts | 공개 타입 |
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

## Tests
rng 재현성, cellKey 왕복(경계값), 스케줄러 순서·클램프, 이벤트 예외 격리, mergeConfig.

## Status
미구현 (M00-T02).

## Gotchas
- 셀키 레이아웃 변경 = 캐시·세이브 호환 파괴 → ADR 필요.
