// 하라주쿠 → 신주쿠 열차 동선 실제 GPU 봇(ADR-0082·0084 — CI 제외, `pnpm stations`): 사람 안내(PR 본문)와 같은 순서.
// ?spawn=harajuku-gate → W로 개찰구 통과 → 계단 표식 F → 승강장 → 북행(외회) 열차 정차·문 열림 기다림 → 가장 가까운 문 앞까지 걷기 → F 탑승
// → V 시점 → T 빨리감기(요요기) → T(신주쿠, MVP 경계역 자동 하차) → 신주쿠 승강장 윗면. 단계별 스크린샷 test-results/golden/route/NN-*.png.
import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { st, tap, waitDoor, walkTo } from './route-helpers.ts';

const OUT = 'test-results/golden/route';
const WORLD = process.env.GOLDEN_WORLD === 'api' ? '' : 'world=local&';
test.use({ viewport: { width: 1600, height: 900 } });

// biome-ignore lint/suspicious/noExplicitAny: 디버그 핸들(게임 내부 타입을 테스트에 끌어오지 않는다).
type G = any;
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

test('Harajuku → Shinjuku by train, following the written guide', async ({ page }) => {
  test.setTimeout(1_200_000);
  mkdirSync(OUT, { recursive: true });
  await page.goto(`/?${WORLD}debug=1&audio=0&crowd=0&traffic=0&spawn=harajuku-gate`);
  await page.waitForFunction(
    () =>
      (globalThis as G).__SANPO_DEBUG__?.world.traversal.mode === 'walk' &&
      (globalThis as G).__SANPO_DEBUG__.world.sim.railStatic(),
    null,
    { timeout: 180_000 },
  );
  await page.addStyleTag({ content: '.debug-overlay,#stats{display:none!important}' });
  await page.mouse.click(800, 450);
  await page.waitForTimeout(4000);
  await shot(page, '01-spawn-harajuku-gate');
  // ② 개찰구(W, 통로 하나) → 계단 표식 안내가 뜰 때까지.
  await page.keyboard.down('KeyW');
  await expect(page.locator('#station-prompt')).toContainText('승강장으로', { timeout: 30_000 });
  await page.keyboard.up('KeyW');
  expect((await st(page)).p.x).toBeLessThan(185);
  await shot(page, '02-inside-gates-stairs');
  // ③ F → 승강장.
  await tap(page, 'KeyF');
  await expect.poll(async () => (await st(page)).p.x, { timeout: 15_000 }).toBeLessThan(160);
  await page.waitForTimeout(1200);
  const plat = await st(page);
  expect(await page.evaluate((q) => (globalThis as G).__SANPO_STATIONS__.topAt(q.x, q.z), plat.p)).toBeDefined();
  await shot(page, '03-platform');
  // ④ 북행 열차 정차·문 열림(최대 10분 — 야마노테 간격 ≈ 4–5분).
  const door = await waitDoor(page);
  await shot(page, '04-train-arrived');
  await walkTo(page, door.pos);
  await expect.poll(async () => (await st(page)).hud.boardable, { timeout: 5000 }).toBe(true);
  await expect(page.locator('#station-prompt')).toContainText('열차 타기');
  await shot(page, '05-door-front-F');
  // ⑤ F 탑승.
  await tap(page, 'KeyF');
  await expect.poll(async () => (await st(page)).mode, { timeout: 10_000 }).toBe('train');
  await page.waitForTimeout(2500);
  await shot(page, '06-aboard');
  // ⑥ V 시점(서기 → 좌석 → 전면 전망).
  await tap(page, 'KeyV');
  await tap(page, 'KeyV');
  await page.waitForTimeout(1500);
  expect((await st(page)).hud.train?.view).toBe('frontView');
  await shot(page, '07-front-view');
  // ⑦ T 빨리감기 → 요요기 정차 → T → 신주쿠(경계역 자동 하차 → walk).
  await tap(page, 'KeyT');
  await expect.poll(async () => (await st(page)).hud.train?.stoppedAtStationId, { timeout: 90_000 }).toBe('yoyogi');
  await page.waitForTimeout(1500);
  await shot(page, '08-yoyogi');
  await tap(page, 'KeyT');
  await expect.poll(async () => (await st(page)).mode, { timeout: 180_000, intervals: [1000] }).toBe('walk');
  await page.waitForTimeout(2500);
  const end = await st(page);
  expect(end.p.z).toBeLessThan(-3200);
  expect(await page.evaluate((q) => (globalThis as G).__SANPO_STATIONS__.topAt(q.x, q.z), end.p)).toBeDefined();
  await shot(page, '09-shinjuku-alighted');
});
