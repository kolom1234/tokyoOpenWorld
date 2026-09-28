// 골든뷰 북마크(`?view=<id>`, M03-T10): tests/golden/views.json의 고정 시점·시각·날씨·시드 → 시작 포즈·부팅 대기 중심,
// 화면이 안정되면(스트리밍 큐 0·HLOD 페이드 0·추가 조건이 settleMs 동안 유지) `#app[data-golden=ready]`. see docs/14-testing-perf.md §3, tests/golden/README.md
import type { GameSystem, GroundQuery, Vec3d } from '@sanpo/core';
import type { RenderStats } from '@sanpo/render';
import type { StreamingStats } from '@sanpo/streaming';
import { type FreecamParams, lookAtAngles } from '@sanpo/traversal';

export type GoldenWeather = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow';

export interface GoldenView {
  id: string;
  /** true = 태스크마다 before/after를 캡처하는 기본 4장. */
  core: boolean;
  title: string;
  purpose: string;
  /** WF 절대 좌표(TP m). eyeAglM이 있으면 y 대신 지면 + eyeAglM(부팅 대기 후 L0 높이장). */
  eyeWF: [number, number, number];
  lookWF: [number, number, number];
  eyeAglM?: number;
  /** 있으면 lookWF y 대신 (look xz 지면, 없으면 eye 지면) + lookAglM. */
  lookAglM?: number;
  fovDeg: number;
  /** ISO 8601(JST 오프셋 포함). sim 시계(M03-T03)가 소비. */
  time: string;
  weather: GoldenWeather;
  /** 군중·교통 결정론 시드(M06~). */
  seed: number;
}

export interface GoldenViewsFile {
  schema: 1;
  views: GoldenView[];
}

/** 화면 안정 판정 유지 시간(ms): 큐가 비고 HLOD 페이드(0.3 s)가 끝난 뒤 이만큼 변화가 없어야 한다. */
export const GOLDEN_SETTLE_MS = 1500;
/** 01-architecture §5: ui = phase 90. */
const GOLDEN_PHASE = 90;

export function findView(file: GoldenViewsFile, id: string): GoldenView | undefined {
  return file.views.find((v) => v.id === id);
}

/** 번들에 views.json을 넣지 않도록 `?view=`일 때만 동적 import(별도 청크). */
export async function loadGoldenView(id: string): Promise<GoldenView | undefined> {
  const mod = (await import('../../../../tests/golden/views.json')) as unknown as { default: GoldenViewsFile };
  return findView(mod.default, id);
}

const vec = (a: readonly [number, number, number]): Vec3d => ({ x: a[0], y: a[1], z: a[2] });

export function viewCenterWF(v: GoldenView): Vec3d {
  return vec(v.eyeWF);
}

export function viewPose(v: GoldenView, ground: GroundQuery): FreecamParams {
  const posWF = vec(v.eyeWF);
  const look = vec(v.lookWF);
  const eyeGround = ground.groundHeightAt(posWF.x, posWF.z);
  if (v.eyeAglM !== undefined && eyeGround !== undefined) posWF.y = eyeGround + v.eyeAglM;
  if (v.lookAglM !== undefined) {
    const g = ground.groundHeightAt(look.x, look.z) ?? eyeGround;
    if (g !== undefined) look.y = g + v.lookAglM;
  }
  return { posWF, ...lookAtAngles(posWF, look) };
}

/** 안정 판정 입력: 스트리밍 진행 중 작업이 없고 HLOD 페이드가 끝났는가. */
export function isQuiet(st: StreamingStats | undefined, r: Pick<RenderStats, 'hlodFading'>): boolean {
  if (st === undefined) return false;
  return st.queued + st.fetching + st.decoding + st.pendingReady === 0 && r.hlodFading === 0;
}

export interface GoldenWatchDeps {
  root: HTMLElement;
  streaming: () => StreamingStats | undefined;
  render: () => Pick<RenderStats, 'hlodFading'>;
  /** 추가 안정 조건(텍스처 적재·노출 수렴 등 — 각 태스크가 추가). */
  extra?: () => boolean;
  now?: () => number;
  settleMs?: number;
}

/**
 * 시작 신호(`start()` — 북마크 포즈 적용 후) 이후 조용한 상태가 settleMs 동안 이어지면 `data-golden=ready`(한 번 뒤엔 조용함이 깨지면 다시 `settling`).
 * 캡처 스크립트는 ready를 기다린 뒤 찍는다.
 */
export function createGoldenWatch(d: GoldenWatchDeps): { system: GameSystem; start(): void } {
  const now = d.now ?? (() => performance.now());
  const settleMs = d.settleMs ?? GOLDEN_SETTLE_MS;
  let started = false;
  let quietSince: number | undefined;
  d.root.dataset.golden = 'loading';
  return {
    start() {
      started = true;
      d.root.dataset.golden = 'settling';
    },
    system: {
      id: 'goldenWatch',
      phase: GOLDEN_PHASE,
      update() {
        if (!started) return;
        const quiet = isQuiet(d.streaming(), d.render()) && (d.extra?.() ?? true);
        const t = now();
        if (!quiet) quietSince = undefined;
        else quietSince ??= t;
        const ready = quietSince !== undefined && t - quietSince >= settleMs;
        const next = ready ? 'ready' : 'settling';
        if (d.root.dataset.golden !== next) d.root.dataset.golden = next;
      },
      dispose() {},
    },
  };
}
