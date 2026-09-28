// M02-T03 수락: 무작위 이동 10분(가상 시계, 16 ms 프레임) — 로드 반경 안 셀 해제 0, 반경 밖 상주는 5 s 안에 한도 이하, 누수 0.
// 모드 전환·freecam 고도(0–900 m)·속도(최대 240 m/s)·순간이동(whenReady)·fetch 실패 2%(→ failed → 60 s 재시도).
// 기본 한도 + 좁은 한도(한도 해제 경로) 두 시나리오. see docs/06-world-streaming.md §2–3, ADR-0023
import {
  type CellKey,
  createEventBus,
  createLogger,
  createRng,
  type FrameContext,
  type InterestPoint,
  type ModeId,
  unpackCellKey,
} from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import type { StreamingConfig, StreamingStats, WhenReadyRequest } from '../src/api.ts';
import { DEFAULT_STREAMING_CONFIG } from '../src/internal/config.ts';
import { computeDesired } from '../src/internal/interest.ts';
import { createStreaming } from '../src/internal/service.ts';
import { targetsOf } from '../src/internal/waiters.ts';
import { synthCellsIndex, synthIndex } from './helpers.ts';
import { createSimClock, createSimIo } from './support/sim.ts';

const log = createLogger({ level: 'error' });
const FRAME_MS = 16;
const SIM_MS = 10 * 60_000;
const BOUND_M = 6000;
const GROUND_M = 10;
const CONVERGE_MS = 5000;
const BASE_SPEED: Record<ModeId, number> = { walk: 1.4, cycle: 5, drive: 15, train: 25, freecam: 60, transition: 0 };
const MODES: readonly ModeId[] = ['walk', 'cycle', 'drive', 'train', 'freecam'];

interface Mover {
  x: number;
  y: number;
  z: number;
  heading: number;
  mode: ModeId;
  speed: number;
  targetAlt: number;
  segmentEnd: number;
}

function interestOf(m: Mover): InterestPoint[] {
  const vx = Math.sin(m.heading) * m.speed;
  const vz = -Math.cos(m.heading) * m.speed;
  const posWF = { x: m.x, y: m.y, z: m.z };
  const forward = { x: Math.sin(m.heading), y: 0, z: -Math.cos(m.heading) };
  const cam: InterestPoint = { posWF, forward, weight: 1, kind: 'camera' };
  if (m.mode === 'freecam') return [cam];
  const pts: InterestPoint[] = [{ posWF, velWF: { x: vx, y: 0, z: vz }, weight: 1, kind: 'player' }, cam];
  if (m.speed > 5) pts.push({ posWF: { x: m.x + vx * 3, y: m.y, z: m.z + vz * 3 }, weight: 1, kind: 'lookahead' });
  return pts;
}

function step(m: Mover, dtS: number): void {
  m.x += Math.sin(m.heading) * m.speed * dtS;
  m.z -= Math.cos(m.heading) * m.speed * dtS;
  if (Math.abs(m.x) > BOUND_M || Math.abs(m.z) > BOUND_M) {
    m.heading += Math.PI;
    m.x = Math.max(-BOUND_M, Math.min(BOUND_M, m.x));
    m.z = Math.max(-BOUND_M, Math.min(BOUND_M, m.z));
  }
  const want = GROUND_M + (m.mode === 'freecam' ? m.targetAlt : 1.6);
  m.y += Math.max(-60 * dtS, Math.min(60 * dtS, want - m.y));
}

interface Violations {
  loadEvicted: number;
  doubleReady: number;
  unknownEvicted: number;
  teleports: number;
  maxOverMs: number;
}

interface SimResult {
  v: Violations;
  stats: StreamingStats;
  end: StreamingStats;
  delivered: Set<CellKey>;
  l3: Set<CellKey>;
  fetches: number;
  injected: number;
  decoding: number;
  timers: number;
  groundAfter: number | undefined;
}

// 시나리오 전체를 한 함수로 둔다(이동 → 관심점 → update → 검사).
async function simulate(cfg: StreamingConfig, seed: number): Promise<SimResult> {
  const clock = createSimClock();
  const io = createSimIo({ clock, seed, fetchMs: [20, 400], decodeMs: [10, 80], failRate: 0.02 });
  const bus = createEventBus(log);
  const index = synthIndex();
  const svc = createStreaming({
    bus,
    log,
    world: { baseUrl: '/w', buildId: 'sim', cellsIndex: synthCellsIndex() },
    config: cfg,
    fetcher: io.fetcher,
    pool: io.pool,
    clock: clock.now,
  });
  const rng = createRng(seed * 31 + 1);
  const m: Mover = { x: 0, y: 11.6, z: 0, heading: 0, mode: 'walk', speed: 1.4, targetAlt: 0, segmentEnd: 0 };
  let points = interestOf(m);
  const pins: WhenReadyRequest[] = [];
  const delivered = new Set<CellKey>();
  const v: Violations = { loadEvicted: 0, doubleReady: 0, unknownEvicted: 0, teleports: 0, maxOverMs: 0 };
  let loadNow: Set<CellKey> | undefined;
  /** 이번 프레임의 로드 영역(독립 계산: 상주 무관 computeDesired + whenReady 대상). */
  const loadSet = (): Set<CellKey> => {
    if (loadNow) return loadNow;
    const frame = { points, mode: m.mode, tier: 'high' as const, groundHeightAt: svc.groundHeightAt };
    loadNow = computeDesired(index, frame, new Set(), cfg.interest).load;
    for (const req of pins) for (const k of targetsOf(index, req)) loadNow.add(k);
    return loadNow;
  };
  svc.onReady((p) => {
    if (delivered.has(p.key)) v.doubleReady++;
    delivered.add(p.key);
    svc.ack(p.key, 'render');
  });
  svc.onEvicted((k) => {
    if (loadSet().has(k)) v.loadEvicted++;
    if (!delivered.delete(k)) v.unknownEvicted++;
  });
  const [system] = svc.systems();
  let overSince: number | undefined;

  const newSegment = (): void => {
    if (rng.next() < 0.25) {
      // 순간이동: 페이드 동안 teleport 관심점 + whenReady(256 m, L0·L1)
      m.x = (rng.next() * 2 - 1) * BOUND_M;
      m.z = (rng.next() * 2 - 1) * BOUND_M;
      const req = { centerWF: { x: m.x, y: 0, z: m.z }, radius: 256, levels: [0, 1] };
      pins.push(req);
      void svc.whenReady(req).then(() => pins.splice(pins.indexOf(req), 1));
      v.teleports++;
    }
    const next = MODES[rng.int(0, MODES.length)] as ModeId;
    if (next !== m.mode) bus.emit('mode/changed', { from: m.mode, to: next });
    m.mode = next;
    m.speed = BASE_SPEED[next] * (next === 'freecam' && rng.next() < 0.5 ? 4 : 1);
    m.heading = rng.next() * Math.PI * 2;
    m.targetAlt = rng.next() < 0.5 ? rng.next() * 900 : rng.next() * 150;
    m.segmentEnd = clock.now() + 3000 + rng.next() * 25_000;
  };

  const checkConvergence = (): void => {
    const load = loadSet();
    const resident = svc.stats().residentByLevel;
    const inLoad: [number, number, number, number] = [0, 0, 0, 0];
    for (const k of delivered) if (load.has(k)) inLoad[unpackCellKey(k).level]++;
    const over = resident.some((n, l) => n > Math.max(cfg.residentMax[l] ?? 0, inLoad[l] ?? 0));
    if (!over) overSince = undefined;
    else overSince ??= clock.now();
    if (overSince !== undefined) v.maxOverMs = Math.max(v.maxOverMs, clock.now() - overSince);
  };

  for (let f = 0; clock.now() < SIM_MS; f++) {
    if (clock.now() >= m.segmentEnd && pins.length === 0) newSegment();
    if (pins.length === 0) step(m, FRAME_MS / 1000);
    points = pins.length > 0 ? [{ posWF: { x: m.x, y: m.y, z: m.z }, weight: 1, kind: 'teleport' }] : interestOf(m);
    loadNow = undefined;
    svc.setInterest(points);
    system?.update({} as FrameContext);
    if (f % 15 === 0) checkConvergence();
    await clock.advance(FRAME_MS);
  }
  const stats = svc.stats();

  // 누수: 관심점 제거 → L3만 남아야 한다. failed 기록은 retryAfterMs(60 s) 뒤 정리.
  points = [];
  svc.setInterest([]);
  for (let t = 0; t < 65_000; t += FRAME_MS) {
    loadNow = undefined;
    system?.update({} as FrameContext);
    await clock.advance(FRAME_MS);
  }
  const end = svc.stats();
  const groundAfter = svc.groundHeightAt(0, 0);
  svc.dispose();
  const counters = io.counters;
  return {
    v,
    stats,
    end,
    delivered,
    l3: new Set(index.keysAt(3)),
    fetches: counters.fetches,
    injected: counters.injectedFailures,
    decoding: counters.decoding,
    timers: clock.pending,
    groundAfter,
  };
}

function expectHealthy(r: SimResult): void {
  expect(r.v.loadEvicted).toBe(0);
  expect(r.v.doubleReady).toBe(0);
  expect(r.v.unknownEvicted).toBe(0);
  expect(r.v.maxOverMs).toBeLessThanOrEqual(CONVERGE_MS);
  expect(r.v.teleports).toBeGreaterThan(3);
  expect(r.injected).toBeGreaterThan(0);
  // 누수 0: 관심점이 없으면 L3만 live, 진행 중·보류·실패 기록·지면·타이머 없음.
  expect([...r.delivered].every((k) => r.l3.has(k))).toBe(true);
  expect(r.delivered.size).toBe(r.l3.size);
  expect(r.end.states).toMatchObject({ queued: 0, fetching: 0, decoding: 0, evicting: 0, failed: 0, ready: 0 });
  expect(r.end.states.live).toBe(r.l3.size);
  expect(r.end.pendingReady).toBe(0);
  expect(r.end.residentByLevel).toEqual([0, 0, 0, r.l3.size]);
  expect(r.decoding).toBe(0);
  expect(r.timers).toBe(0);
  expect(r.groundAfter).toBeUndefined();
}

function summary(name: string, r: SimResult): string {
  const s = r.stats;
  const avg = (s.recompute.totalMs / s.recompute.count).toFixed(3);
  return (
    `[sim ${name}] teleports ${r.v.teleports}, fetches ${r.fetches}, injected failures ${r.injected}, evicted ${s.evicted}, ` +
    `recompute ${s.recompute.count}× avg ${avg} ms max ${s.recompute.maxMs.toFixed(2)} ms, max over-limit ${r.v.maxOverMs} ms`
  );
}

describe('streaming service — 10 min random movement (headless)', () => {
  it('default limits: no load-radius eviction, convergence ≤ 5 s, no leaks', async ({ annotate }) => {
    const r = await simulate(DEFAULT_STREAMING_CONFIG, 7);
    await annotate(summary('default', r));
    expectHealthy(r);
  }, 120_000);

  it('tight limits (L0 24, L1 30, L2 30): limit evictions converge ≤ 5 s without touching load-radius cells', async ({
    annotate,
  }) => {
    const r = await simulate({ ...DEFAULT_STREAMING_CONFIG, residentMax: [24, 30, 30, 16] }, 11);
    await annotate(summary('tight', r));
    expectHealthy(r);
  }, 120_000);
});
