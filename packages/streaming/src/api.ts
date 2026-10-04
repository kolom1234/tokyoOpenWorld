// @sanpo/streaming 공개 계약(타입·인터페이스). 설정(T01) + fetch·디코드 워커 풀(T02) + 서비스·수명주기(T03).
// see docs/modules/streaming.md, docs/06-world-streaming.md §2–4, §7–9
import type {
  CellKey,
  EventBus,
  InterestPoint,
  Logger,
  ModeId,
  QualityTier,
  Result,
  SystemProvider,
  Unsubscribe,
  Vec3d,
  WorkerSupervisor,
} from '@sanpo/core';
import type { CellPayload, CellsIndex, SectionType, TkcErrorCode } from '@sanpo/tile-format';

/** 관심점 → 레벨별 원하는 셀 집합 설정(06 §3, ADR-0021). 반경은 관심점~셀 AABB 수평 최단거리(m). */
export interface InterestConfig {
  /** 모드별 L0 로드 반경 R0(품질 배율 전). freecam은 고도 0 m 값이고 `freecamRadiusPerAltitudeM`만큼 커진다. */
  l0RadiusByModeM: Readonly<Record<ModeId, number>>;
  /** freecam R0 = 기본 + 이 값 × 고도(지면 기준 m). */
  freecamRadiusPerAltitudeM: number;
  /** 품질 티어별 R0 배율(07 §9). */
  l0RadiusScaleByTier: Readonly<Record<QualityTier, number>>;
  /** 배율 적용 후 R0 상한. */
  l0RadiusMaxM: number;
  /** 해제 반경 = 로드 반경 × 이 값(히스테리시스). 고도 전환(고고도 진입/이탈)에도 같은 비율을 쓴다. */
  releaseFactor: number;
  /** 이 고도(지면 기준 m) 초과면 L0는 관심점 셀 중심 (2r+1)² 링만 로드한다. */
  highAltitudeM: number;
  /** 고고도 L0 로드 링 반경(셀). 1 = 3×3. */
  highAltitudeLoadRing: number;
  /** 고고도 L0 유지 링 반경(셀, 고도 > highAltitudeM × releaseFactor일 때). 2 = 5×5. */
  highAltitudeKeepRing: number;
  /** L1 로드 반경(고도 ≤ highAltitudeM). */
  l1RadiusM: number;
  /** 고고도 L1 확장: R1 = l1RadiusM + 이 값 × (고도 − highAltitudeM). */
  l1RadiusPerAltitudeM: number;
  /** 확장 후 R1 상한. */
  l1RadiusMaxM: number;
  /** L2 로드 반경. L3는 cells.idx의 전 셀(해제 없음). */
  l2RadiusM: number;
  /** train 진행 방향 가중: 뒤쪽 셀 거리 × (1 + 이 값 × max(0, −cosθ)). 0이면 끔. */
  trainBehindPenalty: number;
  /** 진행 방향 가중을 적용하는 최소 수평 속도(m/s). */
  directionMinSpeedMs: number;
}

/** 요청 우선순위 설정(06 §4, ADR-0021). 점수는 낮을수록 먼저. */
export interface PriorityConfig {
  /** 뷰 쐐기(카메라 forward 수평 반각) 안 셀의 점수 배율. */
  inViewFactor: number;
  /** 뷰 쐐기 수평 반각(도). */
  viewHalfAngleDeg: number;
  /** teleport 관심점 거리 배율. */
  teleportFactor: number;
  /** 발밑 셀(player·teleport가 든 L0 셀) 고정 점수. 다른 모든 점수(≥ 0)보다 작아야 한다. */
  footScore: number;
  /** 부모 선행: 부모가 같은 요청 후보면 자식 점수 ≥ 부모 점수 + 이 값. */
  parentEpsilon: number;
}

/** 셀 fetch 설정(06 §4, §7, ADR-0022). */
export interface FetchConfig {
  /** 동시 fetch 최대 수. */
  maxConcurrent: number;
  /** 첫 시도 뒤 재시도 횟수(네트워크 오류·408·429·5xx·크기 불일치만). */
  retries: number;
  /** 재시도 지연 = backoffMs × 2^n (n = 0, 1, 2…). */
  backoffMs: number;
  /** Cache Storage `sanpo-world-<buildId>` 사용(없는 환경이면 자동으로 끔). */
  cacheStorage: boolean;
  /** Cache Storage 상한(바이트, 06 §7). 초과 시 가장 오래 안 쓴 셀부터 삭제(ADR-0023). */
  cacheMaxBytes: number;
}

/** 디코드 워커 풀 설정(06 §4, §9). */
export interface DecodeConfig {
  /** 워커 수. 0 = 자동(`hardwareConcurrency − 2`, 1…4). */
  workers: number;
  /** 워커당 동시 작업 수(06 §4: 디코드 큐 = 워커 수 × 2). */
  perWorker: number;
  /** cells.idx hash32로 파일 전체 검사(워커에서). */
  verifyHash: boolean;
}

/** 셀 수명주기·서비스 주기 설정(06 §2, §6, ADR-0023). */
export interface LifecycleConfig {
  /** 3회 재시도 후 failed 셀을 다시 요청할 수 있게 되기까지(ms). */
  retryAfterMs: number;
  /** 원하는 셀 집합 재계산 최소 주기(ms). 관심점 L0 셀·모드·티어가 바뀌면 즉시. */
  recomputeIntervalMs: number;
  /** 프레임당 onReady(+ `cell/ready`) 최대 수. */
  readyPerFrame: number;
  /** 프레임당 해제(onEvicted) 최대 수 — 순간이동 때 수십 셀 해제를 여러 프레임으로 나눈다. */
  evictPerFrame: number;
}

export interface StreamingConfig {
  interest: InterestConfig;
  priority: PriorityConfig;
  /** 레벨별 최대 상주 셀 수(소프트 리밋, index = 레벨). 로드 반경 안 셀은 초과해도 해제하지 않는다. */
  residentMax: readonly [number, number, number, number];
  fetch: FetchConfig;
  decode: DecodeConfig;
  lifecycle: LifecycleConfig;
}

// ── fetch (06 §7) ──

export type CellFetchErrorCode = 'aborted' | 'http' | 'network' | 'size';
export interface CellFetchError {
  code: CellFetchErrorCode;
  message: string;
  /** HTTP 상태(code = 'http'). */
  status?: number;
  /** 네트워크 시도 횟수(캐시 적중이면 0). */
  attempts: number;
}
export interface CellFetchResult {
  /** .tkc 파일 전체. 디코드 워커로 transfer된다(이후 메인에서 사용 금지). */
  bytes: ArrayBuffer;
  fromCache: boolean;
}
/** 셀 바이트 공급자. `createStreaming({ fetcher })`로 교체 가능(테스트·로컬 파일). */
export interface Fetcher {
  /** `expectedBytes` = cells.idx byteLength. 크기가 다르면 재시도 후 'size'. 취소는 'aborted'. */
  fetchCell(
    key: CellKey,
    expectedBytes: number,
    signal?: AbortSignal,
  ): Promise<Result<CellFetchResult, CellFetchError>>;
  /** 캐시된 사본 삭제(워커가 hash32·컨테이너 손상을 보고했을 때 → 다음 요청은 네트워크). */
  invalidate(key: CellKey): Promise<void>;
  /** Cache Storage에 있다고 추적 중인 바이트(상한 LRU 기준, 통계용). */
  cacheBytes?(): number;
}
/** fetch 최소 형태(전역 fetch 또는 테스트 대역). */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
/** Cache Storage 최소 형태(`globalThis.caches` 또는 테스트 대역). */
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}
export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
  /** 저장 순서(오래된 것 먼저). 있으면 부팅 시 상한 계산에 기존 항목을 반영한다. */
  keys?(): Promise<ReadonlyArray<{ readonly url: string } | string>>;
}
export interface CellFetcherDeps {
  /** 월드 루트 URL(끝 `/` 없음). 예: `/world/<buildId>`, `/fixtures/world-mini`. 셀 = `<baseUrl>/L<level>/<ix>/<iz>.tkc`. */
  baseUrl: string;
  buildId: string;
  log: Logger;
  config: FetchConfig;
  fetch?: FetchLike;
  /** 생략 = `globalThis.caches`(없으면 캐시 없이 동작). */
  caches?: CacheStorageLike | null;
  /** 백오프 대기(테스트 주입). 취소되면 즉시 reject. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

// ── 디코드 워커 풀 (06 §9) ──

/** 디코드 요청. sections 생략 = onReady 기본(렌더 메시 + terrain.height). */
export interface DecodeRequest {
  key: CellKey;
  buildId: string;
  /** cells.idx hash32. 있으면 워커가 파일 전체 XXH64 하위 32비트와 비교. */
  hash32?: number;
  sections?: readonly SectionType[];
}
/**
 * TkcErrorCode(컨테이너·섹션 손상) + 'mismatch'(헤더 셀/buildId·hash32 불일치) + 'unsupported'(glb 기능 밖)
 * + 'worker'(워커 사망·풀 종료) + 'aborted'(취소).
 */
export type DecodeErrorCode = 'aborted' | 'mismatch' | 'unsupported' | 'worker' | TkcErrorCode;
export interface DecodeError {
  code: DecodeErrorCode;
  message: string;
}
export interface DecodeResult {
  /** 배열은 모두 소유권 이전된 것(메인에서 복사 없이 소비). */
  payload: CellPayload;
  /** 워커 안 디코드 시간(ms, hash 검사 포함). */
  workerMs: number;
}
export interface DecodePoolStats {
  workers: number;
  running: number;
  inFlight: number;
  queued: number;
}
export interface DecodePool {
  /** `bytes`는 워커로 transfer된다. 취소 시 즉시 'aborted'로 resolve되고 워커 작업도 중단된다. */
  decode(bytes: ArrayBuffer, req: DecodeRequest, signal?: AbortSignal): Promise<Result<DecodeResult, DecodeError>>;
  stats(): DecodePoolStats;
  dispose(): void;
}
export interface DecodePoolDeps {
  supervisor: WorkerSupervisor;
  log: Logger;
  config: DecodeConfig;
  /** 생략 = 번들러가 묶는 `decode.worker.ts` 모듈 워커. */
  createWorker?: () => Worker;
  /** 자동 워커 수 계산용(생략 = navigator.hardwareConcurrency). */
  hardwareConcurrency?: number;
}

// ── 서비스 (06 §2, §8–9) ──

export type CellState = 'absent' | 'queued' | 'fetching' | 'decoding' | 'ready' | 'live' | 'evicting' | 'failed';
export type ConsumerId = 'render' | 'physics' | 'sim' | 'audio' | 'ui';

/** 이 영역(중심 수평 거리 ≤ radius인 셀 AABB)의 levels 셀이 전부 live(또는 failed)가 되면 resolve. */
export interface WhenReadyRequest {
  centerWF: Vec3d;
  radius: number;
  levels: readonly number[];
  /**
   * true면 이 대기자가 끝날 때까지 **대상 셀만 새로 요청**(다른 관심 셀 선적재 보류). 부팅 첫 표시용 — 첫 표시 전 전송량을
   * 준비 집합으로 묶는다(14 §2 초기 다운로드 ≤ 60 MB, M03-T06 측정). 이미 진행 중인 요청은 취소하지 않는다.
   */
  exclusive?: boolean;
  /**
   * exclusive를 이 Promise가 끝날 때까지 유지한다(대상이 먼저 준비돼도 — resolve는 그대로 대상 준비 시점). 부팅: 선컴파일과 셀 준비를 겹치면서
   * 첫 표시 전 선적재를 막는다(M06 사전 4, ADR-0060 — 없으면 대상 준비 뒤 선컴파일 동안 HLOD·주변을 받아 초기 다운로드가 21 → 91 MB).
   */
  holdExclusiveUntil?: Promise<unknown>;
}

export interface StreamingStats {
  states: Record<CellState, number>;
  /** ready + live, 레벨별. */
  residentByLevel: [number, number, number, number];
  queued: number;
  fetching: number;
  decoding: number;
  /** 디코드 끝났지만 아직 onReady로 안 넘긴 셀. */
  pendingReady: number;
  /** 원하는 셀 집합 재계산(computeDesired + rankCells + 해제 계획) 횟수와 소요(ms). */
  recompute: { count: number; lastMs: number; maxMs: number; totalMs: number };
  /** 누적 해제 수·로드 실패 수. */
  evicted: number;
  failures: number;
  /** Cache Storage 추적 바이트(fetcher가 알려 줄 때). */
  cacheBytes: number;
  /** 마지막 재계산의 레벨별 한도 초과(로드 반경 안이라 해제 못 함). */
  overLimit: [number, number, number, number];
}

export interface StreamingService extends SystemProvider {
  /** 관심점 교체(매 프레임 호출해도 됨 — 재계산은 L0 셀 변화 또는 recomputeIntervalMs마다). */
  setInterest(points: readonly InterestPoint[]): void;
  /** 소비자 수신 기록. 'render' ack만 ready → live. */
  ack(key: CellKey, consumer: ConsumerId): void;
  whenReady(req: WhenReadyRequest): Promise<void>;
  stateOf(key: CellKey): CellState;
  /** L0 heightfield 이중선형 보간(WF y). 미적재면 undefined. */
  groundHeightAt(x: number, z: number): number | undefined;
  /** 콜백은 wiring 1곳만(payload 소유권 단일 이전). 두 번째 등록은 프로그래밍 오류(throw). */
  onReady(cb: (p: CellPayload) => void): Unsubscribe;
  /** 캐시(없으면 네트워크)에서 다시 읽어 해당 섹션만 디코드(physics용). 실패 시 reject. */
  requestSections(key: CellKey, types: readonly SectionType[]): Promise<Partial<CellPayload>>;
  /** onReady로 넘긴 셀이 해제될 때(해제 직전). */
  onEvicted(cb: (key: CellKey) => void): Unsubscribe;
  stats(): StreamingStats;
  dispose(): void;
}

export interface StreamingDeps {
  bus: EventBus;
  log: Logger;
  /** 월드 루트(`/world/<buildId>` 등)·buildId·파싱된 cells.idx. */
  world: { baseUrl: string; buildId: string; cellsIndex: CellsIndex };
  /** 생략 = DEFAULT_STREAMING_CONFIG. */
  config?: StreamingConfig;
  /** 기본 디코드 풀용(pool을 주면 불필요). */
  supervisor?: WorkerSupervisor;
  fetcher?: Fetcher;
  pool?: DecodePool;
  /** 단조 시계(ms). 생략 = performance.now. */
  clock?: () => number;
  initialMode?: ModeId;
  initialTier?: QualityTier;
}
