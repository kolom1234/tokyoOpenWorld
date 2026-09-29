// GPU 타이머(M03 성능 표): WebGPU timestamp-query(three `trackTimestamp`)로 렌더 패스 GPU 시간을 모아 프레임당 평균(ms).
// 해석은 비동기(mapAsync) — 이전 해석이 끝난 뒤에만 다음을 요청하고, 그 사이 프레임 수로 나눈다. Chrome 정밀도: `--enable-webgpu-developer-features`(아니면 100 µs 양자화).
// 주의(three r186): `resolveTimestampsAsync()` 반환값은 "마지막 info.frame"의 합뿐이다 — RenderPipeline은 씬 패스·그림자·후처리 쿼드가 서로 다른
// frame id라 쿼드(≈ 0.1 ms)만 잡힌다 → 풀의 `timestamps`(해석 묶음의 모든 패스, uid → ms)를 직접 합산한다.
import type { WebGPURenderer } from 'three/webgpu';

/** 이동 평균 창(프레임 수 기준 표본 가중). */
const WINDOW = 120;

export interface GpuTimerStats {
  enabled: boolean;
  /** 최근 표본 평균 프레임당 GPU ms(렌더 패스 합, 컴퓨트 제외). 표본 없으면 0. */
  frameMs: number;
  /** 해석한 표본(프레임 묶음) 수. */
  samples: number;
}

export interface GpuTimer {
  afterFrame(): void;
  stats(): GpuTimerStats;
  reset(): void;
}

interface PoolLike {
  timestampQueryPool?: { render?: { timestamps?: Map<string, number> } };
}

/** 마지막 해석 묶음의 모든 렌더 패스 GPU 시간 합(ms). */
function sumPool(renderer: WebGPURenderer): number {
  const ts = (renderer.backend as unknown as PoolLike).timestampQueryPool?.render?.timestamps;
  let ms = 0;
  for (const v of ts?.values() ?? []) ms += v;
  return ms;
}

export function createGpuTimer(renderer: WebGPURenderer, enabled: boolean): GpuTimer {
  let pending = false;
  let framesSince = 0;
  let samples = 0;
  const window: { ms: number; frames: number }[] = [];
  const push = (ms: number, frames: number): void => {
    window.push({ ms, frames });
    let n = 0;
    for (const w of window) n += w.frames;
    while (window.length > 1 && n - (window[0]?.frames ?? 0) >= WINDOW) n -= window.shift()?.frames ?? 0;
    samples++;
  };
  return {
    afterFrame() {
      if (!enabled) return;
      framesSince++;
      if (pending) return;
      pending = true;
      const frames = framesSince;
      framesSince = 0;
      void renderer
        .resolveTimestampsAsync('render')
        .then(() => {
          const ms = sumPool(renderer);
          if (ms > 0) push(ms, frames);
        })
        .finally(() => {
          pending = false;
        });
    },
    stats() {
      let ms = 0;
      let frames = 0;
      for (const w of window) {
        ms += w.ms;
        frames += w.frames;
      }
      return { enabled, frameMs: frames > 0 ? ms / frames : 0, samples };
    },
    reset() {
      window.length = 0;
      samples = 0;
    },
  };
}
