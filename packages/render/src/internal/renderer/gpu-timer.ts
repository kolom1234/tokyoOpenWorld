// GPU 타이머(M03 성능 표): WebGPU timestamp-query(three `trackTimestamp`)로 렌더 패스 GPU 시간을 모아 프레임당 평균(ms).
// 해석은 비동기(mapAsync) — 이전 해석이 끝난 뒤에만 다음을 요청하고, 그 사이 프레임 수로 나눈다. Chrome 정밀도: `--enable-webgpu-developer-features`(아니면 100 µs 양자화).
// 주의(three r186): `resolveTimestampsAsync()` 반환값은 "마지막 info.frame"의 합뿐이다 — RenderPipeline은 씬 패스·그림자·후처리 쿼드가 서로 다른
// frame id라 쿼드(≈ 0.1 ms)만 잡힌다 → 풀의 `timestamps`(해석 묶음의 모든 패스, uid → ms)를 직접 합산한다.
// 패스별(M03 보강 2): uid = `r:<프레임 안 렌더 호출 순번>:<컨텍스트>:f<frame>` → 순번별 평균. 이름은 renderer.render를 감싸 순번마다 기록(켰을 때만).
import type { Camera, Object3D, WebGPURenderer } from 'three/webgpu';
import type { GpuPassTime } from '../../api.ts';

/** 이동 평균 창(프레임 수 기준 표본 가중). */
const WINDOW = 120;
const UID = /^r:(\d+):/;

export interface GpuTimerStats {
  enabled: boolean;
  /** 최근 표본 평균 프레임당 GPU ms(렌더 패스 합, 컴퓨트 제외). 표본 없으면 0. */
  frameMs: number;
  /** 해석한 표본(프레임 묶음) 수. */
  samples: number;
  /** 렌더 호출 순번별 평균(창 전체). */
  passes: GpuPassTime[];
}

export interface GpuTimer {
  afterFrame(): void;
  stats(): GpuTimerStats;
  reset(): void;
}

interface PoolLike {
  timestampQueryPool?: { render?: { timestamps?: Map<string, number> } };
}

interface Sample {
  ms: number;
  frames: number;
  byIndex: Map<number, number>;
}

/** 마지막 해석 묶음: 총합 + 순번별 합(ms). */
function readPool(renderer: WebGPURenderer): { ms: number; byIndex: Map<number, number> } {
  const ts = (renderer.backend as unknown as PoolLike).timestampQueryPool?.render?.timestamps;
  const byIndex = new Map<number, number>();
  let ms = 0;
  for (const [uid, v] of ts ?? []) {
    ms += v;
    const i = Number(UID.exec(uid)?.[1] ?? -1);
    byIndex.set(i, (byIndex.get(i) ?? 0) + v);
  }
  return { ms, byIndex };
}

function labelOf(obj: Object3D, camera: Camera): string {
  const quad = (obj as { isQuadMesh?: boolean }).isQuadMesh === true;
  if (quad) return `quad:${obj.name || '?'}`;
  if ((camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true) return 'shadow';
  return obj.name || obj.type;
}

/** renderer.render를 감싸 프레임 안 순번 → 이름을 기록(순번은 three가 호출 전에 올린다 — uid와 같은 값). */
function trackLabels(renderer: WebGPURenderer): Map<number, string> {
  const labels = new Map<number, string>();
  const render = renderer.render.bind(renderer);
  renderer.render = (obj: Object3D, camera: Camera) => {
    labels.set(renderer.info.render.frameCalls + 1, labelOf(obj, camera));
    return render(obj, camera);
  };
  return labels;
}

function summarize(window: readonly Sample[], labels: ReadonlyMap<number, string>): GpuTimerStats['passes'] {
  let frames = 0;
  const sum = new Map<number, number>();
  for (const w of window) {
    frames += w.frames;
    for (const [i, v] of w.byIndex) sum.set(i, (sum.get(i) ?? 0) + v);
  }
  return [...sum]
    .sort((a, b) => a[0] - b[0])
    .map(([index, ms]) => ({ index, label: labels.get(index) ?? '?', ms: frames > 0 ? ms / frames : 0 }));
}

export function createGpuTimer(renderer: WebGPURenderer, enabled: boolean): GpuTimer {
  let pending = false;
  let framesSince = 0;
  let samples = 0;
  const window: Sample[] = [];
  const labels = enabled ? trackLabels(renderer) : new Map<number, string>();
  const push = (s: Sample): void => {
    window.push(s);
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
          const r = readPool(renderer);
          if (r.ms > 0) push({ ...r, frames });
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
      return {
        enabled,
        frameMs: frames > 0 ? ms / frames : 0,
        samples,
        passes: enabled ? summarize(window, labels) : [],
      };
    },
    reset() {
      window.length = 0;
      samples = 0;
    },
  };
}
