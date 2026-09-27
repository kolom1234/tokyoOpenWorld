// 디버그 오버레이 문구(FPS·백엔드·카메라 WF·고도·원점 재설정 횟수).
import type { RenderStats } from '@sanpo/render';
import type { TraversalService } from '@sanpo/traversal';
import { describe, expect, it } from 'vitest';
import { describeDebug, REBASE_TEST_OFFSET_M } from '../src/debug/overlay.ts';

describe('describeDebug', () => {
  it('shows backend, depth, camera WF, altitude above ground and the rebase count', () => {
    const stats: RenderStats = {
      backend: 'webgl2',
      depth: 'reversed-z',
      frames: 10,
      drawCalls: 9,
      triangles: 230499,
      cells: 4,
      originRebases: 2,
      renderOriginWF: { x: 4096, y: 0, z: 0 },
    };
    const t = { camera: { posWF: { x: -60, y: 75.4, z: -15 } }, hud: { speedKmh: 54 } } as unknown as TraversalService;
    const lines = describeDebug(stats, 59.94, t, 15.4);
    expect(lines[0]).toBe('FPS 59.9 (16.7 ms)');
    expect(lines[1]).toBe('백엔드 WebGL2 · 깊이 reversed-z');
    expect(lines[2]).toBe('카메라 WF x -60.00  y 75.40  z -15.00');
    expect(lines[3]).toBe('고도 T.P. 75.4 m · 지면 위 60.0 m · 54.0 km/h');
    expect(lines[4]).toBe('원점 (4096, 0, 0) · 재설정 2회');
    expect(lines[5]).toBe('셀 4 · draw 9 · tris 230,499');
    expect(describeDebug(stats, 0, t, undefined)[3]).toContain('지면 미적재');
    expect(REBASE_TEST_OFFSET_M).toBeGreaterThanOrEqual(2 * 2048);
  });
});
