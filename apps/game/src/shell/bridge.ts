// UiBridge 구현(M10-T01): 시그널(HUD 10 Hz·로딩·설정) + 명령(일시정지·시작·빠른 이동) + @sanpo/ui 마운트. 월드는 attach 뒤에 붙는다(그 전 명령은 무시).
// 게임 로직 없음 — traversal·sim·input 상태를 모으고 명령을 서비스 호출로 옮긴다. see docs/modules/game.md
import { type CellKey, type GameSystem, unpackCellKey, type Vec3d } from '@sanpo/core';
import { cellOf } from '@sanpo/geo';
import {
  type CreditsModel,
  computed,
  type DiscoveryModel,
  effect,
  type HudModel,
  type LoadingModel,
  mountUi,
  type SettingsModel,
  type Signal,
  signal,
  type TravelPlace,
  type UiBridge,
  type UiHandle,
} from '@sanpo/ui';
import type { WorldView } from '../world-view.ts';
import { createCommands, startPoints } from './commands.ts';
import { loadCredits } from './credits.ts';
import { hudStateOf, topPrompt } from './hud-state.ts';
import { INITIAL_LOADING, loadingOfBoot } from './loading.ts';
import { createPause } from './pause.ts';
import { createPlaceIndex, type PlaceIndex } from './places.ts';
import { applySettings, loadSettings, saveSettings } from './settings.ts';

const HUD_INTERVAL_S = 0.1;
const GROUND_SHOW_S = 0.2;
/** L0 셀 크기(m — 05 §1). */
const L0_CELL_M = 256;

export interface ShellOptions {
  menus: boolean;
  storage: Storage | undefined;
  /** `?quality=`·골든뷰 = 티어 고정. */
  fixedQuality: boolean;
  fixedFov: boolean;
  buildId?: () => string | null;
}

export interface Shell {
  readonly bridge: UiBridge;
  readonly ui: UiHandle;
  readonly loading: Signal<LoadingModel>;
  readonly settings: Signal<SettingsModel>;
  /** createWorldView 직후: 설정 적용·HUD·열기 단축키 배선. 반환 = 등록할 시스템. */
  attach(world: WorldView): GameSystem[];
  dispose(): void;
}

const EMPTY_HUD: HudModel = {
  mode: 'idle',
  place: null,
  timeMs: 0,
  weather: 'clear',
  tempC: null,
  prompt: null,
  notice: null,
  noticeSeq: 0,
  guide: null,
  drive: null,
  train: null,
  groundLoading: false,
  fade: 0,
  posWF: { x: 0, y: 0, z: 0 },
  yawRad: 0,
  gamepad: false,
};

function hudOf(doc: Document, w: WorldView, groundS: number, places: PlaceIndex): HudModel {
  const s = hudStateOf(doc);
  const t = w.traversal;
  const p = t.player.posWF;
  return {
    ...EMPTY_HUD,
    mode: t.mode,
    place: places.at(p.x, p.z),
    tempC: w.sim.weather.params.temperatureC ?? null,
    drive: s.drive,
    train: s.train,
    timeMs: w.sim.clock.gameTimeMs,
    weather: w.sim.weather.stateId,
    prompt: topPrompt(s),
    notice: s.notice,
    noticeSeq: s.noticeSeq,
    guide: s.guide,
    groundLoading: groundS >= GROUND_SHOW_S,
    fade: s.fade ? 1 : 0,
    posWF: { x: p.x, y: p.y, z: p.z },
    yawRad: t.player.yawRad,
    gamepad: w.input.gamepadConnected,
  };
}

/** 셀 meta.json → 지명 색인(이미 있으면 생략). */
function loadPlaces(w: WorldView, places: PlaceIndex, key: CellKey): void {
  const s = w.streaming;
  if (!s || places.has(key)) return;
  const { ix, iz } = unpackCellKey(key);
  // 빈 항목으로 먼저 표시(요청 중 중복 방지) → 메타가 오면 교체.
  places.add(key, ix * L0_CELL_M, iz * L0_CELL_M, { placeNames: [] });
  void s
    .requestSections(key, ['meta.json'])
    .then((r) => {
      if (r.meta) places.add(key, ix * L0_CELL_M, iz * L0_CELL_M, r.meta);
    })
    .catch(() => undefined);
}

/** live L0 셀 → meta.json placeNames 색인(해제되면 뺀다). 구독 전에 붙은 셀은 발밑 셀 보충(placesFallback)이 채운다. */
function watchPlaces(w: WorldView, places: PlaceIndex): true {
  w.wiring?.onCell((p) => {
    if (p.level === 0) loadPlaces(w, places, p.key);
  });
  w.streaming?.onEvicted((key) => places.remove(key));
  return true;
}

/** HUD 시그널을 10 Hz로(바뀐 값만) + 로딩 단계 + 열기 단축키(지도·포토·일시정지). */
function hudSystem(doc: Document, w: WorldView, shell: Shell, hud: Signal<HudModel>): GameSystem {
  let acc = HUD_INTERVAL_S;
  let groundS = 0;
  let sig = '';
  const places = createPlaceIndex();
  let watching = false;
  return {
    id: 'shell.hud',
    phase: 96,
    update(f) {
      groundS = w.traversal.hud.groundLoading ? groundS + f.dtReal : 0;
      if (!watching && w.wiring && w.streaming) watching = watchPlaces(w, places);
      const p = w.traversal.player.posWF;
      if (watching && acc === 0) loadPlaces(w, places, cellOf(0, p.x, p.z));
      if (shell.loading.peek().stage !== 'ready' && shell.loading.peek().stage !== 'error') {
        const st = w.bootStage();
        shell.loading.value = { ...shell.loading.peek(), ...loadingOfBoot(st.boot, st.live) };
      }
      if (shell.ui.screen.peek() === 'hud' && w.input.enabled) {
        const a = w.input.state;
        if (a.justPressed('pause')) shell.ui.open('pause');
        else if (a.justPressed('map')) shell.ui.open('map');
        else if (a.justPressed('photo')) shell.ui.open('photo');
      }
      acc += f.dtReal;
      if (acc < HUD_INTERVAL_S) return;
      acc = 0;
      const h = hudOf(doc, w, groundS, places);
      // 위치·시각은 매번 바뀐다 — 지도 기호용으로 0.5 m·1분 단위만 비교.
      const key = JSON.stringify({
        ...h,
        posWF: [Math.round(h.posWF.x * 2), Math.round(h.posWF.z * 2)],
        yawRad: Math.round(h.yawRad * 20),
        timeMs: Math.floor(h.timeMs / 60_000),
      });
      if (key === sig) return;
      sig = key;
      hud.value = h;
    },
    dispose() {},
  };
}

/** 설정이 바뀔 때마다 서비스에 적용하고 저장(첫 적용은 저장 안 함). */
function settingsEffect(w: WorldView, settings: Signal<SettingsModel>, opts: ShellOptions): () => void {
  let prev: SettingsModel | undefined;
  const targets = {
    render: w.render,
    traversal: w.traversal,
    input: w.input,
    audio: () => w.audio,
    fixedQuality: opts.fixedQuality,
    fixedFov: opts.fixedFov,
  };
  return effect(() => {
    const s = settings.value;
    applySettings(targets, s, prev);
    if (prev) saveSettings(opts.storage, s);
    prev = s;
  });
}

export function createShell(doc: Document, root: HTMLElement, opts: ShellOptions): Shell {
  const settings = signal(loadSettings(opts.storage, doc.defaultView?.navigator.languages));
  const loading = signal<LoadingModel>(INITIAL_LOADING);
  const hud = signal<HudModel>(EMPTY_HUD);
  let world: WorldView | undefined;
  const pause = createPause(doc, () => world);
  const bridge: UiBridge = {
    hud,
    loading,
    discoveries: signal<readonly DiscoveryModel[]>([]),
    places: signal<readonly TravelPlace[]>([]),
    settings,
    hasSave: computed(() => false),
    startPoints: startPoints(),
    credits: (): Promise<CreditsModel> => loadCredits(opts.buildId?.() ?? null),
    worldToMap: (p: Vec3d) => ({ x: p.x, y: p.z }),
    commands: createCommands({ doc, world: () => world, pause }),
  };
  const ui = mountUi(root, bridge, { menus: opts.menus });
  const offs: (() => void)[] = [];
  const shell: Shell = {
    bridge,
    ui,
    loading,
    settings,
    attach(w) {
      world = w;
      offs.push(settingsEffect(w, settings, opts), pause.autoPause(ui, opts.menus));
      return [hudSystem(doc, w, shell, hud)];
    },
    dispose() {
      for (const off of offs) off();
      ui.dispose();
    },
  };
  return shell;
}
