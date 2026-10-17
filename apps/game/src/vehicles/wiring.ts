// 플레이어 차 배선(M08-T01): 차 관리자(player-cars) + 차 부르기(walk R·패드 D-pad ← — 가까운 차도 연석, curb-spot) + 스폰 프리셋 차(`vehicles`) + 계기판 HUD.
// traversal 컨텍스트 `vehicles`(탈 수 있는 차)는 world-view가 late.cars로 넘긴다.
import type { CellKey, GameSystem, Vec3d } from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { PhysicsService } from '@sanpo/physics';
import type { RenderService } from '@sanpo/render';
import type { SimService } from '@sanpo/sim';
import type { HazardCircle, TraversalService } from '@sanpo/traversal';
import { laneChunks } from '../lane-chunks.ts';
import type { SpawnPreset } from '../spawn-presets.ts';
import { notice } from '../station/hud.ts';
import { findCurbSpot } from './curb-spot.ts';
import { driveHudSystem } from './drive-hud.ts';
import { hazardsNear } from './hazards.ts';
import { createPlayerCars, type PlayerCars, SEDAN_PARAMS } from './player-cars.ts';
import { createDriveGuide } from './traffic-guide.ts';

export interface VehicleWiring {
  readonly cars: PlayerCars;
  readonly systems: GameSystem[];
  /** traversal `hazards`(AEB — 보행자·교통 차·세워 둔 차). */
  hazards(center: Readonly<Vec3d>, radiusM: number): HazardCircle[];
}

/** 탄것 치수 → sim(교통 양보·군중 회피, M08-T02): 모드가 바뀔 때만. */
function footprintSystem(traversal: TraversalService, sim: SimService): GameSystem {
  let last: string | undefined;
  return {
    id: 'wiring.playerFootprint',
    phase: 21,
    update() {
      const m = traversal.mode;
      if (m === last) return;
      last = m;
      sim.setPlayerVehicle(
        m === 'drive' ? { lengthM: SEDAN_PARAMS.dimensionsM.length, widthM: SEDAN_PARAMS.dimensionsM.width } : null,
      );
    },
    dispose() {},
  };
}

/** walk 중 R: 연석 자리를 찾아 부른다(찾는 동안 한 번만). */
function summonSystem(
  doc: Document,
  d: { input: InputService; traversal: TraversalService; physics: () => PhysicsService | undefined },
  cars: PlayerCars,
  lanes: ReturnType<typeof laneChunks>,
): GameSystem {
  let busy = false;
  return {
    id: 'wiring.summonCar',
    phase: 22,
    update() {
      if (busy || d.traversal.mode !== 'walk' || !d.input.state.justPressed('summon')) return;
      if (!d.physics()) return notice(doc, '아직 준비 중이에요 — 잠시 뒤 다시 R');
      busy = true;
      const me = { ...d.traversal.player.posWF };
      void findCurbSpot(lanes, me).then(
        (spot) => {
          busy = false;
          if (!spot) return notice(doc, '40 m 안 차도에서 세울 자리를 찾지 못했어요 — 큰길 보도로 가서 다시 R');
          cars.park(spot.posWF, spot.yawRad, 'summon');
          notice(doc, `카셰어 차를 불렀어요(${Math.round(spot.distanceM)} m) — 연석 쪽 운전석(오른쪽) 문 앞에서 F`);
        },
        () => {
          busy = false;
        },
      );
    },
    dispose() {},
  };
}

export function createVehicleWiring(d: {
  doc: Document;
  render: RenderService;
  input: InputService;
  traversal: TraversalService;
  sim: SimService;
  physics: () => PhysicsService | undefined;
  /** 노면 젖음 0..1(sim 날씨 + `?wet=` 덮어쓰기). */
  wetness: () => number;
  requestLanes: (key: CellKey) => Promise<ArrayBuffer | undefined>;
  spawn?: SpawnPreset;
}): VehicleWiring {
  const cars = createPlayerCars(d);
  // 첫 차가 보일 때 끊김이 없게 미리(장면 밖 선컴파일).
  void d.render.vehicles.preparePlayers();
  for (const v of d.spawn?.vehicles ?? []) {
    const [x, y, z] = v.posWF;
    cars.park({ x, y, z }, (v.yawDeg * Math.PI) / 180, 'preset');
  }
  const lanes = laneChunks(d.requestLanes);
  return {
    cars,
    systems: [
      cars.system,
      summonSystem(d.doc, d, cars, lanes),
      driveHudSystem(
        d.doc,
        d.traversal,
        createDriveGuide(lanes, (c) => d.sim.signalStateAt(c)),
      ),
      footprintSystem(d.traversal, d.sim),
    ],
    hazards: (c, r) => hazardsNear(d.sim.outputs(), c, r, cars.parkedCircles()),
  };
}
