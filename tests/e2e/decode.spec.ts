// streaming 디코드 워커 e2e(Chromium): `?probe=decode`로 /fixtures/world-mini 셀을 fetch → Cache Storage → 모듈 워커 디코드.
// 파이프라인 스냅샷과 정점·인덱스 수 일치, 2차는 캐시, 취소 동작, 메인 긴 작업 없음. 셀당 시간은 테스트 첨부(decode-probe.json). see ADR-0022
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

interface ProbeCell {
  id: string;
  fromCache: boolean;
  workerMs: number;
  postMs: number;
  meshes: Record<string, Array<{ vertices: number; indices: number }>>;
}
interface Report {
  workers: number;
  passes: ProbeCell[][];
  cancel: { aborted: boolean; nextOk: boolean };
  longTasks: number[];
  cacheStorage: boolean;
}
type Snapshot = Record<string, { sections: Record<string, Array<{ vertices: number; indices: number }>> }>;

const SNAPSHOT = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../fixtures/snapshots/world-mini-decode.json'), 'utf8'),
) as Snapshot;
const SLOT_OF: Record<string, string> = { 'terrain.mesh': 'terrain', 'buildings.mesh': 'buildings' };

test('decode worker: world-mini cells match the pipeline snapshot, cache on 2nd pass, cancel works', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?world=mini&probe=decode');
  await expect(page.locator('#app')).toHaveAttribute('data-probe', 'done', { timeout: 60_000 });
  const report = (await page.evaluate(
    () => (globalThis as { __SANPO_DECODE_PROBE__?: unknown }).__SANPO_DECODE_PROBE__,
  )) as Report;
  await test
    .info()
    .attach('decode-probe.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

  expect(report.workers).toBeGreaterThanOrEqual(1);
  expect(report.cacheStorage).toBe(true);
  const [network, cached] = report.passes;
  expect(network?.map((c) => c.id)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
  expect(network?.every((c) => !c.fromCache)).toBe(true);
  expect(cached?.every((c) => c.fromCache)).toBe(true);
  for (const cell of [...(network ?? []), ...(cached ?? [])]) {
    const snap = SNAPSHOT[cell.id]?.sections ?? {};
    const expected: Record<string, Array<{ vertices: number; indices: number }>> = {};
    for (const [type, prims] of Object.entries(snap)) {
      expected[SLOT_OF[type] ?? type] = prims.map((p) => ({ vertices: p.vertices, indices: p.indices }));
    }
    expect(cell.meshes).toEqual(expected);
    expect(cell.workerMs).toBeGreaterThan(0);
  }
  // 메인 동기 구간(postMessage + transfer)은 ≈ 0.1 ms. 개별 표본은 병렬 e2e(SwiftShader 렌더 테스트)의 CPU 경합으로
  // 선점되면 수 ms로 튀므로 중앙값으로 본다(Hard Rule 8의 4 ms 대비 여유 확인). 긴 작업(≥ 50 ms)은 아래에서 0건.
  const post = [...(network ?? []), ...(cached ?? [])].map((c) => c.postMs).sort((a, b) => a - b);
  expect(post[Math.floor(post.length / 2)]).toBeLessThan(1);
  expect(report.cancel).toEqual({ aborted: true, nextOk: true });
  expect(report.longTasks).toEqual([]);
  expect(errors).toEqual([]);
});
