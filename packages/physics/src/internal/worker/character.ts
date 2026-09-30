// 도보 캐릭터(08 §5): Jolt CharacterVirtual 캡슐(반경 0.25, 전체 키 1.70 — 위치 = 발, mShapeOffset으로 캡슐을 위로), 경사 50°, 계단 0.40 m,
// 바닥 붙기 0.5 m, 예측 접촉 0.1 m, 삼각형 양면(PLATEAU 감김 불일치 — ADR-0042). 원하는 수평 속도(명령)로 가속 8·감속 10 m/s², 지면이면 수직 = 지면 속도, 아니면 중력.
// 에스컬레이터 구간(escalators.ts) 안이면 걷기 수평 ≤ 0.6 m/s + 구간 진행 방향 0.5 m/s(ADR-0044). 지면 재질 = 지면 바디 userData 하위 8비트(상위 = JCOL flags).
import type { Vec3 } from '@sanpo/core';
import { ESCALATOR, type Escalators } from './escalators.ts';
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
  /** 이번 스텝에 에스컬레이터 구간 안. */
  escalator: boolean;
  /** 지난 스텝에 더한 에스컬레이터 수직 속도(다음 스텝의 자기 수직 속도에서 뺀다 — 누적 방지). */
  escVy: number;
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

/** 에스컬레이터 판정 점: 발 위 0.1 m(경사면 바로 위). */
const ESC_PROBE_M = 0.1;

/** 수평 벡터 길이 상한. */
function capped(v: Readonly<Vec3>, max: number): Vec3 {
  const m = Math.hypot(v.x, v.z);
  return m <= max ? v : { x: (v.x / m) * max, y: 0, z: (v.z / m) * max };
}

/** ExtendedUpdate에 넘기는 필터·설정(캐릭터 공용). */
interface UpdateCtx {
  w: PhysicsWorld;
  ext: InstanceType<Jolt['ExtendedUpdateSettings']>;
  bpFilter: InstanceType<Jolt['DefaultBroadPhaseLayerFilter']>;
  objFilter: InstanceType<Jolt['DefaultObjectLayerFilter']>;
  bodyFilter: InstanceType<Jolt['BodyFilter']>;
  shapeFilter: InstanceType<Jolt['ShapeFilter']>;
  g: InstanceType<Jolt['Vec3']>;
}

function createUpdateCtx(w: PhysicsWorld): UpdateCtx {
  const { Jolt, system, iface } = w;
  const ext = new Jolt.ExtendedUpdateSettings();
  ext.mStickToFloorStepDown = new Jolt.Vec3(0, -CHARACTER.stickToFloorM, 0);
  ext.mWalkStairsStepUp = new Jolt.Vec3(0, CHARACTER.stepUpM, 0);
  const gravity = system.GetGravity();
  return {
    w,
    ext,
    bpFilter: new Jolt.DefaultBroadPhaseLayerFilter(iface.GetObjectVsBroadPhaseLayerFilter(), OBJ.CHARACTER),
    objFilter: new Jolt.DefaultObjectLayerFilter(iface.GetObjectLayerPairFilter(), OBJ.CHARACTER),
    bodyFilter: new Jolt.BodyFilter(),
    shapeFilter: new Jolt.ShapeFilter(),
    g: new Jolt.Vec3(gravity.GetX(), gravity.GetY(), gravity.GetZ()),
  };
}

/** 한 스텝: 가감속(에스컬레이터 안이면 걷기 ≤ 0.6 m/s + 진행 방향 0.5 m/s) → 속도 설정 → ExtendedUpdate(계단·바닥 붙기). */
function moveCharacter(u: UpdateCtx, escalators: Escalators, c: CharacterBody, dt: number): void {
  const { Jolt, iface, scratch } = u.w;
  const ch = c.jolt;
  const p = ch.GetPosition();
  const esc = escalators.at(p.GetX(), p.GetY() + ESC_PROBE_M, p.GetZ());
  c.escalator = esc !== undefined;
  approach(c.horizontal, esc ? capped(c.desired, ESCALATOR.walkMaxMs) : c.desired, dt);
  const onGround = ch.GetGroundState() === Jolt.EGroundState_OnGround;
  const own = onGround ? ch.GetGroundVelocity().GetY() : ch.GetLinearVelocity().GetY() - c.escVy;
  // 에스컬레이터 위 접지 중엔 중력을 더하지 않는다(경사 투영으로 운반 속도가 0.5 → 0.46 m/s로 줄지 않게, 바닥 붙기가 접지 유지).
  const vy = own + (onGround && esc ? 0 : u.g.GetY() * dt);
  const e = esc ? esc.dir : ([0, 0, 0] as const);
  const s = ESCALATOR.speedMs;
  c.escVy = e[1] * s;
  ch.SetLinearVelocity(scratch.vec3(c.horizontal.x + e[0] * s, vy + c.escVy, c.horizontal.z + e[2] * s));
  ch.ExtendedUpdate(dt, u.g, u.ext, u.bpFilter, u.objFilter, u.bodyFilter, u.shapeFilter, iface.GetTempAllocator());
}

export function createCharacters(w: PhysicsWorld, escalators: Escalators): Characters {
  const { Jolt, system, scratch } = w;
  const settings = makeSettings(w);
  const u = createUpdateCtx(w);
  const list = new Map<number, CharacterBody>();
  return {
    spawn(handle, p, yaw) {
      this.remove(handle);
      const jolt = new Jolt.CharacterVirtual(settings, scratch.rvec3(p[0], p[1], p[2]), scratch.yawQuat(yaw), system);
      const c: CharacterBody = {
        handle,
        jolt,
        desired: { x: 0, y: 0, z: 0 },
        horizontal: { x: 0, y: 0, z: 0 },
        escalator: false,
        escVy: 0,
      };
      list.set(handle, c);
      return c;
    },
    get: (h) => list.get(h),
    teleport(c, p, yaw) {
      c.jolt.SetPosition(scratch.rvec3(p[0], p[1], p[2]));
      c.jolt.SetRotation(scratch.yawQuat(yaw));
      c.jolt.SetLinearVelocity(scratch.vec3(0, 0, 0));
      c.horizontal = { x: 0, y: 0, z: 0 };
      c.escVy = 0;
    },
    remove(h) {
      const c = list.get(h);
      if (!c) return;
      Jolt.destroy(c.jolt);
      list.delete(h);
    },
    update(dt) {
      for (const c of list.values()) moveCharacter(u, escalators, c, dt);
    },
    groundOf(c) {
      const st = c.jolt.GetGroundState();
      const grounded = st === Jolt.EGroundState_OnGround || st === Jolt.EGroundState_OnSteepGround;
      const id = c.jolt.GetGroundBodyID();
      const material = grounded ? Number(w.bodies.GetUserData(id)) & 0xff : 0;
      return { grounded, material };
    },
    dispose() {
      for (const h of [...list.keys()]) this.remove(h);
      for (const x of [u.ext, u.bodyFilter, u.shapeFilter, u.objFilter, u.bpFilter, u.g]) Jolt.destroy(x);
      Jolt.destroy(settings);
    },
  };
}
