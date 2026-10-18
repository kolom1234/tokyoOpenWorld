// world-view.ts 보조(400줄 제한으로 분리): 상시 배선 시스템·부팅 단계, sim 생성(시계·신호·기후·공휴일·계절·날씨 모드), 늦은 상태 초기값, 선컴파일 시작, 프레임 소스, 스폰 셀 미리 컴파일(ADR-0085).
import type { EventBus, FrameSource, GameSystem, Logger } from '@sanpo/core';
import type { RenderService } from '@sanpo/render';
import {
  type ClockMode,
  createSim,
  type HolidaysFile,
  type SeasonTableFile,
  type SignalPlansFile,
  type SimService,
  type WeatherClimateFile,
} from '@sanpo/sim';
import type { TraversalService } from '@sanpo/traversal';
import HOLIDAYS from '../../../content/sim/holidays-jp.json';
import SEASON from '../../../content/sim/season.json';
import SIGNAL_PLANS from '../../../content/sim/signal-plans.json';
import WEATHER_CLIMATE from '../../../content/sim/weather-climate.json';
import type { BootStage } from './boot-progress.ts';
import type { WeatherOverride } from './debug/wet-override.ts';
import { landingHudSystem } from './landing-hud.ts';
import { trainLcdSystem } from './train-lcd.ts';
import { applyWeatherSpec, startLiveWeather, type WeatherSpec } from './weather-mode.ts';
import { createCameraWiring } from './wiring/camera.ts';
import { createEnvWiring, defaultClock } from './wiring/env.ts';
import type { LateState } from './world-late.ts';

/** sim(시계 + 신호 계획 content/sim/signal-plans.json — M06-T02 + 날씨 기후표 — M09-T01). */
/** simFor 입력(WorldViewDeps 부분 — 순환 import 방지). */
export interface SimForDeps {
  bus: EventBus;
  log: Logger;
  now?: () => number;
  clock?: ClockMode;
  weatherSpec?: WeatherSpec;
  onLiveWeather?: (on: boolean) => void;
}

export function simFor(deps: SimForDeps): SimService {
  const now = deps.now ?? Date.now;
  const signalPlans = SIGNAL_PLANS as unknown as SignalPlansFile;
  const weatherClimate = WEATHER_CLIMATE as unknown as WeatherClimateFile;
  const sim = createSim({
    bus: deps.bus,
    log: deps.log,
    now,
    initialClock: deps.clock ?? defaultClock(now()),
    signalPlans,
    weatherClimate,
    holidays: HOLIDAYS as HolidaysFile,
    season: SEASON as SeasonTableFile,
  });
  const spec = deps.weatherSpec ?? { mode: 'auto' };
  applyWeatherSpec(sim, spec, weatherClimate);
  if (spec.mode === 'live') startLiveWeather(sim, deps.log.child('weather'), deps.onLiveWeather ?? (() => {}));
  return sim;
}

export function initialLate(): LateState {
  return {
    materialsSettled: false,
    avatarSettled: false,
    treesSettled: false,
    signsSettled: false,
    crowdSettled: false,
    trainsSettled: false,
    boot: { precompile: { stage: 'atmosphere', done: 0, total: 1 }, done: false },
  };
}

/** 선컴파일은 월드와 무관 → 렌더 생성 직후 시작(world.json·cells.idx 조회와 겹침). 진행은 로딩 패널 준비 행으로. */
export function startPrecompile(render: RenderService, late: LateState, log: Logger): Promise<void> {
  return render
    .precompile((p) => {
      late.boot.precompile = p;
    })
    .catch((e: unknown) => log.child('world').warn('precompile', e));
}

/** 스케줄러 프레임 소스: 카메라·플레이어 = traversal, 시각 = sim 시계. */
export function frameSourceOf(traversal: TraversalService, sim: SimService): FrameSource {
  return {
    camera: () => traversal.camera,
    player: () => traversal.player,
    gameTimeMs: () => sim.clock.gameTimeMs,
    timeScale: () => sim.clock.timeScale,
  };
}

/** 대기 그룹 반복 컴파일(on이 false가 될 때까지, 0.5 s 간격 — stop()이면 간격 대기를 바로 끝낸다). */
export async function warmStaged(render: RenderService, warm: { on: boolean; stop: () => void }): Promise<void> {
  while (warm.on) {
    await render.compileStaged().catch(() => undefined);
    if (!warm.on) break;
    await new Promise<void>((r) => {
      warm.stop = r;
      setTimeout(r, 500);
    });
  }
}

/** 부팅 단계 구조(UI 로딩 화면): 선컴파일·스폰 셀 live 수. */
export function bootStageOf(late: LateState): { boot: Readonly<BootStage>; live: number } {
  return { boot: late.boot, live: late.boot.spawn?.filter((k) => late.streaming?.stateOf(k) === 'live').length ?? 0 };
}

/** 상시 배선: 카메라·환경·차내 안내·내리기 안내(HUD는 shell). */
export function wiringSystemsFor(
  doc: Document,
  weather: WeatherOverride | undefined,
  v: { render: RenderService; traversal: TraversalService; sim: SimService; late: LateState },
): GameSystem[] {
  return [
    createCameraWiring(v.traversal, v.render),
    createEnvWiring(v.sim, v.render, weather),
    trainLcdSystem(doc, v.traversal, () => v.late.rail),
    landingHudSystem(doc, v.traversal),
  ];
}
