// 킬 스위치 API 클라이언트(ADR-0104): 규칙 식·본문, ensure 멱등(기존 규칙 보존·PUT 미사용), 켜기/끄기 PATCH, 사용자 응답 거부 시 기본 차단으로 재시도.
import { describe, expect, it } from 'vitest';
import {
  apiFromEnv,
  ensure,
  type KillSwitchApi,
  MAINTENANCE_BODY,
  type Rule,
  ruleBody,
  ruleExpression,
  setEnabled,
  status,
} from '../lib/killswitch.ts';

const ZONE = 'z'.repeat(32);

/** 존 엔트리포인트 하나를 흉내 내는 Rulesets API. `rejectCustom` = 사용자 응답을 400으로 거부(플랜). */
function fakeCf(opts: { existing?: Rule[]; noEntrypoint?: boolean; rejectCustom?: boolean } = {}) {
  let ep: { id: string; rules: Rule[] } | null = opts.noEntrypoint
    ? null
    : { id: 'rs1', rules: [...(opts.existing ?? [])] };
  const calls: string[] = [];
  let seq = 0;
  const ok = (result: unknown) => Response.json({ success: true, result });
  const fail = (status: number) =>
    Response.json({ success: false, errors: [{ code: 20120, message: 'not entitled' }] }, { status });
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const path = url.replace('https://api.cloudflare.com/client/v4', '');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Rule & { rules?: Rule[]; position?: unknown })
      : undefined;
    if (method === 'GET' && path.endsWith('/entrypoint')) return ep ? ok(ep) : fail(404);
    const withId = (r: Rule): Rule => ({ ...r, id: `r${++seq}` });
    if (method === 'POST' && path === `/zones/${ZONE}/rulesets`) {
      if (opts.rejectCustom && body?.rules?.some((r) => r.action_parameters)) return fail(400);
      ep = { id: 'rs1', rules: (body?.rules ?? []).map(withId) };
      return ok(ep);
    }
    if (method === 'POST' && path.endsWith('/rules') && ep && body) {
      if (opts.rejectCustom && body.action_parameters) return fail(400);
      const { position: _p, ...rule } = body;
      ep.rules.unshift(withId(rule));
      return ok(ep);
    }
    if (method === 'PATCH' && ep && body) {
      const id = path.split('/').at(-1) ?? '';
      const { rules: _r, position: _p, ...next } = body;
      ep.rules = ep.rules.map((r) => (r.id === id ? { ...next, id } : r));
      return ok(ep);
    }
    return fail(405);
  }) as typeof fetch;
  return { fetchFn, calls, rules: () => ep?.rules ?? [] };
}

const api = (f: ReturnType<typeof fakeCf>): KillSwitchApi => ({ token: 't', zoneId: ZONE, fetchFn: f.fetchFn });

describe('kill switch rules', () => {
  it('blocks only /world/* and /api/* on the given host with a 503 maintenance JSON', () => {
    expect(ruleExpression('earthaimap.com')).toBe(
      '(http.host eq "earthaimap.com" and (starts_with(http.request.uri.path, "/world/") or starts_with(http.request.uri.path, "/api/")))',
    );
    const r = ruleBody('production', false);
    expect(r).toMatchObject({ description: 'sanpo-kill-switch', action: 'block', enabled: false });
    expect(r.action_parameters).toEqual({
      response: { status_code: 503, content_type: 'application/json', content: MAINTENANCE_BODY },
    });
    expect(ruleBody('staging-test', false).expression).toContain('"staging.earthaimap.com"');
    expect(ruleBody('production', true, false).action_parameters).toBeUndefined();
  });

  it('ensure creates both rules disabled, keeps existing rules and is idempotent', async () => {
    const other: Rule = { id: 'keep', description: 'user rule', expression: 'true', action: 'skip', enabled: true };
    const f = fakeCf({ existing: [other] });
    expect(await ensure(api(f))).toEqual(['production', 'staging-test']);
    expect(await ensure(api(f))).toEqual([]);
    expect(f.rules().map((r) => [r.description, r.enabled])).toEqual([
      ['sanpo-kill-switch-staging-test', false],
      ['sanpo-kill-switch', false],
      ['user rule', true],
    ]);
    expect(f.calls.some((c) => c.startsWith('PUT'))).toBe(false);
  });

  it('creates the entrypoint when the zone has none, and falls back to the default block page if custom responses are refused', async () => {
    const f = fakeCf({ noEntrypoint: true, rejectCustom: true });
    await ensure(api(f));
    expect(f.rules()).toHaveLength(2);
    expect(f.rules().every((r) => r.action_parameters === undefined)).toBe(true);
    expect((await status(api(f))).production).toEqual({ exists: true, enabled: false, customResponse: false });
  });

  it('turns a target on and off with PATCH and reports no-op changes', async () => {
    const f = fakeCf();
    expect(await setEnabled(api(f), 'staging-test', true)).toBe(true);
    expect(await setEnabled(api(f), 'staging-test', true)).toBe(false);
    let s = await status(api(f));
    expect(s['staging-test']).toMatchObject({ exists: true, enabled: true });
    expect(s.production).toMatchObject({ exists: true, enabled: false });
    expect(await setEnabled(api(f), 'staging-test', false)).toBe(true);
    s = await status(api(f));
    expect(s['staging-test']).toMatchObject({ enabled: false });
    expect(f.calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(2);
  });

  it('reads the token only from CF_KILLSWITCH_TOKEN (absent = watch and issue only)', () => {
    expect(apiFromEnv({})).toBeUndefined();
    expect(apiFromEnv({ CF_KILLSWITCH_TOKEN: 'x', CF_ZONE_ID: ZONE })).toEqual({ token: 'x', zoneId: ZONE });
  });
});
