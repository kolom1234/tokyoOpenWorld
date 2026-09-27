// render 기본 설정(07 §1 깊이·원평면, 01-architecture §7 원점 재설정). 오버라이드는 createRender deps.config → mergeConfig.
import type { RenderConfig } from '../api.ts';

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  backend: 'auto',
  farM: 60_000,
  maxPixelRatio: 2,
  rebaseDistanceM: 2048,
  rebaseGridM: 256,
};
