// 배선: streaming live L0 셀(버스 `cell/ready`) → sim 반경(256 m — tier A 80 m 스폰·목적지 + tier B 250 m) 안이면 nav.bin을 따로 요청(requestSections)해
// sim.addCell, 반경 × 1.25 밖·해제면 sim.removeCell. streaming·sim은 서로 모른다(01 §4). see docs/10-simulation.md §4, docs/06-world-streaming.md §1
import { type CellKey, type EventBus, type GameSystem, type Logger, unpackCellKey, type Vec3d } from '@sanpo/core';
import type { SimService } from '@sanpo/sim';
import type { StreamingService } from '@sanpo/streaming';
import { cellDistance } from './streaming-physics.ts';

/** 물리 배선(56) 뒤. */
export const SIM_WIRING_PHASE = 57;
export const SIM_NAV_RADIUS_M = 256;
const RELEASE_FACTOR = 1.25;
const CELL_M = 256;
const INTERVAL_MS = 250;

export interface StreamingSimDeps {
  streaming: Pick<StreamingService, 'onEvicted' | 'requestSections'>;
  bus: Pick<EventBus, 'on'>;
  sim: Pick<SimService, 'addCell' | 'removeCell'>;
  player: () => { posWF: Readonly<Vec3d> };
  log: Logger;
  maxInFlight?: number;
  now?: () => number;
}

export interface StreamingSimWiring {
  readonly system: GameSystem;
  stats(): { live: number; added: number; inFlight: number; requests: number };
  dispose(): void;
}

export function createStreamingSimWiring(d: StreamingSimDeps): StreamingSimWiring {
  const now = d.now ?? (() => performance.now());
  const maxInFlight = d.maxInFlight ?? 2;
  const live = new Map<CellKey, Vec3d>();
  const added = new Set<CellKey>();
  const inFlight = new Set<CellKey>();
  let requests = 0;
  let last = Number.NEGATIVE_INFINITY;
  const release = (key: CellKey): void => {
    if (added.delete(key)) d.sim.removeCell(key);
  };
  const offReady = d.bus.on('cell/ready', ({ key }) => {
    const { level, ix, iz } = unpackCellKey(key);
    if (level === 0) live.set(key, { x: ix * CELL_M, y: 0, z: iz * CELL_M });
  });
  const offEvicted = d.streaming.onEvicted((key) => {
    live.delete(key);
    release(key);
  });
  const request = (key: CellKey): void => {
    inFlight.add(key);
    requests++;
    d.streaming
      .requestSections(key, ['nav.bin'])
      .then((p) => {
        if (!live.has(key) || !p.nav) return;
        d.sim.addCell(key, p.nav);
        added.add(key);
      })
      .catch((e: unknown) => d.log.warn('sim nav', key, e))
      .finally(() => inFlight.delete(key));
  };
  const update = (): void => {
    const t = now();
    if (t - last < INTERVAL_MS) return;
    last = t;
    const { posWF } = d.player();
    for (const key of added) {
      const o = live.get(key);
      if (!o || cellDistance(o, posWF) > SIM_NAV_RADIUS_M * RELEASE_FACTOR) release(key);
    }
    const want = [...live]
      .map(([key, o]) => ({ key, dist: cellDistance(o, posWF) }))
      .filter((c) => c.dist <= SIM_NAV_RADIUS_M && !added.has(c.key) && !inFlight.has(c.key))
      .sort((a, b) => a.dist - b.dist);
    for (const c of want) {
      if (inFlight.size >= maxInFlight) break;
      request(c.key);
    }
  };
  return {
    system: { id: 'wiring/streaming-sim', phase: SIM_WIRING_PHASE, update, dispose() {} },
    stats: () => ({ live: live.size, added: added.size, inFlight: inFlight.size, requests }),
    dispose() {
      offReady();
      offEvicted();
    },
  };
}
