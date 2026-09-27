// `?debug=1` 전용 stats-gl 패널(동적 import — 기본 번들에 포함하지 않음). see docs/02-tech-stack.md, docs/14-testing-perf.md
import type { FrameHook } from '../loop.ts';

/** 렌더러 연결 전(M00)에는 CPU 프레임 시간·FPS만 추적한다. GPU 타이밍은 render 연결 시(M03) `stats.init(renderer)`. */
export async function createStatsHook(parent: HTMLElement): Promise<FrameHook> {
  const { default: Stats } = await import('stats-gl');
  const stats = new Stats({ trackGPU: false, horizontal: true });
  parent.append(stats.dom);
  return {
    before: () => stats.begin(),
    after: () => {
      stats.end();
      stats.update();
    },
  };
}
