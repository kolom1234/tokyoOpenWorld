// `?probe=decode` 디버그 프로브(렌더 없이 실행): world-mini 셀을 streaming fetch → 디코드 워커로 두 번(네트워크·Cache Storage) 읽어
// 셀당 시간·정점/인덱스 수·메인 스레드 긴 작업·워커 취소를 측정 → `globalThis.__SANPO_DECODE_PROBE__`, `#app[data-probe]`. e2e decode.spec.ts가 읽는다.
import { type CellKey, cellIdString, createLogger, createWorkerSupervisor } from '@sanpo/core';
import {
  cacheName,
  createDecodePool,
  createFetcher,
  DEFAULT_STREAMING_CONFIG,
  type DecodePool,
  type Fetcher,
  purgeStaleCaches,
} from '@sanpo/streaming';
import { type CellPayload, type CellsIndex, readCellsIndex } from '@sanpo/tile-format';

export interface ProbeCell {
  id: string;
  bytes: number;
  fromCache: boolean;
  fetchMs: number;
  /** 워커 안 디코드(hash32 검사 포함). */
  workerMs: number;
  /** decode() 호출 → 결과 수신(메인 기준 왕복). */
  roundTripMs: number;
  /** decode() 호출의 동기 구간(postMessage + transfer). */
  postMs: number;
  meshes: Record<string, Array<{ vertices: number; indices: number }>>;
}
export interface DecodeProbeReport {
  workers: number;
  hardwareConcurrency: number;
  cacheStorage: boolean;
  passes: ProbeCell[][];
  /** 동시에 4셀 디코드한 전체 시간(워커 병렬). */
  parallelMs: number;
  cancel: { aborted: boolean; nextOk: boolean };
  /** 프로브 동안 관측된 50 ms 이상 메인 스레드 작업(ms). */
  longTasks: number[];
}

function meshCounts(p: CellPayload): ProbeCell['meshes'] {
  const out: ProbeCell['meshes'] = {};
  for (const [slot, m] of Object.entries(p.meshes)) {
    out[slot] = (m?.primitives ?? []).map((prim) => ({
      vertices: (prim.attributes.POSITION?.array.byteLength ?? 0) / 12,
      indices: prim.index?.length ?? 0,
    }));
  }
  return out;
}

interface Ctx {
  fetcher: Fetcher;
  pool: DecodePool;
  index: CellsIndex;
  buildId: string;
}

async function loadOne(c: Ctx, key: CellKey): Promise<ProbeCell> {
  const rec = c.index.get(key);
  const t0 = performance.now();
  const f = await c.fetcher.fetchCell(key, rec?.byteLength ?? 0);
  if (!f.ok) throw new Error(`${cellIdString(key)} fetch ${f.error.code}: ${f.error.message}`);
  const t1 = performance.now();
  const bytes = f.value.bytes.byteLength;
  const pending = c.pool.decode(f.value.bytes, { key, buildId: c.buildId, hash32: rec?.hash32 ?? 0 });
  const postMs = performance.now() - t1;
  const d = await pending;
  if (!d.ok) throw new Error(`${cellIdString(key)} decode ${d.error.code}: ${d.error.message}`);
  return {
    id: d.value.payload.id,
    bytes,
    fromCache: f.value.fromCache,
    fetchMs: t1 - t0,
    workerMs: d.value.workerMs,
    roundTripMs: performance.now() - t1,
    postMs,
    meshes: meshCounts(d.value.payload),
  };
}

async function cancelCheck(c: Ctx, key: CellKey): Promise<DecodeProbeReport['cancel']> {
  const f = await c.fetcher.fetchCell(key, c.index.get(key)?.byteLength ?? 0);
  if (!f.ok) return { aborted: false, nextOk: false };
  const ac = new AbortController();
  const p = c.pool.decode(f.value.bytes, { key, buildId: c.buildId }, ac.signal);
  ac.abort();
  const r = await p;
  const next = await loadOne(c, key).then(
    () => true,
    () => false,
  );
  return { aborted: !r.ok && r.error.code === 'aborted', nextOk: next };
}

async function setup(baseUrl: string): Promise<Ctx & { workers: number }> {
  const log = createLogger({ level: 'info' }).child('probe');
  const world = (await (await fetch(`${baseUrl}/world.json`)).json()) as { buildId: string };
  const idx = readCellsIndex(new Uint8Array(await (await fetch(`${baseUrl}/cells.idx`)).arrayBuffer()));
  if (!idx.ok) throw new Error(`cells.idx ${idx.error.code}`);
  if ('caches' in globalThis) {
    await purgeStaleCaches(caches, world.buildId);
    await caches.delete(cacheName(world.buildId)); // 1차는 네트워크에서 읽게 비운다
  }
  const config = DEFAULT_STREAMING_CONFIG;
  const pool = createDecodePool({ supervisor: createWorkerSupervisor({ log }), log, config: config.decode });
  const fetcher = createFetcher({ baseUrl, buildId: world.buildId, log, config: config.fetch });
  return { fetcher, pool, index: idx.value, buildId: world.buildId, workers: pool.stats().workers };
}

export async function runDecodeProbe(baseUrl: string): Promise<DecodeProbeReport> {
  const longTasks: number[] = [];
  const obs =
    typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')
      ? new PerformanceObserver((l) => {
          for (const e of l.getEntries()) longTasks.push(Math.round(e.duration));
        })
      : undefined;
  obs?.observe({ type: 'longtask', buffered: false });
  const c = await setup(baseUrl);
  const keys = [...c.index.keys()].filter((k) => c.index.get(k) !== undefined && cellIdString(k).startsWith('L0_'));
  const passes: ProbeCell[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    const cells: ProbeCell[] = [];
    for (const k of keys) cells.push(await loadOne(c, k)); // 순차: 셀당 시간이 서로 섞이지 않게
    passes.push(cells);
  }
  const t = performance.now();
  await Promise.all(keys.map((k) => loadOne(c, k)));
  const parallelMs = performance.now() - t;
  const cancel = await cancelCheck(c, keys[0] as CellKey);
  obs?.disconnect();
  c.pool.dispose();
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 0;
  return {
    workers: c.workers,
    hardwareConcurrency,
    cacheStorage: 'caches' in globalThis,
    passes,
    parallelMs,
    cancel,
    longTasks,
  };
}
