// `/world/*`(R2)·`/api/world/current`(KV) 라우트. 바인딩이 없으면 503으로 비활성. see docs/13-deployment.md §4
import type { Env } from '../env.ts';
import { json } from '../headers.ts';

/** 저장소 바인딩 미구성 응답. 클라이언트는 `error` 코드로 "월드 데이터 준비 중"을 표시한다. */
export function storageUnconfigured(binding: 'WORLD' | 'CONFIG'): Response {
  return json(503, {
    error: 'world_storage_unconfigured',
    message: `${binding} binding is not configured on this deployment; world data is disabled.`,
  });
}

function notImplemented(route: string): Response {
  return json(501, { error: 'not_implemented', message: `${route} is not implemented yet (M00-T04).` });
}

export function handleWorldCurrent(_request: Request, env: Env): Response {
  if (env.CONFIG === undefined) return storageUnconfigured('CONFIG');
  // TODO(M00-T04): KV `CURRENT_BUILD:v<fv>` → { buildId, formatVersion, baseUrl } (max-age=60)
  return notImplemented('/api/world/current');
}

export function handleWorldData(_request: Request, env: Env): Response {
  if (env.WORLD === undefined) return storageUnconfigured('WORLD');
  // TODO(M00-T04): buildId·경로 검증 → caches.default → R2 get(range/onlyIf) → 200만 캐시(docs/13 §4)
  return notImplemented('/world/*');
}
