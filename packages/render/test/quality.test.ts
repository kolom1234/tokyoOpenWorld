// 품질 관리자(M03-T08): detect-gpu 매핑, 버스 양방향(되먹임 없음), 60프레임 측정 뒤 한 단계 강등, WebGL2 상한.
import { createEventBus, createLogger, type QualityTier } from '@sanpo/core';
import { describe, expect, it, vi } from 'vitest';
import { createQualityManager, tierFromDetect } from '../src/internal/quality.ts';

const log = createLogger({ level: 'error' });

function rig(dynamic = true, backend: 'webgpu' | 'webgl2' = 'webgpu', initial: QualityTier = 'high') {
  const bus = createEventBus(log);
  const tiers: QualityTier[] = [];
  const scales: number[] = [];
  const emitted: QualityTier[] = [];
  bus.on('quality/changed', ({ tier }) => emitted.push(tier));
  const q = createQualityManager({
    bus,
    log,
    backend,
    initial,
    dynamic,
    benchmarksPath: '/detect-gpu/',
    applyTier: (t) => {
      tiers.push(t);
      return 0.85;
    },
    applyScale: (s) => scales.push(s),
  });
  return { bus, q, tiers, scales, emitted };
}

describe('quality manager', () => {
  it('maps detect-gpu tiers and caps WebGL2 at medium', () => {
    expect([0, 1, 2, 3].map((t) => tierFromDetect(t, 'webgpu'))).toEqual(['low', 'low', 'medium', 'high']);
    expect(tierFromDetect(3, 'webgl2')).toBe('medium');
    expect(rig(true, 'webgl2', 'ultra').q.tier).toBe('medium');
  });

  it('applies bus changes without echoing, and emits its own changes', () => {
    const r = rig();
    r.bus.emit('quality/changed', { tier: 'low' });
    expect(r.q.tier).toBe('low');
    expect(r.tiers).toEqual(['low']);
    expect(r.emitted).toEqual(['low']); // 버스에서 온 것 1건뿐(재방출 없음)
    r.q.setTier('ultra');
    expect(r.emitted).toEqual(['low', 'ultra']);
    r.q.setTier('ultra');
    expect(r.tiers).toEqual(['low', 'ultra']);
  });

  it('steps down one tier when dynamic resolution bottoms out and frames stay slow', () => {
    const r = rig();
    r.q.setTier('ultra'); // 측정 시작(초기 high → ultra)
    for (let i = 0; i < 2000; i++) r.q.onFrame(0.03);
    expect(r.scales).toContain(0.5);
    // 바닥에서도 느리면 한 단계씩(ultra → high → medium → low), 매번 동적 해상도가 다시 바닥에 닿은 뒤.
    expect(r.emitted).toEqual(['ultra', 'high', 'medium', 'low']);
    expect(r.q.stats().frameMs).toBeGreaterThan(25);
  });

  it('does not step down without dynamic resolution', () => {
    const r = rig(false);
    r.q.setTier('ultra');
    const spy = vi.fn();
    r.bus.on('quality/changed', spy);
    for (let i = 0; i < 500; i++) r.q.onFrame(0.03);
    expect(spy).not.toHaveBeenCalled();
    expect(r.scales).toEqual([]);
  });
});
