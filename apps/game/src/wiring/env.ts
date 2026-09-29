// 배선: sim.environment()(태양·달·날씨, 카메라 위치) → render.setEnvironment. camera(65) 뒤·renderPrep(70) 앞. see docs/modules/game.md, docs/01-architecture.md §5
import type { GameSystem } from '@sanpo/core';
import type { RenderService } from '@sanpo/render';
import type { ClockMode, SimService } from '@sanpo/sim';

export const ENV_WIRING_PHASE = 66;
const JST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;
/** 기본 시작 시각(JST 시): 설정 UI(M08) 전 — 부팅 때 밤이면 화면이 어둡기 때문에 오늘 정오부터 1배속. */
const DEFAULT_START_HOUR_JST = 12;

/** 오늘(JST) 정오부터 1배속으로 흐르는 시계. */
export function defaultClock(nowMs: number): ClockMode {
  const dayStart = Math.floor((nowMs + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
  return { kind: 'custom', startMs: dayStart + DEFAULT_START_HOUR_JST * 3600_000, scale: 1 };
}

export function createEnvWiring(sim: SimService, render: Pick<RenderService, 'setEnvironment'>): GameSystem {
  return {
    id: 'wiring/env',
    phase: ENV_WIRING_PHASE,
    update: () => render.setEnvironment(sim.environment()),
    dispose() {},
  };
}
