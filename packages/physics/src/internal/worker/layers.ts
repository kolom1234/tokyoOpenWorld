// 오브젝트 레이어·브로드페이즈 레이어·충돌 행렬(08 §3). 표(COLLISION_PAIRS)는 순수 데이터 — Jolt 필터는 createLayerFilters가 만든다.
import type { Jolt } from './jolt-init.ts';

export const OBJ = {
  STATIC_WORLD: 0,
  TERRAIN: 1,
  PROP_STATIC: 2,
  CHARACTER: 3,
  VEHICLE: 4,
  NPC_KINEMATIC: 5,
  TRAIN: 6,
  SENSOR: 7,
} as const;
export type ObjectLayer = (typeof OBJ)[keyof typeof OBJ];
export const NUM_OBJECT_LAYERS = 8;

export const BP = { NON_MOVING: 0, MOVING: 1, SENSOR: 2 } as const;
export const NUM_BP_LAYERS = 3;

/** 오브젝트 → 브로드페이즈(08 §3 표). */
export const BROADPHASE_OF: Readonly<Record<ObjectLayer, number>> = {
  [OBJ.STATIC_WORLD]: BP.NON_MOVING,
  [OBJ.TERRAIN]: BP.NON_MOVING,
  [OBJ.PROP_STATIC]: BP.NON_MOVING,
  [OBJ.CHARACTER]: BP.MOVING,
  [OBJ.VEHICLE]: BP.MOVING,
  [OBJ.NPC_KINEMATIC]: BP.MOVING,
  [OBJ.TRAIN]: BP.MOVING,
  [OBJ.SENSOR]: BP.SENSOR,
};

/** 충돌 행렬(대칭, 08 §3 ✔ 칸). 보행자·차량 NPC끼리·정적끼리는 충돌 없음. */
export const COLLISION_PAIRS: readonly (readonly [ObjectLayer, ObjectLayer])[] = [
  [OBJ.CHARACTER, OBJ.STATIC_WORLD],
  [OBJ.CHARACTER, OBJ.TERRAIN],
  [OBJ.CHARACTER, OBJ.PROP_STATIC],
  [OBJ.CHARACTER, OBJ.VEHICLE],
  [OBJ.CHARACTER, OBJ.NPC_KINEMATIC],
  [OBJ.CHARACTER, OBJ.TRAIN],
  [OBJ.CHARACTER, OBJ.SENSOR],
  [OBJ.VEHICLE, OBJ.STATIC_WORLD],
  [OBJ.VEHICLE, OBJ.TERRAIN],
  [OBJ.VEHICLE, OBJ.PROP_STATIC],
  [OBJ.VEHICLE, OBJ.NPC_KINEMATIC],
  [OBJ.VEHICLE, OBJ.TRAIN],
  [OBJ.VEHICLE, OBJ.SENSOR],
  [OBJ.TRAIN, OBJ.SENSOR],
];

export function collides(a: ObjectLayer, b: ObjectLayer): boolean {
  return COLLISION_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export interface LayerFilters {
  objectPairs: InstanceType<Jolt['ObjectLayerPairFilterTable']>;
  broadPhase: InstanceType<Jolt['BroadPhaseLayerInterfaceTable']>;
  objectVsBroadPhase: InstanceType<Jolt['ObjectVsBroadPhaseLayerFilterTable']>;
}

/** JoltSettings에 넘길 필터. JoltInterface가 소유권을 가져간다(따로 해제하지 않음). */
export function createLayerFilters(Jolt: Jolt): LayerFilters {
  const objectPairs = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
  for (const [a, b] of COLLISION_PAIRS) objectPairs.EnableCollision(a, b);
  const broadPhase = new Jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BP_LAYERS);
  for (const [layer, bp] of Object.entries(BROADPHASE_OF)) {
    const l = new Jolt.BroadPhaseLayer(bp);
    broadPhase.MapObjectToBroadPhaseLayer(Number(layer), l);
    Jolt.destroy(l);
  }
  const objectVsBroadPhase = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    broadPhase,
    NUM_BP_LAYERS,
    objectPairs,
    NUM_OBJECT_LAYERS,
  );
  return { objectPairs, broadPhase, objectVsBroadPhase };
}
