// `GET /api/world/current?fv=<n>`: KV `CURRENT_BUILD:v<n>` → 활성 buildId·baseUrl. see docs/13-deployment.md §4, §8
import type { Env } from '../env.ts';
import { json, storageUnconfigured } from '../headers.ts';
import { isValidBuildId, parseFormatVersion } from '../validate.ts';

/** 데이터 롤백(KV 값 교체)이 1분 내 반영되도록 짧게 캐시. */
const CURRENT_CACHE_CONTROL = 'public, max-age=60';
const DEFAULT_WORLD_BASE_URL = '/world';

export async function handleWorldCurrent(request: Request, env: Env): Promise<Response> {
  if (env.CONFIG === undefined) return storageUnconfigured('CONFIG');
  const fv = parseFormatVersion(new URL(request.url).searchParams.get('fv'));
  if (fv === undefined) return json(400, { error: 'bad_format_version' });
  const buildId = await env.CONFIG.get(`CURRENT_BUILD:v${fv}`);
  if (buildId === null) return json(404, { error: 'no_build', formatVersion: fv });
  // KV 값은 운영자가 쓰는 입력 — 형식이 틀리면 클라이언트에 경로로 흘리지 않는다.
  if (!isValidBuildId(buildId)) return json(500, { error: 'bad_current_build' });
  const baseUrl = `${env.WORLD_BASE_URL ?? DEFAULT_WORLD_BASE_URL}/${buildId}`;
  return json(200, { buildId, formatVersion: fv, baseUrl }, CURRENT_CACHE_CONTROL);
}
