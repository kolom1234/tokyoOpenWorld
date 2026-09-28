// createStreaming: cells.idx + fetcher + 디코드 풀 + 로드 큐 + 수명주기 + ground + whenReady를 phase 50 시스템 하나로 조립.
// 프레임 작업 = (필요 시) 재계산 + 준비된 셀 ≤ readyPerFrame개 전달. 메인은 파싱 없음(ADR-0022). see docs/06-world-streaming.md §2–9, ADR-0023
import {
  type CellKey,
  type GameSystem,
  type InterestPoint,
  type ModeId,
  type QualityTier,
  type Unsubscribe,
  unpackCellKey,
} from '@sanpo/core';
import { cellOf } from '@sanpo/geo';
import type { CellPayload } from '@sanpo/tile-format';
import type { DecodePool, Fetcher, StreamingConfig, StreamingDeps, StreamingService, StreamingStats } from '../api.ts';
import { type CellIndex, createCellIndex } from './cell-index.ts';
import { DEFAULT_STREAMING_CONFIG } from './config.ts';
import { createDecodePool } from './decode-pool.ts';
import { createFetcher, purgeStaleCaches } from './fetcher.ts';
import type { InterestFrame } from './geometry.ts';
import { createGroundStore, type GroundStore } from './ground.ts';
import { inLoadZone } from './interest.ts';
import { createLifecycle, type Lifecycle } from './lifecycle.ts';
import { recompute } from './planner.ts';
import { createLoadScheduler, type LoadResult, type LoadScheduler } from './scheduler.ts';
import { createWaiters, type Waiters } from './waiters.ts';

/** 01-architecture §5. */
export const STREAMING_PHASE = 50;

interface Svc {
  deps: StreamingDeps;
  cfg: StreamingConfig;
  log: StreamingDeps['log'];
  index: CellIndex;
  fetcher: Fetcher;
  pool: DecodePool;
  ownsPool: boolean;
  sched: LoadScheduler;
  life: Lifecycle;
  ground: GroundStore;
  waiters: Waiters;
  clock: () => number;
  points: readonly InterestPoint[];
  mode: ModeId;
  tier: QualityTier;
  sig: string;
  lastAt: number;
  dirty: boolean;
  /** 마지막 재계산의 해제 계획(프레임당 evictPerFrame개씩 실행). */
  evictQueue: CellKey[];
  readyCb: ((p: CellPayload) => void) | undefined;
  evictedCbs: Set<(key: CellKey) => void>;
  stats: Pick<StreamingStats, 'recompute' | 'evicted' | 'failures' | 'overLimit'>;
  subs: Unsubscribe[];
}

const perfNow = (): number => globalThis.performance?.now() ?? Date.now();

/** 재계산이 필요한 변화: 모드·티어, 관심점 수·종류·L0 셀. */
function signature(s: Svc): string {
  let sig = `${s.mode}|${s.tier}`;
  for (const p of s.points) sig += `|${p.kind}:${cellOf(0, p.posWF.x, p.posWF.z)}`;
  return sig;
}

function frameOf(s: Svc): InterestFrame {
  return { points: s.points, mode: s.mode, tier: s.tier, groundHeightAt: (x, z) => s.ground.groundHeightAt(x, z) };
}

function evict(s: Svc, key: CellKey): void {
  const delivered = s.life.beginEvict(key);
  if (delivered === undefined) return;
  if (unpackCellKey(key).level === 0) s.ground.remove(key);
  if (delivered) {
    for (const cb of s.evictedCbs) cb(key);
    s.deps.bus.emit('cell/evicted', { key });
  }
  s.life.endEvict(key);
  s.stats.evicted++;
}

function runRecompute(s: Svc, now: number): void {
  const t0 = perfNow();
  const out = recompute(
    { index: s.index, cfg: s.cfg, life: s.life, sched: s.sched, pinned: s.waiters.pinned },
    frameOf(s),
    now,
  );
  const ms = perfNow() - t0;
  const r = s.stats.recompute;
  Object.assign(r, { count: r.count + 1, lastMs: ms, maxMs: Math.max(r.maxMs, ms), totalMs: r.totalMs + ms });
  if (out.overLimit.some((n) => n > 0) && out.overLimit.join() !== s.stats.overLimit.join()) {
    s.log.warn('resident limit exceeded inside load radius', out.overLimit);
  }
  s.stats.overLimit = out.overLimit;
  s.evictQueue = out.evict;
  s.lastAt = now;
  s.dirty = false;
}

/** 해제 계획을 프레임 예산만큼 실행. 그사이 다시 로드 영역(또는 whenReady 대상)에 들어온 셀은 건너뛴다. */
function drainEvictions(s: Svc): void {
  if (s.evictQueue.length === 0) return;
  const frame = frameOf(s);
  let n = 0;
  while (n < s.cfg.lifecycle.evictPerFrame && s.evictQueue.length > 0) {
    const key = s.evictQueue.shift() as CellKey;
    if (s.waiters.pinned.has(key) || inLoadZone(key, frame, s.cfg.interest)) continue;
    evict(s, key);
    n++;
  }
}

function deliver(s: Svc): void {
  if (!s.readyCb) return;
  for (const p of s.life.takeReady(s.cfg.lifecycle.readyPerFrame)) {
    s.readyCb(p);
    s.deps.bus.emit('cell/ready', { key: p.key });
  }
}

function update(s: Svc): void {
  const now = s.clock();
  const sig = signature(s);
  if (s.dirty || sig !== s.sig || now - s.lastAt >= s.cfg.lifecycle.recomputeIntervalMs) {
    s.sig = sig;
    runRecompute(s, now);
  }
  drainEvictions(s);
  deliver(s);
  if (s.waiters.size > 0 && s.waiters.settle((k) => s.life.stateOf(k))) s.dirty = true;
}

function onDone(s: Svc, key: CellKey, r: LoadResult): void {
  if (r.ok) {
    const p = r.value.payload;
    s.life.loaded(key, p);
    if (p.level === 0 && p.heightfield) s.ground.add(key, p.originWF, p.heightfield);
    return;
  }
  s.life.failed(key, s.clock());
  s.stats.failures++;
  const e = r.error;
  s.log.warn('cell load failed', key, e.stage, e.stage === 'index' ? e.message : `${e.error.code}: ${e.error.message}`);
}

function assemble(deps: StreamingDeps): Svc {
  const cfg = deps.config ?? DEFAULT_STREAMING_CONFIG;
  const log = deps.log.child('streaming');
  const { baseUrl, buildId, cellsIndex } = deps.world;
  const index = createCellIndex(cellsIndex);
  const fetcher = deps.fetcher ?? createFetcher({ baseUrl, buildId, log, config: cfg.fetch });
  const supervisor = deps.supervisor;
  if (!deps.pool && !supervisor) throw new Error('createStreaming: pool 또는 supervisor 필요');
  const pool =
    deps.pool ??
    createDecodePool({ supervisor: supervisor as NonNullable<typeof supervisor>, log, config: cfg.decode });
  const life = createLifecycle(cfg.lifecycle.retryAfterMs);
  // onDone은 s가 만들어진 뒤에만 불린다(요청은 첫 update 이후).
  let self: Svc | undefined;
  const sched = createLoadScheduler({
    index,
    fetcher,
    pool,
    buildId,
    config: cfg.fetch,
    decodeCapacity: Math.max(1, pool.stats().workers) * cfg.decode.perWorker,
    verifyHash: cfg.decode.verifyHash,
    onStage: (key, stage) => life.stage(key, stage),
    onDone: (key, r) => self && onDone(self, key, r),
  });
  self = {
    deps,
    cfg,
    log,
    index,
    fetcher,
    pool,
    ownsPool: !deps.pool,
    sched,
    life,
    ground: createGroundStore(),
    waiters: createWaiters(index),
    clock: deps.clock ?? perfNow,
    points: [],
    mode: deps.initialMode ?? 'walk',
    tier: deps.initialTier ?? 'high',
    sig: '',
    lastAt: Number.NEGATIVE_INFINITY,
    dirty: true,
    evictQueue: [],
    readyCb: undefined,
    evictedCbs: new Set(),
    stats: {
      recompute: { count: 0, lastMs: 0, maxMs: 0, totalMs: 0 },
      evicted: 0,
      failures: 0,
      overLimit: [0, 0, 0, 0],
    },
    subs: [],
  };
  return self;
}

function snapshot(s: Svc): StreamingStats {
  const q = s.sched.stats();
  return {
    states: s.life.counts(),
    residentByLevel: s.life.residentByLevel(),
    ...q,
    pendingReady: s.life.pendingReady(),
    recompute: { ...s.stats.recompute },
    evicted: s.stats.evicted,
    failures: s.stats.failures,
    cacheBytes: s.fetcher.cacheBytes?.() ?? 0,
    overLimit: [...s.stats.overLimit],
  };
}

async function requestSections(s: Svc, key: CellKey, types: Parameters<StreamingService['requestSections']>[1]) {
  const rec = s.index.get(key);
  if (!rec) throw new Error(`requestSections: ${key} not in cells.idx`);
  const f = await s.fetcher.fetchCell(key, rec.byteLength);
  if (!f.ok) throw new Error(`requestSections fetch ${f.error.code}: ${f.error.message}`);
  const req = {
    key,
    buildId: s.deps.world.buildId,
    sections: types,
    ...(s.cfg.decode.verifyHash ? { hash32: rec.hash32 } : {}),
  };
  const d = await s.pool.decode(f.value.bytes, req);
  if (!d.ok) throw new Error(`requestSections decode ${d.error.code}: ${d.error.message}`);
  return d.value.payload;
}

function dispose(s: Svc): void {
  for (const u of s.subs) u();
  s.subs = [];
  s.sched.dispose();
  if (s.ownsPool) s.pool.dispose();
  s.waiters.flush();
  s.evictQueue = [];
  s.evictedCbs.clear();
  s.readyCb = undefined;
}

export function createStreaming(deps: StreamingDeps): StreamingService {
  const s = assemble(deps);
  s.subs.push(
    deps.bus.on('mode/changed', ({ to }) => {
      s.mode = to;
    }),
    deps.bus.on('quality/changed', ({ tier }) => {
      s.tier = tier;
    }),
  );
  const system: GameSystem = {
    id: 'streaming',
    phase: STREAMING_PHASE,
    async init() {
      const caches = (globalThis as { caches?: Parameters<typeof purgeStaleCaches>[0] }).caches;
      if (s.cfg.fetch.cacheStorage && caches && !deps.fetcher) {
        const stale = await purgeStaleCaches(caches, deps.world.buildId).catch(() => []);
        if (stale.length > 0) s.log.info('purged stale caches', stale);
      }
    },
    update: () => update(s),
    dispose: () => dispose(s),
  };
  return {
    systems: () => [system],
    setInterest(points) {
      s.points = points;
    },
    ack(key, consumer) {
      if (s.life.ack(key, consumer) && consumer === 'render' && s.waiters.size > 0) {
        if (s.waiters.settle((k) => s.life.stateOf(k))) s.dirty = true;
      }
    },
    whenReady(req) {
      const p = s.waiters.add(req);
      s.dirty = true;
      if (s.waiters.settle((k) => s.life.stateOf(k))) s.dirty = true;
      return p;
    },
    stateOf: (key) => s.life.stateOf(key),
    groundHeightAt: (x, z) => s.ground.groundHeightAt(x, z),
    onReady(cb) {
      if (s.readyCb) throw new Error('streaming.onReady: 콜백은 1개만(소유권 단일 이전)');
      s.readyCb = cb;
      return () => {
        if (s.readyCb === cb) s.readyCb = undefined;
      };
    },
    requestSections: (key, types) => requestSections(s, key, types),
    onEvicted(cb) {
      s.evictedCbs.add(cb);
      return () => void s.evictedCbs.delete(cb);
    },
    stats: () => snapshot(s),
    dispose: () => dispose(s),
  };
}
