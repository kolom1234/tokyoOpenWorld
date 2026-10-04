// sim.worker 군중 실행(M06-T03): Recast WASM 초기화 → 내비 월드(셀 nav.bin) + tier A 군중, 신호 램프 = 계획(게임 시각 순수 함수), 게임 시각 = 메인 동기값 + 경과 × 배속.
// 초기화 전에 온 셀은 보류했다가 넣는다. 더미 모드(T01)는 sim.worker가 그대로.

import { init } from '@recast-navigation/core';
import type { Vec3, Vec3d } from '@sanpo/core';
import type { NavCrossing } from '@sanpo/tile-format';
import type { CrowdParams, SignalPlansFile } from '../../api.ts';
import { type CrowdSim, type CrowdSimStats, createCrowdSim } from '../crowd/crowd-sim.ts';
import { createNavWorld, type NavWorld } from '../crowd/nav-world.ts';
import { signalState } from '../signals/controller.ts';
import { type CompiledPlan, compilePlans } from '../signals/plans.ts';

/** 메인 → 워커 시계 동기(게임 시각 ms, 그 순간 절대 ms, 배속 — frozen = 0). */
export interface ClockSync {
  gameMs: number;
  atAbs: number;
  scale: number;
}

export interface CrowdRuntime {
  addCell(key: number, nav: ArrayBuffer): void;
  removeCell(key: number): void;
  setPlayer(pos: Readonly<Vec3d>, vel: Readonly<Vec3>, fwd?: Readonly<Vec3>): void;
  setDensityScale(k: number): void;
  setClock(c: ClockSync): void;
  scenario(center: Readonly<Vec3d>, radius: number, count: number): void;
  /** dt 진행 → out(WF − anchor), 반환 = 쓴 수(준비 전 0). */
  step(dt: number, nowAbs: number, out: Float32Array, anchor: Readonly<Vec3d>): number;
  stats(): (CrowdSimStats & { tiles: number; cells: number; crossings: number }) | undefined;
  /** 차량 램프(같은 계획·같은 게임 시각 — 교통이 쓴다). */
  vehicleLamp(code: number): 'G' | 'Y' | 'R';
  /** 마지막 step의 게임 시각(ms). */
  gameMs(): number;
  /** 반경 r 안 횡단보도(내비 월드 — 교통 횡단보도 정차 금지, M06-T06). 준비 전 빈 배열. */
  crossingsNear(x: number, z: number, r: number): readonly NavCrossing[];
}

export function createCrowdRuntime(
  params: CrowdParams,
  plansFile: SignalPlansFile | undefined,
  clock0: ClockSync,
): CrowdRuntime {
  let nav: NavWorld | undefined;
  let tier: CrowdSim | undefined;
  let densityScale = 1;
  let clock = clock0;
  const pending = new Map<number, ArrayBuffer | null>();
  let pendingScenario: { center: Vec3d; radius: number; count: number } | undefined;
  const plans: CompiledPlan[] = plansFile ? compilePlans(plansFile) : [];
  const gameMs = (nowAbs: number): number => clock.gameMs + (nowAbs - clock.atAbs) * clock.scale;
  let nowGameS = clock.gameMs / 1000;
  const ped = (code: number) => signalState(plans, code, nowGameS).ped;
  void init().then(() => {
    nav = createNavWorld();
    tier = createCrowdSim(nav, params, ped);
    tier.setDensityScale(densityScale);
    for (const [k, b] of pending) if (b) nav.addCell(k, new Uint8Array(b));
    pending.clear();
  });
  return {
    addCell(key, b) {
      if (nav) nav.addCell(key, new Uint8Array(b));
      else pending.set(key, b);
    },
    removeCell(key) {
      if (nav) nav.removeCell(key);
      else pending.delete(key);
    },
    setPlayer: (pos, vel, fwd) => tier?.setPlayer(pos, vel, fwd),
    setDensityScale(k) {
      densityScale = k;
      tier?.setDensityScale(k);
    },
    setClock(c) {
      clock = c;
    },
    scenario(center, radius, count) {
      pendingScenario = { center: { ...center }, radius, count };
    },
    step(dt, nowAbs, out, anchor) {
      nowGameS = gameMs(nowAbs) / 1000;
      if (!tier) return 0;
      // 시험 장면은 그 횡단들의 셀 nav가 들어온 뒤에야 만들 수 있다 → 만들 때까지 틱마다 다시.
      const sc = pendingScenario;
      if (sc && tier.scenario(sc.center, sc.radius, sc.count) > 0) pendingScenario = undefined;
      return tier.step(dt, nowGameS * 1000, out, anchor);
    },
    vehicleLamp: (code) => signalState(plans, code, nowGameS).vehicle,
    gameMs: () => nowGameS * 1000,
    crossingsNear: (x, z, r) => nav?.crossingsNear(x, z, r) ?? [],
    stats() {
      if (!tier || !nav) return undefined;
      return { ...tier.stats(), ...nav.stats() };
    },
  };
}
