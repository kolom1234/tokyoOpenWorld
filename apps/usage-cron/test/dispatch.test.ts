// usage-cron(ADR-0106): GitHub workflow_dispatch 요청 모양, 204만 성공, 토큰 없음·실패 상태는 예외(토큰은 오류 메시지에 없음), 공개 fetch = 404.
import { describe, expect, it } from 'vitest';
import worker, { dispatch, dispatchRequest } from '../src/index.ts';

const TOKEN = 'github_pat_TESTVALUE';

describe('usage-cron dispatch', () => {
  it('posts workflow_dispatch for usage.yml on main with the GitHub API headers', async () => {
    const req = dispatchRequest({}, TOKEN);
    expect(req.method).toBe('POST');
    expect(req.url).toBe(
      'https://api.github.com/repos/kolom1234/tokyoOpenWorld/actions/workflows/usage.yml/dispatches',
    );
    expect(req.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(req.headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
    expect(req.headers.get('User-Agent')).toBe('sanpo-usage-cron');
    expect(await req.json()).toEqual({ ref: 'main' });
    const custom = dispatchRequest({ GITHUB_REPO: 'o/r', WORKFLOW: 'x.yml', REF: 'dev' }, TOKEN);
    expect(custom.url).toBe('https://api.github.com/repos/o/r/actions/workflows/x.yml/dispatches');
    expect(await custom.json()).toEqual({ ref: 'dev' });
  });

  it('succeeds only on 204 and never puts the token in errors', async () => {
    const calls: Request[] = [];
    const ok = (async (r: Request) => {
      calls.push(r);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await dispatch({ GITHUB_DISPATCH_TOKEN: TOKEN }, ok);
    expect(calls).toHaveLength(1);
    const denied = (async () =>
      Response.json({ message: 'Resource not accessible by personal access token' }, { status: 403 })) as typeof fetch;
    const err = await dispatch({ GITHUB_DISPATCH_TOKEN: TOKEN }, denied).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('workflow_dispatch 403: Resource not accessible by personal access token');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('fails loudly without a token and exposes no public endpoint', async () => {
    await expect(dispatch({}, (async () => new Response(null, { status: 204 })) as typeof fetch)).rejects.toThrow(
      /GITHUB_DISPATCH_TOKEN is not set/,
    );
    expect(worker.fetch().status).toBe(404);
    const waited: Promise<unknown>[] = [];
    worker.scheduled(undefined, {}, { waitUntil: (p) => waited.push(p) });
    await expect(waited[0]).rejects.toThrow(/GITHUB_DISPATCH_TOKEN/);
  });
});
