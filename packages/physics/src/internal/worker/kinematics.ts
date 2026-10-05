// 키네마틱 차량(08 §3·§8 직결, M06-T06 — ADR-0066): sim.worker 포트의 KinematicFrame(30 Hz, 플레이어 60 m 안 차량) → NPC_KINEMATIC 상자 바디.
// 프레임은 받아 두기만 하고(Jolt 변경은 step 안에서만) sync()가 생성·제거, 스텝마다 목표 = 받은 포즈 + 전방 × 속력 × (받은 뒤 경과 + 전송 지연, ≤ 0.25 s)
// → MoveKinematic(속도가 생겨 CharacterVirtual이 접촉 속도로 밀린다 — 관통 없음). 프레임에 없는 차 = 제거, 소스가 0.5 s 조용하면 전부 제거.
// 상자 = 폭 × (높이 − 바닥 틈 0.15 m) × 길이(로컬 −Z = 전방). 좌표: 프레임 WF → PHYS(WF − 앵커), 앵커 재설정 = 바디 −Δ.
import { KINEMATIC_STRIDE, type KinematicFrame, type Vec3d } from '@sanpo/core';
import type { Jolt } from './jolt-init.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

type BodyId = InstanceType<Jolt['BodyID']>;

interface Kin {
  body: BodyId;
  /** 길이·폭·높이(바뀌면 다시 만든다). */
  dims: string;
  /** 받은 포즈(WF 바닥 중심)·yaw·속력. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  /** 받은 뒤 경과(s) + 전송 지연. */
  age: number;
  /** 상자 반높이(중심 = 바닥 + 틈 + halfY). */
  halfY: number;
}

/** 차체 바닥 틈(m) — 연석·노면 요철에 걸리지 않게(캐릭터 캡슐 반경 0.25보다 작다). */
export const KIN_CLEARANCE_M = 0.15;
const MAX_EXTRAPOLATE_S = 0.25;
const STALE_S = 0.5;
const MAX_LAG_S = 0.1;

export interface Kinematics {
  /** 포트 수신(nowAbsMs = timeOrigin + now — 전송 지연). Jolt는 건드리지 않는다. */
  receive(f: KinematicFrame, nowAbsMs: number): void;
  /** step 시작: 받아 둔 프레임 반영(생성·갱신·제거) + 조용한 소스 정리. */
  sync(): void;
  /** 물리 스텝마다(캐릭터 갱신 전): 목표 포즈로 MoveKinematic. */
  beforeStep(dt: number): void;
  shift(dx: number, dy: number, dz: number): void;
  readonly count: number;
  /** 받은 프레임 수(누적). */
  readonly frames: number;
  dispose(): void;
}

const halfYOf = (hgt: number): number => Math.max(0.2, hgt - KIN_CLEARANCE_M) / 2;

function createBody(w: PhysicsWorld, r: Float64Array, o: number, anchor: Readonly<Vec3d>): BodyId {
  const { Jolt, bodies, scratch } = w;
  const [len, wid] = [r[o + 6] as number, r[o + 7] as number];
  const halfY = halfYOf(r[o + 8] as number);
  const shape = new Jolt.BoxShape(scratch.vec3(wid / 2, halfY, len / 2), 0.05, undefined);
  const settings = new Jolt.BodyCreationSettings(
    shape,
    scratch.rvec3(
      (r[o + 1] as number) - anchor.x,
      (r[o + 2] as number) + KIN_CLEARANCE_M + halfY - anchor.y,
      (r[o + 3] as number) - anchor.z,
    ),
    scratch.yawQuat(r[o + 4] as number),
    Jolt.EMotionType_Kinematic,
    OBJ.NPC_KINEMATIC,
  );
  const id = new Jolt.BodyID(bodies.CreateAndAddBody(settings, Jolt.EActivation_Activate).GetIndexAndSequenceNumber());
  Jolt.destroy(settings);
  return id;
}

interface Store {
  w: PhysicsWorld;
  anchor: Readonly<Vec3d>;
  list: Map<number, Kin>;
}

function removeKin(st: Store, id: number): void {
  const k = st.list.get(id);
  if (!k) return;
  st.w.bodies.RemoveBody(k.body);
  st.w.bodies.DestroyBody(k.body);
  st.w.Jolt.destroy(k.body);
  st.list.delete(id);
}

/** 프레임 반영: 새 차 = 바디 생성(치수가 바뀌면 다시), 포즈 갱신(경과 = 전송 지연), 없는 차 = 제거. */
function applyFrame(st: Store, f: KinematicFrame, lag: number): void {
  const d = f.data;
  const seen = new Set<number>();
  for (let o = 0; o + KINEMATIC_STRIDE <= d.length; o += KINEMATIC_STRIDE) {
    const id = d[o] as number;
    const dims = `${d[o + 6]}|${d[o + 7]}|${d[o + 8]}`;
    if (st.list.get(id)?.dims !== dims) removeKin(st, id);
    let k = st.list.get(id);
    if (!k) {
      const halfY = halfYOf(d[o + 8] as number);
      k = { body: createBody(st.w, d, o, st.anchor), dims, x: 0, y: 0, z: 0, yaw: 0, speed: 0, age: 0, halfY };
      st.list.set(id, k);
    }
    Object.assign(k, { x: d[o + 1], y: d[o + 2], z: d[o + 3], yaw: d[o + 4], speed: d[o + 5], age: lag });
    seen.add(id);
  }
  for (const id of [...st.list.keys()]) if (!seen.has(id)) removeKin(st, id);
}

export function createKinematics(w: PhysicsWorld, anchor: Readonly<Vec3d>): Kinematics {
  const { Jolt, bodies, scratch } = w;
  const st: Store = { w, anchor, list: new Map() };
  const list = st.list;
  const clear = (): void => {
    for (const id of [...list.keys()]) removeKin(st, id);
  };
  let pending: { f: KinematicFrame; lag: number } | undefined;
  let quietS = 0;
  let frames = 0;
  return {
    receive(f, nowAbsMs) {
      if (f?.t !== 'kin' || !(f.data instanceof Float64Array)) return;
      frames++;
      pending = { f, lag: Math.min(Math.max((nowAbsMs - f.atMs) / 1000, 0), MAX_LAG_S) };
    },
    sync() {
      if (pending) {
        applyFrame(st, pending.f, pending.lag);
        pending = undefined;
        quietS = 0;
      } else if (quietS > STALE_S) clear();
    },
    beforeStep(dt) {
      quietS += dt;
      for (const k of list.values()) {
        k.age += dt;
        const t = Math.min(k.age, MAX_EXTRAPOLATE_S) * k.speed;
        bodies.MoveKinematic(
          k.body,
          scratch.rvec3(
            k.x - Math.sin(k.yaw) * t - anchor.x,
            k.y + KIN_CLEARANCE_M + k.halfY - anchor.y,
            k.z - Math.cos(k.yaw) * t - anchor.z,
          ),
          scratch.yawQuat(k.yaw),
          dt,
        );
      }
    },
    shift(dx, dy, dz) {
      for (const k of list.values()) {
        const p = bodies.GetPosition(k.body);
        const [x, y, z] = [p.GetX() - dx, p.GetY() - dy, p.GetZ() - dz];
        bodies.SetPosition(k.body, scratch.rvec3(x, y, z), Jolt.EActivation_DontActivate);
      }
    },
    get count() {
      return list.size;
    },
    get frames() {
      return frames;
    },
    dispose() {
      clear();
      pending = undefined;
    },
  };
}
