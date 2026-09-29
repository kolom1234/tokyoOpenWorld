// 물리 워커 e2e(M04-T01): `?probe=physics` — 실제 모듈 워커(Vite 청크)에서 Jolt 초기화 → 상자 낙하 → 보간 포즈. 격리(SAB)와 폴백(postMessage) 모두.
// preview 서버는 COOP/COEP로 격리된다 → 폴백은 `&physicsIsolation=degraded`로 강제. see docs/08-physics.md §1·§9
import { expect, test } from '@playwright/test';

interface Report {
  isolation: 'shared' | 'degraded';
  crossOriginIsolated: boolean;
  build: 'multithread' | 'single' | null;
  initMs: number;
  ys: number[];
  finalY: number;
  finalVy: number;
  steps: number;
  longTasks: number[];
}

for (const [label, query, expected] of [
  ['shared (SAB)', '', 'shared'],
  ['degraded (postMessage)', '&physicsIsolation=degraded', 'degraded'],
] as const) {
  test(`physics worker ${label}: box falls and rests on the floor`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?probe=physics${query}`);
    await expect(page.locator('#app')).toHaveAttribute('data-probe', 'done', { timeout: 60_000 });
    const r = (await page.evaluate(
      () => (globalThis as { __SANPO_PHYSICS_PROBE__?: unknown }).__SANPO_PHYSICS_PROBE__,
    )) as Report;
    test.info().annotations.push({ type: 'physics', description: JSON.stringify({ ...r, ys: r.ys.length }) });
    expect(r.crossOriginIsolated).toBe(true);
    expect(r.isolation).toBe(expected);
    expect(r.build).not.toBeNull();
    expect(r.ys.length).toBeGreaterThan(20);
    // 공중(중심 > 1 m)에선 단조 감소(착지 순간 침투 보정으로 1–2 cm 튀는 건 허용), 3 s 뒤 바닥(윗면 0) 위 정지.
    for (let i = 1; i < r.ys.length; i++) {
      if ((r.ys[i] as number) > 1) expect(r.ys[i] as number).toBeLessThanOrEqual((r.ys[i - 1] as number) + 1e-6);
    }
    expect(r.finalY).toBeGreaterThan(0.46);
    expect(r.finalY).toBeLessThan(0.51);
    expect(Math.abs(r.finalVy)).toBeLessThan(0.05);
    expect(r.steps).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });
}
