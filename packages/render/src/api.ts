// @sanpo/render 공개 계약. M01-T06 최소 부분집합(초기화·셀 추가/제거·카메라·원점 재설정·통계) + M02-T05 HLOD 자식 전환·선컴파일 + M03 머티리얼 라이브러리.
// see docs/modules/render.md, docs/07-rendering.md §11
import type {
  CameraState,
  CellKey,
  DeepPartial,
  EnvironmentState,
  EventBus,
  Logger,
  SystemProvider,
  Vec3d,
} from '@sanpo/core';
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
  /** KTX2 Basis 트랜스코더(basis_transcoder.{js,wasm}) 경로(apps/game이 three examples/jsm/libs/basis를 서빙). */
  basisPath: string;
  /** 톤매핑 노출(물리 광량 → 화면). 자동 노출(M03-T07) 전 고정값. */
  exposure: number;
  /** GPU 타이머(timestamp-query) — `stats().gpu` 성능 계측(`?gpuTiming=1`). 약간의 오버헤드. */
  gpuTiming: boolean;
  /** 태양 CSM 그림자(WebGPU만, 품질 티어 T08이 조정). */
  shadows: boolean;
}

/** 공유 머티리얼 라이브러리 상태(M03-T01). 'manifest' = 평균색만, 'ready' = KTX2 배열 적용. */
export interface MaterialLibraryStats {
  state: 'none' | 'manifest' | 'ready' | 'failed';
  layers: number;
  /** 받은 KTX2 바이트. */
  downloadBytes: number;
  /** GPU 업로드 바이트(트랜스코드 후, 밉맵 포함). */
  gpuBytes: number;
  loadMs: number;
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
  /** 자식 숨김 상태를 가진 HLOD 부모 수·페이드 진행 중인 자식 수. */
  hlodParents: number;
  hlodFading: number;
  materials: MaterialLibraryStats;
  /** GPU 프레임 시간(렌더 패스 합, gpuTiming일 때만). */
  gpu: { enabled: boolean; frameMs: number; samples: number };
}

export interface RenderService extends SystemProvider {
  readonly renderOriginWF: Readonly<Vec3d>;
  readonly backend: RenderBackend;
  readonly depth: DepthMode;
  /** 셀 메시 추가(소유권 이전: 배열을 GPU 버퍼로 그대로 사용). 같은 키가 있으면 교체. */
  addCell(p: CellPayload): void;
  removeCell(key: CellKey): void;
  /**
   * HLOD 부모(L1–L3)의 자식 영역(0..15, 05 §4) 표시. false = 0.3 s 디더 페이드로 숨김, true = 즉시 보임(자식 제거 전 호출 → 구멍 없음).
   * 부모가 아직 없어도 기억했다가 붙을 때 적용한다.
   */
  setHlodChildVisible(parent: CellKey, child: number, visible: boolean): void;
  /**
   * 공유 머티리얼 라이브러리 적재(world.json files.materials, 05 §1): manifest → 평균색 → KTX2 배열 3장 교체(재컴파일 없음).
   * 첫 표시 뒤에 부른다(초기 다운로드 예산 밖, 14 §2). 실패 시 reject하고 평균색으로 계속 그린다.
   */
  loadMaterials(manifestUrl: string): Promise<MaterialLibraryStats>;
  /** 환경(태양·달 방향 등, sim 계산값) — 대기·조명이 소비한다. 07 §6: render는 천문 계산을 하지 않는다. */
  setEnvironment(e: Readonly<EnvironmentState>): void;
  /** 고정 머티리얼(+ HLOD 변형) 셰이더 선컴파일(06 §6) — 스트리밍 중 컴파일 끊김 방지. */
  precompile(): Promise<void>;
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
