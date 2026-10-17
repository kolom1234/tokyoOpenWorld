// 플레이어 자전거(M08-T03 — 08 §7): 생활형 자전거 + 탄 사람 = VEHICLE 동적 강체(세로로 긴 상자, 무게중심 0.95 m) + VehicleConstraint(MotorcycleController 2륜·기울기).
// 바퀴 0 앞(조향) · 1 뒤(구동). 페달 = 엔진(단일 기어 1:1, 평평한 토크 곡선)의 스로틀 = 입력 × clamp(1 − v / vmax) → 뒷바퀴 토크 ≤ maxTorqueNm(평지 최고 ≈ 24 km/h).
// 저속 보조: v < assistBelowMs면 Jolt 기울기 제어기를 끄고 롤 스프링(차체 위 → 세계 위, 전방 축 성분만)으로 세운다, v < standStillMs면 발 딛기(강한 롤 고정).
// 기울기 상한 = maxPitchRollDeg(넘어지지 않음). 파라미터 = content/vehicles/bicycle.json.
import type { BicycleParams } from '../../api.ts';
import {
  attachConstraint,
  destroyBody,
  forwardSpeed,
  type J,
  readWheel,
  resist,
  setCurve,
  spawnBody,
  type VehicleBody,
} from './vehicle-common.ts';
import type { PhysicsWorld } from './world.ts';

const deg = (d: number): number => (d * Math.PI) / 180;
/** 상자 높이 비율(바닥 틈 0.3 m 위) — 사람 머리는 상자 밖(낮은 처마에 걸리지 않게). */
const BOX_BOTTOM_M = 0.3;
const BOX_TOP_FRACTION = 0.8;

function bodyShape(w: PhysicsWorld, p: BicycleParams): J<'Shape'> {
  const { Jolt } = w;
  const top = p.dimensionsM.height * BOX_TOP_FRACTION;
  const hh = (top - BOX_BOTTOM_M) / 2;
  const cy = BOX_BOTTOM_M + hh;
  const box = new Jolt.BoxShapeSettings(new Jolt.Vec3(p.dimensionsM.width / 2, hh, p.dimensionsM.length / 2), 0.05);
  const placed = new Jolt.RotatedTranslatedShapeSettings(new Jolt.Vec3(0, cy, 0), Jolt.Quat.prototype.sIdentity(), box);
  const com = new Jolt.OffsetCenterOfMassShapeSettings(new Jolt.Vec3(0, p.comHeightM - cy, 0), placed);
  const shape = com.Create().Get();
  shape.AddRef();
  Jolt.destroy(com);
  return shape;
}

function wheels(w: PhysicsWorld, p: BicycleParams): J<'WheelSettingsWV'>[] {
  const { Jolt } = w;
  const s = p.suspension;
  const y = p.wheel.radiusM + (s.minLengthM + s.maxLengthM) / 2;
  return [true, false].map((front) => {
    const ws = new Jolt.WheelSettingsWV();
    ws.mPosition = new Jolt.Vec3(0, y, ((front ? -1 : 1) * p.wheelbaseM) / 2);
    ws.mWheelForward = new Jolt.Vec3(0, 0, -1);
    ws.mMaxSteerAngle = front ? deg(p.steering.maxSteerDeg) : 0;
    ws.mMaxBrakeTorque = front ? p.brakes.frontTorqueNm : p.brakes.rearTorqueNm;
    ws.mMaxHandBrakeTorque = front ? 0 : p.brakes.rearTorqueNm;
    ws.mRadius = p.wheel.radiusM;
    ws.mWidth = p.wheel.widthM;
    ws.mInertia = 0.1;
    ws.mSuspensionMinLength = s.minLengthM;
    ws.mSuspensionMaxLength = s.maxLengthM;
    ws.mSuspensionSpring.mFrequency = s.frequencyHz;
    ws.mSuspensionSpring.mDamping = s.damping;
    setCurve(ws.mLongitudinalFriction, p.tire.longitudinalFriction);
    setCurve(ws.mLateralFriction, p.tire.lateralFriction);
    return ws;
  });
}

/** 페달 = 엔진: 최고 회전 = vmax의 1.4배 바퀴 회전, 단일 기어 1:1, 차동(오른쪽 = 뒷바퀴 1). */
function controller(w: PhysicsWorld, p: BicycleParams): J<'MotorcycleControllerSettings'> {
  const { Jolt } = w;
  const c = new Jolt.MotorcycleControllerSettings();
  const maxRpm = ((p.pedal.vmaxMs * 1.4) / p.wheel.radiusM / (2 * Math.PI)) * 60;
  c.mEngine.mMaxTorque = p.pedal.maxTorqueNm;
  c.mEngine.mMinRPM = 1;
  c.mEngine.mMaxRPM = maxRpm;
  c.mEngine.mInertia = 0.05;
  c.mEngine.mAngularDamping = 0.02;
  setCurve(c.mEngine.mNormalizedTorque, [
    [0, 1],
    [1, 1],
  ]);
  const t = c.mTransmission;
  t.mMode = Jolt.ETransmissionMode_Auto;
  t.mGearRatios.clear();
  t.mGearRatios.push_back(1);
  t.mReverseGearRatios.clear();
  t.mReverseGearRatios.push_back(-1);
  t.mClutchStrength = 50;
  t.mShiftUpRPM = maxRpm * 2;
  t.mShiftDownRPM = 0;
  c.mDifferentials.clear();
  const d = new Jolt.VehicleDifferentialSettings();
  d.mLeftWheel = -1;
  d.mRightWheel = 1;
  d.mDifferentialRatio = 1;
  c.mDifferentials.push_back(d);
  Jolt.destroy(d);
  c.mMaxLeanAngle = deg(p.lean.maxLeanDeg);
  c.mLeanSpringConstant = p.lean.springConstant;
  c.mLeanSpringDamping = p.lean.springDamping;
  c.mLeanSmoothingFactor = p.lean.smoothing;
  return c;
}

function settings(w: PhysicsWorld, p: BicycleParams): J<'VehicleConstraintSettings'> {
  const { Jolt } = w;
  const v = new Jolt.VehicleConstraintSettings();
  v.mUp = new Jolt.Vec3(0, 1, 0);
  v.mForward = new Jolt.Vec3(0, 0, -1);
  v.mMaxPitchRollAngle = deg(p.maxPitchRollDeg);
  v.mWheels.clear();
  for (const ws of wheels(w, p)) v.mWheels.push_back(ws);
  v.mController = controller(w, p);
  return v;
}

/** 저속 롤 스프링: τ = k·((차체 위 × 세계 위)·전방)·전방 − c·(ω·전방)·전방. */
function upright(w: PhysicsWorld, id: J<'BodyID'>, k: number, c: number): void {
  const { bodies, scratch } = w;
  const q = bodies.GetRotation(id);
  const up = q.MulVec3(scratch.vec3(0, 1, 0));
  const [ux, uy, uz] = [up.GetX(), up.GetY(), up.GetZ()];
  const f = q.MulVec3(scratch.vec3(0, 0, -1));
  const [fx, fy, fz] = [f.GetX(), f.GetY(), f.GetZ()];
  // up × (0, 1, 0) = (−uz, 0, ux).
  const tilt = -uz * fx + ux * fz;
  const om = bodies.GetAngularVelocity(id);
  const spin = om.GetX() * fx + om.GetY() * fy + om.GetZ() * fz;
  const m = k * tilt - c * spin;
  void uy;
  bodies.AddTorque(id, scratch.vec3(fx * m, fy * m, fz * m), w.Jolt.EActivation_Activate);
}

export function createBicycle(
  w: PhysicsWorld,
  pos: readonly [number, number, number],
  yaw: number,
  p: BicycleParams,
): VehicleBody {
  const { Jolt, bodies } = w;
  const shape = bodyShape(w, p);
  const { body, id } = spawnBody(w, shape, pos, yaw, p.massKg);
  const grip = { k: 1 };
  const att = attachConstraint(w, body, settings(w, p), grip);
  const ctl = Jolt.castObject(att.constraint.GetController(), Jolt.MotorcycleController);
  const wheel = (i: number) => Jolt.castObject(att.constraint.GetWheel(i), Jolt.WheelWV);
  const fwd = new Jolt.Vec3(0, 0, -1);
  const applied = { throttle: 0, abs: false, tcs: false };
  const L = p.lowSpeed;
  const self: VehicleBody = {
    id,
    input: { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false },
    applied,
    wheelCount: 2,
    preStep() {
      const v = forwardSpeed(w, id, fwd);
      const av = Math.abs(v);
      const kmh = av * 3.6;
      const pedal = kmh > p.speedLimitKmh ? 0 : self.input.throttle * Math.min(Math.max(1 - av / p.pedal.vmaxMs, 0), 1);
      const hs = Math.min(kmh / p.steering.highSpeedKmh, 1);
      const right = self.input.steer * (1 - (1 - p.steering.highSpeedFactor) * hs);
      resist(w, id, p.aero, p.massKg, v);
      const slow = av < L.assistBelowMs;
      ctl.EnableLeanController(!slow);
      if (slow) {
        const still = av < L.standStillMs && pedal === 0;
        const blend = 1 - av / L.assistBelowMs;
        upright(w, id, still ? L.footDownStiffness : L.uprightStiffness * (0.4 + 0.6 * blend), L.uprightDamping);
      }
      ctl.SetDriverInput(pedal, right, self.input.brake, self.input.handbrake ? 1 : 0);
      applied.throttle = pedal;
      if (pedal !== 0 || right !== 0 || self.input.brake !== 0) bodies.ActivateBody(id);
    },
    setWetness(wet) {
      grip.k = 1 + (p.tire.wetFrictionScale - 1) * Math.min(Math.max(wet, 0), 1);
    },
    speed: () => forwardSpeed(w, id, fwd),
    rpm: () => ctl.GetEngine().GetCurrentRPM(),
    gear: () => 1,
    shifting: () => false,
    wheel: (i, out) => readWheel(w, wheel(i), out),
    dispose() {
      att.dispose();
      destroyBody(w, id, shape);
      Jolt.destroy(fwd);
    },
  };
  return self;
}
