// `pnpm perf` 도우미(M11-T01, 14 §2): 페이지 안 프레임 표본기(rAF 간격·rAF 콜백 시간 = 메인 스레드 프레임 작업), 서비스 통계 표본(1 s),
// nvidia-smi(전력·메모리), 백분위·예산 판정·perf-latest.md 작성. 측정 = 실제 GPU Chrome(CI 제외).
import { execFile } from 'node:child_process';
import type { Page } from '@playwright/test';

/** 페이지 로드 전에 심는다: rAF 콜백 시간(같은 프레임 시각 t끼리 합 = 그 프레임 메인 작업)·프레임 간격. */
export const FRAME_PROBE = `(() => {
  const p = { on: false, last: 0, intervals: [], work: new Map() };
  window.__SANPO_PERF__ = p;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const s = performance.now();
    cb(t);
    if (p.on) p.work.set(t, (p.work.get(t) ?? 0) + performance.now() - s);
  });
  const tick = (t) => { if (p.on && p.last) p.intervals.push(t - p.last); p.last = t; raf(tick); };
  raf(tick);
})();`;

/** 스케줄러 시스템별 누적(ms) — reset = 측정 시작. */
export const systemTimings = (page: Page, reset: boolean) =>
  page.evaluate((r) => {
    const s = (
      globalThis as unknown as {
        __SANPO_DEBUG__: {
          scheduler?: { timings(reset?: boolean): { id: string; totalMs: number; maxMs: number; calls: number }[] };
        };
      }
    ).__SANPO_DEBUG__.scheduler;
    return s?.timings(r) ?? [];
  }, reset);

export interface StatSample {
  t: number;
  drawCalls: number;
  triangles: number;
  physicsTickMs: number;
  simP95TickMs: number;
  heapMB: number;
  groundLoading: boolean;
  renderScale: number;
  /** `PERF_GPU_TIMING=1`(?gpuTiming=1)일 때 패스별 GPU ms(비중만 신뢰 — 절대값은 클럭 비율로 작다). */
  gpuPasses: { label: string; ms: number }[];
}

/** 서비스 통계 1 s 표본(디버그 핸들 — `?debug=1`). */
export async function sampleStats(page: Page): Promise<StatSample> {
  return page.evaluate(() => {
    type W = {
      render: {
        stats(): {
          drawCalls: number;
          triangles: number;
          quality: { renderScale: number };
          gpu: { enabled: boolean; passes: { label: string; ms: number }[] };
        };
      };
      physics?: { stats(): { tickMs: number } };
      sim: { workerStats(): { p95TickMs: number } | undefined };
      traversal: { hud: { groundLoading?: boolean } };
    };
    const w = (globalThis as unknown as { __SANPO_DEBUG__: { world: W } }).__SANPO_DEBUG__.world;
    const r = w.render.stats();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      t: performance.now(),
      drawCalls: r.drawCalls,
      triangles: r.triangles,
      physicsTickMs: w.physics?.stats().tickMs ?? 0,
      simP95TickMs: w.sim.workerStats()?.p95TickMs ?? 0,
      heapMB: (mem?.usedJSHeapSize ?? 0) / 2 ** 20,
      groundLoading: w.traversal.hud.groundLoading === true,
      renderScale: r.quality.renderScale,
      gpuPasses: r.gpu.enabled ? r.gpu.passes.map((p) => ({ label: p.label, ms: p.ms })) : [],
    };
  });
}

export const startFrames = (page: Page) =>
  page.evaluate(() => {
    const p = (
      globalThis as unknown as {
        __SANPO_PERF__: { on: boolean; last: number; intervals: number[]; work: Map<number, number> };
      }
    ).__SANPO_PERF__;
    p.intervals = [];
    p.work = new Map();
    p.last = 0;
    p.on = true;
  });

export const stopFrames = (page: Page) =>
  page.evaluate(() => {
    const p = (
      globalThis as unknown as { __SANPO_PERF__: { on: boolean; intervals: number[]; work: Map<number, number> } }
    ).__SANPO_PERF__;
    p.on = false;
    return { intervals: p.intervals, work: [...p.work.values()] };
  });

/** nvidia-smi 1 s 표본: 전력(W)·전력 상한·GPU 메모리(MiB, 장치 전체). */
export function gpuSampler(): { stop(): { drawW: number[]; limitW: number[]; memMiB: number[] } } {
  const out = { drawW: [] as number[], limitW: [] as number[], memMiB: [] as number[] };
  const t = setInterval(() => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=power.draw,enforced.power.limit,memory.used', '--format=csv,noheader,nounits'],
      (err, s) => {
        if (err) return;
        const [d, l, m] = s.trim().split(',').map(Number);
        if (Number.isFinite(d)) out.drawW.push(d as number);
        if (Number.isFinite(l)) out.limitW.push(l as number);
        if (Number.isFinite(m)) out.memMiB.push(m as number);
      },
    );
  }, 1000);
  return {
    stop() {
      clearInterval(t);
      return out;
    },
  };
}

export function gpuMemNow(): Promise<number> {
  return new Promise((resolve) =>
    execFile('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], (err, s) =>
      resolve(err ? 0 : Number(s.trim()) || 0),
    ),
  );
}

export function pct(a: readonly number[], q: number): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] as number;
}

export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
