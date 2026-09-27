// 기능 감지: WebGPU 3상태, 격리 모드, 디코드 워커 수(주입된 CapsEnv).
import { describe, expect, it } from 'vitest';
import { type CapsEnv, detectCaps } from '../src/caps.ts';

const baseEnv = (over: Partial<CapsEnv> = {}): CapsEnv => ({
  gpu: undefined,
  crossOriginIsolated: true,
  hasSharedArrayBuffer: true,
  hardwareConcurrency: 8,
  ...over,
});

describe('detectCaps', () => {
  it('reports unsupported WebGPU when navigator.gpu is missing', async () => {
    const caps = await detectCaps(baseEnv());
    expect(caps.webgpu).toBe('unsupported');
    expect(caps.gpuAdapter).toBeUndefined();
  });

  it('reports available WebGPU with adapter label', async () => {
    const gpu = { requestAdapter: async () => ({ info: { vendor: 'acme', architecture: 'rdna9' } }) };
    const caps = await detectCaps(baseEnv({ gpu }));
    expect(caps.webgpu).toBe('available');
    expect(caps.gpuAdapter).toBe('acme / rdna9');
  });

  it('treats a null or rejected adapter request as no-adapter', async () => {
    expect((await detectCaps(baseEnv({ gpu: { requestAdapter: async () => null } }))).webgpu).toBe('no-adapter');
    const throwing = {
      requestAdapter: async () => {
        throw new Error('blocked');
      },
    };
    expect((await detectCaps(baseEnv({ gpu: throwing }))).webgpu).toBe('no-adapter');
  });

  it('is isolated only with crossOriginIsolated and SharedArrayBuffer', async () => {
    expect((await detectCaps(baseEnv())).isolation).toBe('isolated');
    expect((await detectCaps(baseEnv({ crossOriginIsolated: false }))).isolation).toBe('degraded');
    expect((await detectCaps(baseEnv({ hasSharedArrayBuffer: false }))).isolation).toBe('degraded');
  });

  it('derives decode workers as clamp(cores - 3, 1, 4)', async () => {
    expect((await detectCaps(baseEnv({ hardwareConcurrency: 16 }))).decodeWorkers).toBe(4);
    expect((await detectCaps(baseEnv({ hardwareConcurrency: 6 }))).decodeWorkers).toBe(3);
    expect((await detectCaps(baseEnv({ hardwareConcurrency: 2 }))).decodeWorkers).toBe(1);
    const unknown = await detectCaps(baseEnv({ hardwareConcurrency: undefined }));
    expect(unknown.hardwareConcurrency).toBe(2);
    expect(unknown.decodeWorkers).toBe(1);
  });
});
