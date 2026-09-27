// 부트 골격: rAF 루프 → scheduler.tick, 월드 상태 조회 분류, 상태 표시 문구, URL 플래그.
import { createLogger, createScheduler, type GameSystem } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { createIdleFrameSource, parseFlags } from '../src/boot.ts';
import { createLoop } from '../src/loop.ts';
import { describeCaps, describeRenderer, describeWorld } from '../src/status-view.ts';
import { fetchWorldStatus } from '../src/world-status.ts';

function manualRaf() {
  let next: ((t: number) => void) | undefined;
  let id = 0;
  return {
    raf: (cb: (t: number) => void) => {
      next = cb;
      return ++id;
    },
    cancelRaf: () => {
      next = undefined;
    },
    step: (t: number) => next?.(t),
  };
}

describe('createLoop', () => {
  it('ticks the scheduler on each frame with hooks around it until stopped', () => {
    const scheduler = createScheduler({ log: createLogger({ sink: () => {} }), clock: () => 0 });
    scheduler.setFrameSource(createIdleFrameSource(() => 0));
    const seen: number[] = [];
    const order: string[] = [];
    const sys: GameSystem = { id: 't', phase: 0, update: (f) => seen.push(f.frameIndex), dispose: () => {} };
    scheduler.add(sys);
    const r = manualRaf();
    const loop = createLoop({ scheduler, raf: r.raf, cancelRaf: r.cancelRaf });
    loop.addHook({ before: () => order.push('before'), after: () => order.push('after') });
    loop.start();
    expect(loop.running).toBe(true);
    r.step(16);
    r.step(33);
    loop.stop();
    r.step(50);
    expect(seen).toHaveLength(2);
    expect(order).toEqual(['before', 'after', 'before', 'after']);
    expect(loop.running).toBe(false);
  });
});

const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('fetchWorldStatus', () => {
  it('requests the current build for the format version', async () => {
    let url = '';
    const status = await fetchWorldStatus(async (u) => {
      url = u;
      return new Response(JSON.stringify({ buildId: 'b', baseUrl: '/world/b', formatVersion: 1 }));
    }, 1);
    expect(url).toBe('/api/world/current?fv=1');
    expect(status).toEqual({ kind: 'ready', buildId: 'b', baseUrl: '/world/b' });
  });

  it('classifies unconfigured storage, missing build and failures', async () => {
    expect(await fetchWorldStatus(respond(503, { error: 'world_storage_unconfigured' }))).toEqual({
      kind: 'unconfigured',
    });
    expect(await fetchWorldStatus(respond(404, { error: 'no_build' }))).toEqual({ kind: 'no-build' });
    expect(await fetchWorldStatus(respond(500, { error: 'boom' }))).toEqual({
      kind: 'error',
      detail: 'HTTP 500 (boom)',
    });
    expect(await fetchWorldStatus(respond(200, { nope: 1 }))).toMatchObject({ kind: 'error' });
    const offline = async (): Promise<Response> => {
      throw new Error('offline');
    };
    expect(await fetchWorldStatus(offline)).toEqual({ kind: 'error', detail: 'offline' });
  });
});

describe('status rows', () => {
  it('flags missing isolation as bad and WebGPU fallback as warn', () => {
    const rows = describeCaps({
      webgpu: 'no-adapter',
      gpuAdapter: undefined,
      crossOriginIsolated: false,
      sharedArrayBuffer: false,
      isolation: 'degraded',
      hardwareConcurrency: 4,
      decodeWorkers: 1,
    });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.isolated).toMatchObject({ value: 'false', state: 'bad' });
    expect(byKey.webgpu?.state).toBe('warn');
    expect(byKey.sab?.state).toBe('warn');
    expect(describeWorld(undefined).state).toBe('warn');
    expect(describeWorld({ kind: 'ready', buildId: 'x', baseUrl: '/world/x' })).toMatchObject({ state: 'warn' });
    const loaded = { kind: 'loaded', source: 'fixture', buildId: 'x', cells: 4, indexed: 4 } as const;
    expect(describeWorld(loaded)).toMatchObject({ state: 'ok', value: '빌드 x · world-mini 픽스처 · 셀 4/4 로드' });
  });

  it('parses the debug and backend flags', () => {
    expect(parseFlags('?debug=1').debug).toBe(true);
    expect(parseFlags('?debug=0').debug).toBe(false);
    expect(parseFlags('').debug).toBe(false);
    expect(parseFlags('?world=mini&debug=1&backend=webgl')).toEqual({ debug: true, world: 'mini', backend: 'webgl' });
    expect(parseFlags('?backend=webgpu')).toEqual({ debug: false });
  });

  it('describes the renderer row (backend · depth · shown cells)', () => {
    expect(describeRenderer('webgl2', 'reversed-z', undefined).value).toBe('WebGL2 · 깊이 reversed-z');
    expect(describeRenderer('webgpu', 'reversed-z', 4).value).toBe('WebGPU · 깊이 reversed-z · 셀 4 표시');
  });
});
