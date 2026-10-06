// 워커 바디 슬롯: 명령(상자·캐릭터·입력·삭제·순간이동) 적용 + 스냅샷 채우기. 슬롯 = 핸들 하위 비트(메인이 발급), 좌표 변환 WF ↔ PHYS는 여기서만.
// 캐릭터(08 §5) = CharacterVirtual(바디 아님) — 같은 슬롯·스냅샷 배치를 쓴다(위치 = 발, 접지·지면 재질).
import type { Vec3d } from '@sanpo/core';
import {
  BODY_ACTIVE,
  BODY_ALIVE,
  BODY_ESCALATOR,
  BODY_GROUNDED,
  BODY_STRIDE,
  type Command,
  MAX_BODIES,
  META_STRIDE,
  slotOf,
} from '../protocol.ts';
import type { CharacterBody, Characters } from './character.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

type Entry =
  | { handle: number; kind: 'rigid'; id: InstanceType<PhysicsWorld['Jolt']['BodyID']> }
  | { handle: number; kind: 'char'; c: CharacterBody };

export type BodyCommand = Exclude<Command, { c: 'removeCell' } | { c: 'rebase' } | { c: 'trains' } | { c: 'statics' }>;

export interface BodySlots {
  apply(cmd: BodyCommand): void;
  /** 바디 기록(pos WF·quat·vel·angVel·flags·groundMat·handle). 반환 = 슬롯 상한(마지막 사용 슬롯 + 1). */
  fill(frame: Float64Array): number;
  readonly count: number;
  /** 앵커 재설정: 강체를 −Δ(캐릭터는 characters.shift). */
  shift(dx: number, dy: number, dz: number): void;
  dispose(): void;
}

/** 너무 얇은 상자는 볼록 반경을 반변의 절반 이하로(Jolt 요구). */
const CONVEX_RADIUS = 0.05;

interface Xyz {
  GetX(): number;
  GetY(): number;
  GetZ(): number;
}

function put(
  f: Float64Array,
  o: number,
  p: Xyz,
  q: Xyz & { GetW(): number },
  v: Xyz,
  a: Xyz | null,
  anchor: Vec3d,
): void {
  f[o] = p.GetX() + anchor.x;
  f[o + 1] = p.GetY() + anchor.y;
  f[o + 2] = p.GetZ() + anchor.z;
  f[o + 3] = q.GetX();
  f[o + 4] = q.GetY();
  f[o + 5] = q.GetZ();
  f[o + 6] = q.GetW();
  f[o + 7] = v.GetX();
  f[o + 8] = v.GetY();
  f[o + 9] = v.GetZ();
  f[o + 10] = a?.GetX() ?? 0;
  f[o + 11] = a?.GetY() ?? 0;
  f[o + 12] = a?.GetZ() ?? 0;
}

/** 한 슬롯 기록(08 §9 배치). 빈 슬롯 = flags 0. */
function writeEntry(
  f: Float64Array,
  o: number,
  e: Entry | undefined,
  w: PhysicsWorld,
  chars: Characters,
  anchor: Vec3d,
): void {
  if (!e) {
    f[o + 13] = 0;
    return;
  }
  if (e.kind === 'rigid') {
    const b = w.bodies;
    put(f, o, b.GetPosition(e.id), b.GetRotation(e.id), b.GetLinearVelocity(e.id), b.GetAngularVelocity(e.id), anchor);
    f[o + 13] = BODY_ALIVE | (b.IsActive(e.id) ? BODY_ACTIVE : 0);
    f[o + 14] = 0;
  } else {
    const ch = e.c.jolt;
    put(f, o, ch.GetPosition(), ch.GetRotation(), ch.GetLinearVelocity(), null, anchor);
    const g = chars.groundOf(e.c);
    f[o + 13] = BODY_ALIVE | BODY_ACTIVE | (g.grounded ? BODY_GROUNDED : 0) | (e.c.escalator ? BODY_ESCALATOR : 0);
    f[o + 14] = g.material;
  }
  f[o + 15] = e.handle;
}

/** 상자 바디 생성·추가. 값 반환 BodyID는 바인딩의 임시 객체(다음 호출에 덮어써짐) → 복사해 보관, 제거 때 해제. */
function createBox(w: PhysicsWorld, c: Extract<Command, { c: 'box' }>, [x, y, z]: readonly [number, number, number]) {
  const { Jolt, bodies, scratch } = w;
  const radius = Math.min(CONVEX_RADIUS, 0.5 * Math.min(c.half.x, c.half.y, c.half.z));
  const shape = new Jolt.BoxShape(scratch.vec3(c.half.x, c.half.y, c.half.z), radius, undefined);
  const motion = c.dynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static;
  const layer = c.dynamic ? OBJ.VEHICLE : OBJ.STATIC_WORLD;
  const settings = new Jolt.BodyCreationSettings(
    shape,
    scratch.rvec3(x, y, z),
    Jolt.Quat.prototype.sIdentity(),
    motion,
    layer,
  );
  const activation = c.dynamic ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate;
  const id = new Jolt.BodyID(bodies.CreateAndAddBody(settings, activation).GetIndexAndSequenceNumber());
  Jolt.destroy(settings);
  return id;
}

/** 순간이동(속도 0) — 강체는 바디 인터페이스, 캐릭터는 CharacterVirtual. */
function teleport(
  w: PhysicsWorld,
  chars: Characters,
  e: Entry | undefined,
  p: [number, number, number],
  yaw: number,
): void {
  const { Jolt, bodies, scratch } = w;
  if (e?.kind === 'rigid') {
    bodies.SetPositionAndRotation(
      e.id,
      scratch.rvec3(p[0], p[1], p[2]),
      scratch.yawQuat(yaw),
      Jolt.EActivation_Activate,
    );
    bodies.SetLinearAndAngularVelocity(e.id, scratch.vec3(0, 0, 0), scratch.vec3(0, 0, 0));
  } else if (e?.kind === 'char') chars.teleport(e.c, p, yaw);
}

/** 캐릭터 입력: 원하는 수평 속도(가감속은 character.ts), 아바타 방향. */
function charInput(w: PhysicsWorld, e: Entry | undefined, c: Extract<Command, { c: 'charInput' }>): void {
  if (e?.kind !== 'char') return;
  e.c.desired.x = c.moveWF.x;
  e.c.desired.z = c.moveWF.z;
  e.c.hold = c.hold === true;
  if (c.yaw !== undefined) e.c.jolt.SetRotation(w.scratch.yawQuat(c.yaw));
}

/** 앵커 재설정: 강체 −Δ(캐릭터는 characters.shift). */
function shiftRigid(w: PhysicsWorld, slots: readonly (Entry | undefined)[], dx: number, dy: number, dz: number): void {
  for (const e of slots) {
    if (e?.kind !== 'rigid') continue;
    const p = w.bodies.GetPosition(e.id);
    const [x, y, z] = [p.GetX() - dx, p.GetY() - dy, p.GetZ() - dz];
    w.bodies.SetPosition(e.id, w.scratch.rvec3(x, y, z), w.Jolt.EActivation_DontActivate);
  }
}

export function createBodySlots(w: PhysicsWorld, anchorWF: Readonly<Vec3d>, chars: Characters): BodySlots {
  const { Jolt, bodies } = w;
  const slots: (Entry | undefined)[] = new Array(MAX_BODIES);
  let count = 0;
  const phys = (p: Vec3d): [number, number, number] => [p.x - anchorWF.x, p.y - anchorWF.y, p.z - anchorWF.z];
  const remove = (slot: number): void => {
    const e = slots[slot];
    if (!e) return;
    if (e.kind === 'rigid') {
      bodies.RemoveBody(e.id);
      bodies.DestroyBody(e.id);
      Jolt.destroy(e.id);
    } else chars.remove(e.handle);
    slots[slot] = undefined;
    count--;
  };
  const own = (h: number): Entry | undefined => {
    const e = slots[slotOf(h)];
    return e?.handle === h ? e : undefined;
  };
  const put = (h: number, e: Entry): void => {
    slots[slotOf(h)] = e;
    count++;
  };
  const box = (c: Extract<Command, { c: 'box' }>): void => {
    remove(slotOf(c.h));
    put(c.h, { handle: c.h, kind: 'rigid', id: createBox(w, c, phys(c.posWF)) });
  };
  return {
    get count() {
      return count;
    },
    apply(c) {
      if (c.c === 'box') box(c);
      else if (c.c === 'character') {
        remove(slotOf(c.h));
        put(c.h, { handle: c.h, kind: 'char', c: chars.spawn(c.h, phys(c.posWF), c.yaw) });
      } else if (c.c === 'charInput') charInput(w, own(c.h), c);
      else if (c.c === 'despawn') {
        if (own(c.h)) remove(slotOf(c.h));
      } else teleport(w, chars, own(c.h), phys(c.posWF), c.yaw);
    },
    shift: (dx, dy, dz) => shiftRigid(w, slots, dx, dy, dz),
    fill(frame) {
      let top = 0;
      for (let s = 0; s < MAX_BODIES; s++) {
        const e = slots[s];
        if (e) top = s + 1;
        writeEntry(frame, META_STRIDE + s * BODY_STRIDE, e, w, chars, anchorWF);
      }
      return top;
    },
    dispose() {
      for (let s = 0; s < MAX_BODIES; s++) remove(s);
    },
  };
}
