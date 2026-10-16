// 하라주쿠 → 신주쿠 열차 동선 실제 GPU 봇(ADR-0082·0084 — CI 제외, `pnpm stations`): 사람 안내(PR 본문)와 같은 순서.
// ?spawn=harajuku-gate → W로 개찰구 통과 → 계단 표식 F → 승강장 → 북행(외회) 열차 정차·문 열림 기다림 → 가장 가까운 문 앞까지 걷기 → F 탑승
// → V 시점 → T 빨리감기(요요기) → T(신주쿠, MVP 경계역 자동 하차) → 신주쿠 승강장 윗면. 단계별 스크린샷 test-results/golden/route/NN-*.png.
import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const OUT = 'test-results/golden/route';
const WORLD = process.env.GOLDEN_WORLD === 'api' ? '' : 'world=local&';
test.use({ viewport: { width: 1600, height: 900 } });

type V = { x: number; y: number; z: number };
// biome-ignore lint/suspicious/noExplicitAny: 디버그 핸들(게임 내부 타입을 테스트에 끌어오지 않는다).
type G = any;

const st = (page: Page) =>
  page.evaluate(() => {
    const t = (globalThis as G).__SANPO_DEBUG__.world.traversal;
    return {
      mode: t.mode as string,
      p: { ...t.player.posWF } as V,
      hud: { ...t.hud, train: t.hud.train ? { ...t.hud.train } : null },
    };
  });
async function tap(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(80);
  await page.keyboard.up(code);
  await page.waitForTimeout(150);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

/** 목표까지 걷기: 0.4 s마다 그 자리 순간이동(위치 그대로)으로 몸·시선을 목표로 돌리고 W(사람이 마우스로 방향을 잡고 W를 누르는 것과 같은 입력). */
async function walkTo(page: Page, target: V, within = 0.35, maxS = 40): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    const { p } = await st(page);
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d <= within) break;
    await page.evaluate(([q, yaw]) => (globalThis as G).__SANPO_DEBUG__.world.traversal.teleport(q, yaw), [
      p,
      Math.atan2(-(target.x - p.x), -(target.z - p.z)),
    ] as const);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(Math.min(400, (d / 1.35) * 1000));
    await page.keyboard.up('KeyW');
  }
}

/** 북행(외회) 하라주쿠 정차·문 열림 열차 + 플레이어에 가장 가까운 문 앞(차체 중심에서 2.4 m — 홈도어 선 바로 바깥, 문 위치 = core TRAIN_CAR_TYPES 20 m 차 doorsZ). */
function doorTarget(page: Page) {
  return page.evaluate(() => {
    const w = (globalThis as G).__SANPO_DEBUG__.world;
    const p = w.traversal.player.posWF;
    for (const t of w.sim.trainsNear(p, 300)) {
      if (t.stoppedAtStationId !== 'harajuku' || !t.doorsOpen || w.sim.trainRide(t.tripId)?.heading !== 'outer')
        continue;
      let best: { d: number; pos: V; car: number } | null = null;
      for (let k = 0; k < t.cars; k++) {
        const c = w.sim.trainCar(t.tripId, k);
        if (!c) continue;
        const f = { x: -Math.sin(c.yawRad), z: -Math.cos(c.yawRad) };
        const r = { x: Math.cos(c.yawRad), z: -Math.sin(c.yawRad) };
        const side = Math.sign((p.x - c.posWF.x) * r.x + (p.z - c.posWF.z) * r.z) || 1;
        for (const dz of [-7.35, -2.45, 2.45, 7.35]) {
          const pos = {
            x: c.posWF.x + r.x * side * 2.4 + f.x * -dz,
            y: p.y,
            z: c.posWF.z + r.z * side * 2.4 + f.z * -dz,
          };
          const d = Math.hypot(pos.x - p.x, pos.z - p.z);
          if (!best || d < best.d) best = { d, pos, car: k };
        }
      }
      if (best) return { tripId: t.tripId as string, ...best };
    }
    return null;
  });
}

/** 북행 열차 정차·문 열림까지(최대 10분). */
async function waitDoor(page: Page): Promise<NonNullable<Awaited<ReturnType<typeof doorTarget>>>> {
  const t0 = Date.now();
  for (;;) {
    const door = await doorTarget(page);
    if (door) return door;
    if (Date.now() - t0 > 600_000) throw new Error('no northbound train with open doors at Harajuku in 10 min');
    await page.waitForTimeout(1000);
  }
}

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
