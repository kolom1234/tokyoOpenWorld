// createSim(M03-T03 최소): 월드 시계(phase 10) + environment()(카메라 위치의 태양·달, 캐시) + 날씨(M09-T01 weather/service.ts). 계절은 M09-T05.
// see docs/modules/sim.md, docs/10-simulation.md §2

import type { EnvironmentState, GameSystem, SeasonParams, Vec3d, WeatherParams } from '@sanpo/core';
import { wfToLonLat } from '@sanpo/geo';
import type { SimDeps, SimService } from '../api.ts';
import { clearSkyIlluminanceLux, moonPosition, sunPosition } from './clock/astronomy.ts';
import { createWorldClock } from './clock/world-clock.ts';
import { weatherScale } from './crowd/density.ts';
import { createRailRt } from './rail/network.ts';
import { createRailStations, type RailStations } from './rail/stations.ts';
import { createTrainSim, type TrainSim } from './rail/trains.ts';
import { signalState } from './signals/controller.ts';
import { compilePlans } from './signals/plans.ts';
import { CLEAR_WEATHER, createWeatherService, type WeatherCore } from './weather/service.ts';
import { createWorkerLink } from './worker/link.ts';

/** 01-architecture §5: sim 시계 = phase 10. */
export const SIM_CLOCK_PHASE = 10;
/**
 * 관측 위치 격자(m): 환경은 격자점에서 계산한다(5 km 이동해도 태양 방향 차 < 0.05°). 스냅하지 않으면 캐시를 처음 채운 위치에 따라
 * 결과가 1 LSB씩 달라져 같은 장소·시각의 화면이 경로 의존적이 된다(원점 재설정 e2e에서 실측).
 */
const OBSERVER_GRID_M = 1000;

function dayOfYearJst(ms: number): number {
  const d = new Date(ms + 9 * 3600_000);
  const y = d.getUTCFullYear();
  return Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}

function seasonOf(ms: number): SeasonParams {
  return { dayOfYear: dayOfYearJst(ms), foliageTint: 0, bloom: 0, leafDensity: 1, outfitPalette: 0 };
}

/** 바람 벡터(WF m/s, 부는 쪽) — windDirDeg = 불어오는 방위(북 0°, 시계 +). */
function windOf(w: WeatherParams): { x: number; y: number; z: number } {
  const to = ((w.windDirDeg + 180) * Math.PI) / 180;
  return { x: Math.sin(to) * w.windMs, y: 0, z: -Math.cos(to) * w.windMs };
}

export function computeEnvironment(
  ms: number,
  observerWF: Readonly<Vec3d>,
  weather: WeatherParams = CLEAR_WEATHER,
): EnvironmentState {
  const ll = wfToLonLat({ x: observerWF.x, y: observerWF.y, z: observerWF.z });
  const sun = sunPosition(ms, ll);
  const moon = moonPosition(ms, ll);
  return {
    gameTimeMs: ms,
    sunDirWF: sun.dirWF,
    moonDirWF: moon.dirWF,
    sunIlluminanceLux: clearSkyIlluminanceLux(sun.elDeg),
    moonPhase: moon.phase,
    weather: { ...weather },
    season: seasonOf(ms),
    wind: windOf(weather),
  };
}

/** environment() 캐시: 같은 시각·관측 격자점·날씨 객체면 같은 결과. */
function envCache(clock: { readonly gameTimeMs: number }, weather: WeatherCore, observer: Readonly<Vec3d>) {
  let cache: { ms: number; x: number; z: number; w: WeatherParams; env: EnvironmentState } | undefined;
  return (): EnvironmentState => {
    const ms = clock.gameTimeMs;
    const x = Math.round(observer.x / OBSERVER_GRID_M) * OBSERVER_GRID_M;
    const z = Math.round(observer.z / OBSERVER_GRID_M) * OBSERVER_GRID_M;
    const w = weather.at(ms);
    const c = cache;
    if (c && c.ms === ms && c.x === x && c.z === z && c.w === w) return c.env;
    const e = computeEnvironment(ms, { x, y: 0, z }, w);
    cache = { ms, x, z, w, env: e };
    return e;
  };
}

export function createSim(deps: SimDeps): SimService {
  const clock = createWorldClock(deps.now ?? Date.now, deps.initialClock);
  const weather = createWeatherService(deps.weatherClimate, () => clock.gameTimeMs);
  const observer: Vec3d = { x: 0, y: 0, z: 0 };
  const link = createWorkerLink(clock, deps);
  let trains: TrainSim | undefined;
  let stations: RailStations | undefined;
  const env = envCache(clock, weather, observer);
  const system: GameSystem = {
    id: 'sim/clock',
    phase: SIM_CLOCK_PHASE,
    update(f) {
      clock.tick(f.dtReal);
      observer.x = f.camera.posWF.x;
      observer.y = f.camera.posWF.y;
      observer.z = f.camera.posWF.z;
      link.frame(f.player, f.camera, weatherScale(env().weather.rainMmH));
      // 열차(M07-T03): 시계 뒤 같은 프레임 시각으로 — 탑승 카메라·render가 이번 프레임 값을 본다(ADR-0072).
      trains?.update(clock.gameTimeMs, observer);
      if (trains) stations?.update(trains.trains());
    },
    dispose() {},
  };
  const plans = deps.signalPlans ? compilePlans(deps.signalPlans) : [];
  return {
    signalStateAt: (code) => signalState(plans, code, clock.gameTimeMs / 1000),
    clock,
    weather,
    startWorker: (o) => link.start(o),
    addCell: (key, nav, lanes) => link.addCell(key, nav, lanes),
    outputs: () => ({ ...link.outputs(), ...(trains ? { trains: trains.buffer } : {}) }),
    setRail(net, tables) {
      const rt = createRailRt(net);
      trains = createTrainSim(rt, tables);
      stations = createRailStations(rt);
      trains.update(clock.gameTimeMs, observer);
      stations.update(trains.trains());
    },
    trainBodies: (p, r) => trains?.bodiesNear(p, r) ?? new Float64Array(0),
    trainCar: (id, k) => trains?.car(id, k),
    trainRide: (id) => trains?.ride(id),
    railStatic: () => stations?.layout,
    psdGateOpen: () => stations?.gateOpen ?? new Float32Array(0),
    trainsNear: (p, r) => trains?.trainsNear(p, r) ?? [],
    trainStats: () => trains?.stats(),
    removeCell: (key) => link.removeCell(key),
    crowdScenario: (c, r, n) => link.scenario(c, r, n),
    connectPhysics: (l) => link.connectPhysics(l),
    workerStats: () => link.stats(),
    environment: env,
    systems: () => [system],
  };
}
