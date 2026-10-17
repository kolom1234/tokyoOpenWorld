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
  /** 발밑 지면 재질 ID(JCOL 재질 — 지형 = asphalt 1, 없으면 0). */
  groundMaterial: number;
  /** 캐릭터가 에스컬레이터 구간 안(0.5 m/s 운반 중, 08 §5). */
  escalator: boolean;
}

/** 도보 캐릭터 입력(08 §5·§10): 원하는 수평 속도 — 가속 8·감속 10 m/s²은 워커가. */
export interface CharacterInput {
  /** 원하는 수평 속도(m/s, WF — y 무시). */
  moveWF: Vec3;
  /** 점프(08 §5 기본 OFF — 아직 무시). */
  jump?: boolean;
  /** 아바타 방향(yaw, rad). 없으면 그대로. */
  yawRad?: number;
  /** 발밑 셀 콜라이더 미적재(08 §4 groundMissing): 제자리 고정 — 중력·이동 없음(낙하 방지). */
  hold?: boolean;
}

/** 플레이어 차량 종류(08 §6·§7). */
export type VehicleKind = 'sedan' | 'bicycle';

/** 곡선 점 [x, y] 목록(Jolt LinearCurve). */
export type CurvePoints = ReadonlyArray<readonly [number, number]>;

/**
 * 4륜 승용차 파라미터(08 §6 — `content/vehicles/sedan.json`, 코드 상수 금지). 차체 원점 = 바닥 중심(앞뒤 차축 가운데, 지면 높이), 전방 = 로컬 −Z.
 * 앞바퀴 조향·앞바퀴 굴림(소형 세단), 우핸들은 traversal 카메라·하차 쪽만.
 */
export interface SedanParams {
  massKg: number;
  dimensionsM: { length: number; width: number; height: number };
  wheelbaseM: number;
  trackM: number;
  /** 무게중심 높이(지면 위 m). */
  comHeightM: number;
  engine: {
    maxTorqueNm: number;
    minRpm: number;
    maxRpm: number;
    /** 정규화 토크 곡선 [rpm 비율 0..1, 토크 비율]. */
    torqueCurve: CurvePoints;
    inertia: number;
    angularDamping: number;
  };
  transmission: {
    gearRatios: readonly number[];
    reverseRatio: number;
    finalDrive: number;
    shiftUpRpm: number;
    shiftDownRpm: number;
    switchTimeS: number;
    clutchStrength: number;
  };
  suspension: {
    minLengthM: number;
    maxLengthM: number;
    frequencyHz: number;
    damping: number;
    antiRollFront: number;
    antiRollRear: number;
  };
  tire: {
    radiusM: number;
    widthM: number;
    /** 종 마찰 [슬립 비, 마찰 계수]. */
    longitudinalFriction: CurvePoints;
    /** 횡 마찰 [슬립 각(deg), 마찰 계수]. */
    lateralFriction: CurvePoints;
    /** 젖은 노면 마찰 배율(08 §6 = 0.7). */
    wetFrictionScale: number;
  };
  steering: { maxSteerDeg: number; highSpeedFactor: number; highSpeedKmh: number };
  brakes: {
    /** 앞바퀴 최대 제동 토크(Nm, 바퀴당). */
    maxBrakeTorqueNm: number;
    /** 뒷바퀴(앞뒤 배분 — 뒤가 먼저 잠기지 않게). */
    rearBrakeTorqueNm: number;
    handbrakeTorqueNm: number;
    /** ABS: 바퀴 종 슬립이 이보다 크면 제동 입력을 absRelease 배로 줄인다(스텝마다). */
    absSlip: number;
    absRelease: number;
    /** TCS: 구동 바퀴 슬립이 이보다 크면 스로틀을 줄인다. */
    tcsSlip: number;
  };
  /** 공기 저항(Cd·A m²·공기 밀도)·구름 저항 계수(× 무게) — Jolt 선형 감쇠 대신(감쇠는 0). */
  aero: { dragAreaM2: number; airDensity: number; rollingCoeff: number };
  driveSide: 'right' | 'left';
  /** 속도 제한(km/h) — 넘으면 스로틀 0. */
  speedLimitKmh: number;
}

/** 차량 입력(08 §10): 스로틀·브레이크 0..1, 조향 −1(왼쪽)..1(오른쪽), 후진 = 스로틀을 뒤로. */
export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  reverse: boolean;
}

/** 바퀴 상태(렌더·소리): 회전 각(rad, 누적)·조향 각(rad)·서스펜션 길이(m)·종 슬립·횡 슬립(deg)·접지(지면 재질, 없으면 −1). */
export interface WheelState {
  rotationRad: number;
  steerRad: number;
  suspensionM: number;
  slipLong: number;
  slipLatDeg: number;
  contactMaterial: number;
}

/** 차량 상태(최신 스냅샷 — HUD·렌더·소리). speedMs = 전방 +. gear: −1 후진, 0 중립, 1.. 전진. */
export interface VehicleState {
  speedMs: number;
  rpm: number;
  gear: number;
  /** 이번 스텝 실제 스로틀(0..1 — TCS·제한 뒤, 엔진음 부하). */
  throttle: number;
  abs: boolean;
  tcs: boolean;
  /** 변속 중(클러치 떨어짐). */
  shifting: boolean;
  wheels: WheelState[];
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
  /** 앵커 재설정 거리(m): 초점(setFocus)이 앵커에서 이보다 멀면 새 격자점으로(08 §2 = 4096). */
  rebaseDistanceM: number;
  /** 셀 콜라이더 적재 조각 예산(ms): 조각마다 이 안에서 작업(높이장 타일·triMesh 조각)을 하나 이상 — step 때와 메시지 사이 빈 시간(08 §4 — 수락 ≤ 8 ms). */
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
  /** 앵커 재설정 횟수. */
  rebases: number;
  /** 최근 틱(스텝 묶음) 워커 처리 시간 평균(ms). */
  tickMs: number;
  /** sim 직결 키네마틱 차량 바디 수·받은 프레임 수(M06-T06). */
  kinematicBodies: number;
  kinematicFrames: number;
  /** 열차 칸 바디 수·정적 묶음 수(M07-T04). */
  trainBodies: number;
  staticGroups: number;
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
  /** 구 캐스트(3인칭 카메라 충돌 — 09 §3): 반경 radius 구를 dir로 maxDist까지. distance = 구 중심 이동 거리, 시작부터 겹치면 0. */
  sphereCast(originWF: Vec3d, dir: Vec3, radius: number, maxDist: number): Promise<RayHit | null>;
  /** 순간 이동(속도 0). */
  teleport(h: BodyHandle, posWF: Vec3d, yawRad: number): void;
  /**
   * 물리 초점(보통 플레이어, 배선이 주기적으로). 앵커에서 rebaseDistanceM(4096 m)보다 멀면 앵커 = 초점의 격자점으로 재설정 —
   * 워커가 모든 바디를 −Δ 옮긴다(WF 명령·스냅샷은 그대로 — 호출 측은 모른다).
   */
  setFocus(posWF: Vec3d): void;
  /** 보간 완료 포즈(아직 스냅샷이 없으면 undefined). 차량 = 차체 원점(바닥 중심). */
  pose(h: BodyHandle): Readonly<Pose> | undefined;
  /**
   * 플레이어 차량(M08-T01 — 08 §6): VEHICLE 레이어 강체 + Jolt VehicleConstraint(WheeledVehicleController, 앞바퀴 조향·굴림, ABS·TCS는 워커).
   * posWF = 차체 바닥 중심(지면), yaw = 전방(−Z 기준, +Y 반시계). 동시에 최대 MAX_VEHICLES(4)대.
   */
  spawnVehicle(kind: 'sedan', posWF: Vec3d, yawRad: number, params: SedanParams): BodyHandle;
  /** 다음 step에 전달(같은 프레임 여러 번이면 마지막 것). */
  setVehicleInput(h: BodyHandle, i: VehicleInput): void;
  /** 최신 스냅샷의 차량 상태(없으면 undefined). */
  vehicleState(h: BodyHandle): Readonly<VehicleState> | undefined;
  /** 노면 젖음 0..1(날씨) — 타이어 마찰 = 건조 × lerp(1, wetFrictionScale, w). */
  setSurfaceWetness(w: number): void;
  /**
   * sim 직결 키네마틱 원천(08 §8, M06-T06 — ADR-0066): sim이 연 MessagePort(KinematicFrame, core)를 워커로 넘긴다(소유권 이전).
   * 워커가 플레이어 60 m 안 차량을 NPC_KINEMATIC 상자로 두고 스텝마다 외삽 목표로 MoveKinematic — 캐릭터가 관통하지 않고 밀린다. 다시 부르면 옛 포트를 닫는다.
   */
  connectKinematicSource(port: MessagePort): void;
  /**
   * 열차 칸(M07-T04, 08 §8 — ADR-0073): 이번 프레임 포즈 레코드(core TRAIN_BODY_STRIDE — id, x,y,z 레일 윗면, yaw, pitch, 차형, 종류, 문).
   * 다음 step에 실린다(같은 프레임 여러 번이면 마지막 것). 워커가 칸마다 TRAIN 키네마틱 합성 바디(바닥·벽(문 자리 비움)·끝벽·칸막이·천장·롱시트)
   * + 닫힌 쪽 문 바디(열림 ≥ 0.9면 없음)를 두고, 물리 스텝마다 직전·이번 포즈를 보간해 MoveKinematic — 캐릭터는 바닥 속도를 받는다. 빈 배열 = 모두 제거.
   */
  setTrainCars(data: Float64Array): void;
  /** 이름 붙인 정적 묶음(M07-T04 — 승강장 바닥 메시·홈도어 상자): 같은 이름 = 교체, null = 제거. */
  setStaticGroup(name: string, group: StaticGroupDesc | null): void;
  stats(): PhysicsStats;
  dispose(): void;
}

/** 정적 묶음: boxes = f64 × 8(cx, cy, cz WF, 반변 hx, hy, hz, yaw, 재질), mesh = WF 정점·삼각형·재질(양면 충돌). */
export interface StaticGroupDesc {
  boxes?: Float64Array;
  mesh?: { positions: Float64Array; indices: Uint32Array; material: number };
}

/** 워커 대신 쓸 전송(테스트·도구: `createInlineTransport()` = 같은 스레드의 워커 코어). 없으면 supervisor로 physics.worker를 띄운다. */
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
