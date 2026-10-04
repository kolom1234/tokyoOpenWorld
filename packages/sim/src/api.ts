// @sanpo/sim 공개 계약. M03-T03: 월드 시계 + 천문(태양·달 → EnvironmentState). M06-T01: sim.worker(30 Hz) + SAB 보행자 인스턴스 버퍼.
// 날씨·교통·열차는 M06·M07·M09.
// see docs/modules/sim.md, docs/10-simulation.md §2·§8
import type {
  CellKey,
  EnvironmentState,
  EventBus,
  Logger,
  SharedInstanceBuffer,
  SystemProvider,
  Vec3d,
  WorkerSupervisor,
} from '@sanpo/core';

/** 군중 조정값(content/sim/crowd.json — game이 읽어 넘김). */
export interface CrowdParams {
  /** 보행 주기 길이(m): 걷기 위상 = 이동 거리 ÷ 주기. */
  gaitCycleM: number;
  /** 대기·휴대폰 클립 반복 길이(s). */
  idleLoopS: number;
  /** M06-T01 더미 원형 걷기(수락 장면). */
  dummy: { count: number; minRadiusM: number; maxRadiusM: number; idleShare: number; phoneShare: number };
  /** M06-T03 tier A 에이전트(DetourCrowd). 없으면 에이전트 모드 불가. */
  agents?: CrowdAgentsParams;
  /** M06-T03 밀도(10 §4.1): 시간대 곡선(JST 0–23시, 0–1)·핫스팟. */
  density?: {
    diurnal: number[];
    hotspots: { name: string; centerWF: [number, number]; radiusM: number; mult: number }[];
  };
}

/** 교통 조정값(content/sim/traffic.json — M06-T05, 10 §5.1): 최대 대수·스폰/제거 반경·평소 스폰 최소 거리(시야 안)·틱당 스폰·JST 시간대 배율. */
export interface TrafficParams {
  maxVehicles: number;
  spawnM: number;
  despawnM: number;
  farM: number;
  spawnsPerTick: number;
  diurnal: number[];
}

/** tier A(10 §4.2: 0–80 m, High 250) 조정값. 거리 m, 속력 m/s, 시간 s. */
export interface CrowdAgentsParams {
  maxA: number;
  radiusA: number;
  despawnA: number;
  /** 플레이어 근처엔 새로 스폰하지 않는다(갑자기 나타남 방지). */
  spawnMinDistM: number;
  speed: [number, number];
  dest: [number, number];
  plansPerTick: number;
  spawnsPerTick: number;
  /** 보행 녹색 뒤 출발 반응(s). */
  reactionS: [number, number];
  phoneShare: number;
  /** 목적지 도착 뒤 멈춰 서는 확률·시간. */
  dwellShare: number;
  dwellS: [number, number];
  /** tier B(M06-T04 — 80–250 m 흐름, High 750): 최대 수·반경·제거 반경·평소 스폰 최소 거리(그 안은 시야 밖만)·A↔B 히스테리시스 반폭·틱당 경로 계획·채우기 틱당 스폰. */
  maxB: number;
  radiusB: number;
  despawnB: number;
  farSpawnM: number;
  lodBandM: number;
  plansPerTickB: number;
  fillPerTick: number;
}

/** 신호 계획 파일(content/sim/signal-plans.json — game이 넘김). 그룹 = [차량 A, 차량 B, 보행 A, 보행 B]. */
export interface SignalPlansFile {
  plans: { name: string; phases: { durS: number; groups: string[] }[] }[];
  sites: { name: string; centerWF: [number, number]; radiusM: number; plan: string }[];
}

/** 신호 그룹 상태(10 §5.2): 차량 G·Y·R, 보행 W(녹)·F(녹 점멸)·D(적). 차량 그룹이면 ped = D, 보행 그룹이면 vehicle = R. */
export interface SignalState {
  vehicle: 'G' | 'Y' | 'R';
  ped: 'W' | 'F' | 'D';
  /** 계획 안 단계 번호·남은 시간(s)·주기(s). */
  phase: number;
  remainingS: number;
  cycleS: number;
}

/** sim.worker 상태(디버그·성능 표). */
export interface SimWorkerStats {
  tickMs: number;
  maxTickMs: number;
  /** 최근 300틱(10 s) p95(ms) — M06-T03 수락 측정. */
  p95TickMs: number;
  count: number;
  ticks: number;
  /** agents 모드(M06-T03·T04): tier A 수·tier B 수·대기·횡단·경로 계획·스폰·제거(내비 밖·끼임)·승격·강등·내비 타일·셀·횡단보도 수. */
  crowd?: {
    agents: number;
    flow: number;
    promoted: number;
    demoted: number;
    waiting: number;
    crossing: number;
    plans: number;
    spawned: number;
    despawned: number;
    offMesh: number;
    stuck: number;
    tiles: number;
    cells: number;
    crossings: number;
  };
  /** 교통(M06-T05): 대수·스폰·제거·적신호 통과·교착·차선·셀, distM/limitM = 평균 속도 비율 누적. */
  traffic?: {
    vehicles: number;
    spawned: number;
    despawned: number;
    violations: number;
    deadlocks: number;
    distM: number;
    limitM: number;
    lanes: number;
    cells: number;
  };
}

export type DayType = 'weekday' | 'saturday' | 'holiday';
export type TimeScale = 1 | 2 | 10 | 60;

/** 10 §2: realtime = 현실 시각 동기, custom = 시작 시각 + 배속, frozen = 고정(포토모드·골든뷰). */
export type ClockMode =
  | { kind: 'realtime' }
  | { kind: 'custom'; startMs: number; scale: TimeScale }
  | { kind: 'frozen'; atMs: number };

export interface WorldClock {
  /** 게임 시각(Unix ms, UTC 순간). 표시는 Asia/Tokyo. */
  readonly gameTimeMs: number;
  /** frozen이면 0. */
  readonly timeScale: number;
  readonly mode: ClockMode['kind'];
  /** 운행일(04:00 JST 경계) 기준 요일 유형. M03은 일요일 = holiday(공휴일 표는 M06). */
  readonly dayType: DayType;
  setMode(m: ClockMode): void;
  setTimeScale(s: TimeScale): void;
  jumpTo(ms: number): void;
}

export interface SimService extends SystemProvider {
  readonly clock: WorldClock;
  /** 현재 시각·관측 위치(카메라 WF)의 환경 — render·audio가 소비. 같은 시각·1 km 안이면 캐시. */
  environment(): EnvironmentState;
  /**
   * sim.worker 시작(M06-T01, 10 §1): 30 Hz 틱이 보행자 SAB 인스턴스 버퍼(stride 8)를 게시한다. 반환 = pedestrians 버퍼
   * (SAB 불가 = undefined). 두 번째 호출은 기존 버퍼를 돌려준다.
   */
  startWorker(o: {
    supervisor: WorkerSupervisor;
    crowd: CrowdParams;
    centerWF: Vec3d;
    /** dummy = M06-T01 원형 걷기, agents = M06-T03 DetourCrowd(기본). */
    mode?: 'dummy' | 'agents';
    /** 교통(M06-T05 — agents 모드에서만). 없으면 차량 없음. */
    traffic?: TrafficParams;
  }): SharedInstanceBuffer | undefined;
  /** 워커 출력 버퍼(10 §8 outputs): 보행자·차량(stride 8 — 차량 칸 = x,y,z·yaw·속력·바퀴 회전·variant·flags). 시작 전 빈 객체. */
  outputs(): { pedestrians?: SharedInstanceBuffer; traffic?: SharedInstanceBuffer };
  /**
   * 셀 내비·차선(10 §8 addCell — nav.bin·lanes.bin gzip 해제 바이트, streaming requestSections). 워커 시작 전이면 보관했다가 시작 때 보낸다.
   * 같은 셀을 다시 넣으면 무시(먼저 removeCell).
   */
  addCell(key: CellKey, nav?: ArrayBuffer, lanes?: ArrayBuffer): void;
  removeCell(key: CellKey): void;
  /** 디버그·시험: 중심 radius 안 신호 횡단 대기점에 count명(건너편 목적지 — M06-T03 수락 장면). */
  crowdScenario(centerWF: Vec3d, radius: number, count: number): void;
  /** 워커 틱 통계(시작 전 undefined). */
  workerStats(): SimWorkerStats | undefined;
  /** 신호 코드(props.inst 신호 기둥 — 교차로 ID × 16 + 계획 × 4 + 그룹)의 지금 상태(10 §5.2, M06-T02). 계획 없음 = 항상 적·보행 적. */
  signalStateAt(code: number): SignalState;
}

export interface SimDeps {
  bus: EventBus;
  log: Logger;
  /** 현실 시계(ms). 테스트 주입용. */
  now?: () => number;
  initialClock?: ClockMode;
  /** 신호 계획(M06-T02). 없으면 signalStateAt = 적색 고정. */
  signalPlans?: SignalPlansFile;
}
