// streaming → render 배선: 관심점 전달, 적용 예산(시간·업로드 바이트, 첫 셀 보장), ack, 부모 HLOD 자식 숨김/표시 순서, 적용 전 해제.
// see docs/06-world-streaming.md §5–6
import { type CellKey, createLogger, type FrameContext, packCellKey } from '@sanpo/core';
import type { RenderService } from '@sanpo/render';
import type { StreamingService } from '@sanpo/streaming';
import type { CellPayload } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { createStreamingRenderWiring, uploadBytes } from '../src/wiring/streaming-render.ts';

const log = createLogger({ level: 'error' });
const F = {} as FrameContext;

function payload(key: CellKey, bytes: number): CellPayload {
  return {
    key,
    meshes: {
      terrain: {
        primitives: [
          {
            materialId: 'terrain_ground',
            attributes: { POSITION: { array: new Float32Array(bytes / 4), itemSize: 3, normalized: false } },
            boundsLocal: { min: [0, 0, 0], max: [1, 1, 1] },
          },
        ],
      },
    },
  } as unknown as CellPayload;
}

function fakes() {
  const calls: string[] = [];
  let readyCb: ((p: CellPayload) => void) | undefined;
  let evictCb: ((k: CellKey) => void) | undefined;
  const interest: unknown[] = [];
  const streaming = {
    onReady: (cb: (p: CellPayload) => void) => {
      readyCb = cb;
      return () => undefined;
    },
    onEvicted: (cb: (k: CellKey) => void) => {
      evictCb = cb;
      return () => undefined;
    },
    ack: (k: CellKey, c: string) => calls.push(`ack ${k} ${c}`),
    setInterest: (p: unknown) => interest.push(p),
  } as unknown as StreamingService;
  const render = {
    addCell: (p: CellPayload) => calls.push(`add ${p.key}`),
    removeCell: (k: CellKey) => calls.push(`remove ${k}`),
    setHlodChildVisible: (p: CellKey, c: number, v: boolean) => calls.push(`hlod ${p} ${c} ${v}`),
  } as unknown as RenderService;
  return {
    calls,
    interest,
    streaming,
    render,
    ready: (p: CellPayload) => readyCb?.(p),
    evict: (k: CellKey) => evictCb?.(k),
  };
}

describe('streaming → render wiring', () => {
  const L0 = packCellKey(0, 5, 6); // 부모 L1_1_1, 자식 인덱스 (6 mod 4)·4 + (5 mod 4) = 9
  const L1 = packCellKey(1, 1, 1);

  it('adds, acks and hides the parent child region; eviction shows the parent before removing', () => {
    const f = fakes();
    const w = createStreamingRenderWiring({
      streaming: f.streaming,
      render: f.render,
      traversal: { interest: [] },
      log,
    });
    const [interest, apply] = w.systems;
    interest?.update(F);
    expect(f.interest).toHaveLength(1);
    f.ready(payload(L0, 64));
    apply?.update(F);
    expect(f.calls).toEqual([`add ${L0}`, `ack ${L0} render`, `hlod ${L1} 9 false`]);
    f.calls.length = 0;
    f.evict(L0);
    expect(f.calls).toEqual([`hlod ${L1} 9 true`, `remove ${L0}`]);
  });

  it('applies the first cell always, then stops at the upload-byte budget', () => {
    const f = fakes();
    const w = createStreamingRenderWiring({
      streaming: f.streaming,
      render: f.render,
      traversal: { interest: [] },
      log,
      budgetBytes: 1000,
    });
    const keys = [0, 1, 2].map((i) => packCellKey(0, i, 0));
    for (const k of keys) f.ready(payload(k, 800));
    expect(uploadBytes(payload(keys[0] as CellKey, 800))).toBe(800);
    w.systems[1]?.update(F);
    expect(f.calls.filter((c) => c.startsWith('add'))).toHaveLength(1);
    expect(w.stats()).toMatchObject({ queued: 2, deferred: 1 });
    w.systems[1]?.update(F);
    w.systems[1]?.update(F);
    expect(w.stats()).toMatchObject({ queued: 0, applied: 3 });
  });

  it('drops a queued payload evicted before it was applied (no render calls)', () => {
    const f = fakes();
    const w = createStreamingRenderWiring({
      streaming: f.streaming,
      render: f.render,
      traversal: { interest: [] },
      log,
    });
    f.ready(payload(L0, 64));
    f.evict(L0);
    w.systems[1]?.update(F);
    expect(f.calls).toEqual([]);
  });

  it('L3 cells have no parent to hide', () => {
    const f = fakes();
    const w = createStreamingRenderWiring({
      streaming: f.streaming,
      render: f.render,
      traversal: { interest: [] },
      log,
    });
    const L3 = packCellKey(3, 0, 0);
    f.ready(payload(L3, 64));
    w.systems[1]?.update(F);
    expect(f.calls).toEqual([`add ${L3}`, `ack ${L3} render`]);
  });
});
