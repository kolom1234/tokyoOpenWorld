// 플레이어 승용차(M08-T01 — 08 §6): VEHICLE 레이어 동적 강체(하부 상자 + 무게중심 낮춤) + Jolt VehicleConstraint(WheeledVehicleController, 원통 캐스트 접지).
// 차체 원점 = 바닥 중심(앞뒤 차축 가운데, 지면), 전방 = 로컬 −Z(traversal yaw 규약), 바퀴 0 앞왼 · 1 앞오 · 2 뒤왼 · 3 뒤오(왼쪽 = −X).
// 운전자 보조는 여기서 스텝마다: ABS(바퀴 종 슬립 > absSlip → 제동 × absRelease), TCS(구동 바퀴 슬립 > tcsSlip → 스로틀 ½), 속도 감응 조향, 속도 제한.
// 파라미터는 content/vehicles/sedan.json(코드 상수 금지 — 모듈 카드 Gotchas). 노면 마찰 = 타이어 곡선만 × lerp(1, wetFrictionScale, 젖음) —
// Jolt 기본 결합 √(타이어 × 바디 마찰)은 셀 콜라이더 기본 마찰 0.2에서 접지력이 45 %로 떨어진다(GetCombinedFriction 콜백으로 대체).
import type { CurvePoints, SedanParams, VehicleInput } from '../../api.ts';
import type { Jolt } from './jolt-init.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

type J<K extends keyof Jolt> = Jolt[K] extends abstract new (...a: never[]) => infer R ? R : never;

/** 차체 충돌 상자: 바닥 틈(m)·높이 비율(차 높이 중 하부 상자). */
const BODY_CLEARANCE_M = 0.18;
const BODY_HEIGHT_FRACTION = 0.62;
/** 정지 때 서스펜션이 눌린 길이(최소·최대 사이 비율) — 바퀴 부착 높이 = 반경 + 이 길이(원점 ≈ 지면). */
const REST_FRACTION = 0.45;
/** 이 속력(m/s) 아래에서는 TCS·ABS를 쓰지 않는다(슬립 비 = 속도 차 ÷ 노면 속도 — 저속에서 과대). */
const TCS_MIN_SPEED_MS = 4;

export interface WheelOut {
  rotation: number;
  steer: number;
  suspension: number;
  slipLong: number;
  slipLatDeg: number;
  material: number;
}

export interface SedanBody {
  readonly id: J<'BodyID'>;
  readonly params: SedanParams;
  input: VehicleInput;
  /** 마지막 스텝 실제 스로틀·ABS·TCS. */
  readonly applied: { throttle: number; abs: boolean; tcs: boolean };
  /** 스텝 전: 입력 → SetDriverInput(보조 포함). */
  preStep(dt: number): void;
  /** 노면 젖음 0..1 → 마찰 곡선. */
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

function setCurve(c: J<'LinearCurve'>, pts: CurvePoints): void {
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

function bodyShape(w: PhysicsWorld, p: SedanParams): J<'Shape'> {
  const { Jolt } = w;
  const hh = (p.dimensionsM.height * BODY_HEIGHT_FRACTION) / 2;
  const cy = BODY_CLEARANCE_M + hh;
  const box = new Jolt.BoxShapeSettings(new Jolt.Vec3(p.dimensionsM.width / 2, hh, p.dimensionsM.length / 2), 0.05);
  const placed = new Jolt.RotatedTranslatedShapeSettings(new Jolt.Vec3(0, cy, 0), Jolt.Quat.prototype.sIdentity(), box);
  const com = new Jolt.OffsetCenterOfMassShapeSettings(new Jolt.Vec3(0, p.comHeightM - cy, 0), placed);
  const shape = com.Create().Get();
  shape.AddRef();
  Jolt.destroy(com);
  return shape;
}

/** 바퀴 4개(앞 = 조향, 뒤 = 핸드브레이크). */
function wheelSettings(w: PhysicsWorld, p: SedanParams): J<'WheelSettingsWV'>[] {
  const { Jolt } = w;
  const s = p.suspension;
  const rest = s.minLengthM + (s.maxLengthM - s.minLengthM) * REST_FRACTION;
  const y = p.tire.radiusM + rest;
  const out: J<'WheelSettingsWV'>[] = [];
  for (const [x, z, front] of [
    [-p.trackM / 2, -p.wheelbaseM / 2, true],
    [p.trackM / 2, -p.wheelbaseM / 2, true],
    [-p.trackM / 2, p.wheelbaseM / 2, false],
    [p.trackM / 2, p.wheelbaseM / 2, false],
  ] as const) {
    const ws = new Jolt.WheelSettingsWV();
    ws.mPosition = new Jolt.Vec3(x, y, z);
    ws.mWheelForward = new Jolt.Vec3(0, 0, -1);
    ws.mMaxSteerAngle = front ? (p.steering.maxSteerDeg * Math.PI) / 180 : 0;
    ws.mMaxHandBrakeTorque = front ? 0 : p.brakes.handbrakeTorqueNm;
    ws.mMaxBrakeTorque = front ? p.brakes.maxBrakeTorqueNm : p.brakes.rearBrakeTorqueNm;
    ws.mRadius = p.tire.radiusM;
    ws.mWidth = p.tire.widthM;
    ws.mSuspensionMinLength = s.minLengthM;
    ws.mSuspensionMaxLength = s.maxLengthM;
    ws.mSuspensionSpring.mFrequency = s.frequencyHz;
    ws.mSuspensionSpring.mDamping = s.damping;
    setCurve(ws.mLongitudinalFriction, p.tire.longitudinalFriction);
    setCurve(ws.mLateralFriction, p.tire.lateralFriction);
    out.push(ws);
  }
  return out;
}

function controllerSettings(w: PhysicsWorld, p: SedanParams): J<'WheeledVehicleControllerSettings'> {
  const { Jolt } = w;
  const c = new Jolt.WheeledVehicleControllerSettings();
  const e = c.mEngine;
  e.mMaxTorque = p.engine.maxTorqueNm;
  e.mMinRPM = p.engine.minRpm;
  e.mMaxRPM = p.engine.maxRpm;
  e.mInertia = p.engine.inertia;
  e.mAngularDamping = p.engine.angularDamping;
  setCurve(e.mNormalizedTorque, p.engine.torqueCurve);
  const t = c.mTransmission;
  t.mMode = Jolt.ETransmissionMode_Auto;
  t.mGearRatios.clear();
  for (const g of p.transmission.gearRatios) t.mGearRatios.push_back(g);
  t.mReverseGearRatios.clear();
  t.mReverseGearRatios.push_back(p.transmission.reverseRatio);
  t.mShiftUpRPM = p.transmission.shiftUpRpm;
  t.mShiftDownRPM = p.transmission.shiftDownRpm;
  t.mSwitchTime = p.transmission.switchTimeS;
  t.mClutchStrength = p.transmission.clutchStrength;
  c.mDifferentials.clear();
  const d = new Jolt.VehicleDifferentialSettings();
  d.mLeftWheel = 0;
  d.mRightWheel = 1;
  d.mDifferentialRatio = p.transmission.finalDrive;
  c.mDifferentials.push_back(d);
  Jolt.destroy(d);
  return c;
}

function constraintSettings(w: PhysicsWorld, p: SedanParams, wheels: J<'WheelSettingsWV'>[]) {
  const { Jolt } = w;
  const v = new Jolt.VehicleConstraintSettings();
  v.mUp = new Jolt.Vec3(0, 1, 0);
  v.mForward = new Jolt.Vec3(0, 0, -1);
  v.mWheels.clear();
  for (const ws of wheels) v.mWheels.push_back(ws);
  v.mAntiRollBars.clear();
  for (const [l, r, k] of [
    [0, 1, p.suspension.antiRollFront],
    [2, 3, p.suspension.antiRollRear],
  ] as const) {
    const bar = new Jolt.VehicleAntiRollBar();
    bar.mLeftWheel = l;
    bar.mRightWheel = r;
    bar.mStiffness = k;
    v.mAntiRollBars.push_back(bar);
    Jolt.destroy(bar);
  }
  v.mController = controllerSettings(w, p);
  return v;
}

/** 공기 저항 ½ρ·CdA·v² + 구름 저항 Crr·m·g(움직일 때) — 진행 반대 방향 힘. */
function resist(w: PhysicsWorld, id: J<'BodyID'>, p: SedanParams, speed: number): void {
  const v = w.bodies.GetLinearVelocity(id);
  const [vx, vz] = [v.GetX(), v.GetZ()];
  const sp = Math.hypot(vx, vz);
  if (sp < 0.05 || Math.abs(speed) < 0.05) return;
  const f = 0.5 * p.aero.airDensity * p.aero.dragAreaM2 * sp * sp + p.aero.rollingCoeff * p.massKg * 9.81;
  w.bodies.AddForce(id, w.scratch.vec3((-vx / sp) * f, 0, (-vz / sp) * f), w.Jolt.EActivation_DontActivate);
}

/** 운전자 보조: ABS·TCS·속도 감응 조향·속도 제한 → SetDriverInput 인자. */
function assist(b: { speed: number; slips: number[]; input: VehicleInput; p: SedanParams }) {
  const { p, input } = b;
  const v = Math.abs(b.speed);
  const kmh = v * 3.6;
  const hs = Math.min(kmh / p.steering.highSpeedKmh, 1);
  const right = input.steer * (1 - (1 - p.steering.highSpeedFactor) * hs);
  let throttle = kmh > p.speedLimitKmh ? 0 : input.throttle;
  const drive = Math.max(Math.abs(b.slips[0] ?? 0), Math.abs(b.slips[1] ?? 0));
  // TCS: 구동 바퀴 슬립이 tcsSlip을 넘은 만큼 비례로 줄인다(최소 30 %). 저속(슬립 비가 노면 속도로 나눠 커지는 구간)은 제외.
  const tcs = throttle > 0 && v > TCS_MIN_SPEED_MS && drive > p.brakes.tcsSlip;
  if (tcs) throttle *= Math.max(0.3, 1 - (drive - p.brakes.tcsSlip) / p.brakes.tcsSlip);
  const maxSlip = Math.max(...b.slips.map(Math.abs));
  const abs = input.brake > 0 && v > 1 && maxSlip > p.brakes.absSlip;
  const brake = abs ? input.brake * p.brakes.absRelease : input.brake;
  return { forward: input.reverse ? -throttle : throttle, right, brake, throttle, abs, tcs };
}

/** 차체 강체(질량 = 파라미터, 선형 감쇠 0 — 저항은 resist). */
function spawnBody(w: PhysicsWorld, pos: readonly [number, number, number], yaw: number, p: SedanParams) {
  const { Jolt, bodies, scratch } = w;
  const shape = bodyShape(w, p);
  const bcs = new Jolt.BodyCreationSettings(
    shape,
    scratch.rvec3(pos[0], pos[1], pos[2]),
    scratch.yawQuat(yaw),
    Jolt.EMotionType_Dynamic,
    OBJ.VEHICLE,
  );
  bcs.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
  bcs.mMassPropertiesOverride.mMass = p.massKg;
  bcs.mLinearDamping = 0;
  const body = bodies.CreateBody(bcs);
  Jolt.destroy(bcs);
  const id = new Jolt.BodyID(body.GetID().GetIndexAndSequenceNumber());
  bodies.AddBody(id, Jolt.EActivation_Activate);
  return { body, id, shape };
}

/** VehicleConstraint(원통 캐스트 접지) + 스텝 리스너 + 마찰 콜백. */
function attachConstraint(w: PhysicsWorld, body: J<'Body'>, p: SedanParams, grip: { k: number }) {
  const { Jolt, system } = w;
  const vs = constraintSettings(w, p, wheelSettings(w, p));
  const constraint = new Jolt.VehicleConstraint(body, vs);
  Jolt.destroy(vs);
  constraint.SetVehicleCollisionTester(new Jolt.VehicleCollisionTesterCastCylinder(OBJ.VEHICLE, 0.05));
  system.AddConstraint(constraint);
  const listener = new Jolt.VehicleConstraintStepListener(constraint);
  system.AddStepListener(listener);
  const callbacks = frictionCallbacks(w, grip);
  callbacks.SetVehicleConstraint(constraint);
  return { constraint, listener, callbacks };
}

export function createSedan(
  w: PhysicsWorld,
  pos: readonly [number, number, number],
  yaw: number,
  p: SedanParams,
): SedanBody {
  const { Jolt, bodies, system } = w;
  const { body, id, shape } = spawnBody(w, pos, yaw, p);
  const grip = { k: 1 };
  const { constraint, listener, callbacks } = attachConstraint(w, body, p, grip);
  const ctl = Jolt.castObject(constraint.GetController(), Jolt.WheeledVehicleController);
  const wheel = (i: number) => Jolt.castObject(constraint.GetWheel(i), Jolt.WheelWV);
  const slips = [0, 0, 0, 0];
  const applied = { throttle: 0, abs: false, tcs: false };
  const fwd = new Jolt.Vec3(0, 0, -1);
  const self: SedanBody = {
    id,
    params: p,
    input: { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false },
    applied,
    wheelCount: 4,
    preStep() {
      for (let i = 0; i < 4; i++) slips[i] = wheel(i).HasContact() ? wheel(i).mLongitudinalSlip : 0;
      const speed = self.speed();
      const a = assist({ speed, slips, input: self.input, p });
      resist(w, id, p, speed);
      ctl.SetDriverInput(a.forward, a.right, a.brake, self.input.handbrake ? 1 : 0);
      Object.assign(applied, { throttle: a.throttle, abs: a.abs, tcs: a.tcs });
      if (a.forward !== 0 || a.right !== 0 || a.brake !== 0 || self.input.handbrake) bodies.ActivateBody(id);
    },
    setWetness(wet) {
      grip.k = 1 + (p.tire.wetFrictionScale - 1) * Math.min(Math.max(wet, 0), 1);
    },
    speed() {
      const f = bodies.GetRotation(id).MulVec3(fwd);
      const v = bodies.GetLinearVelocity(id);
      return f.GetX() * v.GetX() + f.GetY() * v.GetY() + f.GetZ() * v.GetZ();
    },
    rpm: () => ctl.GetEngine().GetCurrentRPM(),
    gear: () => ctl.GetTransmission().GetCurrentGear(),
    shifting: () => ctl.GetTransmission().IsSwitchingGear(),
    wheel(i, out) {
      const wh = wheel(i);
      out.rotation = wh.GetRotationAngle();
      out.steer = wh.GetSteerAngle();
      out.suspension = wh.GetSuspensionLength();
      out.slipLong = wh.HasContact() ? wh.mLongitudinalSlip : 0;
      out.slipLatDeg = wh.HasContact() ? (wh.mLateralSlip * 180) / Math.PI : 0;
      out.material = wh.HasContact() ? Number(bodies.GetUserData(wh.GetContactBodyID())) & 0xff : -1;
    },
    dispose() {
      system.RemoveStepListener(listener);
      system.RemoveConstraint(constraint);
      Jolt.destroy(listener);
      Jolt.destroy(callbacks);
      bodies.RemoveBody(id);
      bodies.DestroyBody(id);
      Jolt.destroy(id);
      Jolt.destroy(fwd);
      shape.Release();
    },
  };
  return self;
}
