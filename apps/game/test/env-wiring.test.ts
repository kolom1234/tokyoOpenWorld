import { describe, expect, it } from 'vitest';
import { createEnvWiring, defaultClock } from '../src/wiring/env.ts';

describe('env wiring', () => {
  it('starts the default clock at today 12:00 JST, 1×', () => {
    const now = Date.parse('2026-09-29T23:30:00+09:00');
    const c = defaultClock(now);
    expect(c).toEqual({ kind: 'custom', startMs: Date.parse('2026-09-29T12:00:00+09:00'), scale: 1 });
    // 자정 직후(JST)도 그날 정오.
    expect(defaultClock(Date.parse('2026-09-30T00:10:00+09:00'))).toMatchObject({
      startMs: Date.parse('2026-09-30T12:00:00+09:00'),
    });
  });

  it('pushes sim.environment() to render each frame before renderPrep', () => {
    const env = { sunDirWF: { x: 0, y: 1, z: 0 } } as never;
    const got: unknown[] = [];
    const sys = createEnvWiring({ environment: () => env } as never, { setEnvironment: (e) => got.push(e) });
    expect(sys.phase).toBeGreaterThan(65);
    expect(sys.phase).toBeLessThan(70);
    sys.update({} as never);
    expect(got).toEqual([env]);
  });
});
