// `pnpm soak`(M11-T02): 실제 GPU Chrome으로 SOAK_MINUTES(기본 60)분 자동 산책 — [시부야 도보 → 하라주쿠 승강장 → 북행 열차 탑승·빨리감기(신주쿠 경계역 하차)
// → 주행 코스 운전 → 상공 자유비행(다른 구역으로 — 스트리밍 적재·해제)] 반복. 30 s마다 JS 힙·GPU 메모리(nvidia-smi)·셀 수·워커 재시작·페이지 오류.
// 수락(14 §1·M11-T02): 10분 이후 힙·GPU 메모리 증가 기울기 ≈ 0, 워커 재시작 0. 결과 test-results/golden/soak/soak.json + 콘솔 요약. 서버 = 골든뷰와 같음.
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { WORLD } from './drive-helpers.ts';
import { gpuMemNow, round, slope } from './perf-helpers.ts';
import { st, tap, waitDoor, walkTo } from './route-helpers.ts';

const MINUTES = Number(process.env.SOAK_MINUTES ?? '60');
const OUT = 'test-results/golden/soak';
// biome-ignore lint/suspicious/noExplicitAny: 디버그 핸들.
type G = any;

interface Sample {
  min: number;
  heapMB: number;
  gpuMiB: number;
  cells: number;
  mode: string;
}

const req = (page: Page, mode: string, params: unknown) =>
  page.evaluate(([m, p]) => (globalThis as G).__SANPO_DEBUG__.world.traversal.request(m, p), [mode, params] as const);

async function walkLeg(page: Page): Promise<void> {
  await req(page, 'walk', { posWF: { x: -22.3, y: 15, z: 8.6 }, yawRad: 0 });
  await page.waitForTimeout(6000);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    await page.evaluate((y) => {
      const t = (globalThis as G).__SANPO_DEBUG__.world.traversal;
      t.request('walk', { posWF: { ...t.avatar.posWF }, yawRad: y });
    }, yaw);
    await page.waitForTimeout(15_000);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
}

/** 하라주쿠 승강장 → 북행 문 앞 → F 탑승 → T 두 번(요요기 → 신주쿠 경계역 하차). 열차가 10분 안에 없으면 건너뛴다. */
async function trainLeg(page: Page): Promise<boolean> {
  await req(page, 'walk', { posWF: { x: 152.9, y: 30.44, z: -1205.2 }, yawRad: (-8.5 * Math.PI) / 180 });
  await page.waitForTimeout(6000);
  const door = await waitDoor(page, 420_000).catch(() => null);
  if (!door) return false;
  await walkTo(page, door.pos);
  await tap(page, 'KeyF');
  const boarded = await expect
    .poll(async () => (await st(page)).mode, { timeout: 10_000 })
    .toBe('train')
    .then(() => true)
    .catch(() => false);
  if (!boarded) return false;
  await page.waitForTimeout(3000);
  await tap(page, 'KeyT');
  await page.waitForTimeout(25_000);
  await tap(page, 'KeyT');
  await expect
    .poll(async () => (await st(page)).mode, { timeout: 120_000 })
    .toBe('walk')
    .catch(() => undefined);
  return true;
}

async function driveLeg(page: Page): Promise<void> {
  await req(page, 'walk', { posWF: { x: -1537.5, y: 40, z: -2597.6 }, yawRad: (124.8 * Math.PI) / 180 });
  await page.waitForTimeout(8000);
  const id = await page.evaluate(() =>
    (globalThis as G).__SANPO_DEBUG__.world.cars.park(
      { x: -1540.9, y: 40, z: -2595.4 },
      (124.8 * Math.PI) / 180,
      'preset',
    ),
  );
  const h = await page
    .waitForFunction(
      (cid) => (globalThis as G).__SANPO_DEBUG__.world.cars.list().find((c: G) => c.id === cid)?.handle,
      id,
      {
        timeout: 30_000,
      },
    )
    .then((x) => x.jsonValue())
    .catch(() => undefined);
  if (h === undefined) return;
  await page.waitForTimeout(2000);
  await req(page, 'drive', { vehicle: h, kind: 'sedan' });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(14_000);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyS');
  await tap(page, 'KeyF');
  await page.waitForTimeout(2000);
}

async function flyLeg(page: Page, round: number): Promise<void> {
  const spots = [
    { x: -120, z: -3405 },
    { x: 400, z: -1800 },
    { x: -900, z: -900 },
    { x: 600, z: 300 },
  ];
  const s = spots[round % spots.length] as { x: number; z: number };
  await req(page, 'freecam', { posWF: { x: s.x, y: 220, z: s.z }, yawRad: (round * Math.PI) / 3, pitchRad: -0.25 });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(45_000);
  await page.keyboard.up('KeyW');
}

/** 30 s 표본기(힙·GPU 메모리·셀 수·모드). stop() = 끝까지 기다려 표본 반환. */
function startSampler(page: Page, t0: number): { stop(): Promise<Sample[]> } {
  const samples: Sample[] = [];
  let stop = false;
  const run = (async () => {
    while (!stop) {
      const s = await page
        .evaluate(() => {
          const w = (globalThis as G).__SANPO_DEBUG__.world;
          const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
          return {
            heapMB: (mem?.usedJSHeapSize ?? 0) / 2 ** 20,
            cells: w.render.stats().cells,
            mode: w.traversal.mode,
          };
        })
        .catch(() => null);
      if (s) samples.push({ min: (Date.now() - t0) / 60_000, gpuMiB: await gpuMemNow(), ...s });
      await page.waitForTimeout(30_000);
    }
  })();
  return {
    async stop() {
      stop = true;
      await run;
      return samples;
    },
  };
}

/** 10분 이후 표본으로 기울기(단위/분)·처음/끝/최대. */
function summarize(samples: Sample[], head: Record<string, unknown>) {
  const late = samples.filter((s) => s.min >= 10);
  const xs = late.map((s) => s.min);
  return {
    ...head,
    heapSlopeMBPerMin: round(
      slope(
        xs,
        late.map((s) => s.heapMB),
      ),
      3,
    ),
    gpuSlopeMiBPerMin: round(
      slope(
        xs,
        late.map((s) => s.gpuMiB),
      ),
      3,
    ),
    heapMB: {
      first: round(late[0]?.heapMB ?? 0, 0),
      last: round(late.at(-1)?.heapMB ?? 0, 0),
      max: round(Math.max(...samples.map((s) => s.heapMB)), 0),
    },
    gpuMiB: {
      first: late[0]?.gpuMiB ?? 0,
      last: late.at(-1)?.gpuMiB ?? 0,
      max: Math.max(...samples.map((s) => s.gpuMiB)),
    },
    samples,
  };
}

test('soak: walk → train → drive → fly loop, memory trend and worker restarts', async ({ page }) => {
  test.setTimeout((MINUTES + 15) * 60_000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  let restarts = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (/restarted \(#\d+\)|giving up after/.test(m.text())) restarts++;
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  await page.goto(`/?${WORLD}perf=1&audio=0&spawn=shibuya-scramble`);
  await page.waitForFunction(() => (globalThis as G).__SANPO_DEBUG__?.world?.traversal?.mode === 'walk', null, {
    timeout: 180_000,
  });
  await page.mouse.click(400, 300);
  const t0 = Date.now();
  const sampler = startSampler(page, t0);
  const legs = { rounds: 0, trains: 0 };
  while (Date.now() - t0 < MINUTES * 60_000) {
    await walkLeg(page);
    if (await trainLeg(page)) legs.trains++;
    await driveLeg(page);
    await flyLeg(page, legs.rounds);
    legs.rounds++;
  }
  const samples = await sampler.stop();
  const result = summarize(samples, { minutes: MINUTES, ...legs, restarts, errors: [...new Set(errors)].slice(0, 20) });
  writeFileSync(`${OUT}/soak.json`, `${JSON.stringify(result, null, 1)}\n`);
  const { samples: _s, ...brief } = result;
  process.stdout.write(`[soak] ${JSON.stringify(brief)}\n`);
  expect(restarts).toBe(0);
});
