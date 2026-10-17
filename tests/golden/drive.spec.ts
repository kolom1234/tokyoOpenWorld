// 차량 주행 실제 GPU 봇(M08 — CI 제외, `pnpm drive`): 실제 Chrome WebGPU + MVP 월드에서 운전 수락 수치를 잰다.
// 코스 = spawn 프리셋 `drive-course`(평지 직선 311 m, 높이 39.76–40.05 m — lanes.bin 직선 차선 연쇄 + 1 m 간격 아래 레이로 턱 없음 확인), 교통·군중 끔(`traffic=0&crowd=0` — 재현).
// 표본 = 페이지 안 rAF마다(시각·속력·위치·기어·rpm·ABS) → Node에서 계산. 결과 test-results/golden/drive/metrics.json + 콘솔 표. GPU 전력(W)은 nvidia-smi 1 s 표본.
// 서버 = 골든뷰와 같음(dev `?world=local` 또는 GOLDEN_BASE_URL + GOLDEN_WORLD=api).
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildGraph } from './autopilot.ts';
import {
  boardCourse,
  brakeDistance,
  type Dbg,
  lanesAround,
  latest,
  median,
  pilot,
  powerSampler,
  startContactMeter,
  startLane,
  startSampler,
  stopContactMeter,
  stopSampler,
  timeTo,
  WORLD,
} from './drive-helpers.ts';

const OUT = 'test-results/golden/drive';

test.use({ viewport: { width: 1600, height: 900 } });
test.describe.configure({ mode: 'serial' });

const results: Record<string, unknown> = {};
/** 수치 한 줄(PR 표용 — 콘솔 금지 규칙 밖의 stdout). */
const report = (k: string, v: unknown): void =>
  void process.stdout.write(`[drive] ${k} ${JSON.stringify(v)}
`);
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
test.afterAll(() =>
  writeFileSync(
    `${OUT}/metrics.json`,
    `${JSON.stringify(results, null, 2)}
`,
  ),
);

test('sedan 0→100 km/h on the straight (real GPU)', async ({ page }) => {
  const h = await boardCourse(page);
  const power = powerSampler();
  await startSampler(page, h);
  const t0 = await page.evaluate(() => performance.now() / 1000);
  await page.keyboard.down('KeyW');
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && (await latest(page)) < 101) await page.waitForTimeout(100);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${OUT}/sedan-100kmh.png` });
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyS');
  const samples = await stopSampler(page);
  const p = power.stop();
  const t100 = timeTo(samples, t0, 100);
  results.accel = {
    t0to100S: t100,
    maxGear: Math.max(0, ...samples.map((s) => Number(s.gear)).filter(Number.isFinite)),
    fpsMedian: median(samples.map((s) => s.fps)),
    gpuPowerW: { medianDraw: median(p.drawW), maxDraw: Math.max(0, ...p.drawW), limit: median(p.limitW) },
  };
  report('accel', results.accel);
  expect(t100).toBeGreaterThanOrEqual(10);
  expect(t100).toBeLessThanOrEqual(13);
});

for (const wet of [0, 1] as const)
  test(`sedan 60 km/h full braking — ${wet ? 'wet' : 'dry'} (real GPU)`, async ({ page }) => {
    const h = await boardCourse(page, wet ? '&wet=1' : '');
    const power = powerSampler();
    await startSampler(page, h);
    await page.keyboard.down('KeyW');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && (await latest(page)) < 60) await page.waitForTimeout(30);
    await page.keyboard.up('KeyW');
    const kmhAtBrake = await latest(page);
    const t0 = await page.evaluate(() => performance.now() / 1000);
    await page.keyboard.down('KeyS');
    const stopBy = Date.now() + 8000;
    while (Date.now() < stopBy && (await latest(page)) > 0.2) await page.waitForTimeout(30);
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(300);
    const samples = await stopSampler(page);
    const p = power.stop();
    const d = brakeDistance(samples, t0);
    const key = wet ? 'brakeWet' : 'brakeDry';
    results[key] = {
      fromKmh: kmhAtBrake,
      distanceM: d,
      absActive: samples.some((s) => s.t >= t0 && s.abs),
      fpsMedian: median(samples.map((s) => s.fps)),
      gpuPowerW: { medianDraw: median(p.drawW), maxDraw: Math.max(0, ...p.drawW), limit: median(p.limitW) },
    };
    report(key, results[key]);
    if (!wet) {
      expect(d).toBeGreaterThanOrEqual(14);
      expect(d).toBeLessThanOrEqual(20);
    } else expect(d ?? 0).toBeGreaterThan(((results.brakeDry as { distanceM?: number })?.distanceM ?? 0) + 1);
  });

test('bicycle flat top speed 22–26 km/h, upright (real GPU)', async ({ page }) => {
  const h = await boardCourse(page, '', 'bicycle');
  const power = powerSampler();
  await startSampler(page, h);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(25_000);
  const top = await latest(page);
  await page.keyboard.up('KeyW');
  const samples = await stopSampler(page);
  const pw = power.stop();
  results.bikeTop = {
    topKmh: top,
    maxRollDeg: Math.max(...samples.map((s) => Math.abs(s.roll))),
    fpsMedian: median(samples.map((s) => s.fps)),
    gpuPowerW: { medianDraw: median(pw.drawW), maxDraw: Math.max(0, ...pw.drawW), limit: median(pw.limitW) },
  };
  report('bikeTop', results.bikeTop);
  expect(top).toBeGreaterThanOrEqual(22);
  expect(top).toBeLessThanOrEqual(26);
});

test('bicycle 1 m/s for 20 s with steering wobble: no fall (real GPU)', async ({ page }) => {
  const h = await boardCourse(page, '', 'bicycle');
  await startSampler(page, h);
  const t0 = Date.now();
  let left = false;
  while (Date.now() - t0 < 20_000) {
    const kmh = await latest(page);
    // 1 m/s(3.6 km/h) 근처 유지 — 페달 끊어 밟기, 1.5 s마다 좌우 조향.
    if (kmh < 3.2) await page.keyboard.down('KeyW');
    else await page.keyboard.up('KeyW');
    const want = Math.floor((Date.now() - t0) / 1500) % 2 === 0;
    if (want !== left) {
      left = want;
      await page.keyboard.up(left ? 'KeyD' : 'KeyA');
      await page.keyboard.down(left ? 'KeyA' : 'KeyD');
    }
    await page.waitForTimeout(50);
  }
  for (const k of ['KeyW', 'KeyA', 'KeyD']) await page.keyboard.up(k);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyS');
  const samples = await stopSampler(page);
  const moving = samples.filter((s) => s.kmh > 1);
  results.bikeSlow = {
    avgKmh: moving.reduce((a, s) => a + s.kmh, 0) / Math.max(1, moving.length),
    maxRollDeg: Math.max(...samples.map((s) => Math.abs(s.roll))),
    stoppedRollDeg: Math.abs(samples[samples.length - 1]?.roll ?? 0),
    falls: samples.filter((s) => Math.abs(s.roll) > 30).length,
  };
  report('bikeSlow', results.bikeSlow);
  expect((results.bikeSlow as { falls: number }).falls).toBe(0);
});

/** 보행자 밀집 저속 주행(M08-T02 수락 — 접촉 0): 스크램블 교차로 둘레 차선을 자동 운전(15 km/h, 적·황 정지선 정지)하며 프레임마다 보행자 ↔ 차체 사각형 거리. */
test('sedan at low speed through the Scramble crowd: pedestrian contacts 0 (real GPU)', async ({ page }) => {
  const secs = Number(process.env.DRIVE_CROWD_S ?? '150');
  await page.goto(`/?${WORLD}spawn=shibuya-scramble&debug=1`);
  await page.waitForFunction(
    () => (globalThis as unknown as Dbg).__SANPO_DEBUG__?.world?.traversal?.mode === 'walk',
    null,
    {
      timeout: 180_000,
    },
  );
  await page.waitForTimeout(8000);
  const graph = buildGraph(await lanesAround(page, -2, 1, -2, 1));
  const start = startLane(graph);
  const p0 = start.pts[1] as [number, number];
  const p1 = (start.pts[2] ?? start.pts[1]) as [number, number];
  const yaw0 = Math.atan2(-(p1[0] - p0[0]), -(p1[1] - p0[1]));
  const id = await page.evaluate(
    ([x, z, yaw]) => (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.cars.park({ x, y: 15.5, z }, yaw, 'preset'),
    [p0[0], p0[1], yaw0] as const,
  );
  const h = (await (
    await page.waitForFunction(
      (cid) => (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.cars.list().find((c) => c.id === cid)?.handle,
      id,
      { timeout: 60_000 },
    )
  ).jsonValue()) as number;
  await page.waitForTimeout(2000);
  await page.evaluate(
    (v) =>
      (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.traversal.request('drive', { vehicle: v, kind: 'sedan' }),
    h,
  );
  await page.waitForTimeout(1500);
  await startContactMeter(page, h);
  const power = powerSampler();
  // 앞 40 %는 신호를 지키고, 나머지는 일부러 무시(보행 현시 횡단보도로 — AEB 스트레스).
  await pilot(page, graph, start, secs, (n) => `${OUT}/crowd-${n}.png`, secs * 0.4);
  const m = await stopContactMeter(page);
  const pw = power.stop();
  results.crowd = {
    ...m,
    seconds: secs,
    gpuPowerW: { medianDraw: median(pw.drawW), maxDraw: Math.max(0, ...pw.drawW), limit: median(pw.limitW) },
  };
  report('crowd', results.crowd);
  expect(m.contacts).toBe(0);
  expect(m.distanceM).toBeGreaterThan(150);
});
