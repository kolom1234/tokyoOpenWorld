// 부트 상태 화면: 기능 감지·월드 상태를 표로 표시(+ e2e용 data-* 속성). HUD는 @sanpo/ui로 대체(M08). see docs/modules/game.md
import { type Caps, IsolationMode, WebGpuStatus } from './caps.ts';
import type { WorldStatus } from './world-status.ts';

export type RowState = 'ok' | 'warn' | 'bad';
export interface StatusRow {
  key: string;
  label: string;
  value: string;
  state: RowState;
}

const WEBGPU_TEXT: Readonly<Record<WebGpuStatus, string>> = {
  available: '사용 가능',
  'no-adapter': '어댑터 없음 → WebGL2 폴백',
  unsupported: '미지원 → WebGL2 폴백',
};

export function describeCaps(caps: Caps): StatusRow[] {
  const gpuOk = caps.webgpu === WebGpuStatus.Available;
  return [
    {
      key: 'isolated',
      label: 'crossOriginIsolated',
      value: String(caps.crossOriginIsolated),
      state: caps.crossOriginIsolated ? 'ok' : 'bad',
    },
    {
      key: 'webgpu',
      label: 'WebGPU',
      value: gpuOk && caps.gpuAdapter ? `${WEBGPU_TEXT[caps.webgpu]} (${caps.gpuAdapter})` : WEBGPU_TEXT[caps.webgpu],
      state: gpuOk ? 'ok' : 'warn',
    },
    {
      key: 'sab',
      label: 'SharedArrayBuffer',
      value: caps.isolation === IsolationMode.Isolated ? '사용 가능' : '불가 → Degraded 모드',
      state: caps.isolation === IsolationMode.Isolated ? 'ok' : 'warn',
    },
    {
      key: 'cores',
      label: 'CPU 스레드',
      value: `${caps.hardwareConcurrency} (디코드 워커 ${caps.decodeWorkers})`,
      state: 'ok',
    },
  ];
}

export function describeWorld(world: WorldStatus | undefined): StatusRow {
  const row = (value: string, state: RowState): StatusRow => ({ key: 'world', label: '월드 데이터', value, state });
  if (world === undefined) return row('확인 중…', 'warn');
  switch (world.kind) {
    case 'ready':
      return row(`빌드 ${world.buildId} (로드 중…)`, 'warn');
    case 'loaded': {
      const src = world.source === 'fixture' ? 'world-mini 픽스처' : 'R2';
      return row(`빌드 ${world.buildId} · ${src} · 셀 ${world.cells}/${world.indexed} 로드`, 'ok');
    }
    case 'unconfigured':
      return row('준비 중 (저장소 미연결)', 'warn');
    case 'no-build':
      return row('활성 빌드 없음', 'warn');
    case 'error':
      return row(`오류: ${world.detail}`, 'bad');
  }
}

/** 렌더러 행: 초기화된 백엔드·깊이 전략(ADR-0006)과 화면에 올린 셀 수. */
export function describeRenderer(backend: string, depth: string, cells: number | undefined): StatusRow {
  const label = backend === 'webgpu' ? 'WebGPU' : 'WebGL2';
  const shown = cells === undefined ? '' : ` · 셀 ${cells} 표시`;
  return { key: 'renderer', label: '렌더러', value: `${label} · 깊이 ${depth}${shown}`, state: 'ok' };
}

export interface StatusView {
  setCaps(caps: Caps): void;
  setWorld(world: WorldStatus): void;
  setRenderer(backend: string, depth: string): void;
  /** 렌더에 추가한 셀 수(e2e: `data-rendered-cells`). */
  setRendered(cells: number): void;
  showError(message: string): void;
}

function rowElements(doc: Document, r: StatusRow): HTMLElement[] {
  const dt = doc.createElement('dt');
  dt.textContent = r.label;
  const dd = doc.createElement('dd');
  dd.textContent = r.value;
  dd.dataset.key = r.key;
  dd.dataset.state = r.state;
  return [dt, dd];
}

/** root 내용을 교체한다. 텍스트는 모두 textContent로 넣는다(HTML 주입 없음). */
export function mountStatusView(root: HTMLElement): StatusView {
  const doc = root.ownerDocument;
  const title = doc.createElement('h1');
  title.textContent = 'TOKYO SANPO';
  const note = doc.createElement('p');
  note.className = 'note';
  note.textContent = 'M01 — 기능 감지·월드 로드 상태';
  const list = doc.createElement('dl');
  list.className = 'caps';
  root.replaceChildren(title, note, list);

  let rows: StatusRow[] = [];
  let world: WorldStatus | undefined;
  let renderer: { backend: string; depth: string; cells?: number } | undefined;
  const render = (): void => {
    const r0 = renderer ? [describeRenderer(renderer.backend, renderer.depth, renderer.cells)] : [];
    list.replaceChildren(...[...rows, ...r0, describeWorld(world)].flatMap((r) => rowElements(doc, r)));
  };
  render();

  return {
    setCaps(caps) {
      rows = describeCaps(caps);
      root.dataset.isolated = String(caps.crossOriginIsolated);
      root.dataset.webgpu = caps.webgpu;
      render();
    },
    setWorld(w) {
      world = w;
      root.dataset.world = w.kind;
      if (w.kind === 'loaded') {
        root.dataset.worldSource = w.source;
        root.dataset.worldCells = String(w.cells);
      }
      render();
    },
    setRenderer(backend, depth) {
      renderer = { backend, depth };
      root.dataset.backend = backend;
      render();
    },
    setRendered: (n) => {
      if (renderer) renderer.cells = n;
      root.dataset.renderedCells = String(n);
      render();
    },
    showError(message) {
      const err = doc.createElement('pre');
      err.className = 'error';
      err.textContent = message;
      root.dataset.error = 'true';
      root.append(err);
    },
  };
}
