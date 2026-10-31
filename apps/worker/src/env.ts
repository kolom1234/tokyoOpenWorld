// Worker 바인딩 타입(Env). R2·KV는 선택 — 리소스 생성 전 배포를 허용하기 위해 optional. see docs/modules/worker.md
// @cloudflare/workers-types는 DOM lib와 전역 타입이 충돌하므로, 실제로 쓰는 멤버만 구조적으로 선언한다.

/** Static Assets 바인딩(`assets.binding`). */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

/** R2Range 중 응답 Content-Range 계산에 쓰는 형태. 런타임에 따라 쓰지 않는 키가 `undefined`로 존재할 수 있다. */
export interface WorldRange {
  offset?: number | undefined;
  length?: number | undefined;
  suffix?: number | undefined;
}

/** R2Object 중 사용하는 부분(메타데이터만, 본문 없음 — head 결과·조건부 요청 불일치). */
export interface WorldObject {
  size: number;
  httpEtag: string;
  range?: WorldRange;
  writeHttpMetadata(headers: Headers): void;
}

/** R2ObjectBody 중 사용하는 부분. */
export interface WorldObjectBody extends WorldObject {
  body: ReadableStream;
}

/** R2Bucket 중 사용하는 부분. `range` = 직접 해석한 범위(range.ts — 요청 헤더를 그대로 넘기지 않는다, F07), `onlyIf` = 조건부 헤더만 담은 Headers. */
export interface WorldBucket {
  get(key: string, options?: { range?: WorldRange; onlyIf?: Headers }): Promise<WorldObjectBody | WorldObject | null>;
  head(key: string): Promise<WorldObject | null>;
}

/** KVNamespace 중 사용하는 부분. */
export interface ConfigKv {
  get(key: string): Promise<string | null>;
}

/** ExecutionContext 중 사용하는 부분(응답 후 캐시 저장). */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** AnalyticsEngineDataset 중 사용하는 부분(M11-T03 오류 보고). */
export interface LogDataset {
  writeDataPoint(p: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

/** Workers Rate Limiting 바인딩(`ratelimits`, F03) 중 사용하는 부분. 카운터는 PoP 단위·근사(정확한 전역 한도가 아님). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS?: AssetsBinding;
  /** R2 월드 데이터 버킷. 없으면 `/world/*` 비활성(503). */
  WORLD?: WorldBucket;
  /** KV 설정(`CURRENT_BUILD:v<fv>`). 없으면 `/api/world/current` 비활성(503). */
  CONFIG?: ConfigKv;
  LIVE_WEATHER?: string;
  WORLD_BASE_URL?: string;
  /** Workers Analytics Engine 데이터셋 `sanpo_errors`(M11-T03). 없으면 `/api/log`는 기록 없이 204. */
  LOGS?: LogDataset;
  /** `/api/log` IP(해시) 요청 제한. 없으면(테스트) 제한 없음 — 대시보드 WAF 규칙이 앞단. */
  LOG_LIMITER?: RateLimiter;
  /** 배포 환경 `production`·`staging`·`local`(wrangler vars). production은 `kind:"test"` 보고를 거절한다. */
  DEPLOY_ENV?: string;
}
