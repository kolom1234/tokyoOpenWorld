// 비용 회로 차단기 감시 트리거(ADR-0106): Cloudflare Cron Trigger(30분마다) → GitHub `workflow_dispatch`로 `usage.yml` 실행.
// GitHub 예약 실행은 이 저장소에서 하루 3–4번만 돌았다(13·43분 cron, 2026-11-08~14 실측 22회/6일) — 시각이 지켜지는 트리거를 Cloudflare에 둔다.
// 판정·차단 로직은 그대로 Actions(`scripts/cf-usage.ts --kill-switch`). 비밀값 = GITHUB_DISPATCH_TOKEN(fine-grained PAT: 이 저장소 Actions 읽기·쓰기만) —
// 게임 Worker(apps/worker)의 "비밀값 없음" 불변식을 지키려고 별도 Worker로 둔다. 공개 경로 없음(workers.dev·라우트 없음, fetch = 404). see docs/13-deployment.md §6.1

export interface Env {
  /** fine-grained PAT(저장소 kolom1234/tokyoOpenWorld, Actions: Read and write). `wrangler secret put`으로만 — 코드·설정에 두지 않는다. */
  GITHUB_DISPATCH_TOKEN?: string;
  /** `owner/name`(wrangler vars). */
  GITHUB_REPO?: string;
  /** 실행할 워크플로 파일 이름. */
  WORKFLOW?: string;
  /** 실행할 브랜치. */
  REF?: string;
}

/** ScheduledController·ExecutionContext 중 쓰는 부분. */
export interface CronContext {
  waitUntil(promise: Promise<unknown>): void;
}

export const DEFAULTS = { repo: 'kolom1234/tokyoOpenWorld', workflow: 'usage.yml', ref: 'main' } as const;

/** `POST /repos/{repo}/actions/workflows/{workflow}/dispatches` — 성공 = 204(대기열 등록). */
export function dispatchRequest(env: Env, token: string): Request {
  const repo = env.GITHUB_REPO ?? DEFAULTS.repo;
  const workflow = env.WORKFLOW ?? DEFAULTS.workflow;
  return new Request(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub API는 User-Agent가 없으면 403.
      'User-Agent': 'sanpo-usage-cron',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: env.REF ?? DEFAULTS.ref }),
  });
}

/** 한 번 디스패치. 실패는 예외 — Cron 실행이 실패로 기록돼 대시보드·Workers Logs에서 보인다(GitHub 쪽 감시 지연 이슈가 따로 잡는다). */
export async function dispatch(env: Env, fetchFn: typeof fetch = (r, i) => fetch(r, i)): Promise<void> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN is not set (wrangler secret put GITHUB_DISPATCH_TOKEN)');
  const res = await fetchFn(dispatchRequest(env, token));
  if (res.status !== 204) {
    // 응답 본문의 message만(토큰·헤더는 남기지 않는다).
    const msg = await res
      .json()
      .then((j) => String((j as { message?: unknown }).message ?? ''))
      .catch(() => '');
    throw new Error(`workflow_dispatch ${res.status}${msg ? `: ${msg.slice(0, 120)}` : ''}`);
  }
}

export default {
  scheduled(_controller: unknown, env: Env, ctx: CronContext): void {
    ctx.waitUntil(dispatch(env));
  },
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
