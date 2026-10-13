// world-view.ts 보조(400줄 제한으로 분리): sim 생성(시계·신호·기후·공휴일·계절·날씨 모드), 늦은 상태 초기값, 선컴파일 시작, 프레임 소스, 스폰 셀 미리 컴파일(ADR-0085).
import type { EventBus, FrameSource, Logger } from '@sanpo/core';
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
import { precompileText } from './boot-progress.ts';
import { applyWeatherSpec, startLiveWeather, type WeatherSpec } from './weather-mode.ts';
import { defaultClock } from './wiring/env.ts';
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
    boot: { precompile: '대기 LUT…', done: false },
  };
}

/** 선컴파일은 월드와 무관 → 렌더 생성 직후 시작(world.json·cells.idx 조회와 겹침). 진행은 로딩 패널 준비 행으로. */
export function startPrecompile(render: RenderService, late: LateState, log: Logger): Promise<void> {
  return render
    .precompile((p) => {
      late.boot.precompile = precompileText(p);
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
