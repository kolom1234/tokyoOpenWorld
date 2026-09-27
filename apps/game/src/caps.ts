// 기능 감지: WebGPU 어댑터, crossOriginIsolated(SAB), 코어 수 → 격리 모드·디코드 워커 수. see docs/01-architecture.md §2
import { clamp } from '@sanpo/core';

export const WebGpuStatus = {
  /** `navigator.gpu.requestAdapter()`가 어댑터를 반환. */
  Available: 'available',
  /** API는 있으나 어댑터 없음(블록리스트·하드웨어 미지원) → WebGL2 폴백. */
  NoAdapter: 'no-adapter',
  /** `navigator.gpu` 없음(비보안 컨텍스트·미지원 브라우저) → WebGL2 폴백. */
  Unsupported: 'unsupported',
} as const;
export type WebGpuStatus = (typeof WebGpuStatus)[keyof typeof WebGpuStatus];

/** 격리 실패 시 Degraded: SAB 대신 postMessage + Transferable, Jolt 싱글스레드 빌드(01-architecture §2). */
export const IsolationMode = { Isolated: 'isolated', Degraded: 'degraded' } as const;
export type IsolationMode = (typeof IsolationMode)[keyof typeof IsolationMode];

export interface Caps {
  webgpu: WebGpuStatus;
  /** 어댑터 vendor/architecture(있을 때만). 진단 표시용. */
  gpuAdapter: string | undefined;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  isolation: IsolationMode;
  hardwareConcurrency: number;
  /** decode.worker 개수 = clamp(cores − 3, 1, 4) (01-architecture §2). */
  decodeWorkers: number;
}

/** 감지 입력(테스트에서 주입). 전역에서 읽는 기본값은 `capsEnvFromGlobal()`. */
export interface CapsEnv {
  gpu: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string } } | null> } | undefined;
  crossOriginIsolated: boolean;
  hasSharedArrayBuffer: boolean;
  hardwareConcurrency: number | undefined;
}

/** 메인 스레드 외 예약 스레드: main + physics.worker + sim.worker. */
const RESERVED_THREADS = 3;
const MIN_DECODE_WORKERS = 1;
const MAX_DECODE_WORKERS = 4;
/** hardwareConcurrency를 알 수 없을 때의 가정(보수적). */
const FALLBACK_CORES = 2;

export function capsEnvFromGlobal(): CapsEnv {
  const nav = globalThis.navigator as Navigator | undefined;
  return {
    gpu: nav?.gpu,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    hasSharedArrayBuffer: typeof globalThis.SharedArrayBuffer === 'function',
    hardwareConcurrency: nav?.hardwareConcurrency,
  };
}

async function probeWebGpu(gpu: CapsEnv['gpu']): Promise<Pick<Caps, 'webgpu' | 'gpuAdapter'>> {
  if (gpu === undefined) return { webgpu: WebGpuStatus.Unsupported, gpuAdapter: undefined };
  try {
    const adapter = await gpu.requestAdapter();
    if (adapter === null) return { webgpu: WebGpuStatus.NoAdapter, gpuAdapter: undefined };
    const label = [adapter.info?.vendor, adapter.info?.architecture].filter((s) => s !== undefined && s !== '');
    return { webgpu: WebGpuStatus.Available, gpuAdapter: label.length > 0 ? label.join(' / ') : undefined };
  } catch {
    // requestAdapter 거부(정책·드라이버 오류)는 "어댑터 없음"과 같은 폴백 경로.
    return { webgpu: WebGpuStatus.NoAdapter, gpuAdapter: undefined };
  }
}

export async function detectCaps(env: CapsEnv = capsEnvFromGlobal()): Promise<Caps> {
  const cores =
    env.hardwareConcurrency !== undefined && env.hardwareConcurrency > 0 ? env.hardwareConcurrency : FALLBACK_CORES;
  const isolated = env.crossOriginIsolated && env.hasSharedArrayBuffer;
  return {
    ...(await probeWebGpu(env.gpu)),
    crossOriginIsolated: env.crossOriginIsolated,
    sharedArrayBuffer: env.hasSharedArrayBuffer,
    isolation: isolated ? IsolationMode.Isolated : IsolationMode.Degraded,
    hardwareConcurrency: cores,
    decodeWorkers: clamp(cores - RESERVED_THREADS, MIN_DECODE_WORKERS, MAX_DECODE_WORKERS),
  };
}
