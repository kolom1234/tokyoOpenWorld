// 킬 스위치(ADR-0104) 응답 → 점검 상태·로딩 단계: WAF 사용자 응답 503 maintenance 또는 기본 차단 페이지 403(JSON 아님).
import { describe, expect, it } from 'vitest';
import { loadingOfWorld } from '../src/shell/loading.ts';
import { fetchWorldStatus, isEdgeBlock } from '../src/world-status.ts';

describe('kill-switch maintenance status', () => {
  it('recognises edge blocks but not Worker errors', () => {
    expect(isEdgeBlock(503, 'maintenance')).toBe(true);
    expect(isEdgeBlock(403, undefined)).toBe(true);
    expect(isEdgeBlock(503, 'world_storage_unconfigured')).toBe(false);
    expect(isEdgeBlock(404, 'no_build')).toBe(false);
  });

  it('maps a blocked /api/world/current to the maintenance loading stage', async () => {
    const html = async () => new Response('<html>Sorry, you have been blocked</html>', { status: 403 });
    const s = await fetchWorldStatus(html, 1);
    expect(s).toEqual({ kind: 'maintenance' });
    expect(loadingOfWorld(s)).toEqual({ stage: 'maintenance', error: null });
    const json = async () => Response.json({ error: 'maintenance' }, { status: 503 });
    expect(await fetchWorldStatus(json, 1)).toEqual({ kind: 'maintenance' });
  });
});
