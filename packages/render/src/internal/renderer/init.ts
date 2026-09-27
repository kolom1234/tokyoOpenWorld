// WebGPURenderer 초기화(WebGL2 폴백) + 깊이 전략 결정(reversed-Z 우선, 불가 시 logarithmic — ADR-0006). see docs/07-rendering.md §1
import type { Logger } from '@sanpo/core';
import { AgXToneMapping, SRGBColorSpace, WebGPURenderer } from 'three/webgpu';
import type { DepthMode, RenderBackend, RenderConfig } from '../../api.ts';
import { probeBackend } from './backend-caps.ts';

export interface InitializedRenderer {
  renderer: WebGPURenderer;
  backend: RenderBackend;
  depth: DepthMode;
}

/** 초기화 후 실제 상태에서 깊이 모드를 읽는다(예측과 다르면 three가 폴백한 것). */
export function resolveDepthMode(r: { reversedDepthBuffer: boolean; logarithmicDepthBuffer: boolean }): DepthMode {
  if (r.reversedDepthBuffer) return 'reversed-z';
  return r.logarithmicDepthBuffer ? 'logarithmic' : 'standard';
}

export async function initRenderer(
  canvas: HTMLCanvasElement,
  cfg: Readonly<RenderConfig>,
  log: Logger,
): Promise<InitializedRenderer> {
  const forceWebGL = cfg.backend === 'webgl';
  const probe = await probeBackend(forceWebGL, canvas.ownerDocument);
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    forceWebGL,
    reversedDepthBuffer: probe.reversedZ,
    logarithmicDepthBuffer: !probe.reversedZ,
  });
  await renderer.init();
  renderer.toneMapping = AgXToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const backend: RenderBackend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2';
  const depth = resolveDepthMode(renderer);
  if (backend !== probe.backend || (probe.reversedZ && depth !== 'reversed-z')) {
    log.warn('backend/depth differs from probe', { probe, backend, depth });
  }
  log.info('renderer', { backend, depth });
  return { renderer, backend, depth };
}
