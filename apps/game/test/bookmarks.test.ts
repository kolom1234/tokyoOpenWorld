import { describe, expect, it } from 'vitest';
import {
  createGoldenWatch,
  findView,
  GOLDEN_SETTLE_MS,
  type GoldenView,
  isQuiet,
  viewPose,
} from '../src/debug/bookmarks.ts';

const VIEW: GoldenView = {
  id: 'v',
  core: true,
  title: 't',
  purpose: 'p',
  eyeWF: [0, 50, 0],
  lookWF: [0, 50, -100],
  fovDeg: 60,
  time: '2026-05-15T12:00:00+09:00',
  weather: 'clear',
  seed: 1,
};

const quietStats = { queued: 0, fetching: 0, decoding: 0, pendingReady: 0 } as never;

describe('bookmarks', () => {
  it('finds views by id', () => {
    expect(findView({ schema: 1, views: [VIEW] }, 'v')).toBe(VIEW);
    expect(findView({ schema: 1, views: [VIEW] }, 'x')).toBeUndefined();
  });

  it('uses absolute coordinates, or ground + AGL when given', () => {
    const noGround = { groundHeightAt: () => undefined };
    const p = viewPose(VIEW, noGround);
    expect(p.posWF).toEqual({ x: 0, y: 50, z: 0 });
    expect(p.pitchRad).toBeCloseTo(0, 9);
    const agl = viewPose({ ...VIEW, eyeAglM: 10, lookAglM: 10 }, { groundHeightAt: () => 30 });
    expect(agl.posWF.y).toBe(40);
    expect(agl.pitchRad).toBeCloseTo(0, 9);
    // AGL이 있어도 지면을 모르면 절대 좌표 유지.
    expect(viewPose({ ...VIEW, eyeAglM: 10 }, noGround).posWF.y).toBe(50);
  });

  it('is quiet only when streaming queues are empty and no HLOD fade runs', () => {
    expect(isQuiet(undefined, { hlodFading: 0 })).toBe(false);
    expect(isQuiet(quietStats, { hlodFading: 0 })).toBe(true);
    expect(isQuiet(quietStats, { hlodFading: 1 })).toBe(false);
    expect(isQuiet({ ...(quietStats as object), fetching: 1 } as never, { hlodFading: 0 })).toBe(false);
  });

  it('marks ready after the settle time and resets when activity resumes', () => {
    const root = { dataset: {} as Record<string, string> } as HTMLElement;
    let t = 0;
    let fading = 0;
    let extra = true;
    const w = createGoldenWatch({
      root,
      streaming: () => quietStats,
      render: () => ({ hlodFading: fading }),
      extra: () => extra,
      now: () => t,
    });
    const tick = () => w.system.update({} as never);
    tick();
    expect(root.dataset.golden).toBe('loading');
    w.start();
    tick();
    expect(root.dataset.golden).toBe('settling');
    t = GOLDEN_SETTLE_MS - 1;
    tick();
    expect(root.dataset.golden).toBe('settling');
    t = GOLDEN_SETTLE_MS;
    tick();
    expect(root.dataset.golden).toBe('ready');
    fading = 1;
    tick();
    expect(root.dataset.golden).toBe('settling');
    fading = 0;
    extra = false;
    t += 10_000;
    tick();
    expect(root.dataset.golden).toBe('settling');
  });
});
