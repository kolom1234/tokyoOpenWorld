// `?debug=1` 오버레이: FPS·백엔드·깊이·카메라 WF/고도·원점 재설정 횟수 + [O] 원점 재설정 강제 테스트(먼 곳 순간이동 → 복귀). see docs/modules/game.md
import type { GameSystem, GroundQuery, Logger } from '@sanpo/core';
import type { RenderService, RenderStats } from '@sanpo/render';
import type { StreamingStats } from '@sanpo/streaming';
import type { TraversalService } from '@sanpo/traversal';

/** 재설정 거리(2048 m, 01-architecture §7)의 2배 동쪽으로 → 확실히 재설정 2회(갈 때·올 때). */
export const REBASE_TEST_OFFSET_M = 4096;
/** 먼 곳에 머무는 시간(ms) — 빈 화면이 보였다 돌아오는 것을 눈으로 확인할 수 있게. */
export const REBASE_TEST_HOLD_MS = 1000;
export const REBASE_TEST_KEY = 'KeyO';
/** 오버레이 글자 갱신 주기(ms). */
const REFRESH_MS = 250;
/** 01-architecture §5: ui = phase 90. */
const OVERLAY_PHASE = 90;

const BACKEND_LABEL: Readonly<Record<RenderStats['backend'], string>> = { webgpu: 'WebGPU', webgl2: 'WebGL2' };

export interface DebugOverlayDeps {
  parent: HTMLElement;
  render: RenderService;
  /** 월드 로드 뒤에 생긴다(getter). */
  readonly streaming?: { stats(): StreamingStats } | undefined;
  traversal: TraversalService;
  ground: GroundQuery;
  log: Logger;
  /** 단조 시계(ms). FPS는 FrameContext.dtReal(0.1 s 상한)이 아닌 실제 경과로 잰다. */
  now?: () => number;
}

export interface DebugOverlay {
  readonly system: GameSystem;
  /** 원점 재설정 강제: +4096 m 순간이동 → 1 s 후 원위치(같은 yaw·pitch). */
  rebaseTest(): Promise<void>;
  dispose(): void;
}

const fmt = (n: number, d = 1): string => n.toFixed(d).replace('-0.0', '0.0');

/** 스트리밍 한 줄: 레벨별 상주(L0/L1/L2/L3)·진행 중·HLOD 페이드. */
export function describeStreaming(st: StreamingStats | undefined, r: RenderStats): string {
  if (!st) return '스트리밍 대기(월드 로드 전)';
  const [l0, l1, l2, l3] = st.residentByLevel;
  return (
    `스트리밍 상주 L0 ${l0} · L1 ${l1} · L2 ${l2} · L3 ${l3} · 대기 ${st.queued} · fetch ${st.fetching} · 디코드 ${st.decoding} · ` +
    `실패 ${st.failures} · HLOD 부모 ${r.hlodParents} · 페이드 ${r.hlodFading}`
  );
}

export function describeDebug(
  s: RenderStats,
  fps: number,
  t: TraversalService,
  groundY: number | undefined,
  st?: StreamingStats,
): string[] {
  const p = t.camera.posWF;
  const agl = groundY === undefined ? '지면 미적재' : `지면 위 ${fmt(p.y - groundY)} m`;
  const o = s.renderOriginWF;
  return [
    `FPS ${fmt(fps)} (${fmt(fps > 0 ? 1000 / fps : 0)} ms)`,
    `백엔드 ${BACKEND_LABEL[s.backend]} · 깊이 ${s.depth}`,
    `카메라 WF x ${fmt(p.x, 2)}  y ${fmt(p.y, 2)}  z ${fmt(p.z, 2)}`,
    `고도 T.P. ${fmt(p.y)} m · ${agl} · ${fmt(t.hud.speedKmh ?? 0)} km/h`,
    `원점 (${o.x}, ${o.y}, ${o.z}) · 재설정 ${s.originRebases}회`,
    `셀 ${s.cells} · draw ${s.drawCalls} · tris ${s.triangles.toLocaleString('en-US')}`,
    describeStreaming(st, s),
    `[클릭] 마우스 잠금 · WASD 이동 · E/Q 상승/하강 · 휠 속도 · Shift ×4 · [O] 원점 재설정 테스트`,
  ];
}

/** e2e용 `data-*`. */
function writeDataset(el: HTMLElement, s: RenderStats): void {
  el.dataset.backend = s.backend;
  el.dataset.depth = s.depth;
  el.dataset.cells = String(s.cells);
  el.dataset.frames = String(s.frames);
  el.dataset.rebases = String(s.originRebases);
}

export function createDebugOverlay(deps: DebugOverlayDeps): DebugOverlay {
  const { render, traversal } = deps;
  const log = deps.log.child('debug');
  const el = deps.parent.ownerDocument.createElement('pre');
  el.className = 'debug-overlay';
  deps.parent.append(el);
  const now = deps.now ?? (() => performance.now());
  let windowStart = now();
  let frames = 0;
  let fps = 0;
  let busy = false;

  const refresh = (): void => {
    const s = render.stats();
    const p = traversal.camera.posWF;
    const st = deps.streaming?.stats();
    el.textContent = describeDebug(s, fps, traversal, deps.ground.groundHeightAt(p.x, p.z), st).join('\n');
    writeDataset(el, s);
  };

  const rebaseTest = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    const home = { ...traversal.camera.posWF };
    const yaw = traversal.player.yawRad;
    log.info('rebase test: away', REBASE_TEST_OFFSET_M, 'm');
    await traversal.teleport({ ...home, x: home.x + REBASE_TEST_OFFSET_M }, yaw);
    await new Promise((r) => setTimeout(r, REBASE_TEST_HOLD_MS));
    await traversal.teleport(home, yaw);
    log.info('rebase test: back', render.stats().originRebases, 'rebases');
    busy = false;
  };

  const win = deps.parent.ownerDocument.defaultView;
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === REBASE_TEST_KEY && !e.repeat) void rebaseTest();
  };
  win?.addEventListener('keydown', onKey);

  const system: GameSystem = {
    id: 'debug/overlay',
    phase: OVERLAY_PHASE,
    update() {
      frames++;
      const t = now();
      if (t - windowStart < REFRESH_MS) return;
      fps = (frames * 1000) / (t - windowStart);
      windowStart = t;
      frames = 0;
      refresh();
    },
    dispose() {
      win?.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
  refresh();
  return { system, rebaseTest, dispose: () => system.dispose() };
}
