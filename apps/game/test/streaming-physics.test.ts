// streaming → physics 배선(M04-T02): 물리 반경 안 live L0 셀만 가까운 순으로 requestSections → addCell, 반경 × 1.25 밖·해제 → removeCell, 동시 요청 제한.
import { type CellKey, createLogger, type ModeId, packCellKey, type Vec3d } from '@sanpo/core';
import type { CellPayload } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { cellDistance, createStreamingPhysicsWiring } from '../src/wiring/streaming-physics.ts';

function fakeStreaming() {
  let ready: ((e: { key: CellKey }) => void) | undefined;
  let evicted: ((k: CellKey) => void) | undefined;
  const pending: { key: CellKey; resolve: (p: Partial<CellPayload>) => void }[] = [];
  return {
    pending,
    live(ix: number, iz: number, level = 0) {
      ready?.({ key: packCellKey(level as 0, ix, iz) });
    },
    bus: {
      on(_k: string, cb: (e: { key: CellKey }) => void) {
        ready = cb;
        return () => undefined;
      },
    } as never,
    evict: (key: CellKey) => evicted?.(key),
    api: {
      onEvicted(cb: (k: CellKey) => void) {
        evicted = cb;
        return () => undefined;
      },
      requestSections(key: CellKey) {
        return new Promise<Partial<CellPayload>>((resolve) => pending.push({ key, resolve }));
      },
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('streaming → physics wiring', () => {
  it('measures horizontal distance to the cell box (0 inside)', () => {
    expect(cellDistance({ x: 0, y: 0, z: 0 }, { x: 100, y: 50, z: 100 })).toBe(0);
    expect(cellDistance({ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 100 })).toBe(44);
  });

  it('adds nearest in-radius L0 cells (2 in flight) and removes them past 1.25 × radius or on eviction', async () => {
    const s = fakeStreaming();
    const added: CellKey[] = [];
    const removed: CellKey[] = [];
    const player = { posWF: { x: 128, y: 20, z: 128 } as Vec3d, mode: 'walk' as ModeId };
    let t = 0;
    const w = createStreamingPhysicsWiring({
      streaming: s.api,
      bus: s.bus,
      physics: { addCell: (k) => added.push(k), removeCell: (k) => removed.push(k), setFocus: () => undefined },
      player: () => player,
      log: createLogger({ level: 'error' }),
      now: () => t,
    });
    s.live(0, 0);
    s.live(1, 0);
    s.live(3, 0); // 512 m 떨어짐 — 반경 256 밖
    s.live(0, 1);
    s.live(0, 0, 1); // L1은 무시
    w.system.update({} as never);
    expect(s.pending.map((p) => p.key)).toEqual([packCellKey(0, 0, 0), packCellKey(0, 1, 0)]);
    for (const p of s.pending.splice(0)) p.resolve({});
    await flush();
    t += 300;
    w.system.update({} as never);
    expect(s.pending.map((p) => p.key)).toEqual([packCellKey(0, 0, 1)]);
    for (const p of s.pending.splice(0)) p.resolve({});
    await flush();
    expect(added).toEqual([packCellKey(0, 0, 0), packCellKey(0, 1, 0), packCellKey(0, 0, 1)]);
    expect(w.stats()).toMatchObject({ live: 4, added: 3, inFlight: 0 });
    // x = 700 → (0,0)·(0,1)은 444 m(1.25 × 256 = 320 m 밖), (1,0)은 188 m(유지).
    player.posWF = { x: 700, y: 20, z: 128 };
    t += 300;
    w.system.update({} as never);
    expect(removed).toEqual([packCellKey(0, 0, 0), packCellKey(0, 0, 1)]);
    s.evict(packCellKey(0, 1, 0));
    expect(removed).toContain(packCellKey(0, 1, 0));
    w.dispose();
  });
});
