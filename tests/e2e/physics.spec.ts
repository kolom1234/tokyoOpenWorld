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

// M04-T02: 게임 부트(world-mini) → streaming live L0 → collision.bin + terrain.height → 물리 워커 적재 → 레이캐스트가 지면(높이장)·건물을 맞힌다.
test('cell colliders: world-mini cells load into the physics worker and raycasts hit ground and buildings', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?world=mini&debug=1&backend=webgl&time=2026-05-15T12:00:00%2B09:00&crowd=0');
  await expect(page.locator('#app')).toHaveAttribute('data-rendered-cells', '4', { timeout: 60_000 });
  type Dbg = {
    world: {
      physics: {
        stats(): { colliderCells: number; colliderPending: number; loadTickMaxMs: number; loadTicksOver8Ms: number };
        raycast(
          o: object,
          d: object,
          m: number,
        ): Promise<{ posWF: { x: number; y: number; z: number }; layer: number } | null>;
      };
      ground: { groundHeightAt(x: number, z: number): number | undefined };
    };
  };
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (globalThis as unknown as { __SANPO_DEBUG__: Dbg }).__SANPO_DEBUG__.world.physics.stats();
          return s.colliderCells >= 4 && s.colliderPending === 0;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  const r = await page.evaluate(async () => {
    const w = (globalThis as unknown as { __SANPO_DEBUG__: Dbg }).__SANPO_DEBUG__.world;
    const out: { want: number | undefined; got: number | undefined; layer: number | undefined }[] = [];
    // 정수 좌표(높이장 샘플) — 지면 레이.
    for (const [x, z] of [
      [-60, -15],
      [-200, -200],
      [100, 100],
      [-10, 180],
    ] as const) {
      const hit = await w.physics.raycast({ x, y: 400, z }, { x: 0, y: -1, z: 0 }, 800);
      out.push({ want: w.ground.groundHeightAt(x, z), got: hit?.posWF.y, layer: hit?.layer });
    }
    // 스크램블 스퀘어(최고 건물) 쪽 수평 레이: 건물(STATIC_WORLD = 0)에 맞아야 한다.
    const wall = await w.physics.raycast({ x: -60, y: 60, z: -15 }, { x: 191, y: 0, z: 147 }, 400);
    return { ground: out, wall, stats: w.physics.stats() };
  });
  test.info().annotations.push({ type: 'colliders', description: JSON.stringify(r) });
  // 지면을 맞힌 레이(TERRAIN = 1)는 streaming 높이장과 ±5 cm. 건물 지붕에 먼저 맞은 레이는 제외.
  // 보도(M05-T01) 위는 TERRAIN 층 보도 윗면(높이장 + 0.15 m 안팎)에 먼저 맞는다 → 따로 센다.
  const ground = r.ground.filter((g) => g.layer === 1);
  const onSidewalk = ground.filter((g) => Math.abs((g.got as number) - (g.want as number) - 0.158) < 0.04);
  for (const g of ground) {
    if (!onSidewalk.includes(g)) expect(Math.abs((g.got as number) - (g.want as number))).toBeLessThanOrEqual(0.05);
  }
  expect(ground.length - onSidewalk.length).toBeGreaterThanOrEqual(2);
  expect(r.wall?.layer).toBe(0);
  // 적재 틱(≤ 8 ms) 판정은 실제 GPU 브라우저에서(PR·PROGRESS 기록) — SwiftShader는 렌더가 모든 CPU 코어를 써서 워커 wasm도 2–3배 느리다(최대 22 ms 실측).
  expect(errors).toEqual([]);
});
