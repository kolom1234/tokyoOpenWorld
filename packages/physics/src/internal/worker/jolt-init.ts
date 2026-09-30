// Jolt 초기화(08 §1, ADR-0041): single-thread wasm-compat 빌드(wasm 내장). multithread 빌드는 pthread 워커를 자기 파일로 띄우는데
// Vite가 이를 중첩 워커(iife)로 번들하다 최상위 await에서 빌드가 깨지고, 개발 서버에서도 초기화 ≈ 3 s(single ≈ 50 ms)라 쓰지 않는다.
import type JoltNs from 'jolt-physics';

/** Jolt 모듈(초기화 완료) 타입. */
export type Jolt = typeof JoltNs;
export type JoltBuildName = 'multithread' | 'single';

export interface JoltLoaded {
  Jolt: Jolt;
  build: JoltBuildName;
  initMs: number;
}

type Init = () => Promise<Jolt>;

export async function loadJolt(): Promise<JoltLoaded> {
  const t0 = performance.now();
  const mod = (await import('jolt-physics/wasm-compat')) as unknown as { default: Init };
  return { Jolt: await mod.default(), build: 'single', initMs: performance.now() - t0 };
}
