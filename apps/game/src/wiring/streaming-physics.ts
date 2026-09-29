// 배선: streaming live L0 셀(버스 `cell/ready` — onReady는 렌더 배선 단독 소유) → 물리 반경(08 §4) 안이면 collision.bin + terrain.height를 따로 요청(requestSections)해 physics.addCell,
// 반경 × 1.25 밖으로 나가거나 해제되면 physics.removeCell. streaming·physics는 서로 모른다(01 §4). see docs/06-world-streaming.md §1, docs/08-physics.md §4
import {
  type CellKey,
  type EventBus,
  type GameSystem,
  type Logger,
  type ModeId,
  unpackCellKey,
  type Vec3d,
} from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { StreamingService } from '@sanpo/streaming';

/** 01 §5: streaming 적용(55) 뒤. */
export const PHYSICS_WIRING_PHASE = 56;
/** 08 §4 물리 반경(m). freecam·transition은 도보와 같게(도보 전환 대비 선적재). */
export const PHYSICS_RADIUS_M: Readonly<Record<ModeId, number>> = {
  walk: 256,
  cycle: 320,
  drive: 512,
  train: 256,
  freecam: 256,
  transition: 256,
};
const RELEASE_FACTOR = 1.25;
const CELL_M = 256;
/** 재계산 간격(ms). */
const INTERVAL_MS = 250;

export interface StreamingPhysicsDeps {
  streaming: Pick<StreamingService, 'onEvicted' | 'requestSections'>;
  bus: Pick<EventBus, 'on'>;
  physics: Pick<PhysicsService, 'addCell' | 'removeCell'>;
  player: () => { posWF: Readonly<Vec3d>; mode: ModeId };
  log: Logger;
  /** 동시에 요청할 셀 수. */
  maxInFlight?: number;
  now?: () => number;
}

export interface StreamingPhysicsStats {
  live: number;
  added: number;
  inFlight: number;
  requests: number;
}

export interface StreamingPhysicsWiring {
  readonly system: GameSystem;
  stats(): StreamingPhysicsStats;
  dispose(): void;
}

/** 셀(원점 = 북서 모서리) AABB까지의 수평 거리. */
export function cellDistance(origin: Readonly<Vec3d>, p: Readonly<Vec3d>): number {
  const dx = Math.max(origin.x - p.x, 0, p.x - (origin.x + CELL_M));
  const dz = Math.max(origin.z - p.z, 0, p.z - (origin.z + CELL_M));
  return Math.hypot(dx, dz);
}

export function createStreamingPhysicsWiring(d: StreamingPhysicsDeps): StreamingPhysicsWiring {
  const now = d.now ?? (() => performance.now());
  const maxInFlight = d.maxInFlight ?? 2;
  const live = new Map<CellKey, Vec3d>();
  const added = new Set<CellKey>();
  const inFlight = new Set<CellKey>();
  let requests = 0;
  let last = Number.NEGATIVE_INFINITY;
  const release = (key: CellKey): void => {
    if (added.delete(key)) d.physics.removeCell(key);
  };
  const offReady = d.bus.on('cell/ready', ({ key }) => {
    const { level, ix, iz } = unpackCellKey(key);
    if (level === 0) live.set(key, { x: ix * CELL_M, y: 0, z: iz * CELL_M });
  });
  const offEvicted = d.streaming.onEvicted((key) => {
    live.delete(key);
    release(key);
  });
  const request = (key: CellKey, origin: Vec3d): void => {
    inFlight.add(key);
    requests++;
    d.streaming
      .requestSections(key, ['collision.bin', 'terrain.height'])
      .then((p) => {
        if (!live.has(key)) return;
        d.physics.addCell(key, origin, p.collision, p.heightfield);
        added.add(key);
      })
      .catch((e: unknown) => d.log.warn('physics cell', key, e))
      .finally(() => inFlight.delete(key));
  };
  const update = (): void => {
    const t = now();
    if (t - last < INTERVAL_MS) return;
    last = t;
    const { posWF, mode } = d.player();
    const r = PHYSICS_RADIUS_M[mode];
    for (const key of added) {
      const o = live.get(key);
      if (!o || cellDistance(o, posWF) > r * RELEASE_FACTOR) release(key);
    }
    const want = [...live]
      .map(([key, o]) => ({ key, o, dist: cellDistance(o, posWF) }))
      .filter((c) => c.dist <= r && !added.has(c.key) && !inFlight.has(c.key))
      .sort((a, b) => a.dist - b.dist);
    for (const c of want) {
      if (inFlight.size >= maxInFlight) break;
      request(c.key, c.o);
    }
  };
  return {
    system: { id: 'wiring/streaming-physics', phase: PHYSICS_WIRING_PHASE, update, dispose() {} },
    stats: () => ({ live: live.size, added: added.size, inFlight: inFlight.size, requests }),
    dispose() {
      offReady();
      offEvicted();
    },
  };
}
