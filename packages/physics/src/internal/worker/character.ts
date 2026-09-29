// 도보 캐릭터(08 §5): Jolt CharacterVirtual 캡슐(반경 0.25, 전체 키 1.70 — 위치 = 발, mShapeOffset으로 캡슐을 위로), 경사 50°, 계단 0.40 m,
// 바닥 붙기 0.5 m, 예측 접촉 0.1 m, 삼각형 양면(PLATEAU 감김 불일치 — ADR-0042). 원하는 수평 속도(명령)로 가속 8·감속 10 m/s², 지면이면 수직 = 지면 속도, 아니면 중력.
import type { Vec3 } from '@sanpo/core';
import type { Jolt } from './jolt-init.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

export const CHARACTER = {
  radius: 0.25,
  height: 1.7,
  maxSlopeDeg: 50,
  stepUpM: 0.4,
  stickToFloorM: 0.5,
  predictiveContactM: 0.1,
  accel: 8,
  decel: 10,
} as const;

type JCharacter = InstanceType<Jolt['CharacterVirtual']>;

export interface CharacterBody {
  readonly handle: number;
  readonly jolt: JCharacter;
  /** 원하는 수평 속도(WF = PHYS 축, m/s). */
  desired: Vec3;
  /** 현재 수평 속도(가감속 적용 후). */
  horizontal: Vec3;
}

export interface Characters {
  spawn(handle: number, posPhys: readonly [number, number, number], yaw: number): CharacterBody;
  get(handle: number): CharacterBody | undefined;
  remove(handle: number): void;
  /** 순간이동(속도 0). */
  teleport(c: CharacterBody, posPhys: readonly [number, number, number], yaw: number): void;
  /** 물리 스텝 전: 모든 캐릭터 이동(ExtendedUpdate — 계단·바닥 붙기). */
  update(dt: number): void;
  /** 접지 여부·지면 재질(지면 바디 userData). */
  groundOf(c: CharacterBody): { grounded: boolean; material: number };
  dispose(): void;
}

/** 수평 속도를 목표 쪽으로 가속(8) 또는 감속(10) 한도 안에서. */
export function approach(cur: Vec3, want: Readonly<Vec3>, dt: number): void {
  const dx = want.x - cur.x;
  const dz = want.z - cur.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-9) return;
  // 목표 속력이 현재보다 작거나 방향이 반대면 감속 한도.
  const speeding = Math.hypot(want.x, want.z) >= Math.hypot(cur.x, cur.z);
  const maxDv = (speeding ? CHARACTER.accel : CHARACTER.decel) * dt;
  const k = Math.min(1, maxDv / d);
  cur.x += dx * k;
  cur.z += dz * k;
}

function makeSettings(w: PhysicsWorld): InstanceType<Jolt['CharacterVirtualSettings']> {
  const { Jolt } = w;
  const s = new Jolt.CharacterVirtualSettings();
  const halfCyl = (CHARACTER.height - 2 * CHARACTER.radius) / 2;
  s.mShape = new Jolt.CapsuleShape(halfCyl, CHARACTER.radius);
  s.mShapeOffset = new Jolt.Vec3(0, halfCyl + CHARACTER.radius, 0);
  s.mMaxSlopeAngle = (CHARACTER.maxSlopeDeg * Math.PI) / 180;
  s.mBackFaceMode = Jolt.EBackFaceMode_CollideWithBackFaces;
  s.mPredictiveContactDistance = CHARACTER.predictiveContactM;
  s.mCharacterPadding = 0.02;
  // 캡슐 아래 반구만 지지면(발) — 옆면 접촉은 지면으로 보지 않는다.
  s.mSupportingVolume = new Jolt.Plane(Jolt.Vec3.prototype.sAxisY(), -CHARACTER.radius);
  s.mEnhancedInternalEdgeRemoval = true;
  return s;
}

export function createCharacters(w: PhysicsWorld): Characters {
  const { Jolt, system, iface, scratch } = w;
  const settings = makeSettings(w);
  const bpFilter = new Jolt.DefaultBroadPhaseLayerFilter(iface.GetObjectVsBroadPhaseLayerFilter(), OBJ.CHARACTER);
  const objFilter = new Jolt.DefaultObjectLayerFilter(iface.GetObjectLayerPairFilter(), OBJ.CHARACTER);
  const bodyFilter = new Jolt.BodyFilter();
  const shapeFilter = new Jolt.ShapeFilter();
  const ext = new Jolt.ExtendedUpdateSettings();
  ext.mStickToFloorStepDown = new Jolt.Vec3(0, -CHARACTER.stickToFloorM, 0);
  ext.mWalkStairsStepUp = new Jolt.Vec3(0, CHARACTER.stepUpM, 0);
  const gravity = system.GetGravity();
  const g = new Jolt.Vec3(gravity.GetX(), gravity.GetY(), gravity.GetZ());
  const list = new Map<number, CharacterBody>();
  const move = (c: CharacterBody, dt: number): void => {
    const ch = c.jolt;
    approach(c.horizontal, c.desired, dt);
    const v = ch.GetLinearVelocity();
    const onGround = ch.GetGroundState() === Jolt.EGroundState_OnGround;
    let vy = onGround ? ch.GetGroundVelocity().GetY() : v.GetY();
    vy += g.GetY() * dt;
    ch.SetLinearVelocity(scratch.vec3(c.horizontal.x, vy, c.horizontal.z));
    ch.ExtendedUpdate(dt, g, ext, bpFilter, objFilter, bodyFilter, shapeFilter, iface.GetTempAllocator());
  };
  return {
    spawn(handle, p, yaw) {
      this.remove(handle);
      const jolt = new Jolt.CharacterVirtual(settings, scratch.rvec3(p[0], p[1], p[2]), scratch.yawQuat(yaw), system);
      const c: CharacterBody = { handle, jolt, desired: { x: 0, y: 0, z: 0 }, horizontal: { x: 0, y: 0, z: 0 } };
      list.set(handle, c);
      return c;
    },
    get: (h) => list.get(h),
    teleport(c, p, yaw) {
      c.jolt.SetPosition(scratch.rvec3(p[0], p[1], p[2]));
      c.jolt.SetRotation(scratch.yawQuat(yaw));
      c.jolt.SetLinearVelocity(scratch.vec3(0, 0, 0));
      c.horizontal = { x: 0, y: 0, z: 0 };
    },
    remove(h) {
      const c = list.get(h);
      if (!c) return;
      Jolt.destroy(c.jolt);
      list.delete(h);
    },
    update(dt) {
      for (const c of list.values()) move(c, dt);
    },
    groundOf(c) {
      const st = c.jolt.GetGroundState();
      const grounded = st === Jolt.EGroundState_OnGround || st === Jolt.EGroundState_OnSteepGround;
      const id = c.jolt.GetGroundBodyID();
      const material = grounded ? w.bodies.GetUserData(id) : 0;
      return { grounded, material };
    },
    dispose() {
      for (const h of [...list.keys()]) this.remove(h);
      for (const x of [ext, bodyFilter, shapeFilter, objFilter, bpFilter, g]) Jolt.destroy(x);
      Jolt.destroy(settings);
    },
  };
}
