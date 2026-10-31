// Worker 엔트리(라우터): /api/*, /world/*는 Worker, 나머지는 Static Assets. see docs/13-deployment.md §4, docs/modules/worker.md
import type { Env, WorkerContext } from './env.ts';
import { json, withSecurityHeaders } from './headers.ts';
import { handleWorldCurrent } from './routes/current.ts';
import { handleLog } from './routes/log.ts';
import { handleWeather } from './routes/weather.ts';
import { handleWorldData } from './routes/world.ts';

const READ_METHODS = new Set(['GET', 'HEAD']);

/** 배포 스모크 테스트용 생존 확인. 바인딩 등 내부 구성은 외부에 노출하지 않는다(ADR-0102) — 저장소 미구성은 `/api/world/current` 503으로 드러난다. */
function health(): Response {
  return json(200, { ok: true });
}

const isWorkerPath = (pathname: string): boolean =>
  pathname.startsWith('/api/') || pathname === '/world' || pathname.startsWith('/world/');

async function route(request: Request, env: Env, ctx: WorkerContext | undefined): Promise<Response> {
  const { pathname } = new URL(request.url);
  const isWorld = pathname === '/world' || pathname.startsWith('/world/');
  if (isWorkerPath(pathname)) {
    if (pathname === '/api/log') return handleLog(request, env);
    if (!READ_METHODS.has(request.method)) return json(405, { error: 'method_not_allowed' });
    if (pathname === '/api/health') return health();
    if (pathname === '/api/world/current') return handleWorldCurrent(request, env, ctx);
    if (pathname === '/api/weather') return handleWeather(request, env, ctx);
    if (isWorld) return handleWorldData(request, env, ctx);
    return json(404, { error: 'not_found' });
  }
  if (env.ASSETS === undefined) return json(404, { error: 'not_found' });
  return env.ASSETS.fetch(request);
}

/**
 * 테스트에서 직접 호출하는 핸들러. 모든 Worker 응답(오류 포함)에 보안 헤더를 붙인다 — 정적 에셋 위임 응답은 격리 헤더만(문서 CSP는 `_headers`).
 * 최상위 예외 경계(F07, ADR-0103): 처리 안 된 예외는 내부 정보 없는 500 JSON(no-store) — Cloudflare 1101 페이지(보안 헤더 없음) 대신.
 */
export async function handleRequest(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  let res: Response;
  try {
    res = await route(request, env, ctx);
  } catch (e) {
    // Workers Logs에 종류만 남긴다(메시지·스택은 응답에 넣지 않는다).
    // biome-ignore lint/suspicious/noConsole: Worker에는 @sanpo/core Logger가 없다 — 관측 로그가 유일한 진단 경로.
    console.error('unhandled', e instanceof Error ? e.name : typeof e);
    res = json(500, { error: 'internal_error' });
  }
  return withSecurityHeaders(res, res.status >= 500 || isWorkerPath(new URL(request.url).pathname));
}

export default {
  fetch: (request: Request, env: Env, ctx: WorkerContext): Promise<Response> => handleRequest(request, env, ctx),
};
