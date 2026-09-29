// Jolt 월드(08 §1): JoltInterface + PhysicsSystem + BodyInterface, 고정 스텝. 좌표 = PHYS(WF − 앵커, +Y 위 — 중력 기본값 그대로).
import type { Jolt } from './jolt-init.ts';
import { createScratch, type Scratch } from './jolt-mem.ts';
import { createLayerFilters } from './layers.ts';

/** 한도: 셀 정적 바디(셀당 1–2) + 소품·NPC·차량. 08 §3 NPC 캡슐까지 여유. */
const MAX_BODIES = 16_384;
const MAX_BODY_PAIRS = 65_536;
const MAX_CONTACTS = 16_384;

export interface PhysicsWorld {
  readonly Jolt: Jolt;
  readonly iface: InstanceType<Jolt['JoltInterface']>;
  readonly system: InstanceType<Jolt['PhysicsSystem']>;
  readonly bodies: InstanceType<Jolt['BodyInterface']>;
  readonly scratch: Scratch;
  step(dtS: number): void;
  dispose(): void;
}

export function createWorld(Jolt: Jolt, threads: number): PhysicsWorld {
  const settings = new Jolt.JoltSettings();
  const f = createLayerFilters(Jolt);
  settings.mMaxBodies = MAX_BODIES;
  settings.mMaxBodyPairs = MAX_BODY_PAIRS;
  settings.mMaxContactConstraints = MAX_CONTACTS;
  settings.mMaxWorkerThreads = threads;
  settings.mObjectLayerPairFilter = f.objectPairs;
  settings.mBroadPhaseLayerInterface = f.broadPhase;
  settings.mObjectVsBroadPhaseLayerFilter = f.objectVsBroadPhase;
  const iface = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  const system = iface.GetPhysicsSystem();
  const scratch = createScratch(Jolt);
  return {
    Jolt,
    iface,
    system,
    bodies: system.GetBodyInterface(),
    scratch,
    // 120 Hz에서 충돌 하위 스텝 1(08 §1).
    step: (dtS) => iface.Step(dtS, 1),
    dispose() {
      scratch.dispose();
      Jolt.destroy(iface);
    },
  };
}
