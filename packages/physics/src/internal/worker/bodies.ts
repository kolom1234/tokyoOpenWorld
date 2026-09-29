// 워커 바디 슬롯: 명령(상자·삭제·순간이동) 적용 + 스냅샷 채우기. 슬롯 = 핸들 하위 비트(메인이 발급), 좌표 변환 WF ↔ PHYS는 여기서만.
import type { Vec3d } from '@sanpo/core';
import { BODY_ACTIVE, BODY_ALIVE, BODY_STRIDE, type Command, MAX_BODIES, META_STRIDE, slotOf } from '../protocol.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

interface BodyEntry {
  handle: number;
  id: InstanceType<PhysicsWorld['Jolt']['BodyID']>;
}

export interface BodySlots {
  apply(cmd: Exclude<Command, { c: 'removeCell' }>): void;
  /** 바디 기록(pos WF·quat·vel·angVel·flags·groundMat·handle). 반환 = 슬롯 상한(마지막 사용 슬롯 + 1). */
  fill(frame: Float64Array): number;
  readonly count: number;
  dispose(): void;
}

/** 너무 얇은 상자는 볼록 반경을 반변의 절반 이하로(Jolt 요구). */
const CONVEX_RADIUS = 0.05;

/** 한 슬롯 기록(08 §9 배치). 빈 슬롯 = flags 0. */
function writeBody(
  frame: Float64Array,
  o: number,
  e: BodyEntry | undefined,
  bodies: PhysicsWorld['bodies'],
  anchorWF: Readonly<Vec3d>,
): void {
  if (!e) {
    frame[o + 13] = 0;
    return;
  }
  const p = bodies.GetPosition(e.id);
  const q = bodies.GetRotation(e.id);
  const v = bodies.GetLinearVelocity(e.id);
  const a = bodies.GetAngularVelocity(e.id);
  frame[o] = p.GetX() + anchorWF.x;
  frame[o + 1] = p.GetY() + anchorWF.y;
  frame[o + 2] = p.GetZ() + anchorWF.z;
  frame[o + 3] = q.GetX();
  frame[o + 4] = q.GetY();
  frame[o + 5] = q.GetZ();
  frame[o + 6] = q.GetW();
  frame[o + 7] = v.GetX();
  frame[o + 8] = v.GetY();
  frame[o + 9] = v.GetZ();
  frame[o + 10] = a.GetX();
  frame[o + 11] = a.GetY();
  frame[o + 12] = a.GetZ();
  frame[o + 13] = BODY_ALIVE | (bodies.IsActive(e.id) ? BODY_ACTIVE : 0);
  frame[o + 14] = 0;
  frame[o + 15] = e.handle;
}

export function createBodySlots(w: PhysicsWorld, anchorWF: Readonly<Vec3d>): BodySlots {
  const { Jolt, bodies, scratch } = w;
  const slots: (BodyEntry | undefined)[] = new Array(MAX_BODIES);
  let count = 0;
  const remove = (slot: number): void => {
    const e = slots[slot];
    if (!e) return;
    bodies.RemoveBody(e.id);
    bodies.DestroyBody(e.id);
    Jolt.destroy(e.id);
    slots[slot] = undefined;
    count--;
  };
  const box = (c: Extract<Command, { c: 'box' }>): void => {
    const slot = slotOf(c.h);
    remove(slot);
    const radius = Math.min(CONVEX_RADIUS, 0.5 * Math.min(c.half.x, c.half.y, c.half.z));
    const shape = new Jolt.BoxShape(scratch.vec3(c.half.x, c.half.y, c.half.z), radius, undefined);
    const pos = scratch.rvec3(c.posWF.x - anchorWF.x, c.posWF.y - anchorWF.y, c.posWF.z - anchorWF.z);
    const motion = c.dynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static;
    const layer = c.dynamic ? OBJ.VEHICLE : OBJ.STATIC_WORLD;
    const settings = new Jolt.BodyCreationSettings(shape, pos, Jolt.Quat.prototype.sIdentity(), motion, layer);
    const activation = c.dynamic ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate;
    // 값 반환 BodyID는 바인딩의 임시 객체(다음 호출에 덮어써짐) → 복사해 보관, 제거 때 해제.
    const id = new Jolt.BodyID(bodies.CreateAndAddBody(settings, activation).GetIndexAndSequenceNumber());
    Jolt.destroy(settings);
    slots[slot] = { handle: c.h, id };
    count++;
  };
  const teleport = (c: Extract<Command, { c: 'teleport' }>): void => {
    const e = slots[slotOf(c.h)];
    if (!e || e.handle !== c.h) return;
    const pos = scratch.rvec3(c.posWF.x - anchorWF.x, c.posWF.y - anchorWF.y, c.posWF.z - anchorWF.z);
    bodies.SetPositionAndRotation(e.id, pos, scratch.yawQuat(c.yaw), Jolt.EActivation_Activate);
    bodies.SetLinearAndAngularVelocity(e.id, scratch.vec3(0, 0, 0), scratch.vec3(0, 0, 0));
  };
  return {
    get count() {
      return count;
    },
    apply(c) {
      if (c.c === 'box') box(c);
      else if (c.c === 'despawn') {
        const s = slotOf(c.h);
        if (slots[s]?.handle === c.h) remove(s);
      } else teleport(c);
    },
    fill(frame) {
      let top = 0;
      for (let s = 0; s < MAX_BODIES; s++) {
        const e = slots[s];
        if (e) top = s + 1;
        writeBody(frame, META_STRIDE + s * BODY_STRIDE, e, bodies, anchorWF);
      }
      return top;
    },
    dispose() {
      for (let s = 0; s < MAX_BODIES; s++) remove(s);
    },
  };
}
