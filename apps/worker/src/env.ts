// Worker 바인딩 타입(Env). R2·KV는 선택 — 리소스 생성 전 배포를 허용하기 위해 optional. see docs/modules/worker.md
// @cloudflare/workers-types는 DOM lib와 전역 타입이 충돌하므로, 실제로 쓰는 멤버만 구조적으로 선언한다.

/** Static Assets 바인딩(`assets.binding`). */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

/** R2Bucket 중 사용하는 부분. TODO(M00-T04): get 옵션(range/onlyIf)·R2ObjectBody 타입 구체화. */
export interface WorldBucket {
  get(key: string, options?: unknown): Promise<unknown>;
}

/** KVNamespace 중 사용하는 부분. */
export interface ConfigKv {
  get(key: string): Promise<string | null>;
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
