// `GET /api/world/current?fv=<n>`: KV `CURRENT_BUILD:v<n>` → 활성 buildId·baseUrl. 엣지 캐시 30 s(KV 읽기 절감, F05). see docs/13-deployment.md §4, §8
import { edgeCache } from '../cache.ts';
import type { Env, WorkerContext } from '../env.ts';
import { json, storageUnconfigured } from '../headers.ts';
import { isValidBuildId, parseFormatVersion } from '../validate.ts';

/**
 * 데이터 롤백(KV 값 교체) 반영 지연 = KV 전파(실측 4–13 s) + 엣지 ≤ 30 s + 브라우저 ≤ 30 s — 1분 안(docs/13 §8).
 * 같은 값을 브라우저와 엣지(Cache API TTL)에 쓴다.
 */
const CURRENT_CACHE_CONTROL = 'public, max-age=30';
const DEFAULT_WORLD_BASE_URL = '/world';

async function readCurrent(env: Env & { CONFIG: NonNullable<Env['CONFIG']> }, fv: number): Promise<Response> {
  const buildId = await env.CONFIG.get(`CURRENT_BUILD:v${fv}`);
  if (buildId === null) return json(404, { error: 'no_build', formatVersion: fv }, CURRENT_CACHE_CONTROL);
  // KV 값은 운영자가 쓰는 입력 — 형식이 틀리면 클라이언트에 경로로 흘리지 않는다(캐시하지 않음).
  if (!isValidBuildId(buildId)) return json(500, { error: 'bad_current_build' });
  const baseUrl = `${env.WORLD_BASE_URL ?? DEFAULT_WORLD_BASE_URL}/${buildId}`;
  return json(200, { buildId, formatVersion: fv, baseUrl }, CURRENT_CACHE_CONTROL);
}

export async function handleWorldCurrent(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  const { CONFIG } = env;
  if (CONFIG === undefined) return storageUnconfigured('CONFIG');
  const url = new URL(request.url);
  const fv = parseFormatVersion(url.searchParams.get('fv'));
  if (fv === undefined) return json(400, { error: 'bad_format_version' });
  // 키 = fv만(다른 쿼리는 무시) — 쿼리 변형으로 KV를 반복 읽지 않게.
  const cache = edgeCache();
  const key = new Request(`${url.origin}/api/world/current?fv=${fv}`);
  const hit = await cache?.match(key);
  if (hit !== undefined) return hit;
  const res = await readCurrent({ ...env, CONFIG }, fv);
  if (cache !== undefined && ctx !== undefined && res.status !== 500) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
