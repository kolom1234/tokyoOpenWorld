// 자체 날씨(10 §3, M09-T01 — ADR-0076): 30분 칸 마르코프. 칸마다 시드 난수 u1 > stay면 그 달 분포 p에서 u2로 다시 뽑고, 아니면 앞 칸 상태 유지.
// 다시 뽑기는 앞 상태와 무관 → 어떤 시작 상태에서 돌려도 첫 다시 뽑기에서 합류 = 지금 상태 = "마지막 다시 뽑기 칸"의 결과(시간 순수 함수 — 아무 시각으로 점프해도 같다).
// 정상 분포 = p(T = stay·I + (1 − stay)·p). 칸 경계 blendMin 분 동안 앞 상태 값에서 선형 보간.
import { hash32, type WeatherParams, WORLD_SEED } from '@sanpo/core';
import type { WeatherClimateFile, WeatherStateDef } from '../../api.ts';

const JST_MS = 9 * 3_600_000;
const U32 = 0x1_0000_0000;
/** 뒤로 찾는 칸 상한(stay 0.9 → 평균 10칸, 0.9^400 ≈ 0). */
const MAX_LOOKBACK = 400;

/** 칸 k(JST 기준 slotMin 분 단위 일련)의 달(0–11). */
export function monthOfSlot(c: WeatherClimateFile, slot: number): number {
  return new Date(slot * c.slotMin * 60_000).getUTCMonth();
}

const u01 = (slot: number, salt: string): number => hash32(WORLD_SEED, 'weather', salt, slot) / U32;

/** 누적 분포 역함수(합이 1이 아니어도 정규화). */
export function pickState(p: readonly number[], u: number): number {
  const total = p.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += (p[i] as number) / total;
    if (u < acc) return i;
  }
  return p.length - 1;
}

export interface MarkovCache {
  readonly states: Map<number, number>;
}

export const createMarkovCache = (): MarkovCache => ({ states: new Map() });

/** 칸 k의 상태 번호(states 순서). 캐시는 칸 → 상태(같은 기후표 동안 유효). */
export function stateAtSlot(c: WeatherClimateFile, slot: number, cache?: MarkovCache): number {
  const hit = cache?.states.get(slot);
  if (hit !== undefined) return hit;
  let s = 0;
  for (let j = slot, n = 0; n < MAX_LOOKBACK; j--, n++) {
    const m = c.months[monthOfSlot(c, j)];
    if (!m) break;
    if (u01(j, 'redraw') >= m.stay || n === MAX_LOOKBACK - 1) {
      s = pickState(m.p, u01(j, 'state'));
      break;
    }
  }
  if (cache) {
    if (cache.states.size > 4096) cache.states.clear();
    cache.states.set(slot, s);
  }
  return s;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 게임 시각(Unix ms)의 JST 칸 일련·칸 안 분. */
export function slotOf(c: WeatherClimateFile, ms: number): { slot: number; minIn: number } {
  const jstMin = (ms + JST_MS) / 60_000;
  const slot = Math.floor(jstMin / c.slotMin);
  return { slot, minIn: jstMin - slot * c.slotMin };
}

/** 상태 정의 → 날씨 값(젖음 제외 — wetness.ts). 바람 방향·기온은 달 표 + 일교차(14시 최고, ±3 °C), 비·눈이면 −1.5 °C. */
function paramsOfState(c: WeatherClimateFile, def: WeatherStateDef, ms: number): Omit<WeatherParams, 'wetness'> {
  const m = c.months[new Date(ms + JST_MS).getUTCMonth()] ?? c.months[0];
  const hour = ((((ms + JST_MS) / 3_600_000) % 24) + 24) % 24;
  const diurnal = 3 * Math.cos(((hour - 14) / 24) * 2 * Math.PI);
  const wet = def.rainMmH > 0 || def.snow > 0 ? -1.5 : 0;
  return {
    cloudCover: def.cloudCover,
    rainMmH: def.rainMmH,
    fog: def.fog,
    windMs: def.windMs,
    windDirDeg: m?.windDirDeg ?? 0,
    snow: def.snow,
    temperatureC: Math.round(((m?.tempC ?? 15) + diurnal + wet) * 10) / 10,
  };
}

/** 게임 시각의 날씨(전이 보간 포함, 젖음 0). id = 지금 칸 상태. */
export function weatherAt(
  c: WeatherClimateFile,
  ms: number,
  cache?: MarkovCache,
): { id: string; params: Omit<WeatherParams, 'wetness'> } {
  const { slot, minIn } = slotOf(c, ms);
  const cur = c.states[stateAtSlot(c, slot, cache)] as WeatherStateDef;
  const a = paramsOfState(c, cur, ms);
  if (minIn >= c.blendMin) return { id: cur.id, params: a };
  const prev = c.states[stateAtSlot(c, slot - 1, cache)] as WeatherStateDef;
  if (prev === cur) return { id: cur.id, params: a };
  const b = paramsOfState(c, prev, ms);
  const t = minIn / c.blendMin;
  return {
    id: cur.id,
    params: {
      cloudCover: lerp(b.cloudCover, a.cloudCover, t),
      rainMmH: lerp(b.rainMmH, a.rainMmH, t),
      fog: lerp(b.fog, a.fog, t),
      windMs: lerp(b.windMs, a.windMs, t),
      windDirDeg: a.windDirDeg,
      snow: lerp(b.snow, a.snow, t),
      temperatureC: a.temperatureC ?? 15,
    },
  };
}
