// createStreaming: 부팅 순서·whenReady·onReady 프레임 한도·ack → live·해제 이벤트·failed 60 s 재시도·ground·requestSections.
// 가상 시계 + 합성 fetcher/풀(test/support/sim.ts). see docs/06-world-streaming.md §2, §6, §8–9
import {
  type CellKey,
  cellIdString,
  createEventBus,
  createLogger,
  type EventBus,
  type FrameContext,
  packCellKey,
} from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import type { StreamingService } from '../src/api.ts';
import { createStreaming } from '../src/internal/service.ts';
import { point, synthCellsIndex } from './helpers.ts';
import { createSimClock, createSimIo, flush, type SimClock, type SimIoOptions } from './support/sim.ts';

const log = createLogger({ level: 'error' });
const FRAME = {} as FrameContext;
const K0 = (ix: number, iz: number): CellKey => packCellKey(0, ix, iz);
/** 작은 월드: L0 8×8(±1 km), L1 4×4, L2 2×2, L3 2×2. */
const SMALL: readonly [number, number][] = [
  [-4, 3],
  [-2, 1],
  [-1, 0],
  [-1, 0],
];
const FAST: Partial<SimIoOptions> = { fetchMs: [5, 6], decodeMs: [5, 6] };

interface Rig {
  svc: StreamingService;
  bus: EventBus;
  clock: SimClock;
  delivered: CellKey[];
  evicted: CellKey[];
  perFrame: number[];
  io: ReturnType<typeof createSimIo>;
  /** n 프레임(16 ms) 진행. */
  run(frames: number): Promise<void>;
}

function rig(opts: Partial<SimIoOptions> = {}, ack = true): Rig {
  const clock = createSimClock();
  const io = createSimIo({ clock, ...opts });
  const bus = createEventBus(log);
  const svc = createStreaming({
    bus,
    log,
    world: { baseUrl: '/w', buildId: 'sim', cellsIndex: synthCellsIndex(SMALL) },
    fetcher: io.fetcher,
    pool: io.pool,
    clock: clock.now,
  });
  const delivered: CellKey[] = [];
  const evicted: CellKey[] = [];
  const perFrame: number[] = [];
  let thisFrame = 0;
  svc.onReady((p) => {
    delivered.push(p.key);
    thisFrame++;
    if (ack) svc.ack(p.key, 'render');
  });
  svc.onEvicted((k) => evicted.push(k));
  const [system] = svc.systems();
  const run = async (frames: number) => {
    for (let i = 0; i < frames; i++) {
      thisFrame = 0;
      system?.update(FRAME);
      perFrame.push(thisFrame);
      await clock.advance(16);
    }
  };
  return { svc, bus, clock, delivered, evicted, perFrame, io, run };
}

describe('createStreaming', () => {
  it('boots foot cell first, then L3 → L2 → L1 → rest, ≤ 2 onReady per frame, render ack → live', async () => {
    const r = rig(FAST);
    r.svc.setInterest([point('player', 10, 0, 10)]);
    let done = false;
    void r.svc.whenReady({ centerWF: { x: 10, y: 0, z: 10 }, radius: 256, levels: [0, 1] }).then(() => {
      done = true;
    });
    await r.run(200);
    expect(done).toBe(true);
    expect(r.delivered[0]).toBe(K0(0, 0));
    const levels = r.delivered.map((k) => cellIdString(k).slice(0, 2));
    expect(levels.indexOf('L3')).toBeLessThan(levels.indexOf('L2'));
    expect(levels.indexOf('L2')).toBeLessThan(levels.indexOf('L1'));
    expect(Math.max(...r.perFrame)).toBeLessThanOrEqual(2);
    expect(r.svc.stateOf(K0(0, 0))).toBe('live');
    expect(r.svc.stats().pendingReady).toBe(0);
  });

  it('keeps delivered-but-unacked cells ready; only the render ack makes them live', async () => {
    const r = rig(FAST, false);
    r.svc.setInterest([point('player', 10, 0, 10)]);
    await r.run(60);
    expect(r.svc.stateOf(K0(0, 0))).toBe('ready');
    r.svc.ack(K0(0, 0), 'physics');
    expect(r.svc.stateOf(K0(0, 0))).toBe('ready');
    r.svc.ack(K0(0, 0), 'render');
    expect(r.svc.stateOf(K0(0, 0))).toBe('live');
  });

  it('groundHeightAt samples resident L0 heightfields and forgets evicted ones', async () => {
    const r = rig(FAST);
    r.svc.setInterest([point('player', 10, 0, 10)]);
    expect(r.svc.groundHeightAt(10, 10)).toBeUndefined();
    await r.run(60);
    expect(r.svc.groundHeightAt(10, 10)).toBeCloseTo(10, 6);
    r.svc.setInterest([point('player', -900, 0, -900)]); // 반대편: (0,0)은 해제 반경 밖
    await r.run(60);
    expect(r.evicted).toContain(K0(0, 0));
    expect(r.svc.stateOf(K0(0, 0))).toBe('absent');
    expect(r.svc.groundHeightAt(10, 10)).toBeUndefined();
  });

  it('emits cell/ready and cell/evicted bus events once per load', async () => {
    const r = rig(FAST);
    const ev: string[] = [];
    r.bus.on('cell/ready', ({ key }) => ev.push(`+${cellIdString(key)}`));
    r.bus.on('cell/evicted', ({ key }) => ev.push(`-${cellIdString(key)}`));
    r.svc.setInterest([point('player', 10, 0, 10)]);
    await r.run(60);
    r.svc.setInterest([point('player', -900, 0, -900)]);
    await r.run(60);
    expect(ev.filter((e) => e === '+L0_0_0')).toHaveLength(1);
    expect(ev.filter((e) => e === '-L0_0_0')).toHaveLength(1);
    expect(ev.indexOf('+L0_0_0')).toBeLessThan(ev.indexOf('-L0_0_0'));
  });

  it('marks a cell failed after the fetcher gives up and retries it only after retryAfterMs (60 s)', async () => {
    const r = rig({ ...FAST, alwaysFail: new Set([K0(0, 0)]) });
    r.svc.setInterest([point('player', 10, 0, 10)]);
    await r.run(30);
    expect(r.svc.stateOf(K0(0, 0))).toBe('failed');
    const fetchesAtFail = r.io.counters.fetches;
    await r.run(Math.floor(59_000 / 16)); // 59 s: 재요청 없음(다른 셀은 이미 적재)
    expect(r.io.counters.fetches).toBe(fetchesAtFail);
    await r.run(Math.ceil(2_000 / 16)); // 61 s
    expect(r.io.counters.fetches).toBe(fetchesAtFail + 1);
    expect(r.svc.stats().failures).toBe(2);
  });

  it('whenReady pins cells outside the interest radius and resolves even if a target fails', async () => {
    const r = rig({ ...FAST, alwaysFail: new Set([K0(3, 3)]) });
    r.svc.setInterest([point('player', -900, 0, -900)]);
    let done = false;
    void r.svc.whenReady({ centerWF: { x: 900, y: 0, z: 900 }, radius: 10, levels: [0] }).then(() => {
      done = true;
    });
    await r.run(60);
    expect(done).toBe(true);
    expect(r.svc.stateOf(K0(3, 3))).toBe('failed');
  });

  it('cancels in-flight requests that leave the keep radius and never delivers them', async () => {
    const r = rig({ fetchMs: [400, 500], decodeMs: [5, 6] });
    r.svc.setInterest([point('player', 900, 0, 900)]);
    await r.run(3);
    expect(r.svc.stateOf(K0(3, 3))).toBe('fetching');
    r.svc.setInterest([point('player', -900, 0, -900)]);
    await r.run(3);
    expect(r.svc.stateOf(K0(3, 3))).toBe('absent');
    await r.run(80);
    expect(r.delivered).not.toContain(K0(3, 3));
  });

  it('allows exactly one onReady consumer and recomputes on mode/quality events', async () => {
    const r = rig();
    expect(() => r.svc.onReady(() => undefined)).toThrow();
    r.svc.setInterest([point('player', 10, 0, 10)]);
    await r.run(1);
    expect(r.svc.stats().recompute.count).toBe(1);
    r.bus.emit('mode/changed', { from: 'walk', to: 'drive' });
    await r.run(1);
    expect(r.svc.stats().recompute.count).toBe(2);
    r.bus.emit('quality/changed', { tier: 'low' });
    await r.run(1);
    expect(r.svc.stats().recompute.count).toBe(3);
  });

  it('rate-limits recompute: same L0 cell → every recomputeIntervalMs, new L0 cell → immediately', async () => {
    const r = rig();
    r.svc.setInterest([point('player', 10, 0, 10)]);
    await r.run(1);
    for (let i = 0; i < 10; i++) {
      r.svc.setInterest([point('player', 10 + i, 0, 10)]);
      await r.run(1);
    }
    expect(r.svc.stats().recompute.count).toBe(1); // 176 ms < 250 ms, 같은 셀
    r.svc.setInterest([point('player', 300, 0, 10)]);
    await r.run(1);
    expect(r.svc.stats().recompute.count).toBe(2);
    await r.run(16);
    expect(r.svc.stats().recompute.count).toBe(3);
  });

  it('requestSections refetches and decodes only on demand; unknown cells reject', async () => {
    const r = rig(FAST);
    const p = r.svc.requestSections(K0(0, 0), ['collision.bin', 'terrain.height']);
    await r.clock.advance(20);
    await r.clock.advance(20);
    await flush();
    expect((await p).key).toBe(K0(0, 0));
    await expect(r.svc.requestSections(packCellKey(0, 99, 99), ['collision.bin'])).rejects.toThrow();
  });

  it('dispose resolves pending whenReady and stops delivering', async () => {
    const r = rig({ fetchMs: [400, 500] });
    r.svc.setInterest([point('player', 10, 0, 10)]);
    const p = r.svc.whenReady({ centerWF: { x: 10, y: 0, z: 10 }, radius: 256, levels: [0] });
    await r.run(2);
    r.svc.dispose();
    await expect(p).resolves.toBeUndefined();
    await r.run(40);
    expect(r.delivered).toHaveLength(0);
  });
});
