// @sanpo/render 공개 계약. M01-T06 최소 부분집합(초기화·셀 추가/제거·카메라·원점 재설정·통계) + M02-T05 HLOD 자식 전환·선컴파일 + M03 머티리얼 라이브러리.
// see docs/modules/render.md, docs/07-rendering.md §11
import type {
  AvatarState,
  CameraState,
  CellKey,
  DeepPartial,
  EnvironmentState,
  EventBus,
  Logger,
  QualityTier,
  SharedInstanceBuffer,
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

/** 07 §9 품질 티어(@sanpo/core 정의 재수출 — `quality/changed` 이벤트와 같은 타입). */
export type { QualityTier };

/** 후처리 효과 스위치(07 §7). 티어 표(`post/config.ts`) → 이 값, `RenderConfig.post`(디버그 `?post=`)로 개별 덮어쓰기. */
export interface PostEffects {
  /** 앰비언트 차폐·간접광: SSGI는 AO(알파)도 낸다. */
  ao: 'none' | 'gtao' | 'ssgi';
  /** AO/GI 해상도 배율(0.5 = 반해상도). */
  aoScale: number;
  ssr: boolean;
  bloom: boolean;
  autoExposure: boolean;
  /** 시간 안티에일리어싱: renderScale 1 = TRAA, < 1 = TAAU(업스케일). SSGI·GTAO 시간 필터에 필요. */
  taa: boolean;
  /** 씬·후처리 해상도 배율(07 §9 — TAAU로 출력 해상도 복원, taa 필요). 동적 조정은 M03-T08. */
  renderScale: number;
  /** 자동 노출을 못 쓸 때(WebGL2) 고정 노출 배율. 없으면 1. */
  fixedExposure?: number;
  lut: boolean;
  sharpen: boolean;
  /** 대기 공중원근 해상도: 'half' = 렌더 스케일의 ½×½에서 산란·투과 + 깊이 인지 업샘플(ADR-0039), 'full' = 픽셀마다(takram). */
  aerial: 'full' | 'half';
}

/** 패스별 GPU 시간(`?gpuTiming=1`): 프레임 안 렌더 호출 순번별 평균. label = 씬(`scene`)·그림자(`shadow`)·후처리 쿼드 이름 등. */
export interface GpuPassTime {
  index: number;
  label: string;
  ms: number;
}

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
  /** 'flat' = 파사드를 단색 PBR로(셰이더 비용 A/B 측정·최저 품질). */
  facade: 'procedural' | 'flat';
  /** 품질 티어(`?quality=`). 후처리 효과 기본값을 정한다(07 §9). */
  quality: QualityTier;
  /** 티어 값 위에 덮어쓸 효과(`?post=ssr:0,ao:gtao` — A/B 측정). */
  post: Partial<PostEffects>;
  /** 동적 해상도(M03-T08, 0.5–1.0, 목표 16.6 ms). 골든뷰는 끈다(결정론). */
  dynamicResolution: boolean;
  /** detect-gpu 벤치마크 JSON 경로(자체 호스팅 — apps/game이 `/detect-gpu/`로 서빙). */
  gpuBenchmarksPath: string;
  /** 디버그 GPU 부하(렌더 스케일 해상도에서 픽셀당 반복 수, `?gpuLoad=`) — 동적 해상도 수락 확인용. 0 = 끔. */
  debugGpuLoad: number;
  /** 소프트웨어 래스터(SwiftShader — CI)에서도 후처리 체인(GTAO·TAAU 등)을 켠다(`?forcePost=1`, 정지 떨림 e2e). 그림자·동적 해상도는 따로 끈다. */
  debugForcePost: boolean;
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
  gpu: { enabled: boolean; frameMs: number; samples: number; passes: GpuPassTime[] };
  /** 적용 중 후처리 효과(WebGL2 직접 렌더 = null). */
  post: PostEffects | null;
  /** 자동 노출(기하 평균 휘도·배율, 약 0.5 s마다 갱신). 끔·WebGL2 = null. */
  exposure: { lum: number; scale: number } | null;
  /** 품질 티어·현재 렌더 스케일·프레임 시간 EMA(ms). */
  quality: { tier: QualityTier; renderScale: number; dynamic: boolean; frameMs: number };
  /** 태양 그림자(07 §9 티어) + 이번 프레임 다시 그린 캐스케이드 수(ADR-0039). 그림자 없음 = null. */
  shadows: { cascades: number; mapSize: number; maxFarM: number; updated: number } | null;
  /** 거리 소품(M05-T03): 적재 인스턴스·보이는 인스턴스·쓰는 풀(= 드로우콜, ≤ 종류 × 3)·풀 재작성 횟수. */
  props: { instances: number; visible: number; pools: number; rebuilds: number; dropped: number };
  /** 나무(M05-T04): 적재 인스턴스·보이는 인스턴스·그리는 메시 수(드로우콜)·용량 초과·에셋 준비. */
  trees: { instances: number; visible: number; pools: number; dropped: number; ready: boolean };
  /** 가상 간판(M05-T06): 적재 인스턴스(돌출·입간판·옥상)·보이는 인스턴스·그리는 풀·에셋 준비. */
  signs: { instances: number; visible: number; pools: number; ready: boolean };
  /** 군중(M06-T01): sim 인스턴스 수·그린 수·쓰는 풀(드로우콜)·용량 초과·그림자 드리우는 수(LOD0)·에셋 준비. */
  crowd: {
    instances: number;
    visible: number;
    pools: number;
    dropped: number;
    casters: number;
    lods: number[];
    ready: boolean;
    /** 원경 스프라이트(M06-T04): 셀에서 뽑은 점 수·지금 그리는 수. */
    far: { points: number; drawn: number };
  };
}

/** 플레이어 아바타 에셋 URL(파이프라인 `characters` — Rocketbox 스킨 GLB + KTX2 아틀라스, ADR-0057). */
export interface AvatarAssetUrls {
  glb: string;
  texture: string;
}

/** 나무 에셋 URL(파이프라인 `trees` 산출, 게임 번들 해시 에셋). */
export interface TreeAssetUrls {
  manifest: string;
  glb: string;
  leaves: string;
  impostor: string;
}

/** 간판 에셋 URL(파이프라인 `signage` 산출 — 브랜드 색까지 구운 아틀라스 PNG, 게임 번들 해시 에셋). */
export interface SignageAssetUrls {
  atlas: string;
}

/** 군중 팩 URL(파이프라인 `characters` 군중 — Rocketbox 베이스 12종, ADR-0057). */
export interface CrowdAssetUrls {
  manifest: string;
  bin: string;
  texture: string;
}

/** 10 §1: sim SAB 인스턴스 버퍼를 render가 읽는다(wiring이 1회 bindShared). */
export interface InstanceLayer {
  bindShared(buf: SharedInstanceBuffer): void;
  /** 원경 스프라이트(tier C, 235–800 m — M06-T04) 밀도 0..1. 게임이 sim 군중 수 ÷ 목표로(시간대·날씨). 기본 0(안 보임). */
  setFarDensity(k: number): void;
}

/** 선컴파일 진행(M06): 단계·완료 수·총 수. */
export interface PrecompileProgress {
  stage: 'atmosphere' | 'materials' | 'avatar';
  done: number;
  total: number;
}

export interface RenderService extends SystemProvider {
  readonly renderOriginWF: Readonly<Vec3d>;
  /** 품질 티어 변경(후처리 재구성 — 셰이더 재컴파일 끊김 1회) + `quality/changed`. 버스 이벤트로도 바뀐다. */
  setQuality(tier: QualityTier): void;
  /** detect-gpu로 초기 티어 추정 → 적용 → 60프레임 측정 후 필요하면 한 단계 내림. 첫 표시 뒤에 부른다. */
  detectQuality(): Promise<QualityTier>;
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
  /**
   * 고정 머티리얼(+ HLOD 변형) 셰이더 선컴파일(06 §6) — 스트리밍 중 컴파일 끊김 방지. 대기 LUT → 머티리얼 ID 묶음마다 한 프레임 양보 → 아바타,
   * 단계마다 onProgress(부팅 로딩 표시 — M06).
   */
  precompile(onProgress?: (p: PrecompileProgress) => void): Promise<void>;
  /**
   * 부팅 첫 표시(M06 사전 4): on이면 이후 addCell의 셀 메시를 장면 밖 대기 그룹에 둔다(그리지 않음 → 첫 렌더 동기 컴파일 없음).
   * `compileStaged`로 선컴파일과 겹쳐 파이프라인을 만들고 `commitStaged`로 장면에 붙인다(대기 모드 끝). 소품·나무·간판 풀은 대상 아님.
   */
  stageCells(on: boolean): void;
  compileStaged(): Promise<void>;
  commitStaged(): void;
  /** WF float64 카메라. 다음 renderPrep(phase 70)에서 원점 재설정·투영에 반영. */
  setCamera(c: Readonly<CameraState>): void;
  /** 플레이어 아바타 상태(절차 마네킹 M04-T05 → 모델 ADR-0048). 매 프레임 renderPrep 전에. */
  setAvatar(a: Readonly<AvatarState>): void;
  /**
   * 아바타 모델(파이프라인 `characters` — Rocketbox GLB + KTX2 아틀라스, ADR-0057) 적재 → 선컴파일 → 마네킹 교체. 첫 표시 뒤에 부른다.
   * 실패하면 reject하고 절차 마네킹을 계속 쓴다.
   */
  loadAvatar(urls: AvatarAssetUrls): Promise<void>;
  /**
   * 나무 에셋(파이프라인 `trees` — 수종 GLB·잎·임포스터 아틀라스, M05-T04) 적재 → 머티리얼 선컴파일 → 셀 trees.inst를 그리기 시작.
   * 첫 표시 뒤에 부른다(초기 다운로드 밖). 그 전 셀의 나무도 기억했다가 그린다.
   */
  loadTrees(urls: TreeAssetUrls): Promise<void>;
  /** 간판 아틀라스(M05-T06) 적재 → 간판 머티리얼 선컴파일 → 셀 props.inst 간판 종류 + 파사드 1층 간판 띠에 가상 브랜드. */
  loadSignage(urls: SignageAssetUrls): Promise<void>;
  /** 군중 팩 적재 → 머티리얼 선컴파일 → pedestrians 레이어를 그리기 시작(M06-T01). 첫 표시 뒤에 부른다. */
  loadCrowd(urls: CrowdAssetUrls): Promise<void>;
  /**
   * 신호 램프 원천(M06-T02): props.inst 신호 기둥의 현시 코드 → 램프 값(차량 1 적·2 황·3 녹 + 4 × 보행 1 적·2 녹, 0 = 꺼짐).
   * 배선이 sim.signalStateAt로 만든다. 매 renderPrep에 보이는 기둥만 묻는다. null = 램프 끔.
   */
  setSignalLamps(lamp: ((code: number) => number) | null): void;
  /** 보행자 인스턴스 레이어(sim 출력). */
  readonly pedestrians: InstanceLayer;
  stats(): RenderStats;
  dispose(): void;
}

export interface RenderDeps {
  canvas: HTMLCanvasElement;
  bus: EventBus;
  log: Logger;
  config?: DeepPartial<RenderConfig>;
}
