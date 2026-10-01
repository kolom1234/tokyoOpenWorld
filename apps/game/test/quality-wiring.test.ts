// 품질 배선(M03-T08): 저장된 티어 우선, 없으면 첫 표시 뒤 감지, 변경마다 저장, 고정(?quality·골든)은 손대지 않음.
import { createEventBus, createLogger, type QualityTier } from '@sanpo/core';
import { describe, expect, it, vi } from 'vitest';
import { loadTier, QUALITY_STORAGE_KEY, startQualityWiring } from '../src/wiring/quality.ts';

const log = createLogger({ level: 'error' });

function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe('quality wiring', () => {
  it('detects once when nothing is stored and saves the result and later changes', async () => {
    const storage = memStorage();
    const bus = createEventBus(log);
    const detectQuality = vi.fn(async (): Promise<QualityTier> => 'medium');
    const timers: (() => void)[] = [];
    let idle = false;
    const q = startQualityWiring({
      render: { detectQuality },
      bus,
      log,
      storage,
      fixed: false,
      streamingIdle: () => idle,
      setTimer: (fn) => timers.push(fn),
    });
    // 스트리밍이 바쁘면 기다린다.
    for (let i = 0; i < 3; i++) (timers.shift() as () => void)();
    expect(detectQuality).not.toHaveBeenCalled();
    expect(q.settled).toBe(false);
    idle = true;
    for (let i = 0; i < 2; i++) (timers.shift() as () => void)();
    await Promise.resolve();
    await Promise.resolve();
    expect(detectQuality).toHaveBeenCalledTimes(1);
    expect(loadTier(storage)).toBe('medium');
    await Promise.resolve();
    expect(q.settled).toBe(true);
    bus.emit('quality/changed', { tier: 'low' });
    expect(storage.getItem(QUALITY_STORAGE_KEY)).toBe('low');
  });

  it('skips detection when a tier is stored or the tier is fixed', () => {
    const detectQuality = vi.fn(async (): Promise<QualityTier> => 'high');
    const bus = createEventBus(log);
    const stored = startQualityWiring({
      render: { detectQuality },
      bus,
      log,
      storage: memStorage({ [QUALITY_STORAGE_KEY]: 'low' }),
      fixed: false,
    });
    const fixed = startQualityWiring({ render: { detectQuality }, bus, log, storage: memStorage(), fixed: true });
    expect(detectQuality).not.toHaveBeenCalled();
    expect([stored.settled, fixed.settled]).toEqual([true, true]);
    expect(loadTier(memStorage({ [QUALITY_STORAGE_KEY]: 'bogus' }))).toBeUndefined();
    expect(loadTier(undefined)).toBeUndefined();
  });
});
