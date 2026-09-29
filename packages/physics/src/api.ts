// @sanpo/physics 공개 계약(타입·인터페이스). Jolt 객체는 워커 밖으로 나가지 않는다 — 메인은 명령 큐 + 보간 스냅샷만.
// 좌표: 명령·스냅샷은 WF float64, 워커 안에서만 PHYS(= WF − 앵커, float32). see docs/08-physics.md §1–3·§9–10, docs/modules/physics.md
import type { CellKey, EventBus, Logger, Quat, SystemProvider, Vec3, Vec3d, WorkerSupervisor } from '@sanpo/core';
import type { HeightfieldData } from '@sanpo/tile-format';

/** 바디 핸들(메인에서 발급 — 스냅샷 슬롯 + 세대). */
export type BodyHandle = number & { readonly __brand: 'BodyHandle' };

/** 'shared' = SharedArrayBuffer 스냅샷(crossOriginIsolated), 'degraded' = 틱마다 postMessage(Transferable). */
export type PhysicsIsolation = 'shared' | 'degraded';
/** 워커가 실제로 올린 Jolt 빌드(현재 항상 single — ADR-0041). */
export type JoltBuild = 'multithread' | 'single';

/** 보간 완료 포즈(WF). */
export interface Pose {
  posWF: Vec3d;
  quat: Quat;
  linVel: Vec3;
  grounded: boolean;
  /** 발밑 지면 재질 ID(M04-T04~, 없으면 0). */
  groundMaterial: number;
}

/** 도보 캐릭터 입력(08 §5·§10): 원하는 수평 속도 — 가속 8·감속 10 m/s²은 워커가. */
export interface CharacterInput {
  /** 원하는 수평 속도(m/s, WF — y 무시). */
  moveWF: Vec3;
  /** 점프(08 §5 기본 OFF — 아직 무시). */
  jump?: boolean;
  /** 아바타 방향(yaw, rad). 없으면 그대로. */
  yawRad?: number;
}

export interface PhysicsConfig {
  /** 고정 스텝(Hz). 08 §1 = 120. */
  stepHz: number;
  /** 프레임당 최대 스텝(초과 시간은 버림 — 스파이럴 방지). */
  maxStepsPerTick: number;
  /** 보간 지연(s): 렌더 시각 = 지금 − 지연. 워커 왕복 1프레임 + 스텝 1개를 덮는다. */
  interpolationDelayS: number;
  /** 'auto' = 격리되면 shared, 'degraded' = 격리돼도 postMessage 강제(e2e·비교), 'shared' = SharedArrayBuffer만 있으면 SAB(Node 테스트). */
  isolation: 'auto' | 'degraded' | 'shared';
  /** 앵커 격자(m): 세션 시작 앵커 = 첫 위치의 이 격자점(08 §2). */
  anchorGridM: number;
  /** 셀 콜라이더 적재 틱 예산(ms): 틱마다 이 안에서 작업(높이장·triMesh 청크)을 하나 이상(08 §4 — 수락 ≤ 8 ms). */
  cellBudgetMs: number;
}

/** 레이캐스트 결과(WF). */
export interface RayHit {
  posWF: Vec3d;
  /** 표면 법선(단위). */
  normal: Vec3;
  distance: number;
  /** ObjectLayer(08 §3: 0 STATIC_WORLD, 1 TERRAIN …). */
  layer: number;
  /** JCOL 재질(05 §6). */
  material: number;
}

export interface PhysicsStats {
  ready: boolean;
  isolation: PhysicsIsolation;
  build: JoltBuild | null;
  /** 워커가 진행한 스텝 수·마지막 스냅샷 시뮬레이션 시각(s). */
  steps: number;
  simTimeS: number;
  bodies: number;
  /** 워커 Jolt 초기화 시간(ms). */
  initMs: number;
  /** 적재된(또는 적재 중인) 콜라이더 셀 수·남은 적재 작업 수·적재 틱 최대(ms). */
  colliderCells: number;
  colliderPending: number;
  loadTickMaxMs: number;
  /** 적재 틱이 8 ms를 넘은 횟수(GC 등 잡음 포함). */
  loadTicksOver8Ms: number;
  /** 최근 틱(스텝 묶음) 워커 처리 시간 평균(ms). */
  tickMs: number;
  anchorWF: Readonly<Vec3d>;
}

export interface PhysicsService extends SystemProvider {
  /** 워커 Jolt 초기화 완료. 실패하면 reject. */
  readonly ready: Promise<void>;
  readonly isolation: PhysicsIsolation;
  /**
   * 디버그·테스트 상자(M04-T01 수락 — 낙하 테스트): dynamic = 떨어지는 상자(VEHICLE 레이어), static = 바닥(STATIC_WORLD).
   * halfExtentM = 반변(m).
   */
  debugSpawnBox(posWF: Vec3d, halfExtentM: Vec3, dynamic: boolean): BodyHandle;
  despawn(h: BodyHandle): void;
  /**
   * 도보 캐릭터(08 §5, CharacterVirtual 캡슐 r 0.25·키 1.70, 경사 50°, 계단 0.40 m, 바닥 붙기 0.5 m, 삼각형 양면).
   * posWF = 발 위치. pose().posWF도 발, grounded·groundMaterial 포함.
   */
  spawnCharacter(posWF: Vec3d, yawRad: number): BodyHandle;
  /** 다음 step에 전달(같은 프레임 여러 번이면 마지막 것). */
  setCharacterInput(h: BodyHandle, i: CharacterInput): void;
  /**
   * 셀 콜라이더(08 §4): jcol = collision.bin(gzip 해제), hf = terrain.height. 버퍼 소유권은 워커로 넘어간다(Transferable).
   * 같은 키면 교체. 워커가 틱당 예산 안에서 적재 → 끝나면 hasCell = true.
   */
  addCell(key: CellKey, originWF: Vec3d, jcol: ArrayBuffer | undefined, heightfield: HeightfieldData | undefined): void;
  removeCell(key: CellKey): void;
  /** 적재 완료(발밑 셀 확인 — groundMissing 판정, M04-T06). */
  hasCell(key: CellKey): boolean;
  /** 가장 가까운 충돌(모든 레이어). dir은 정규화 불필요. */
  raycast(originWF: Vec3d, dir: Vec3, maxDist: number): Promise<RayHit | null>;
  /** 순간 이동(속도 0). */
  teleport(h: BodyHandle, posWF: Vec3d, yawRad: number): void;
  /** 보간 완료 포즈(아직 스냅샷이 없으면 undefined). */
  pose(h: BodyHandle): Readonly<Pose> | undefined;
  stats(): PhysicsStats;
  dispose(): void;
}

/** 워커 대신 쓸 전송(테스트: 같은 스레드의 워커 코어). 없으면 supervisor로 physics.worker를 띄운다. */
export interface PhysicsTransport {
  post(msg: unknown, transfer?: Transferable[]): void;
  onMessage(h: (data: unknown) => void): () => void;
  terminate(): void;
}

export interface PhysicsDeps {
  bus: EventBus;
  log: Logger;
  /** 브라우저: 워커 감독자. transport가 있으면 쓰지 않는다. */
  supervisor?: WorkerSupervisor;
  transport?: PhysicsTransport;
  /** 세션 시작 앵커를 정할 첫 위치(WF). */
  originWF: Vec3d;
  config?: Partial<PhysicsConfig>;
  /** 단조 시계(ms). 기본 performance.now. */
  now?: () => number;
}
