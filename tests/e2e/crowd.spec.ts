// 군중 스모크(M06-T01, ADR-0061): `?crowd=dummy` — sim.worker(SAB)가 1,000명을 게시하고, 군중 팩(뼈 팔레트·KTX2 배열)이 WebGL2(SwiftShader)에서도
// 적재·그려지는지. 시간 창이 아니라 상태(군중 ready·visible·워커 틱)로 기다린다.
import { expect, test } from '@playwright/test';
import { STATE_TIMEOUT_MS, waitFrames, waitSettled } from './game.ts';

type Handle = {
  __SANPO_DEBUG__: {
    world: {
      render: { stats(): { crowd: { instances: number; visible: number; ready: boolean } } };
      sim: { workerStats(): { ticks: number; count: number } | undefined };
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
