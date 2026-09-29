// 초기화 전 백엔드·깊이 기능 예측: WebGPU 어댑터 유무, WebGL2 EXT_clip_control(reversed-Z 필요조건). see docs/07-rendering.md §1, ADR-0006
import type { RenderBackend } from '../../api.ts';

export interface BackendProbe {
  /** 예측 백엔드. three가 실제 결정하므로 init 후 renderer.backend로 재확인한다. */
  backend: RenderBackend;
  /** reversed-Z 가능 여부: WebGPU는 항상, WebGL2는 EXT_clip_control 필요(three r186 WebGLBackend). */
  reversedZ: boolean;
  /** 소프트웨어 래스터(SwiftShader·llvmpipe — CI·GPU 없는 환경). 후처리·그림자·프로브를 끈다(ADR-0028, M03-T09). */
  software: boolean;
}

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render driver/i;

/** WebGL 렌더러 문자열(WEBGL_debug_renderer_info)로 소프트웨어 래스터 판정. 알 수 없으면 false. */
export function isSoftwareRenderer(rendererString: string | null | undefined): boolean {
  return SOFTWARE_GL.test(rendererString ?? '');
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

/** 임시 캔버스의 WebGL2 컨텍스트로 확장·렌더러 문자열 확인 후 즉시 해제. */
export function probeWebgl2(doc: Document): { clipControl: boolean; software: boolean } {
  const gl = doc.createElement('canvas').getContext('webgl2');
  if (gl === null) return { clipControl: false, software: true };
  const clipControl = gl.getExtension('EXT_clip_control') !== null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? (gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string) : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { clipControl, software: isSoftwareRenderer(name) };
}

export async function probeBackend(forceWebGL: boolean, doc: Document): Promise<BackendProbe> {
  if (!forceWebGL && (await hasWebGpuAdapter())) return { backend: 'webgpu', reversedZ: true, software: false };
  const gl = probeWebgl2(doc);
  return { backend: 'webgl2', reversedZ: gl.clipControl, software: gl.software };
}
