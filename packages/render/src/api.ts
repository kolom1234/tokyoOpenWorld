// @sanpo/render 공개 계약. M01-T06 = 최소 부분집합(초기화·셀 추가/제거·카메라·원점 재설정·통계). see docs/modules/render.md, docs/07-rendering.md §11
import type { CameraState, CellKey, DeepPartial, EventBus, Logger, SystemProvider, Vec3d } from '@sanpo/core';
import type { CellPayload } from '@sanpo/tile-format';

/** 실제 사용 중인 GPU 백엔드(초기화 후 확정). WebGPU 불가 시 WebGL2 자동 폴백. */
export type RenderBackend = 'webgpu' | 'webgl2';
/**
 * 깊이 버퍼 전략(ADR-0006). 'reversed-z' = float32 깊이 + 역방향(WebGPU 항상, WebGL2는 EXT_clip_control 있을 때),
 * 'logarithmic' = 그 외 폴백(프래그먼트 깊이 기록 → early-Z 손실), 'standard' = 예측이 빗나가 three가 기본 깊이로 되돌린 경우(경고 로그).
 */
export type DepthMode = 'reversed-z' | 'logarithmic' | 'standard';

export interface RenderConfig {
  /** 'webgl' = WebGL2 강제(`?backend=webgl`). */
  backend: 'auto' | 'webgl';
  /** 07 §1: 근평면은 CameraState.near, 원평면 60 km. */
  farM: number;
  /** 최대 devicePixelRatio(고DPI 비용 상한). */
  maxPixelRatio: number;
  /** 01-architecture §7: 카메라가 renderOrigin에서 이 거리 이상 멀어지면 재설정. */
  rebaseDistanceM: number;
  /** 재설정 시 새 원점 스냅 격자(m). */
  rebaseGridM: number;
}

export interface RenderStats {
  backend: RenderBackend;
  depth: DepthMode;
  /** 렌더한 프레임 수. */
  frames: number;
  drawCalls: number;
  triangles: number;
  cells: number;
  /** 세션 동안 원점 재설정 횟수. */
  originRebases: number;
  renderOriginWF: Readonly<Vec3d>;
}

export interface RenderService extends SystemProvider {
  readonly renderOriginWF: Readonly<Vec3d>;
  readonly backend: RenderBackend;
  readonly depth: DepthMode;
  /** 셀 메시 추가(소유권 이전: 배열을 GPU 버퍼로 그대로 사용). 같은 키가 있으면 교체. */
  addCell(p: CellPayload): void;
  removeCell(key: CellKey): void;
  /** WF float64 카메라. 다음 renderPrep(phase 70)에서 원점 재설정·투영에 반영. */
  setCamera(c: Readonly<CameraState>): void;
  stats(): RenderStats;
  dispose(): void;
}

export interface RenderDeps {
  canvas: HTMLCanvasElement;
  bus: EventBus;
  log: Logger;
  config?: DeepPartial<RenderConfig>;
}
