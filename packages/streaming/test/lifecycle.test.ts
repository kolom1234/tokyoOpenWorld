// 셀 상태기계: 전이·ack(render만 live)·보류 payload FIFO·해제·failed 재요청 시각·정리. see docs/06-world-streaming.md §2
import { packCellKey } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { createLifecycle } from '../src/internal/lifecycle.ts';
import { synthPayload } from './support/sim.ts';

const A = packCellKey(0, 0, 0);
const B = packCellKey(0, 1, 0);

describe('createLifecycle', () => {
  it('walks absent → queued → fetching → decoding → ready → (render ack) live → evicting → absent', () => {
    const l = createLifecycle(60_000);
    expect(l.stateOf(A)).toBe('absent');
    expect(l.requestable(A, 0)).toBe(true);
    for (const s of ['queued', 'fetching', 'decoding'] as const) {
      l.stage(A, s);
      expect(l.stateOf(A)).toBe(s);
      expect(l.requestable(A, 0)).toBe(false);
    }
    l.loaded(A, synthPayload(A, 3));
    expect(l.stateOf(A)).toBe('ready');
    expect(l.ack(A, 'render')).toBe(false); // 아직 onReady 전
    expect(l.takeReady(2).map((p) => p.key)).toEqual([A]);
    expect(l.ack(A, 'sim')).toBe(true);
    expect(l.stateOf(A)).toBe('ready');
    expect(l.ack(A, 'render')).toBe(true);
    expect(l.stateOf(A)).toBe('live');
    expect(l.beginEvict(A)).toBe(true);
    expect(l.stateOf(A)).toBe('evicting');
    l.endEvict(A);
    expect(l.stateOf(A)).toBe('absent');
    expect(l.size).toBe(0);
  });

  it('delivers ready payloads FIFO, max n per call, and skips ones evicted before delivery', () => {
    const l = createLifecycle(60_000);
    const C = packCellKey(0, 2, 0);
    for (const k of [A, B, C]) l.loaded(k, synthPayload(k, 3));
    expect(l.pendingReady()).toBe(3);
    expect(l.beginEvict(B)).toBe(false); // 넘기기 전 해제 → onEvicted 대상 아님
    l.endEvict(B);
    expect(l.takeReady(1).map((p) => p.key)).toEqual([A]);
    expect(l.takeReady(5).map((p) => p.key)).toEqual([C]);
    expect(l.pendingReady()).toBe(0);
    expect(l.readyBacklog).toBe(0);
  });

  it('failed cells become requestable after retryAfterMs and are pruned when no longer wanted', () => {
    const l = createLifecycle(60_000);
    l.stage(A, 'fetching');
    l.failed(A, 1000);
    l.stage(B, 'fetching');
    l.failed(B, 1000);
    expect(l.requestable(A, 60_999)).toBe(false);
    expect(l.requestable(A, 61_000)).toBe(true);
    l.pruneFailed(61_000, new Set([A]));
    expect(l.stateOf(A)).toBe('failed');
    expect(l.stateOf(B)).toBe('absent');
  });

  it('cancelled drops only in-flight records; counts and residentByLevel reflect states', () => {
    const l = createLifecycle(60_000);
    l.stage(A, 'queued');
    l.cancelled(A);
    expect(l.stateOf(A)).toBe('absent');
    l.loaded(B, synthPayload(B, 3));
    l.cancelled(B);
    expect(l.stateOf(B)).toBe('ready');
    expect(l.counts().ready).toBe(1);
    expect(l.residentByLevel()).toEqual([1, 0, 0, 0]);
  });
});
