// 차량 주행 실제 GPU 봇(M08 — CI 제외, `pnpm drive`): 실제 Chrome WebGPU + MVP 월드에서 운전 수락 수치를 잰다.
// 코스 = spawn 프리셋 `drive-course`(평지 직선 311 m, 높이 39.76–40.05 m — lanes.bin 직선 차선 연쇄 + 1 m 간격 아래 레이로 턱 없음 확인), 교통·군중 끔(`traffic=0&crowd=0` — 재현).
// 표본 = 페이지 안 rAF마다(시각·속력·위치·기어·rpm·ABS) → Node에서 계산. 결과 test-results/golden/drive/metrics.json + 콘솔 표. GPU 전력(W)은 nvidia-smi 1 s 표본.
// 서버 = 골든뷰와 같음(dev `?world=local` 또는 GOLDEN_BASE_URL + GOLDEN_WORLD=api).
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const OUT = 'test-results/golden/drive';
const WORLD = process.env.GOLDEN_WORLD === 'api' ? '' : 'world=local&';
const COURSE = 'spawn=drive-course&traffic=0&crowd=0&debug=1';

test.use({ viewport: { width: 1600, height: 900 } });
test.describe.configure({ mode: 'serial' });

interface Sample {
  t: number;
  kmh: number;
  x: number;
  z: number;
  gear: string;
  rpm: number;
  abs: boolean;
  fps: number;
}

const results: Record<string, unknown> = {};
/** 수치 한 줄(PR 표용 — 콘솔 금지 규칙 밖의 stdout). */
const report = (k: string, v: unknown): void => void process.stdout.write(`[drive] ${k} ${JSON.stringify(v)}\n`);
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
test.afterAll(() => writeFileSync(`${OUT}/metrics.json`, `${JSON.stringify(results, null, 2)}\n`));

/** nvidia-smi 1 s 표본(없으면 빈 배열). */
function powerSampler(): { stop(): { drawW: number[]; limitW: number[] } } {
  const drawW: number[] = [];
  const limitW: number[] = [];
  const t = setInterval(() => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=power.draw,enforced.power.limit', '--format=csv,noheader,nounits'],
      (err, out) => {
        if (err) return;
        const [d, l] = out.trim().split(',').map(Number);
        if (Number.isFinite(d)) drawW.push(d as number);
        if (Number.isFinite(l)) limitW.push(l as number);
      },
    );
  }, 1000);
  return {
    stop() {
      clearInterval(t);
      return { drawW, limitW };
    },
  };
}

/** 코스 부팅 → 세워 둔 차가 생기면 운전석에 앉힌다(추적 시점). 반환 = 차 핸들. */
async function boardCourse(page: Page, extra = ''): Promise<number> {
  await page.goto(`/?${WORLD}${COURSE}${extra}`);
  await page.waitForFunction(
    () => {
      const w = (globalThis as { __SANPO_DEBUG__?: { world?: { traversal?: { mode: string } } } }).__SANPO_DEBUG__
        ?.world;
      return w?.traversal?.mode === 'walk';
    },
    null,
    { timeout: 180_000 },
  );
  const handle = await page.waitForFunction(
    () => {
      const w = (globalThis as unknown as { __SANPO_DEBUG__: { world: { cars?: { list(): { handle?: number }[] } } } })
        .__SANPO_DEBUG__.world;
      return w.cars?.list().find((c) => c.handle !== undefined)?.handle;
    },
    null,
    { timeout: 60_000 },
  );
  const h = (await handle.jsonValue()) as number;
  // 차가 내려앉고 주변 콜라이더가 차도록 잠시.
  await page.waitForTimeout(4000);
  const ok = await page.evaluate(
    (vehicle) =>
      (
        globalThis as unknown as {
          __SANPO_DEBUG__: { world: { traversal: { request(m: string, p: unknown): boolean } } };
        }
      ).__SANPO_DEBUG__.world.traversal.request('drive', { vehicle, kind: 'sedan' }),
    h,
  );
  expect(ok).toBe(true);
  await page.waitForTimeout(1500);
  return h;
}

/** 페이지 안 rAF 표본기 시작(전역 배열). */
async function startSampler(page: Page, handle: number): Promise<void> {
  await page.evaluate((h) => {
    type W = {
      traversal: { hud: { drive?: { speedKmh: number; gear: string; rpm: number; abs: boolean } } };
      physics: { pose(h: number): { posWF: { x: number; z: number } } | undefined };
    };
    const g = globalThis as unknown as {
      __SANPO_DEBUG__: { world: W };
      __DRIVE_SAMPLES__: unknown[];
      __DRIVE_ON__: boolean;
    };
    const w = g.__SANPO_DEBUG__.world;
    g.__DRIVE_SAMPLES__ = [];
    g.__DRIVE_ON__ = true;
    let last = performance.now();
    const tick = (now: number): void => {
      const d = w.traversal.hud.drive;
      const p = w.physics.pose(h);
      if (d && p)
        g.__DRIVE_SAMPLES__.push({
          t: now / 1000,
          kmh: d.speedKmh,
          x: p.posWF.x,
          z: p.posWF.z,
          gear: d.gear,
          rpm: d.rpm,
          abs: d.abs,
          fps: 1000 / Math.max(now - last, 1),
        });
      last = now;
      if (g.__DRIVE_ON__) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, handle);
}

async function stopSampler(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { __DRIVE_SAMPLES__: Sample[]; __DRIVE_ON__: boolean };
    g.__DRIVE_ON__ = false;
    return g.__DRIVE_SAMPLES__;
  });
}

const latest = async (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __SANPO_DEBUG__: { world: { traversal: { hud: { drive?: { speedKmh: number } } } } };
        }
      ).__SANPO_DEBUG__.world.traversal.hud.drive?.speedKmh ?? 0,
  );

/** 표본에서 정지 → 목표 속력까지 시간(s): 스로틀 시작 시각 t0부터. */
function timeTo(samples: readonly Sample[], t0: number, kmh: number): number | undefined {
  const s = samples.find((x) => x.t >= t0 && x.kmh >= kmh);
  return s ? s.t - t0 : undefined;
}

/** 제동 시작 시각 t0부터 멈출 때(< 0.2 km/h)까지 이동 거리(m). */
function brakeDistance(samples: readonly Sample[], t0: number): number | undefined {
  const start = samples.find((x) => x.t >= t0);
  const stop = samples.find((x) => x.t > t0 + 0.2 && x.kmh < 0.2);
  return start && stop ? Math.hypot(stop.x - start.x, stop.z - start.z) : undefined;
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : 0;
};

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
