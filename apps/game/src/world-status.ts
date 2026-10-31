// 부트 4단계: GET /api/world/current?fv= → 활성 월드 빌드 조회(킬 스위치 차단 = 점검 상태). see docs/13-deployment.md §4, §8
import { FORMAT_VERSION } from '@sanpo/tile-format';
import type { WorldSource } from './world-load.ts';

export type WorldStatus =
  | { kind: 'ready'; buildId: string; baseUrl: string }
  /** world.json·cells.idx·스폰 주변 셀 헤더까지 확인(world-load.ts). e2e는 이 상태를 기다린다. */
  | { kind: 'loaded'; source: WorldSource; buildId: string; cells: number; indexed: number }
  /** Worker에 R2/KV 바인딩이 없음(503 world_storage_unconfigured, ADR-0015). */
  | { kind: 'unconfigured' }
  /** KV에 이 formatVersion의 활성 빌드가 없음(404). */
  | { kind: 'no-build' }
  /** 비용 차단 장치(킬 스위치, ADR-0104)가 `/api/*`·`/world/*`를 엣지에서 막는 중 — 점검 화면. */
  | { kind: 'maintenance' }
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

/**
 * 킬 스위치 응답(ADR-0104): WAF 규칙의 사용자 응답 `503 {"error":"maintenance"}`, 또는 사용자 응답을 못 쓰는 플랜의 기본 차단 페이지(403 HTML).
 * Worker는 이 경로에 403을 내지 않으므로 JSON 오류 코드 없는 403 = 엣지 차단.
 */
export function isEdgeBlock(status: number, code: string | undefined): boolean {
  return (status === 503 && code === 'maintenance') || (status === 403 && code === undefined);
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
  if (isEdgeBlock(res.status, code)) return { kind: 'maintenance' };
  if (res.status === 503 && code === 'world_storage_unconfigured') return { kind: 'unconfigured' };
  if (res.status === 404 && code === 'no_build') return { kind: 'no-build' };
  return { kind: 'error', detail: `HTTP ${res.status}${code ? ` (${code})` : ''}` };
}
