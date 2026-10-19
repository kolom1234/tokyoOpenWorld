// `pnpm perf`(M11-T01, 14 §2): 실제 GPU Chrome(CI 제외) 2560×1440, High 고정·동적 해상도 끔, vsync·프레임 상한 해제(rAF 간격 = 실제 프레임 비용).
// 경로 3종: ① 스크램블 도보(달리기, 4방향) ② 시부야 시가지 자동 주행(스크램블 출발 차선 — 교통·군중 켬) ③ 신주쿠 상공 자유비행(서→남→동).
// + 부팅(새 컨텍스트, 첫 표시·전송 MB). 결과 = perf-results/<날짜>.json, docs/generated/perf-latest.md. 서버 = 골든뷰와 같음(dev `?world=local` 또는 GOLDEN_BASE_URL).
import { expect, type Page, test } from '@playwright/test';
import { buildGraph } from './autopilot.ts';
import { type Dbg, lanesAround, pilot, startLane, WORLD } from './drive-helpers.ts';
import {
  FRAME_PROBE,
  gpuMemNow,
  gpuSampler,
  type StatSample,
  sampleStats,
  startFrames,
  stopFrames,
  systemTimings,
} from './perf-helpers.ts';
import { type BootRun, type PathRun, writeReport } from './perf-report.ts';

const SECONDS = Number(process.env.PERF_SECONDS ?? '40');
const QUERY = `perf=1&quality=${process.env.PERF_QUALITY ?? 'high'}&dynres=0${process.env.PERF_GPU_TIMING === '1' ? '&gpuTiming=1' : ''}${process.env.PERF_QUERY ? `&${process.env.PERF_QUERY}` : ''}`;
const runs: PathRun[] = [];
let boot: BootRun | null = null;
let photoHitch: Record<string, number> | null = null;

const [VW, VH] = (process.env.PERF_VIEWPORT ?? '2560x1440').split('x').map(Number) as [number, number];

test.use({
  viewport: { width: VW, height: VH },
  launchOptions: {
    args: [
      '--enable-webgpu-developer-features',
      '--ignore-gpu-blocklist',
      '--window-size=1280,760',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
    ],
  },
});
test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  const env = {
    viewport: `${VW}×${VH}`,
    quality: process.env.PERF_QUALITY ?? 'high',
    dynres: 'off',
    seconds: String(SECONDS),
  };
  const md = writeReport(env, runs, boot, photoHitch);
  process.stdout.write(md);
});

type W = Dbg['__SANPO_DEBUG__']['world'] & {
  traversal: { avatar: { posWF: { x: number; y: number; z: number } } };
};

async function open(page: Page, spawn: string): Promise<void> {
  await page.addInitScript(FRAME_PROBE);
  await page.goto(`/?${WORLD}spawn=${spawn}&${QUERY}`);
  await page.waitForFunction(
    () => (globalThis as unknown as Dbg).__SANPO_DEBUG__?.world?.traversal?.mode === 'walk',
    null,
    {
      timeout: 180_000,
    },
  );
  await page.waitForTimeout(10_000);
}

/** 측정 구간: 프레임 표본 + 1 s 통계 + nvidia-smi, drive = 경로를 움직이는 함수. */
async function measure(page: Page, id: string, label: string, drive: () => Promise<void>): Promise<void> {
  const base = await gpuMemNow();
  const gpu = gpuSampler();
  const stats: StatSample[] = [];
  let stop = false;
  const sampler = (async () => {
    while (!stop) {
      stats.push(await sampleStats(page).catch(() => stats.at(-1) as StatSample));
      await page.waitForTimeout(1000);
    }
  })();
  await systemTimings(page, true);
  await startFrames(page);
  await drive();
  const f = await stopFrames(page);
  const systems = await systemTimings(page, false);
  stop = true;
  await sampler;
  let stalls = 0;
  for (let i = 1; i < stats.length; i++) if (stats[i]?.groundLoading && !stats[i - 1]?.groundLoading) stalls++;
  runs.push({ id, label, seconds: SECONDS, ...f, stats, gpu: gpu.stop(), gpuMemBaseMiB: base, stalls, systems });
}

test('perf ① walk the Scramble (sprint, 4 legs)', async ({ page }) => {
  await open(page, 'shibuya-scramble');
  await measure(page, 'walk', '스크램블 도보', async () => {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      await page.evaluate((y) => {
        const t = (globalThis as unknown as { __SANPO_DEBUG__: { world: W } }).__SANPO_DEBUG__.world.traversal;
        t.request('walk', { posWF: { ...t.avatar.posWF }, yawRad: y });
      }, yaw);
      await page.waitForTimeout((SECONDS * 1000) / 4);
    }
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
  });
  expect(runs.at(-1)?.intervals.length).toBeGreaterThan(100);
});

test('perf ② drive downtown Shibuya (autopilot, traffic + crowd)', async ({ page }) => {
  await open(page, 'shibuya-scramble');
  const graph = buildGraph(await lanesAround(page, -2, 1, -2, 1));
  const start = startLane(graph);
  const p0 = start.pts[1] as [number, number];
  const p1 = (start.pts[2] ?? start.pts[1]) as [number, number];
  const yaw0 = Math.atan2(-(p1[0] - p0[0]), -(p1[1] - p0[1]));
  const id = await page.evaluate(
    ([x, z, y]) => (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.cars.park({ x, y: 15.5, z }, y, 'preset'),
    [p0[0], p0[1], yaw0] as const,
  );
  const h = (await (
    await page.waitForFunction(
      (cid) => (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.cars.list().find((c) => c.id === cid)?.handle,
      id,
      {
        timeout: 60_000,
      },
    )
  ).jsonValue()) as number;
  await page.waitForTimeout(2000);
  await page.evaluate(
    (v) =>
      (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.traversal.request('drive', { vehicle: v, kind: 'sedan' }),
    h,
  );
  await page.waitForTimeout(1500);
  await measure(page, 'drive', '시부야 시가지 주행', () =>
    pilot(page, graph, start, SECONDS, () => 'test-results/golden/perf-drive.png'),
  );
  expect(runs.at(-1)?.intervals.length).toBeGreaterThan(100);
});

test('perf ③ fly over Shinjuku (freecam, W→S→E)', async ({ page }) => {
  await open(page, 'shinjuku-west');
  await measure(page, 'fly', '신주쿠 상공 비행', async () => {
    await page.keyboard.down('KeyW');
    let pos = { x: -120, y: 180, z: -3405 };
    for (const yaw of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
      pos = await page.evaluate(
        ([p, y]) => {
          const t = (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.traversal as unknown as {
            request(m: string, q: unknown): boolean;
            camera: { posWF: { x: number; y: number; z: number } };
          };
          t.request('freecam', { posWF: p, yawRad: y, pitchRad: -0.22 });
          return p;
        },
        [pos, yaw] as const,
      );
      await page.waitForTimeout((SECONDS * 1000) / 3);
      pos = await page.evaluate(() => {
        const c = (
          (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.traversal as unknown as {
            camera: { posWF: { x: number; y: number; z: number } };
          }
        ).camera.posWF;
        return { x: c.x, y: Math.max(120, c.y), z: c.z };
      });
    }
    await page.keyboard.up('KeyW');
  });
  expect(runs.at(-1)?.intervals.length).toBeGreaterThan(100);
});

/** M10 잔여: 포토 DOF 켜고 끌 때 가장 긴 프레임(전 4.8 s — 출력 노드 교체 후). */
test('perf photo: DOF toggle hitch', async ({ page }) => {
  await open(page, 'shibuya-scramble');
  const hitch = await page.evaluate(async () => {
    const r = (globalThis as unknown as { __SANPO_DEBUG__: { world: { render: { setPhoto(p: unknown): void } } } })
      .__SANPO_DEBUG__.world.render;
    const worst = async (fn: () => void) => {
      let last = performance.now();
      let max = 0;
      let run = true;
      const loop = () => {
        const t = performance.now();
        max = Math.max(max, t - last);
        last = t;
        if (run) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      await new Promise((res) => setTimeout(res, 500));
      max = 0;
      fn();
      await new Promise((res) => setTimeout(res, 4000));
      run = false;
      return Math.round(max);
    };
    const dof = { focusM: 10, rangeM: 5, bokeh: 2 };
    return {
      baseline: await worst(() => undefined),
      // 포토 모드 진입(조리개 f/22 = DOF 없음).
      enter: await worst(() => r.setPhoto({ exposureEv: 0, dof: null })),
      firstOn: await worst(() => r.setPhoto({ exposureEv: 0, dof })),
      off: await worst(() => r.setPhoto({ exposureEv: 0, dof: null })),
      againOn: await worst(() => r.setPhoto({ exposureEv: 0, dof: { ...dof, focusM: 20 } })),
    };
  });
  photoHitch = hitch;
  process.stdout.write(`[perf] photo DOF hitch ${JSON.stringify(hitch)}
`);
  expect(hitch.firstOn).toBeLessThan(4800);
});

test('perf boot: first display and transfer (fresh context)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let bytes = 0;
  const pending: Promise<void>[] = [];
  const log: string[] = [];
  const t0 = Date.now();
  page.on('console', (m) => {
    if (/precompile|staged cells/.test(m.text()))
      log.push(`${((Date.now() - t0) / 1000).toFixed(2)} ${m.text().replace('[render] ', '')}`);
  });
  page.on('requestfinished', (r) =>
    pending.push(
      r.sizes().then((s) => {
        bytes += s.responseBodySize + s.responseHeadersSize;
      }),
    ),
  );
  await page.goto(`/?${WORLD.replace(/&$/, '')}`);
  await expect(page.locator('#app')).toHaveAttribute('data-rendered-cells', /[1-9]/, { timeout: 120_000 });
  const firstDisplayS = (Date.now() - t0) / 1000;
  await Promise.all(pending);
  boot = { firstDisplayS, transferMB: bytes / 1e6, log };
  await ctx.close();
});
