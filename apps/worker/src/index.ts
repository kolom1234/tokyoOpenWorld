// Worker 엔트리(라우터): /api/*, /world/*는 Worker, 나머지는 Static Assets. see docs/13-deployment.md §4, docs/modules/worker.md
import type { Env, WorkerContext } from './env.ts';
import { json, withSecurityHeaders } from './headers.ts';
import { handleWorldCurrent } from './routes/current.ts';
import { handleWorldData } from './routes/world.ts';

const READ_METHODS = new Set(['GET', 'HEAD']);

/** 배포 스모크 테스트용 상태. 바인딩 유무(boolean)만 노출하고 값·ID는 노출하지 않는다. */
function health(env: Env): Response {
  return json(200, { ok: true, bindings: { world: env.WORLD !== undefined, config: env.CONFIG !== undefined } });
}

async function route(request: Request, env: Env, ctx: WorkerContext | undefined): Promise<Response> {
  const { pathname } = new URL(request.url);
  const isWorld = pathname === '/world' || pathname.startsWith('/world/');
  if (pathname.startsWith('/api/') || isWorld) {
    if (!READ_METHODS.has(request.method)) return json(405, { error: 'method_not_allowed' });
    if (pathname === '/api/health') return health(env);
    if (pathname === '/api/world/current') return handleWorldCurrent(request, env);
    if (isWorld) return handleWorldData(request, env, ctx);
    return json(404, { error: 'not_found' });
  }
  if (env.ASSETS === undefined) return json(404, { error: 'not_found' });
  return env.ASSETS.fetch(request);
}

/** 테스트에서 직접 호출하는 핸들러. 모든 Worker 응답에 보안 헤더를 붙인다. */
export async function handleRequest(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  return withSecurityHeaders(await route(request, env, ctx));
}

export default {
  fetch: (request: Request, env: Env, ctx: WorkerContext): Promise<Response> => handleRequest(request, env, ctx),
};
