// 카셰어·공유자전거 거점(M08-T02·T03 — 가상 브랜드 "SANPO Car"·"SANPO Cycle"): live L0 셀의 meta.json `interactables`(carShare·bikeDock) →
// 1 s마다 플레이어에게 가까운 거점부터(130 m 안) 카셰어 1대·자전거 2대를 세워 두고, 220 m 밖으로 멀어진 거점의 탈것은 치운다(타는 중이면 그대로).
import type { CellKey, GameSystem, Vec3d } from '@sanpo/core';
import { unpackCellKey } from '@sanpo/core';
import type { CellMeta, InteractableRecord } from '@sanpo/tile-format';
import type { TraversalService } from '@sanpo/traversal';
import type { PlayerCars, RideKind } from './player-cars.ts';

const NEAR_M = 130;
const FAR_M = 220;
/** 가까운 거점 몇 곳까지 채우나(종류별)·거점당 대수. */
const SPOTS_OF: Readonly<Record<RideKind, number>> = { sedan: 2, bicycle: 2 };
const PER_SPOT: Readonly<Record<RideKind, number>> = { sedan: 1, bicycle: 2 };
/** 자전거 나란히(옆 간격 m). */
const BIKE_GAP_M = 0.8;
const MOVED_M = 10;

export interface ShareSpot {
  id: string;
  cell: CellKey;
  kind: RideKind;
  posWF: Vec3d;
  yawRad: number;
  cars: number[];
}

/** 셀 interactables → 거점(WF). */
export function spotsOf(key: CellKey, list: readonly InteractableRecord[]): ShareSpot[] {
  const { ix, iz } = unpackCellKey(key);
  return list
    .filter((r) => r.kind === 'carShare' || r.kind === 'bikeDock')
    .map((r) => ({
      id: r.id,
      cell: key,
      kind: r.kind === 'carShare' ? 'sedan' : 'bicycle',
      posWF: { x: ix * 256 + r.posLocal[0], y: r.posLocal[1], z: iz * 256 + r.posLocal[2] },
      yawRad: r.yaw ?? 0,
      cars: [],
    }));
}

export interface ShareSpots {
  readonly system: GameSystem;
  addCell(key: CellKey, meta: CellMeta | undefined): void;
  removeCell(key: CellKey): void;
  /** 디버그·봇·안내: 지금 아는 거점. */
  list(): readonly ShareSpot[];
}

function fill(cars: PlayerCars, s: ShareSpot): void {
  const n = PER_SPOT[s.kind];
  for (let i = s.cars.length; i < n; i++) {
    // 자전거는 옆으로 나란히(오른쪽 = (cos, −sin)).
    const off = s.kind === 'bicycle' ? (i - (n - 1) / 2) * BIKE_GAP_M : 0;
    const p = { x: s.posWF.x + Math.cos(s.yawRad) * off, y: s.posWF.y, z: s.posWF.z - Math.sin(s.yawRad) * off };
    s.cars.push(cars.park(p, s.yawRad, 'share', s.kind));
  }
}

function clear(cars: PlayerCars, s: ShareSpot): void {
  for (const id of s.cars) cars.remove(id);
  s.cars = [];
}

export function createShareSpots(cars: PlayerCars, traversal: TraversalService): ShareSpots {
  const spots = new Map<string, ShareSpot>();
  let t = 0;
  const update = (): void => {
    const me = traversal.player.posWF;
    const all = [...spots.values()];
    // 없어졌거나 거점에서 10 m 넘게 옮겨진(타고 간) 탈것은 거점에서 뗀다 — 거점을 떠나도 치우지 않게.
    const at = new Map(cars.list().map((c) => [c.id, c.posWF]));
    for (const s of all)
      s.cars = s.cars.filter((id) => {
        const p = at.get(id);
        if (p === undefined) return false;
        if (Math.hypot(p.x - s.posWF.x, p.z - s.posWF.z) < MOVED_M) return true;
        cars.release(id);
        return false;
      });
    for (const kind of ['sedan', 'bicycle'] as const) {
      const ranked = all
        .filter((s) => s.kind === kind)
        .map((s) => ({ s, d: Math.hypot(s.posWF.x - me.x, s.posWF.z - me.z) }))
        .sort((a, b) => a.d - b.d);
      ranked.forEach(({ s, d }, i) => {
        if (d > FAR_M || i >= SPOTS_OF[kind] + 1) clear(cars, s);
        else if (d < NEAR_M && i < SPOTS_OF[kind]) fill(cars, s);
      });
    }
  };
  return {
    system: {
      id: 'wiring.shareSpots',
      phase: 23,
      update(f) {
        t -= f.dtReal;
        if (t > 0) return;
        t = 1;
        update();
      },
      dispose() {},
    },
    addCell(key, meta) {
      for (const s of spotsOf(key, meta?.interactables ?? [])) if (!spots.has(s.id)) spots.set(s.id, s);
    },
    removeCell(key) {
      for (const [id, s] of spots)
        if (s.cell === key) {
          clear(cars, s);
          spots.delete(id);
        }
    },
    list: () => [...spots.values()],
  };
}
