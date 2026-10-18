// 목 UiBridge(`?ui-sandbox=1` 스토리 페이지·단위 테스트): 가짜 로딩 진행, HUD 모드 순환, 고정 크레딧. 게임 없이 화면을 본다.
import { type Signal, signal } from '@preact/signals';
import type {
  CreditsModel,
  DiscoveryModel,
  HudModel,
  LoadingModel,
  SettingsModel,
  TravelPlace,
  UiBridge,
} from '../../api.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';

export const MOCK_HUD: HudModel = {
  mode: 'walk',
  place: { ko: '시부야구 도겐자카 2초메', ja: '渋谷区 道玄坂二丁目', en: 'Dogenzaka 2-chome, Shibuya' },
  timeMs: Date.parse('2026-05-15T12:00:00+09:00'),
  weather: 'clear',
  tempC: null,
  prompt: { key: 'hud.prompt.boardTrain' },
  notice: null,
  noticeSeq: 0,
  guide: {
    kind: 'gate',
    station: { ko: '하라주쿠', ja: '原宿', en: 'Harajuku' },
    exit: { ko: '다케시타 출구', ja: '竹下口', en: 'Takeshita Exit' },
    distanceM: 32,
    arrowDeg: 45,
  },
  drive: null,
  train: null,
  groundLoading: false,
  fade: 0,
  posWF: { x: 0, y: 15, z: 0 },
  yawRad: 0,
  gamepad: false,
};

const MOCK_CREDITS: CreditsModel = {
  buildId: 'sandbox',
  data: [
    {
      id: 'osm',
      kind: 'data',
      title: 'OpenStreetMap',
      license: 'ODbL-1.0',
      url: 'https://www.openstreetmap.org/copyright',
      attribution: {
        ko: '© OpenStreetMap contributors',
        ja: '© OpenStreetMap contributors',
        en: '© OpenStreetMap contributors',
      },
    },
  ],
  oss: [{ name: 'preact', version: '10.29.8', license: 'MIT' }],
};

export interface MockBridge extends UiBridge {
  hudSignal: Signal<HudModel>;
  loadingSignal: Signal<LoadingModel>;
  paused: boolean[];
}

export function createMockBridge(opts: { settings?: Partial<SettingsModel>; ready?: boolean } = {}): MockBridge {
  const hud = signal<HudModel>(MOCK_HUD);
  const loading = signal<LoadingModel>({
    stage: opts.ready ? 'ready' : 'shaders',
    progress: opts.ready ? 1 : 0.4,
    detail: opts.ready ? null : { key: 'boot.detail.shaders', params: { done: 12, total: 30 } },
    webgpu: true,
    isolated: true,
    error: null,
  });
  const paused: boolean[] = [];
  return {
    hudSignal: hud,
    loadingSignal: loading,
    paused,
    hud,
    loading,
    discoveries: signal<readonly DiscoveryModel[]>([]),
    places: signal<readonly TravelPlace[]>([]),
    settings: signal<SettingsModel>({ ...DEFAULT_SETTINGS, ...opts.settings }),
    hasSave: signal(true),
    startPoints: [
      {
        id: 'shibuya-scramble',
        name: { ko: '시부야 스크램블 교차로', ja: '渋谷スクランブル交差点', en: 'Shibuya Scramble Crossing' },
      },
      { id: 'harajuku-gate', name: { ko: '하라주쿠역', ja: '原宿駅', en: 'Harajuku Station' } },
      { id: 'shinjuku-west', name: { ko: '신주쿠역 서쪽 출구', ja: '新宿駅西口', en: 'Shinjuku Sta. West Exit' } },
    ],
    credits: () => Promise.resolve(MOCK_CREDITS),
    worldToMap: (p) => ({ x: p.x, y: p.z }),
    commands: {
      pause: (on) => {
        paused.push(on);
      },
      start: () => new Promise((r) => setTimeout(r, 300)),
      fastTravel: () => Promise.resolve(),
      setTime: () => {},
      setWeather: () => {},
      takePhoto: () => Promise.resolve(new Blob()),
      setPhotoParams: () => {},
      exportSave: () => Promise.resolve(new Blob(['{}'], { type: 'application/json' })),
      importSave: () => Promise.resolve(),
    },
  };
}
