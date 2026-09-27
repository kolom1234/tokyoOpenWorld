// 초기화 전 백엔드·깊이 기능 예측: WebGPU 어댑터 유무, WebGL2 EXT_clip_control(reversed-Z 필요조건). see docs/07-rendering.md §1, ADR-0006
import type { RenderBackend } from '../../api.ts';

export interface BackendProbe {
  /** 예측 백엔드. three가 실제 결정하므로 init 후 renderer.backend로 재확인한다. */
  backend: RenderBackend;
  /** reversed-Z 가능 여부: WebGPU는 항상, WebGL2는 EXT_clip_control 필요(three r186 WebGLBackend). */
  reversedZ: boolean;
}

interface GpuLike {
  requestAdapter(): Promise<unknown>;
}

async function hasWebGpuAdapter(): Promise<boolean> {
  const gpu = (globalThis.navigator as { gpu?: GpuLike } | undefined)?.gpu;
  if (gpu === undefined) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** 임시 캔버스의 WebGL2 컨텍스트로 확장 확인 후 즉시 해제. */
export function webgl2HasClipControl(doc: Document): boolean {
  const gl = doc.createElement('canvas').getContext('webgl2');
  if (gl === null) return false;
  const ok = gl.getExtension('EXT_clip_control') !== null;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return ok;
}

export async function probeBackend(forceWebGL: boolean, doc: Document): Promise<BackendProbe> {
  if (!forceWebGL && (await hasWebGpuAdapter())) return { backend: 'webgpu', reversedZ: true };
  return { backend: 'webgl2', reversedZ: webgl2HasClipControl(doc) };
}
