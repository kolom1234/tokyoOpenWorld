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
  | 'uiClick';

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
  setVehicleState(s: { rpm: number; throttle: number; speed: number; surface: number } | null): void;
  setTrainState(s: { speed: number; inside: boolean } | null): void;
  setTrainsNear(trains: readonly NearTrain[]): void;
  setMix(m: Partial<AudioMix>): void;
  readonly mix: Readonly<AudioMix>;
  stats(): AudioStats;
  dispose(): void;
}
