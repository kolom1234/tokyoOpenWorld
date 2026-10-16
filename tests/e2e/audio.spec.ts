// 오디오 스모크(M09-T04, ADR-0079): 제스처 전에는 AudioContext를 만들지 않고(state 'locked'), 클릭 뒤 'running' 또는 'unavailable'(헤드리스·장치 없음 — 무음 허용)로
// 넘어가며, world-mini 셀 audio.json 존이 리스너 위치 가중으로 잡히고, 볼륨 키가 믹스를 바꾸고, 콘솔 오류가 없다. 소리 자체는 검사하지 않는다(헤드리스 무음).
// 대기는 시간 창이 아니라 상태(audio.state·stats)로.
import { expect, test } from '@playwright/test';
import { STATE_TIMEOUT_MS, STATE_VIEW, waitSettled } from './game.ts';

test.use({ viewport: STATE_VIEW });

type Handle = {
  __SANPO_DEBUG__: {
    world: {
      audio?: {
        state: string;
        mix: { master: number };
        stats(): { state: string; zones: Record<string, number> };
      };
    };
  };
};

test('audio: locked until a gesture, then running/unavailable without errors; zones + volume keys', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?world=mini&debug=1&weather=clear&vol=0.5');
  await waitSettled(page);
  const audio = () =>
    page.evaluate(() => {
      const a = (globalThis as unknown as Handle).__SANPO_DEBUG__.world.audio;
      return a ? { state: a.state, master: a.mix.master, zones: a.stats().zones } : null;
    });
  const before = await audio();
  expect(before?.state).toBe('locked');
  expect(before?.master).toBe(0.5);
  // 캔버스 가운데(왼쪽 위는 디버그 그래프가 덮는다).
  await page.mouse.click(640, 420);
  await expect
    .poll(async () => (await audio())?.state, { timeout: STATE_TIMEOUT_MS })
    .toMatch(/^(running|unavailable)$/);
  const after = await audio();
  if (after?.state === 'running') {
    // 존 가중 합 = 1(10 Hz 갱신 — 상태로 기다린다).
    await expect
      .poll(async () => Object.values((await audio())?.zones ?? {}).reduce((s, v) => s + v, 0), {
        timeout: STATE_TIMEOUT_MS,
      })
      .toBeCloseTo(1, 3);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('BracketRight');
  await expect.poll(async () => (await audio())?.master, { timeout: STATE_TIMEOUT_MS }).toBeCloseTo(0.6, 5);
  await page.keyboard.press('Backslash');
  await expect.poll(async () => (await audio())?.master, { timeout: STATE_TIMEOUT_MS }).toBe(0);
  expect(errors).toEqual([]);
});
