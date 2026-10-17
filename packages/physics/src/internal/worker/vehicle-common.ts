// 플레이어 탈것 공용(M08-T01·T03): 몸체 인터페이스, 동적 차체 강체, VehicleConstraint 붙이기(원통 캐스트·스텝 리스너·마찰 콜백), 공기·구름 저항, 바퀴 읽기.
// 노면 마찰 = 타이어 곡선 × grip.k(젖음) — Jolt 기본 √(타이어 × 바디)는 셀 콜라이더 마찰 0.2에서 접지력 45 %(ADR-0087).
import type { CurvePoints, VehicleInput } from '../../api.ts';
import type { Jolt } from './jolt-init.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

export type J<K extends keyof Jolt> = Jolt[K] extends abstract new (...a: never[]) => infer R ? R : never;

export interface WheelOut {
  rotation: number;
  steer: number;
  suspension: number;
  slipLong: number;
  slipLatDeg: number;
  material: number;
}

/** 워커 탈것 한 대(세단·자전거). */
export interface VehicleBody {
  readonly id: J<'BodyID'>;
  input: VehicleInput;
  /** 마지막 스텝 실제 스로틀·ABS·TCS. */
  readonly applied: { throttle: number; abs: boolean; tcs: boolean };
  /** 스텝 전: 입력 → SetDriverInput(보조 포함). */
  preStep(dt: number): void;
  /** 노면 젖음 0..1 → 마찰 배율. */
  setWetness(w: number): void;
  /** 전방 속력(m/s, 후진 −). */
  speed(): number;
  rpm(): number;
  gear(): number;
  shifting(): boolean;
  wheel(i: number, out: WheelOut): void;
  readonly wheelCount: number;
  dispose(): void;
}

export interface Aero {
  dragAreaM2: number;
  airDensity: number;
  rollingCoeff: number;
}

export function setCurve(c: J<'LinearCurve'>, pts: CurvePoints): void {
  c.Clear();
  for (const [x, y] of pts) c.AddPoint(x, y);
}

/** 바퀴–노면 마찰 = 타이어 곡선 값 × grip.k(젖음). 그 밖 콜백은 빈 함수(JS 구현 필수). */
function frictionCallbacks(w: PhysicsWorld, grip: { k: number }): J<'VehicleConstraintCallbacksJS'> {
  const cb = new w.Jolt.VehicleConstraintCallbacksJS();
  cb.GetCombinedFriction = (_wheel: number, _dir: number, tireFriction: number) => tireFriction * grip.k;
  cb.OnPreStepCallback = () => undefined;
  cb.OnPostCollideCallback = () => undefined;
  cb.OnPostStepCallback = () => undefined;
  return cb;
}

/** VEHICLE 레이어 동적 강체(질량 = massKg, 선형 감쇠 0 — 저항은 resist). shape는 참조 1 가진 채로. */
export function spawnBody(
  w: PhysicsWorld,
  shape: J<'Shape'>,
  pos: readonly [number, number, number],
  yaw: number,
  massKg: number,
) {
  const { Jolt, bodies, scratch } = w;
  const bcs = new Jolt.BodyCreationSettings(
    shape,
    scratch.rvec3(pos[0], pos[1], pos[2]),
    scratch.yawQuat(yaw),
    Jolt.EMotionType_Dynamic,
    OBJ.VEHICLE,
  );
  bcs.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
  bcs.mMassPropertiesOverride.mMass = massKg;
  bcs.mLinearDamping = 0;
  const body = bodies.CreateBody(bcs);
  Jolt.destroy(bcs);
  const id = new Jolt.BodyID(body.GetID().GetIndexAndSequenceNumber());
  bodies.AddBody(id, Jolt.EActivation_Activate);
  return { body, id };
}

/** VehicleConstraint(원통 캐스트 접지) + 스텝 리스너 + 마찰 콜백. vs는 여기서 해제. */
export function attachConstraint(
  w: PhysicsWorld,
  body: J<'Body'>,
  vs: J<'VehicleConstraintSettings'>,
  grip: { k: number },
) {
  const { Jolt, system } = w;
  const constraint = new Jolt.VehicleConstraint(body, vs);
  Jolt.destroy(vs);
  constraint.SetVehicleCollisionTester(new Jolt.VehicleCollisionTesterCastCylinder(OBJ.VEHICLE, 0.05));
  system.AddConstraint(constraint);
  const listener = new Jolt.VehicleConstraintStepListener(constraint);
  system.AddStepListener(listener);
  const callbacks = frictionCallbacks(w, grip);
  callbacks.SetVehicleConstraint(constraint);
  const dispose = (): void => {
    system.RemoveStepListener(listener);
    system.RemoveConstraint(constraint);
    Jolt.destroy(listener);
    Jolt.destroy(callbacks);
  };
  return { constraint, dispose };
}

/** 공기 저항 ½ρ·CdA·v² + 구름 저항 Crr·m·g(움직일 때) — 진행 반대 방향 힘. */
export function resist(w: PhysicsWorld, id: J<'BodyID'>, aero: Aero, massKg: number, speed: number): void {
  const v = w.bodies.GetLinearVelocity(id);
  const [vx, vz] = [v.GetX(), v.GetZ()];
  const sp = Math.hypot(vx, vz);
  if (sp < 0.05 || Math.abs(speed) < 0.05) return;
  const f = 0.5 * aero.airDensity * aero.dragAreaM2 * sp * sp + aero.rollingCoeff * massKg * 9.81;
  w.bodies.AddForce(id, w.scratch.vec3((-vx / sp) * f, 0, (-vz / sp) * f), w.Jolt.EActivation_DontActivate);
}

/** 차체 전방(로컬 −Z) 속력. fwd = 재사용 Vec3(0, 0, −1). */
export function forwardSpeed(w: PhysicsWorld, id: J<'BodyID'>, fwd: J<'Vec3'>): number {
  const f = w.bodies.GetRotation(id).MulVec3(fwd);
  const v = w.bodies.GetLinearVelocity(id);
  return f.GetX() * v.GetX() + f.GetY() * v.GetY() + f.GetZ() * v.GetZ();
}

export function readWheel(w: PhysicsWorld, wh: J<'WheelWV'>, out: WheelOut): void {
  const contact = wh.HasContact();
  out.rotation = wh.GetRotationAngle();
  out.steer = wh.GetSteerAngle();
  out.suspension = wh.GetSuspensionLength();
  out.slipLong = contact ? wh.mLongitudinalSlip : 0;
  out.slipLatDeg = contact ? (wh.mLateralSlip * 180) / Math.PI : 0;
  out.material = contact ? Number(w.bodies.GetUserData(wh.GetContactBodyID())) & 0xff : -1;
}

/** 강체 제거·해제(형상 참조 Release). */
export function destroyBody(w: PhysicsWorld, id: J<'BodyID'>, shape: J<'Shape'>): void {
  w.bodies.RemoveBody(id);
  w.bodies.DestroyBody(id);
  w.Jolt.destroy(id);
  shape.Release();
}
