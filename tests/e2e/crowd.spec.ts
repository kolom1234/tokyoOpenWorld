// 군중 스모크(M06-T01, ADR-0061): `?crowd=dummy` — sim.worker(SAB)가 1,000명을 게시하고, 군중 팩(뼈 팔레트·KTX2 배열)이 WebGL2(SwiftShader)에서도
// 적재·그려지는지. M06-T03(ADR-0063): `?crowd=scramble` — world-mini nav.bin → 워커 Recast(WASM)·DetourCrowd에 250명이 스크램블 대기점에 서고
// 보행 녹색에 건너는지(신호 계획 시각을 녹색 직전으로). 시간 창이 아니라 상태(군중 ready·visible·워커 통계)로 기다린다.
import { expect, test } from '@playwright/test';
import { STATE_TIMEOUT_MS, waitFrames, waitSettled } from './game.ts';

type ClockHandle = {
  __SANPO_DEBUG__: { world: { sim: { clock: { gameTimeMs: number; jumpTo(ms: number): void } } } };
};

type Handle = {
  __SANPO_DEBUG__: {
    world: {
      render: { stats(): { crowd: { instances: number; visible: number; ready: boolean } } };
      sim: {
        workerStats():
          | {
              ticks: number;
              count: number;
              crowd?: { agents: number; waiting: number; crossing: number; tiles: number; offMesh: number };
            }
          | undefined;
      };
    };
  };
};

test('dummy crowd: sim worker publishes 1,000 pedestrians and the crowd pack renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?world=mini&debug=1&crowd=dummy');
  await waitSettled(page);
  const crowd = () => page.evaluate(() => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.render.stats().crowd);
  await expect.poll(async () => (await crowd()).ready, { timeout: STATE_TIMEOUT_MS }).toBe(true);
  await expect.poll(async () => (await crowd()).instances, { timeout: STATE_TIMEOUT_MS }).toBe(1000);
  await waitFrames(page, 3);
  expect((await crowd()).visible).toBeGreaterThan(0);
  const sim = await page.evaluate(() => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.sim.workerStats());
  expect(sim?.count).toBe(1000);
  expect(sim?.ticks).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('agents (M06-T03): world-mini navmesh tiles reach the worker, 250 scramble agents wait then cross', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?world=mini&debug=1&crowd=scramble');
  await waitSettled(page);
  // 스크램블 계획(주기 120 s, 사이트 오프셋 0): 86–112 s 전방향 보행 W. 부팅 시간(SwiftShader 수십 s)과 무관하게 시계를 직접 옮긴다 —
  // 차량 현시(주기 50 s 지점)로 → 대기 무리 → 85 s 지점으로(1 s 뒤 W).
  const jumpToCycle = (at: number) =>
    page.evaluate((s) => {
      const c = (globalThis as unknown as ClockHandle).__SANPO_DEBUG__.world.sim.clock;
      const t = c.gameTimeMs / 1000;
      c.jumpTo((t - (((t % 120) + 120) % 120) + s + 120) * 1000);
    }, at);
  await jumpToCycle(50);
  const sim = () =>
    page.evaluate(() => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.sim.workerStats()?.crowd);
  await expect.poll(async () => (await sim())?.tiles ?? 0, { timeout: STATE_TIMEOUT_MS }).toBe(64);
  await expect.poll(async () => (await sim())?.agents ?? 0, { timeout: STATE_TIMEOUT_MS }).toBeGreaterThanOrEqual(200);
  await expect.poll(async () => (await sim())?.waiting ?? 0, { timeout: STATE_TIMEOUT_MS }).toBeGreaterThanOrEqual(150);
  await jumpToCycle(85);
  await expect
    .poll(async () => (await sim())?.crossing ?? 0, { timeout: STATE_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(150);
  const crowd = () => page.evaluate(() => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.render.stats().crowd);
  await expect.poll(async () => (await crowd()).ready, { timeout: STATE_TIMEOUT_MS }).toBe(true);
  await waitFrames(page, 3);
  expect((await crowd()).visible).toBeGreaterThan(0);
  expect((await sim())?.offMesh ?? -1).toBe(0);
  expect(errors).toEqual([]);
});
