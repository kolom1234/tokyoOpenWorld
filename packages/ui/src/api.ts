// @sanpo/ui 공개 계약(타입·인터페이스). 게임 상태는 UiBridge(apps/game 구현)로만 읽고 쓴다. see docs/modules/ui.md, docs/12-ui-ux.md §7

import type { ReadonlySignal, Signal } from '@preact/signals';
import type { QualityTier, Vec3d } from '@sanpo/core';

export type Lang = 'ko' | 'ja' | 'en';
export const LANGS: readonly Lang[] = ['ko', 'ja', 'en'];

/** 3개 언어 이름(장소·역·POI — 데이터에서 온 고유명사). */
export interface LocalName {
  ko: string;
  ja: string;
  en: string;
}

/** 번역 키 + 치환값(`{name}`). 값이 LocalName이면 현재 언어로 고른다. */
export interface Msg {
  key: string;
  params?: Readonly<Record<string, string | number | LocalName>>;
}

export type ScreenId = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'credits' | 'map' | 'log' | 'photo';

export type LoadingStage = 'caps' | 'manifest' | 'shaders' | 'spawn' | 'ready' | 'error';

export interface LoadingModel {
  stage: LoadingStage;
  /** 0…1(대략). */
  progress: number;
  /** 단계 세부(셰이더 n/N·셀 n/N 등 — 번역 키). */
  detail: Msg | null;
  webgpu: boolean | null;
  isolated: boolean | null;
  /** 오류 원문(개발자용 — 번역하지 않는다). */
  error: string | null;
}

/** 역 근접 안내(화면 위). arrowDeg = 시선 기준 목표 방향(0 = 앞, + = 왼쪽, 45° 단위). */
export interface GuideModel {
  kind: 'gate' | 'stairs' | 'platformExit';
  station: LocalName;
  exit: LocalName;
  distanceM: number;
  arrowDeg: number;
}

/** 탈것 계기(drive·cycle). */
export interface DriveModel {
  kind: 'sedan' | 'bicycle';
  speedKmh: number;
  gear: string;
  /** 0…1. */
  rpm: number;
  lights: boolean;
  indicator: -1 | 0 | 1;
  braking: boolean;
  abs: boolean;
  tcs: boolean;
  aeb: boolean;
  sidewalk: boolean;
  limitKmh: number | null;
  stop: { lamp: 'R' | 'Y'; distM: number } | null;
  wrongWay: boolean;
}

export interface TrainModel {
  line: LocalName;
  next: LocalName | null;
  stopped: LocalName | null;
  arrivalInS: number | null;
}

export interface HudModel {
  /** traversal 모드(walk·drive·cycle·train·freecam·idle). */
  mode: string;
  /** 현재 지명(○○区 ○○町 ○丁目). */
  place: LocalName | null;
  /** 게임 시각(epoch ms) — 표시는 JST. */
  timeMs: number;
  /** 날씨 상태 id(sim). */
  weather: string;
  tempC: number | null;
  prompt: Msg | null;
  notice: Msg | null;
  /** 알림이 바뀔 때마다 증가(같은 글 반복도 다시 띄움). */
  noticeSeq: number;
  guide: GuideModel | null;
  drive: DriveModel | null;
  train: TrainModel | null;
  groundLoading: boolean;
  /** 화면 검은 막 0…1(역 계단·빠른 이동). */
  fade: number;
  /** 미니맵용 플레이어 위치·시선(WF, yaw = +Y 반시계, 0 = 북). */
  posWF: Vec3d;
  yawRad: number;
  /** 게임패드 연결(도움말을 패드 글자로). */
  gamepad: boolean;
  /** 효과음 자막(M11-T04 — 12 §6): 게임이 중요 효과음을 낼 때마다 seq 증가, 표시는 설정 captions일 때만. */
  caption: Msg | null;
  captionSeq: number;
}

export type PoiCategory = 'landmark' | 'street' | 'park' | 'shrine' | 'view';

export interface DiscoveryModel {
  id: string;
  name: LocalName;
  category: PoiCategory;
  posWF: Vec3d;
  description: LocalName;
  /** 발견 시각(게임 epoch ms) — 없으면 미발견. */
  discoveredAtMs: number | null;
  weather: string | null;
  photoIds: readonly string[];
}

/** 빠른 이동 대상(역·스폰 지점 — 발견한 것만 이동 가능). */
export interface TravelPlace {
  id: string;
  name: LocalName;
  kind: 'station' | 'place' | 'poi';
  posWF: Vec3d;
  unlocked: boolean;
}

export type Units = 'metric' | 'imperial';

export interface VolumeSettings {
  master: number;
  ambience: number;
  sfx: number;
  vehicle: number;
  train: number;
  ui: number;
}

/** 재바인딩 가능한 키보드 액션(input ButtonAction 일부). */
export type RebindAction =
  | 'interact'
  | 'toggleView'
  | 'freeCam'
  | 'sprint'
  | 'pace'
  | 'summon'
  | 'summonBike'
  | 'land'
  | 'lights'
  | 'skip'
  | 'map'
  | 'photo';
export const REBIND_ACTIONS: readonly RebindAction[] = [
  'interact',
  'toggleView',
  'freeCam',
  'sprint',
  'pace',
  'summon',
  'summonBike',
  'land',
  'lights',
  'skip',
  'map',
  'photo',
];

/** 색각 보정(M11-T04 — 12 §6): 1형(적)·2형(녹)·3형(청) 색각에 맞춘 대비 보정 LUT(render setColorVision). */
export type ColorVision = 'off' | 'protan' | 'deutan' | 'tritan';
export const COLOR_VISIONS: readonly ColorVision[] = ['off', 'protan', 'deutan', 'tritan'];

export interface SettingsModel {
  v: 1;
  lang: Lang;
  quality: 'auto' | QualityTier;
  fovDeg: number;
  headBob: boolean;
  /** 모션 민감: 헤드밥·카메라 흔들림·속도 FOV 효과 끔. */
  reduceMotion: boolean;
  lookSensitivity: number;
  invertY: boolean;
  volume: VolumeSettings;
  muted: boolean;
  hudFade: boolean;
  units: Units;
  minimapRotate: boolean;
  uiScale: number;
  showHelp: boolean;
  /** 색각 보정(M11-T04). */
  colorVision: ColorVision;
  /** 효과음 자막(M11-T04). */
  captions: boolean;
  /** 액션 → 키 코드(KeyboardEvent.code) 덮어쓰기. 없으면 기본. */
  keys: Partial<Record<RebindAction, string>>;
}

export interface PhotoParams {
  timeOffsetH: number;
  /** 날씨 프리셋 상태 id(null = 지금 날씨 그대로). */
  weather: string | null;
  exposureEv: number;
  /** 화이트밸런스 −1(차갑게)…+1(따뜻하게). */
  whiteBalance: number;
  focalMm: number;
  aperture: number;
  focusM: number | null;
  vignette: number;
  grain: number;
  grid: boolean;
  hideHud: boolean;
}

export interface CreditEntry {
  id: string;
  kind: string;
  title: string;
  license: string;
  url: string | null;
  attribution: LocalName | null;
}
export interface OssEntry {
  name: string;
  version: string;
  license: string;
}
export interface CreditsModel {
  buildId: string | null;
  data: readonly CreditEntry[];
  oss: readonly OssEntry[];
}

/** 지도 타일 피처(MVT 디코드 결과 — 좌표 = 타일 정수 0…extent). type 1 점·2 선·3 면. */
export interface MapFeatureData {
  layer: string;
  type: 1 | 2 | 3;
  geometry: number[][];
  props: Record<string, string | number | boolean>;
}
export interface MapTileData {
  extent: number;
  features: MapFeatureData[];
}

/** 지도 데이터(빌드 global/map.pmtiles — 게임이 읽어 디코드). 좌표 = 웹 메르카토르 정규(0…1, y 아래). */
export interface MapSource {
  readonly state: ReadonlySignal<'idle' | 'loading' | 'ready' | 'missing'>;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** 처음 필요할 때 받기 시작(여러 번 불러도 한 번). */
  load(): void;
  tile(z: number, x: number, y: number): Promise<MapTileData | null>;
}

/** 세이브 v2(12 §4 — M10-T06 ADR-0096): 위치·시각·발견 기록·빠른 이동·사진 메타(썸네일 Blob은 IndexedDB `photo/<id>` 따로). */
export interface SaveData {
  v: 2;
  /** 저장 실제 시각(epoch ms). */
  savedAt: number;
  posWF: Vec3d;
  yawRad: number;
  mode: 'walk' | 'freecam';
  gameTimeMs: number;
  /** posWF = 발견한 자리(빠른 이동 목표 — 없으면 명소 좌표). */
  discoveries: { id: string; atMs: number; weather: string; photoIds: string[]; posWF?: Vec3d }[];
  unlocked: string[];
  photos: { id: string; atMs: number; poiId: string | null }[];
  stats: { walkedM: number };
}

/** 내보내기 파일(JSON): 세이브 + 설정 + 사진 썸네일(data URL). */
export interface SaveExport {
  format: 'tokyo-sanpo-save';
  save: SaveData;
  settings: SettingsModel;
  thumbs: Record<string, string>;
}

/** 세이브 가져오기 실패 사유(ADR-0103): 형식이 아님·손상 | 파일이 상한보다 큼(읽기 전) | 배열·썸네일 합계가 상한 초과. */
export type SaveImportProblem = 'invalid' | 'too_large' | 'too_many';

export type StartChoice = { kind: 'continue' } | { kind: 'new'; at: string };

export interface UiCommands {
  pause(on: boolean): void;
  start(choice: StartChoice): Promise<void>;
  fastTravel(placeId: string): Promise<void>;
  setTime(ms: number): void;
  setWeather(mode: string, preset?: string): void;
  /** 원본 캡처 PNG(×1|×2 — 화이트밸런스·비네팅·그레인은 UI가 합성). */
  takePhoto(scale: 1 | 2): Promise<Blob>;
  /** 포토 모드 파라미터(null = 나가기). 들어가지 못하면(탈것·열차 중) false. */
  setPhotoParams(p: PhotoParams | null): boolean;
  /** 썸네일 보관 + 가까운 발견 명소(250 m)에 연결 → 사진 id·명소 이름. */
  storePhoto(thumb: Blob): Promise<{ id: string; poiName: LocalName | null }>;
  /** 화면 점(0…1)까지 거리 m(오른쪽 클릭 초점) — 없으면 null. */
  pickFocus(x: number, y: number): Promise<number | null>;
  exportSave(): Promise<Blob>;
  importSave(f: File): Promise<void>;
}

export interface UiBridge {
  hud: ReadonlySignal<HudModel>;
  loading: ReadonlySignal<LoadingModel>;
  discoveries: ReadonlySignal<readonly DiscoveryModel[]>;
  places: ReadonlySignal<readonly TravelPlace[]>;
  settings: Signal<SettingsModel>;
  /** 이어하기 가능(세이브 있음). */
  hasSave: ReadonlySignal<boolean>;
  /** 타이틀 "새 산책" 시작 지점(스폰 프리셋 id·이름). */
  startPoints: readonly { id: string; name: LocalName }[];
  credits(): Promise<CreditsModel>;
  /** WF → 웹 메르카토르 정규 좌표(0…1, y 아래). */
  worldToMap(posWF: Vec3d): { x: number; y: number };
  map: MapSource;
  /** 도감 사진 썸네일 URL(blob:, 포토 모드 — 없으면 빈 칸). */
  photoUrl?(id: string): string | undefined;
  commands: UiCommands;
}

export interface UiOptions {
  /** 타이틀·자동 일시정지(포인터 잠금 풀림) 사용. false = 개발·테스트(`?debug=1` 등) — 로딩 뒤 바로 HUD. */
  menus: boolean;
  /** 시작 화면 스택(샌드박스·스크린샷 — 기본 ['boot']). */
  initial?: readonly ScreenId[];
}

export interface UiHandle {
  readonly screen: ReadonlySignal<ScreenId>;
  /** 화면 열기(HUD에서 지도·포토·일시정지 — 게임 입력 배선). */
  open(s: ScreenId): void;
  /** 메뉴 닫고 HUD로. */
  close(): void;
  /** 도움말 패널 접기·펴기(H). */
  toggleHelp(): void;
  dispose(): void;
}
