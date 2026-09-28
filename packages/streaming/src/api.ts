// @sanpo/streaming 공개 계약(타입·인터페이스). M02-T01 설정 + M02-T02 fetch·디코드 워커 풀. see docs/modules/streaming.md, docs/06-world-streaming.md §3–4, §7, §9
import type { CellKey, Logger, ModeId, QualityTier, Result, WorkerSupervisor } from '@sanpo/core';
import type { CellPayload, SectionType, TkcErrorCode } from '@sanpo/tile-format';

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

export interface StreamingConfig {
  interest: InterestConfig;
  priority: PriorityConfig;
  /** 레벨별 최대 상주 셀 수(소프트 리밋, index = 레벨). 로드 반경 안 셀은 초과해도 해제하지 않는다. */
  residentMax: readonly [number, number, number, number];
  fetch: FetchConfig;
  decode: DecodeConfig;
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
