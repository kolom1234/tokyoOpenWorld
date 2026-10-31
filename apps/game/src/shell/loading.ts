// 부팅 상태 → UI 로딩 화면(LoadingModel): StatusView(e2e data-* 속성 — 화면에서는 숨김)를 감싸 같은 호출을 시그널로도 보낸다. 순수 매핑 함수는 테스트.
import type { LoadingModel, Signal } from '@sanpo/ui';
import type { BootStage } from '../boot-progress.ts';
import { type Caps, IsolationMode, WebGpuStatus } from '../caps.ts';
import type { StatusView } from '../status-view.ts';
import type { WorldStatus } from '../world-status.ts';

export const INITIAL_LOADING: LoadingModel = {
  stage: 'caps',
  progress: 0.02,
  detail: null,
  webgpu: null,
  isolated: null,
  error: null,
};

/** 월드 상태 → 단계(오류·미연결은 error). */
export function loadingOfWorld(w: WorldStatus): Partial<LoadingModel> {
  switch (w.kind) {
    case 'ready':
      return { stage: 'manifest', progress: 0.12 };
    case 'loaded':
      return { stage: 'shaders', progress: 0.2 };
    case 'maintenance':
      return { stage: 'maintenance', error: null };
    case 'unconfigured':
    case 'no-build':
      return { stage: 'error', error: `world: ${w.kind}` };
    case 'error':
      return { stage: 'error', error: w.detail };
  }
}

/** 선컴파일·스폰 셀 → 단계·진행(셰이더 20–60 %, 셀 60–95 %). */
export function loadingOfBoot(b: Readonly<BootStage>, live: number): Partial<LoadingModel> {
  if (b.done) return { stage: 'ready', progress: 1, detail: null };
  const p = b.precompile;
  const total = b.spawn?.length ?? 0;
  const cellFrac = total > 0 ? live / total : 0;
  if (p.stage === 'materials')
    return {
      stage: 'shaders',
      progress: 0.25 + 0.35 * (p.total > 0 ? p.done / p.total : 0),
      detail: { key: 'boot.detail.shaders', params: { done: p.done, total: p.total } },
    };
  if (p.stage === 'atmosphere' || p.stage === 'avatar')
    return {
      stage: 'shaders',
      progress: p.stage === 'atmosphere' ? 0.22 : 0.6,
      detail: { key: `boot.detail.${p.stage}` },
    };
  return {
    stage: 'spawn',
    progress: 0.6 + 0.35 * cellFrac,
    detail: total > 0 ? { key: 'boot.detail.cells', params: { done: live, total } } : null,
  };
}

/** StatusView 래퍼: 원래 동작 + 로딩 시그널. */
export function loadingView(view: StatusView, loading: Signal<LoadingModel>): StatusView {
  const patch = (p: Partial<LoadingModel>) => {
    // 오류·점검 화면은 끝 상태 — 뒤따르는 진행 보고로 덮지 않는다.
    const end = loading.peek().stage;
    if ((end === 'error' || end === 'maintenance') && p.stage !== end) return;
    loading.value = { ...loading.peek(), ...p };
  };
  return {
    setCaps(caps: Caps) {
      view.setCaps(caps);
      patch({
        stage: 'manifest',
        progress: 0.08,
        webgpu: caps.webgpu === WebGpuStatus.Available,
        isolated: caps.isolation === IsolationMode.Isolated,
      });
    },
    setWorld(w) {
      view.setWorld(w);
      patch(loadingOfWorld(w));
    },
    setRenderer: (b, d) => view.setRenderer(b, d),
    setRendered(n) {
      view.setRendered(n);
      patch({ stage: 'ready', progress: 1, detail: null });
    },
    setProgress: (t) => view.setProgress(t),
    showError(message) {
      view.showError(message);
      patch({ stage: 'error', error: message });
    },
  };
}
