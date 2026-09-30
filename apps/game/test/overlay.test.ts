// 디버그 오버레이 문구(FPS·백엔드·카메라 WF·고도·원점 재설정 횟수).
import type { RenderStats } from '@sanpo/render';
import type { StreamingStats } from '@sanpo/streaming';
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
      hlodParents: 3,
      hlodFading: 1,
      materials: { state: 'ready', layers: 32, downloadBytes: 20_500_000, gpuBytes: 64_000_000, loadMs: 900 },
      gpu: { enabled: false, frameMs: 0, samples: 0, passes: [] },
      post: null,
      exposure: null,
      quality: { tier: 'high', renderScale: 0.85, dynamic: true, frameMs: 16.7 },
      shadows: null,
      props: { instances: 1200, visible: 800, pools: 14, rebuilds: 3 },
    };
    const t = { camera: { posWF: { x: -60, y: 75.4, z: -15 } }, hud: { speedKmh: 54 } } as unknown as TraversalService;
    const lines = describeDebug(stats, 59.94, t, 15.4);
    expect(lines[0]).toBe('FPS 59.9 (16.7 ms)');
    expect(lines[1]).toBe('백엔드 WebGL2 · 깊이 reversed-z');
    expect(lines[2]).toBe('카메라 WF x -60.00  y 75.40  z -15.00');
    expect(lines[3]).toBe('고도 T.P. 75.4 m · 지면 위 60.0 m · 54.0 km/h');
    expect(lines[4]).toBe('원점 (4096, 0, 0) · 재설정 2회');
    expect(lines[5]).toBe('셀 4 · draw 9 · tris 230,499');
    expect(lines[7]).toBe('머티리얼 ready · 32층 · 20.5 MB → GPU 64.0 MB · 900 ms');
    expect(describeDebug(stats, 0, t, undefined)[3]).toContain('지면 미적재');
    expect(lines[6]).toContain('월드 로드 전');
    const st = {
      residentByLevel: [9, 4, 2, 1],
      queued: 3,
      fetching: 2,
      decoding: 1,
      failures: 0,
    } as unknown as StreamingStats;
    expect(describeDebug(stats, 60, t, 15.4, st)[6]).toBe(
      '스트리밍 상주 L0 9 · L1 4 · L2 2 · L3 1 · 대기 3 · fetch 2 · 디코드 1 · 실패 0 · HLOD 부모 3 · 페이드 1',
    );
    expect(REBASE_TEST_OFFSET_M).toBeGreaterThanOrEqual(2 * 2048);
  });
});
