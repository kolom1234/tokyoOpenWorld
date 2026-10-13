// 역 계단 동선 실제 GPU 검사(ADR-0082 — CI 제외, `pnpm stations`): access.json 모든 출구마다
// 개찰구 안 계단 표식에서 F → 발이 승강장 윗면(sim 메시) 위·가장자리 여유 ≥ 1 m → W 2 s 걸어도 윗면·구덩이 아님 → 승강장 표식에서 F → 거리 바닥.
// 스크린샷 test-results/golden/stations/<역>-<출구>-{platform,street}.png. 서버 = 골든뷰와 같음(dev `?world=local` 또는 GOLDEN_BASE_URL).
import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const OUT = 'test-results/golden/stations';
const WORLD = process.env.GOLDEN_WORLD === 'api' ? '' : 'world=local&';

test.use({ viewport: { width: 1600, height: 900 } });

type V = { x: number; y: number; z: number };
interface Target {
  station: string;
  exit: string;
  down: { pos: V; yawRad: number };
}
type Probe = {
  topAt(x: number, z: number): number | undefined;
  clearTopAt(x: number, z: number, r: number): number | undefined;
  inPit(p: V): boolean;
  targets(): Target[];
};
type Handle = {
  __SANPO_DEBUG__: {
    world: {
      traversal: { mode: string; player: { posWF: V }; teleport(p: V, yaw: number): Promise<void> };
      sim: { railStatic(): unknown };
      physics: { raycast(o: V, d: V, m: number): Promise<{ posWF: V } | null> };
    };
  };
  __SANPO_STATIONS__: Probe;
};

const player = (page: Page) =>
  page.evaluate(() => ({ ...(globalThis as unknown as Handle).__SANPO_DEBUG__.world.traversal.player.posWF }));
const mode = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.traversal.mode);

// evaluate 콜백은 브라우저에서 돈다 — 바깥 함수를 쓰지 않고 핸들을 직접.
const topAt = (page: Page, p: V) =>
  page.evaluate((q) => (globalThis as unknown as Handle).__SANPO_STATIONS__.topAt(q.x, q.z), p);
const clearAt = (page: Page, p: V, r: number) =>
  page.evaluate(([q, rr]) => (globalThis as unknown as Handle).__SANPO_STATIONS__.clearTopAt(q.x, q.z, rr), [
    p,
    r,
  ] as const);
const inPit = (page: Page, p: V) =>
  page.evaluate((q) => (globalThis as unknown as Handle).__SANPO_STATIONS__.inPit(q), p);

async function tap(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(80);
  await page.keyboard.up(code);
}

/** freecam으로 날아가 발밑 콜라이더가 생길 때까지 기다린 뒤 walk로 그 자리에. */
async function walkAt(page: Page, p: V, yaw: number): Promise<void> {
  if ((await mode(page)) !== 'freecam') await tap(page, 'KeyC');
  await expect.poll(() => mode(page)).toBe('freecam');
  await page.evaluate(
    ([q, y]) => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.traversal.teleport({ ...q, y: q.y + 6 }, y),
    [p, yaw] as const,
  );
  await expect
    .poll(
      () =>
        page.evaluate(async (q) => {
          const hit = await (globalThis as unknown as Handle).__SANPO_DEBUG__.world.physics.raycast(
            { x: q.x, y: q.y + 3, z: q.z },
            { x: 0, y: -1, z: 0 },
            8,
          );
          return hit ? Math.abs(hit.posWF.y - q.y) : 99;
        }, p),
      { timeout: 90_000, intervals: [1000] },
    )
    .toBeLessThan(0.6);
  await tap(page, 'KeyC');
  await expect.poll(() => mode(page)).toBe('walk');
  await page.waitForTimeout(1500);
  await page.evaluate(
    ([q, y]) => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.traversal.teleport({ ...q, y: q.y + 0.1 }, y),
    [p, yaw] as const,
  );
  await page.waitForTimeout(1200);
}

async function pressFAndArrive(page: Page, from: V): Promise<V> {
  await expect(page.locator('#station-prompt')).toContainText('F', { timeout: 15_000 });
  await tap(page, 'KeyF');
  await expect
    .poll(async () => {
      const p = await player(page);
      return Math.hypot(p.x - from.x, p.z - from.z);
    })
    .toBeGreaterThan(10);
  await expect.poll(() => page.locator('#station-fade').evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  await page.waitForTimeout(800);
  return player(page);
}

test('every exit: stairs F lands on the platform top, walking stays on it, F back up lands on the street', async ({
  page,
}) => {
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  await page.goto(`/?${WORLD}debug=1&audio=0&crowd=0&traffic=0`);
  await page.waitForFunction(
    () => {
      const g = globalThis as unknown as Partial<Handle>;
      return (
        g.__SANPO_DEBUG__?.world.traversal.mode === 'walk' && g.__SANPO_DEBUG__.world.sim.railStatic() !== undefined
      );
    },
    null,
    { timeout: 180_000 },
  );
  await page.mouse.click(800, 450);
  const targets = await page.evaluate(() => (globalThis as unknown as Handle).__SANPO_STATIONS__.targets());
  const access = (await import('../../content/stations/access.json', { with: { type: 'json' } })).default as {
    stations: {
      id: string;
      exits: {
        id: string;
        stairs: { posWF: number[]; yawDeg: number };
        platform: { posWF: number[]; yawDeg: number };
      }[];
    }[];
  };
  expect(targets.length).toBeGreaterThanOrEqual(4);
  for (const t of targets) {
    const e = access.stations.find((s) => s.id === t.station)?.exits.find((x) => x.id === t.exit);
    if (!e) throw new Error(`${t.station}/${t.exit}`);
    const v = (a: number[]): V => ({ x: a[0] as number, y: a[1] as number, z: a[2] as number });
    const stairs = v(e.stairs.posWF);
    await walkAt(page, stairs, (e.stairs.yawDeg * Math.PI) / 180);
    const p = await pressFAndArrive(page, stairs);
    const top = await topAt(page, p);
    expect(top, `${t.station} feet on platform top`).toBeDefined();
    expect(Math.abs(p.y - (top as number)), `${t.station} feet height`).toBeLessThan(0.2);
    expect(await clearAt(page, p, 1.0), `${t.station} clearance ≥ 1 m`).toBeDefined();
    await page.screenshot({ path: `${OUT}/${t.station}-${t.exit}-platform.png` });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2000);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(600);
    const q = await player(page);
    expect(await topAt(page, q), `${t.station} still on top after walking`).toBeDefined();
    expect(await inPit(page, q), `${t.station} not in a pit`).toBe(false);
    // 올라가기: 승강장 표식에서 F → 계단 입구 앞(거리 바닥 — 표식 높이 ±1 m).
    const plat = v(e.platform.posWF);
    await page.evaluate(
      ([o, y]) => (globalThis as unknown as Handle).__SANPO_DEBUG__.world.traversal.teleport({ ...o, y: o.y + 0.1 }, y),
      [plat, (e.platform.yawDeg * Math.PI) / 180] as const,
    );
    await page.waitForTimeout(800);
    const s = await pressFAndArrive(page, plat);
    expect(Math.abs(s.y - stairs.y), `${t.station} street height`).toBeLessThan(1);
    await page.screenshot({ path: `${OUT}/${t.station}-${t.exit}-street.png` });
  }
});
