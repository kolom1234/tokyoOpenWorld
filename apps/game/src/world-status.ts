// 부트 4단계: GET /api/world/current?fv= → 활성 월드 빌드 조회. see docs/13-deployment.md §4, §8
import { FORMAT_VERSION } from '@sanpo/tile-format';

export type WorldStatus =
  | { kind: 'ready'; buildId: string; baseUrl: string }
  /** Worker에 R2/KV 바인딩이 없음(503 world_storage_unconfigured, ADR-0015). */
  | { kind: 'unconfigured' }
  /** KV에 이 formatVersion의 활성 빌드가 없음(404). */
  | { kind: 'no-build' }
  | { kind: 'error'; detail: string };

type FetchLike = (input: string) => Promise<Response>;

function isCurrentBody(v: unknown): v is { buildId: string; baseUrl: string } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.buildId === 'string' && typeof o.baseUrl === 'string';
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const code = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).error : undefined;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

/** 네트워크·파싱 실패도 예외 대신 `{ kind: 'error' }`로 돌려준다(부트 화면 표시용). */
export async function fetchWorldStatus(
  fetchFn: FetchLike = (u) => fetch(u),
  formatVersion: number = FORMAT_VERSION,
): Promise<WorldStatus> {
  let res: Response;
  try {
    res = await fetchFn(`/api/world/current?fv=${formatVersion}`);
  } catch (e) {
    return { kind: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
  if (res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    if (!isCurrentBody(body)) return { kind: 'error', detail: 'malformed /api/world/current response' };
    return { kind: 'ready', buildId: body.buildId, baseUrl: body.baseUrl };
  }
  const code = await errorCode(res);
  if (res.status === 503 && code === 'world_storage_unconfigured') return { kind: 'unconfigured' };
  if (res.status === 404 && code === 'no_build') return { kind: 'no-build' };
  return { kind: 'error', detail: `HTTP ${res.status}${code ? ` (${code})` : ''}` };
}
