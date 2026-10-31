// 킬 스위치(ADR-0104): earthaimap.com 존 WAF 사용자 정의 규칙 `sanpo-kill-switch`(평소 비활성)를 만들고 켜고 끈다 —
// `/world/*`·`/api/*` 요청을 Worker·R2에 닿기 전에 엣지에서 막는다(정적 게임 파일은 계속 제공 → 게임이 점검 화면).
// 토큰 = 환경 변수 CF_KILLSWITCH_TOKEN(존 한정 Zone → WAF: Edit + Zone → Zone: Read), 존 id = CF_ZONE_ID(없으면 이름으로 찾음). 값·id는 출력하지 않는다.
const API = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_request_firewall_custom';
export const ZONE_NAME = 'earthaimap.com';

export type Target = 'production' | 'staging-test';

/** production = 공개 도메인, staging-test = staging 커스텀 도메인(켜기/끄기 실검증 전용 — production 규칙은 만들기만 하고 켜지 않는다). */
export const TARGETS: Readonly<Record<Target, { description: string; host: string }>> = {
  production: { description: 'sanpo-kill-switch', host: 'earthaimap.com' },
  'staging-test': { description: 'sanpo-kill-switch-staging-test', host: 'staging.earthaimap.com' },
};

/** 차단 응답 본문 — 게임 world-status.ts `isEdgeBlock`이 점검 화면으로 바꾼다(사용자 응답을 못 쓰면 기본 403 페이지도 같은 처리). */
export const MAINTENANCE_BODY = '{"error":"maintenance"}';

export function ruleExpression(host: string): string {
  return `(http.host eq "${host}" and (starts_with(http.request.uri.path, "/world/") or starts_with(http.request.uri.path, "/api/")))`;
}

export interface Rule {
  id?: string;
  description?: string;
  expression: string;
  action: string;
  enabled: boolean;
  action_parameters?: Record<string, unknown>;
}

/** 규칙 본문. `customResponse` = 503 JSON 사용자 응답(플랜이 거부하면 false로 다시 — 기본 403 차단 페이지). */
export function ruleBody(target: Target, enabled: boolean, customResponse = true): Rule {
  const t = TARGETS[target];
  return {
    description: t.description,
    expression: ruleExpression(t.host),
    action: 'block',
    enabled,
    ...(customResponse
      ? {
          action_parameters: {
            response: { status_code: 503, content_type: 'application/json', content: MAINTENANCE_BODY },
          },
        }
      : {}),
  };
}

export interface KillSwitchApi {
  token: string;
  zoneId?: string;
  fetchFn?: typeof fetch;
}

export class CfApiError extends Error {
  readonly status: number;
  readonly codes: number[];
  constructor(status: number, codes: number[], message: string) {
    super(message);
    this.status = status;
    this.codes = codes;
  }
}

/** REST 호출 → result. 실패 = CfApiError(경로의 32자리 id는 가린다). */
async function call<T>(api: KillSwitchApi, method: string, path: string, body?: unknown): Promise<T> {
  const res = await (api.fetchFn ?? fetch)(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    result?: T;
    errors?: { code: number; message: string }[];
  };
  if (!res.ok || j.success === false) {
    const errs = j.errors ?? [];
    const where = `${method} ${path.replace(/[0-9a-f]{32}/g, '…')}`;
    throw new CfApiError(
      res.status,
      errs.map((e) => e.code),
      `${where} ${res.status}: ${errs.map((e) => e.message).join('; ')}`,
    );
  }
  return j.result as T;
}

export async function zoneId(api: KillSwitchApi): Promise<string> {
  if (api.zoneId) return api.zoneId;
  const zones = await call<{ id: string }[]>(api, 'GET', `/zones?name=${ZONE_NAME}`);
  const id = zones[0]?.id;
  if (!id) throw new Error(`zone ${ZONE_NAME} is not visible to the token`);
  return id;
}

interface Entrypoint {
  id: string;
  rules?: Rule[];
}

/** 존 엔트리포인트(없으면 null — 사용자 정의 규칙이 하나도 없던 존). */
async function entrypoint(api: KillSwitchApi, zone: string): Promise<Entrypoint | null> {
  try {
    return await call<Entrypoint>(api, 'GET', `/zones/${zone}/rulesets/phases/${PHASE}/entrypoint`);
  } catch (e) {
    if (e instanceof CfApiError && e.status === 404) return null;
    throw e;
  }
}

export type TargetState = { exists: false } | { exists: true; enabled: boolean; customResponse: boolean };

const find = (ep: Entrypoint | null, target: Target): Rule | undefined =>
  ep?.rules?.find((r) => r.description === TARGETS[target].description);

export async function status(api: KillSwitchApi): Promise<Record<Target, TargetState>> {
  const ep = await entrypoint(api, await zoneId(api));
  const one = (t: Target): TargetState => {
    const r = find(ep, t);
    return r
      ? { exists: true, enabled: r.enabled, customResponse: r.action_parameters !== undefined }
      : { exists: false };
  };
  return { production: one('production'), 'staging-test': one('staging-test') };
}

/** 사용자 응답 거부(플랜 권한)로 보이는 오류 — 기본 차단 페이지로 다시 만든다. */
const rejectsCustomResponse = (e: unknown): boolean => e instanceof CfApiError && e.status === 400;

/** 빠진 규칙을 **비활성**으로 만든다(멱등). 기존 규칙은 건드리지 않는다. 엔트리포인트가 없을 때만 만든다(PUT은 기존 규칙을 덮으므로 쓰지 않음). */
export async function ensure(api: KillSwitchApi): Promise<Target[]> {
  const zone = await zoneId(api);
  let ep = await entrypoint(api, zone);
  const created: Target[] = [];
  for (const t of Object.keys(TARGETS) as Target[]) {
    if (find(ep, t)) continue;
    const add = async (custom: boolean): Promise<void> => {
      const rule = ruleBody(t, false, custom);
      if (ep === null) {
        ep = await call<Entrypoint>(api, 'POST', `/zones/${zone}/rulesets`, {
          name: 'default',
          kind: 'zone',
          phase: PHASE,
          rules: [rule],
        });
      } else {
        // 맨 앞(차단은 종료 동작 — 앞선 skip 규칙에 가려지지 않게).
        ep = await call<Entrypoint>(api, 'POST', `/zones/${zone}/rulesets/${ep.id}/rules`, {
          ...rule,
          position: { index: 1 },
        });
      }
    };
    try {
      await add(true);
    } catch (e) {
      if (!rejectsCustomResponse(e)) throw e;
      await add(false);
    }
    created.push(t);
  }
  return created;
}

/** 규칙을 켜거나 끈다(없으면 ensure 먼저). 반환 = 바뀌었는가. */
export async function setEnabled(api: KillSwitchApi, target: Target, enabled: boolean): Promise<boolean> {
  const zone = await zoneId(api);
  let ep = await entrypoint(api, zone);
  if (!find(ep, target)) {
    await ensure(api);
    ep = await entrypoint(api, zone);
  }
  const rule = find(ep, target);
  if (!ep || !rule?.id) throw new Error(`kill-switch rule for ${target} is missing after ensure`);
  if (rule.enabled === enabled) return false;
  const { id, ...rest } = rule;
  const body: Rule = {
    description: rest.description ?? TARGETS[target].description,
    expression: rest.expression,
    action: rest.action,
    enabled,
    ...(rest.action_parameters ? { action_parameters: rest.action_parameters } : {}),
  };
  await call(api, 'PATCH', `/zones/${zone}/rulesets/${ep.id}/rules/${id}`, body);
  return true;
}

/** 환경 변수에서 API 설정(토큰 없으면 undefined — 감시·이슈만, 차단 건너뜀). */
export function apiFromEnv(env: NodeJS.ProcessEnv = process.env): KillSwitchApi | undefined {
  const token = env.CF_KILLSWITCH_TOKEN;
  if (!token) return undefined;
  return { token, ...(env.CF_ZONE_ID ? { zoneId: env.CF_ZONE_ID } : {}) };
}
