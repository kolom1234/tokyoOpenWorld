// 열차 칸 바디(M07-T04, 08 §8 — ADR-0073): 메인 sim 열차(프레임마다 정확한 값) → step 명령 'trains'(core TRAIN_BODY_STRIDE 레코드) →
// TRAIN 레이어 키네마틱 합성 바디(바닥·옆벽(문 자리 비움)·끝벽·운전실 칸막이·천장·롱시트) + 쪽마다 닫힌 문 바디(열림 ≥ 0.9면 없음).
// 스텝마다 목표 = 직전·이번 레코드 선형 보간(시각 = 메인 시계 targetS) → MoveKinematic — 바디 속도가 생겨 캐릭터가 바닥 속도를 받는다(character.ts).
// 레코드에 없는 칸 = 제거. 좌표: WF → PHYS(WF − 앵커), 앵커 재설정 = −Δ.
import { TRAIN_BODY_STRIDE, TRAIN_CAR_TYPES, type TrainCarTypeInfo, type Vec3d } from '@sanpo/core';
import type { JcolBox, JcolShape } from '@sanpo/tile-format';
import type { Jolt } from './jolt-init.ts';
import { OBJ } from './layers.ts';
import { createPrimitiveCompound } from './primitives.ts';
import type { PhysicsWorld } from './world.ts';

type BodyId = InstanceType<Jolt['BodyID']>;
type Shape = InstanceType<Jolt['Shape']>;

/** 벽·바닥·천장 두께(m). */
const T = 0.08;
/** 문이 이만큼 열리면 문 바디를 없앤다(캐릭터 캡슐 0.5 m가 지나갈 틈). */
const DOOR_OPEN_AT = 0.9;
/** 롱시트 깊이·높이(m) — 계단 오르기 0.40 m보다 높아 올라서지 않는다. */
const SEAT = { depth: 0.5, height: 0.45 } as const;

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface Car {
  body: BodyId;
  key: string;
  /** 쪽(−1 왼쪽·+1 오른쪽)별 닫힌 문 바디. */
  doors: Map<number, BodyId>;
  prev: Pose;
  cur: Pose;
  tPrev: number;
  tCur: number;
}

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): JcolBox => ({
  kind: 'box',
  halfExtents: [hx, hy, hz],
  posLocal: [cx, cy, cz],
  quat: [0, 0, 0, 1],
  layer: 0,
  material: 0,
  flags: 0,
});

/** 옆벽 구간(문 자리 비움 — 운전실 쪽 끝은 칸막이까지 막힘)·끝벽·칸막이·바닥·천장·롱시트. */
export function carShapes(t: TrainCarTypeInfo, kind: number): JcolShape[] {
  const e = t.lengthM / 2 - 0.25;
  const W = t.widthM;
  const hy = (t.ceilingM - t.floorM) / 2 + T;
  const cy = (t.floorM + t.ceilingM) / 2;
  const out: JcolShape[] = [
    box(0, t.floorM - T / 2, 0, W / 2, T / 2, e),
    box(0, t.ceilingM + T / 2, 0, W / 2, T / 2, e),
    box(0, cy, -e + T / 2, W / 2, hy, T / 2),
    box(0, cy, e - T / 2, W / 2, hy, T / 2),
  ];
  const cuts = [...t.doorsZ].sort((a, b) => a - b).map((z) => [z - t.doorWidthM / 2, z + t.doorWidthM / 2] as const);
  let z = -e;
  const spans: [number, number][] = [];
  for (const [a, b] of cuts) {
    if (a > z) spans.push([z, a]);
    z = b;
  }
  if (e > z) spans.push([z, e]);
  for (const s of [-1, 1]) {
    for (const [a, b] of spans) {
      out.push(box(s * (W / 2 - T / 2), cy, (a + b) / 2, T / 2, hy, (b - a) / 2));
      if (b - a > 1)
        out.push(
          box(
            s * (W / 2 - T - SEAT.depth / 2),
            t.floorM + SEAT.height / 2,
            (a + b) / 2,
            SEAT.depth / 2,
            SEAT.height / 2,
            (b - a) / 2 - 0.05,
          ),
        );
    }
    for (const [a, b] of cuts) {
      const h = (t.ceilingM - t.doorTopM) / 2;
      out.push(box(s * (W / 2 - T / 2), t.doorTopM + h, (a + b) / 2, T / 2, h, (b - a) / 2));
    }
  }
  if (kind === 2) out.push(box(0, cy, -e + t.cabM, W / 2, hy, T / 2));
  if (kind === 3) out.push(box(0, cy, e - t.cabM, W / 2, hy, T / 2));
  return out;
}

/** 한쪽 닫힌 문(문 자리마다 판). */
export function doorShapes(t: TrainCarTypeInfo, side: number): JcolShape[] {
  const cy = (t.floorM + t.doorTopM) / 2;
  const hy = (t.doorTopM - t.floorM) / 2;
  return t.doorsZ.map((z) => box(side * (t.widthM / 2 - T / 2), cy, z, T / 2, hy, t.doorWidthM / 2));
}

export interface TrainBodies {
  /** step 명령(메인 시계 targetS의 칸 레코드). 레코드에 없는 칸은 제거. */
  apply(data: Float64Array, atS: number): void;
  /** 물리 스텝마다(캐릭터 갱신 전): 스텝 끝 시각 tEnd의 보간 목표로 MoveKinematic. */
  beforeStep(tEnd: number, dt: number): void;
  shift(dx: number, dy: number, dz: number): void;
  readonly count: number;
  dispose(): void;
}

function quatOf(J: Jolt, p: Pose): InstanceType<Jolt['Quat']> {
  // q = yaw(Y) ⊗ pitch(X) — render·sim과 같은 순서(pitch 먼저, 그다음 yaw).
  const [sy, cy] = [Math.sin(p.yaw / 2), Math.cos(p.yaw / 2)];
  const [sp, cp] = [Math.sin(p.pitch / 2), Math.cos(p.pitch / 2)];
  return new J.Quat(cy * sp, sy * cp, -sy * sp, cy * cp);
}

const lerpAngle = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

interface Store {
  w: PhysicsWorld;
  anchor: Readonly<Vec3d>;
  cars: Map<number, Car>;
  /** (차형|종류|쪽) → 셰이프(참조 1개 보유 — dispose에서 Release). */
  shapes: Map<string, Shape>;
}

function shapeOf(st: Store, key: string, make: () => JcolShape[]): Shape {
  let s = st.shapes.get(key);
  if (!s) {
    s = createPrimitiveCompound(st.w.Jolt, make());
    if (!s) throw new Error(`train shape ${key}`);
    st.shapes.set(key, s);
  }
  return s;
}

function addBody(st: Store, shape: Shape, p: Pose): BodyId {
  const { Jolt, bodies, scratch } = st.w;
  const q = quatOf(Jolt, p);
  const settings = new Jolt.BodyCreationSettings(
    shape,
    scratch.rvec3(p.x - st.anchor.x, p.y - st.anchor.y, p.z - st.anchor.z),
    q,
    Jolt.EMotionType_Kinematic,
    OBJ.TRAIN,
  );
  const id = new Jolt.BodyID(bodies.CreateAndAddBody(settings, Jolt.EActivation_Activate).GetIndexAndSequenceNumber());
  Jolt.destroy(settings);
  Jolt.destroy(q);
  return id;
}

function removeBody(st: Store, id: BodyId): void {
  st.w.bodies.RemoveBody(id);
  st.w.bodies.DestroyBody(id);
  st.w.Jolt.destroy(id);
}

function removeCar(st: Store, id: number): void {
  const c = st.cars.get(id);
  if (!c) return;
  removeBody(st, c.body);
  for (const d of c.doors.values()) removeBody(st, d);
  st.cars.delete(id);
}

/** 닫힌 쪽 문 바디: 열림(쪽 일치) ≥ DOOR_OPEN_AT면 제거, 아니면 있게. */
function syncDoors(st: Store, c: Car, t: TrainCarTypeInfo, type: number, doors: number): void {
  for (const side of [-1, 1]) {
    const open = Math.max(0, doors * side) >= DOOR_OPEN_AT;
    const have = c.doors.get(side);
    if (open && have) {
      removeBody(st, have);
      c.doors.delete(side);
    } else if (!open && !have)
      c.doors.set(
        side,
        addBody(
          st,
          shapeOf(st, `${type}|door|${side}`, () => doorShapes(t, side)),
          c.cur,
        ),
      );
  }
}

function applyRecords(st: Store, d: Float64Array, atS: number): void {
  const seen = new Set<number>();
  for (let o = 0; o + TRAIN_BODY_STRIDE <= d.length; o += TRAIN_BODY_STRIDE) {
    const id = d[o] as number;
    const type = Math.min(TRAIN_CAR_TYPES.length - 1, Math.max(0, Math.round(d[o + 6] as number)));
    const kind = Math.round(d[o + 7] as number);
    const t = TRAIN_CAR_TYPES[type] as TrainCarTypeInfo;
    const key = `${type}|${kind}`;
    const pose: Pose = {
      x: d[o + 1] as number,
      y: d[o + 2] as number,
      z: d[o + 3] as number,
      yaw: d[o + 4] as number,
      pitch: d[o + 5] as number,
    };
    if (st.cars.get(id)?.key !== key) removeCar(st, id);
    let c = st.cars.get(id);
    if (!c) {
      c = {
        body: addBody(
          st,
          shapeOf(st, key, () => carShapes(t, kind)),
          pose,
        ),
        key,
        doors: new Map(),
        prev: pose,
        cur: pose,
        tPrev: atS,
        tCur: atS,
      };
      st.cars.set(id, c);
    } else Object.assign(c, { prev: c.cur, tPrev: c.tCur, cur: pose, tCur: atS });
    syncDoors(st, c, t, type, d[o + 8] as number);
    seen.add(id);
  }
  for (const id of [...st.cars.keys()]) if (!seen.has(id)) removeCar(st, id);
}

export function createTrainBodies(w: PhysicsWorld, anchor: Readonly<Vec3d>): TrainBodies {
  const { Jolt, bodies, scratch } = w;
  const st: Store = { w, anchor, cars: new Map(), shapes: new Map() };
  const target: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  return {
    apply: (data, atS) => applyRecords(st, data, atS),
    beforeStep(tEnd, dt) {
      for (const c of st.cars.values()) {
        const span = c.tCur - c.tPrev;
        const a = span > 1e-6 ? Math.min(Math.max((tEnd - c.tPrev) / span, 0), 1) : 1;
        target.x = c.prev.x + (c.cur.x - c.prev.x) * a;
        target.y = c.prev.y + (c.cur.y - c.prev.y) * a;
        target.z = c.prev.z + (c.cur.z - c.prev.z) * a;
        target.yaw = lerpAngle(c.prev.yaw, c.cur.yaw, a);
        target.pitch = c.prev.pitch + (c.cur.pitch - c.prev.pitch) * a;
        const q = quatOf(Jolt, target);
        const pos = scratch.rvec3(target.x - anchor.x, target.y - anchor.y, target.z - anchor.z);
        bodies.MoveKinematic(c.body, pos, q, dt);
        for (const d of c.doors.values()) bodies.MoveKinematic(d, pos, q, dt);
        Jolt.destroy(q);
      }
    },
    shift(dx, dy, dz) {
      for (const c of st.cars.values())
        for (const id of [c.body, ...c.doors.values()]) {
          const p = bodies.GetPosition(id);
          const [x, y, z] = [p.GetX() - dx, p.GetY() - dy, p.GetZ() - dz];
          bodies.SetPosition(id, scratch.rvec3(x, y, z), Jolt.EActivation_DontActivate);
        }
    },
    get count() {
      return st.cars.size;
    },
    dispose() {
      for (const id of [...st.cars.keys()]) removeCar(st, id);
      for (const s of st.shapes.values()) s.Release();
      st.shapes.clear();
    },
  };
}
