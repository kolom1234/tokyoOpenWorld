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

/** R2Bucket 중 사용하는 부분. `range`/`onlyIf`에 요청 Headers를 그대로 넘기면 R2가 Range·조건부 헤더를 해석한다. */
export interface WorldBucket {
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<WorldObjectBody | WorldObject | null>;
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

export interface Env {
  ASSETS?: AssetsBinding;
  /** R2 월드 데이터 버킷. 없으면 `/world/*` 비활성(503). */
  WORLD?: WorldBucket;
  /** KV 설정(`CURRENT_BUILD:v<fv>`). 없으면 `/api/world/current` 비활성(503). */
  CONFIG?: ConfigKv;
  LIVE_WEATHER?: string;
  WORLD_BASE_URL?: string;
}
