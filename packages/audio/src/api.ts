// @sanpo/audio 공개 계약(타입·인터페이스). see docs/modules/audio.md, docs/11-audio.md, ADR-0079
import type { CameraState, CellKey, Logger, SystemProvider, Vec3d } from '@sanpo/core';
import type { AudioZones } from '@sanpo/tile-format';

/** 믹서 버스(11 §1). 값 = 선형 이득 0..1(master는 0..1.5). */
export type AudioBus = 'master' | 'ambience' | 'sfx' | 'vehicle' | 'train' | 'ui';
export type AudioMix = Record<AudioBus, number>;

/** 합성 효과음(녹음 금지 범주 — 개찰구·차임·LCD음, 11 §4). 모두 자체 설계 음형(실제 역·사업자 음과 다르게). */
export type SfxId =
  | 'gateOpen'
  | 'gateClose'
  | 'gateDenied'
  | 'cardTouch'
  | 'stationChime'
  | 'lcdChime'
  | 'doorChime'
  | 'uiClick'
  | 'bicycleBell';

export interface AudioDeps {
  log: Logger;
  /** 빌드 shared/audio/manifest.json URL. 없으면 녹음 베드·발소리 없이 합성음만. */
  manifestUrl?: string;
  /** AudioContext 생성(테스트·헤드리스 주입). 없으면 globalThis.AudioContext, 그것도 없으면 무음(state 'unavailable'). */
  createContext?: () => AudioContext;
  fetchFn?: (url: string) => Promise<Response>;
  /** 처음 믹스(설정 저장값·`?vol=`). */
  initialMix?: Partial<AudioMix>;
}

/** 프레임 환경(게임 배선이 sim에서 채운다). */
export interface AudioEnv {
  gameTimeMs: number;
  /** 밤 정도 0..1(태양 고도). */
  night: number;
  rainMmH: number;
  windMs: number;
  /** 군중 밀도 0..1(시간대·요일 곡선). */
  crowd: number;
  /** 우산 아래(비 + 걷기). */
  umbrella: boolean;
}

/** 발소리 입력(walk 모드). material = tile-format JCOL_MATERIAL. */
export interface FootstepState {
  speedMs: number;
  grounded: boolean;
  material: number;
  /** 노면 젖음 0..1. */
  wet: number;
}

/** 근처 열차(통과음 — 위치 WF·속력 m/s). */
export interface NearTrain {
  /** 열차(트립) id — 같은 열차의 합성음을 이어 쓴다. */
  id: string;
  posWF: Vec3d;
  speedMs: number;
}

export type PedSignal = 'W' | 'F' | 'D';

/** 플레이어 탈것 소리 입력(M08-T04, ADR-0090 — 게임이 physics vehicleState·traversal HUD에서 채운다). */
export interface VehicleAudioState {
  kind: 'car' | 'bicycle';
  /** 엔진 회전수(자전거 0). */
  rpm: number;
  /** 실제 스로틀·페달 0..1(엔진 부하). */
  throttle: number;
  /** 전방 속력 m/s(후진 −). */
  speedMs: number;
  /** 변속 중(클러치 떨어짐 — 부하 빠짐·RPM 낙하가 들린다). */
  shifting: boolean;
  /** 가장 미끄러지는 바퀴 0..1(종 슬립 비·횡 슬립각 정규화) — 타이어 끽 소리. */
  slip: number;
  /** 노면 젖음 0..1. */
  wetness: number;
  /** 바퀴 아래 재질(JCOL_MATERIAL). */
  surface: number;
  /** 운전석 시점(실내 — 고역·바람 줄임). */
  interior: boolean;
}

export interface AudioStats {
  state: 'locked' | 'running' | 'unavailable';
  /** 존 종류별 가중(합 1). */
  zones: Record<string, number>;
  /** 소리 나는 베드(이득 > 0.01) id. */
  beds: string[];
  /** 적재된 녹음 파일 수 / manifest 파일 수. */
  loaded: number;
  files: number;
  voices: number;
  signalTones: number;
  steps: number;
  mix: AudioMix;
  /** 탈것 엔진 합성기(M08-T04 — unlock 직후 적재): off = 오디오 없음, loading = 워클릿 적재 중, fallback = 워클릿 불가(오실레이터). */
  engine: 'off' | 'loading' | 'worklet' | 'fallback';
  /** 출력 시계 결손(1 s 구간에서 컨텍스트 시각이 성능 시각보다 20 ms 넘게 뒤처짐 — 오디오 스레드 언더런 근사) 횟수. */
  clockGlitches: number;
}

export interface AudioService extends SystemProvider {
  readonly state: AudioStats['state'];
  /** 첫 사용자 제스처 뒤 호출(AudioContext.resume). 그 전엔 아무 소리도 내지 않는다. */
  unlock(): Promise<void>;
  setListener(camera: CameraState, groundY?: number): void;
  addCell(key: CellKey, zones?: AudioZones): void;
  removeCell(key: CellKey): void;
  setEnvironment(e: AudioEnv): void;
  setFootsteps(s: FootstepState | null): void;
  /** 음향식 보행 신호 상태(신호 코드 → 보행 W/F/D). 없으면 유도음 없음. */
  setSignalSource(f: ((code: number) => PedSignal) | null): void;
  /** 가려짐 판정(리스너 → 소리 선분이 건물에 막히는가 — physics 레이캐스트, 4 Hz). 없으면 가려짐 없음. */
  setOccluder(f: ((fromWF: Vec3d, toWF: Vec3d) => Promise<boolean>) | null): void;
  playAt(id: SfxId, posWF: Vec3d, opts?: { gain?: number; pitch?: number }): void;
  playUi(id: SfxId): void;
  setVehicleState(s: VehicleAudioState | null): void;
  setTrainState(s: { speed: number; inside: boolean } | null): void;
  setTrainsNear(trains: readonly NearTrain[]): void;
  setMix(m: Partial<AudioMix>): void;
  readonly mix: Readonly<AudioMix>;
  stats(): AudioStats;
  dispose(): void;
}
