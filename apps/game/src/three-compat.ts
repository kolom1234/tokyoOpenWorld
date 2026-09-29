// Vite alias `three` → 이 모듈(vite.config.ts): three addon(KTX2Loader)·takram 대기는 `three`에서 import하지만 게임은 WebGPU 빌드만 번들한다.
// WebGL 전용 이름 2개만 대체: WebGLCubeRenderTarget → WebGPU CubeRenderTarget(takram SkyEnvironmentNode의 CubeCamera),
// WebGLRenderer → instanceof 검사용 빈 클래스(takram isFloatLinearSupported가 WebGPU 경로로 간다). see ADR-0028
export * from 'three/webgpu';
export { CubeRenderTarget as WebGLCubeRenderTarget } from 'three/webgpu';

/** instanceof 전용 자리표시 — 어떤 렌더러도 이 클래스의 인스턴스가 아니다. */
export class WebGLRenderer {}
