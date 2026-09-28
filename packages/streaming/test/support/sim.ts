// 서비스 테스트 대역: 가상 시계(ms) + 지연·실패를 흉내 내는 fetcher/디코드 풀(합성 payload). 결정론(createRng).
import { type CellKey, cellIdString, createRng, type Rng, unpackCellKey } from '@sanpo/core';
import { cellOriginWF } from '@sanpo/geo';
import type { CellHeader, CellPayload } from '@sanpo/tile-format';
import type { DecodePool, Fetcher } from '../../src/api.ts';

export interface SimClock {
  now(): number;
  /** ms 뒤 resolve(취소 신호가 오면 즉시 'aborted'). */
  after(ms: number, signal?: AbortSignal): Promise<'ok' | 'aborted'>;
  /** 시계를 진행하고 만기 타이머를 푼 뒤 마이크로태스크를 비운다. */
  advance(ms: number): Promise<void>;
  readonly pending: number;
}

/** setImmediate 한 번 = 쌓인 마이크로태스크 전부 실행. */
export const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

export function createSimClock(): SimClock {
  let t = 0;
  let timers: { at: number; fire: (v: 'ok' | 'aborted') => void }[] = [];
  return {
    now: () => t,
    after(ms, signal) {
      return new Promise((resolve) => {
        if (signal?.aborted) return resolve('aborted');
        const timer = { at: t + ms, fire: resolve };
        timers.push(timer);
        signal?.addEventListener(
          'abort',
          () => {
            timers = timers.filter((x) => x !== timer);
            resolve('aborted');
          },
          { once: true },
        );
      });
    },
    async advance(ms) {
      t += ms;
      const due = timers.filter((x) => x.at <= t);
      timers = timers.filter((x) => x.at > t);
      for (const d of due) d.fire('ok');
      await flush();
      await flush();
    },
    get pending() {
      return timers.length;
    },
  };
}

export interface SimIo {
  fetcher: Fetcher;
  pool: DecodePool;
  /** fetch 호출 수·실패 주입 수·디코드 진행 중 수. */
  counters: { fetches: number; injectedFailures: number; decoding: number };
}

export interface SimIoOptions {
  clock: SimClock;
  seed?: number;
  /** [min, max) ms. */
  fetchMs?: [number, number];
  decodeMs?: [number, number];
  /** 0..1, fetch 최종 실패(재시도 소진 후 http 500) 확률. */
  failRate?: number;
  /** 높이장 크기(작게 — 메모리). */
  hfSize?: number;
  /** 이 셀은 항상 실패. */
  alwaysFail?: ReadonlySet<CellKey>;
}

const between = (rng: Rng, [a, b]: [number, number]): number => a + rng.next() * (b - a);

export function synthPayload(key: CellKey, hfSize: number, heightM = 10): CellPayload {
  const { level, ix, iz } = unpackCellKey(key);
  const o = cellOriginWF(key);
  const header = { cell: { level, ix, iz }, buildId: 'sim', originWF: [o.x, o.y, o.z] } as unknown as CellHeader;
  const p: CellPayload = { key, id: cellIdString(key), level, originWF: o, header, meshes: {} };
  if (level === 0) {
    const data = new Uint16Array(hfSize * hfSize).fill(Math.round((heightM + 100) / 0.01));
    p.heightfield = { size: hfSize, minH: -100, step: 0.01, data };
  }
  return p;
}

export function createSimIo(o: SimIoOptions): SimIo {
  const rng = createRng(o.seed ?? 1);
  const counters = { fetches: 0, injectedFailures: 0, decoding: 0 };
  const fetcher: Fetcher = {
    async fetchCell(key, _n, signal) {
      counters.fetches++;
      const fail = o.alwaysFail?.has(key) || rng.next() < (o.failRate ?? 0);
      const r = await o.clock.after(between(rng, o.fetchMs ?? [20, 200]), signal);
      if (r === 'aborted') return { ok: false, error: { code: 'aborted', message: 'x', attempts: 1 } };
      if (fail) {
        counters.injectedFailures++;
        return { ok: false, error: { code: 'http', status: 500, message: 'sim 500', attempts: 4 } };
      }
      return { ok: true, value: { bytes: new ArrayBuffer(8), fromCache: false } };
    },
    invalidate: async () => undefined,
  };
  const pool: DecodePool = {
    async decode(_b, req, signal) {
      counters.decoding++;
      const r = await o.clock.after(between(rng, o.decodeMs ?? [10, 60]), signal);
      counters.decoding--;
      if (r === 'aborted') return { ok: false, error: { code: 'aborted', message: 'x' } };
      return { ok: true, value: { payload: synthPayload(req.key, o.hfSize ?? 3), workerMs: 1 } };
    },
    stats: () => ({ workers: 2, running: 2, inFlight: counters.decoding, queued: 0 }),
    dispose: () => undefined,
  };
  return { fetcher, pool, counters };
}
