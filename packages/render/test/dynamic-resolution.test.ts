// 동적 해상도(M03-T08): 느리면 즉시 내림, 목표 안에서 2 s 머물면 올려 봄, 올린 직후 넘치면 되돌리고 대기 2배, 범위·끊김 무시.
import { describe, expect, it } from 'vitest';
import { createDynamicResolution } from '../src/internal/renderer/dynamic-resolution.ts';

const run = (d: ReturnType<typeof createDynamicResolution>, dt: number, frames: number): number[] => {
  const changes: number[] = [];
  for (let i = 0; i < frames; i++) {
    const s = d.update(dt);
    if (s !== undefined) changes.push(s);
  }
  return changes;
};

describe('dynamic resolution', () => {
  it('steps down under load to the floor and not below', () => {
    const d = createDynamicResolution(0.85);
    const changes = run(d, 0.03, 600);
    expect(changes[0]).toBe(0.8);
    expect(d.scale).toBe(0.5);
    expect(Math.min(...changes)).toBe(0.5);
  });

  it('probes up when calm, backs off after an overshoot, and ignores hitches', () => {
    const d = createDynamicResolution(0.7);
    expect(run(d, 1 / 60, 60 * 3)).toContain(0.75); // 2 s 안정 → 한 단계 올림
    const s = d.scale;
    run(d, 0.3, 50); // 긴 끊김 → 무시
    expect(d.scale).toBe(s);
    const down = run(d, 0.025, 60);
    expect(down[0]).toBe(s - 0.05);
    const floor = Math.min(...run(d, 1 / 60, 60), d.scale); // EMA 꼬리로 한 번 더 내릴 수 있다
    // 올린 직후 넘쳤으므로 다음 시도는 4 s(2 × 2 s) 안정 뒤에야.
    expect(run(d, 1 / 60, 60 * 3).filter((x) => x > floor)).toEqual([]);
    expect(run(d, 1 / 60, 60 * 2).filter((x) => x > floor).length).toBe(1);
  });

  it('never exceeds 1.0 and resets cleanly', () => {
    const d = createDynamicResolution(1);
    expect(run(d, 1 / 60, 60 * 10)).toEqual([]);
    d.reset(0.6);
    expect(d.scale).toBe(0.6);
  });
});
