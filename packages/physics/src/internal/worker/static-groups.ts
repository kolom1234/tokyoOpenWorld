// 이름 붙인 정적 묶음(M07-T04 — ADR-0073): 메인이 만든 승강장 바닥(삼각형 메시 — 레일 데이터에서)·홈도어(상자) → STATIC_WORLD 바디 1개씩.
// 같은 이름 = 교체(홈도어 열림·닫힘), null = 제거. 원점 = 첫 점(PHYS float32 정밀도), 앵커 재설정 = −Δ.
import type { Vec3d } from '@sanpo/core';
import type { JcolBox } from '@sanpo/tile-format';
import { createMeshShape } from './heightfield.ts';
import type { Jolt } from './jolt-init.ts';
import { OBJ } from './layers.ts';
import { createPrimitiveCompound } from './primitives.ts';
import type { PhysicsWorld } from './world.ts';

type BodyId = InstanceType<Jolt['BodyID']>;

/** 상자 레코드(f64): cx, cy, cz(WF), 반변 hx, hy, hz, yaw, 재질. */
export const STATIC_BOX_STRIDE = 8;

export interface StaticGroup {
  boxes?: Float64Array;
  /** WF xyz × 정점, 삼각형 인덱스, 재질(JCOL_MATERIAL). */
  mesh?: { positions: Float64Array; indices: Uint32Array; material: number };
}

export interface StaticGroups {
  set(name: string, g: StaticGroup | null): void;
  shift(dx: number, dy: number, dz: number): void;
  readonly count: number;
  dispose(): void;
}

function originOf(g: StaticGroup): [number, number, number] {
  const a = g.mesh?.positions ?? g.boxes;
  return a && a.length >= 3 ? [a[0] as number, a[1] as number, a[2] as number] : [0, 0, 0];
}

function boxesShape(J: Jolt, b: Float64Array, o: readonly number[]) {
  const shapes: JcolBox[] = [];
  for (let i = 0; i + STATIC_BOX_STRIDE <= b.length; i += STATIC_BOX_STRIDE) {
    const yaw = b[i + 6] as number;
    shapes.push({
      kind: 'box',
      halfExtents: [b[i + 3] as number, b[i + 4] as number, b[i + 5] as number],
      posLocal: [
        (b[i] as number) - (o[0] as number),
        (b[i + 1] as number) - (o[1] as number),
        (b[i + 2] as number) - (o[2] as number),
      ],
      quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      layer: OBJ.STATIC_WORLD,
      material: b[i + 7] as number,
      flags: 0,
    });
  }
  return createPrimitiveCompound(J, shapes);
}

function meshShape(J: Jolt, m: NonNullable<StaticGroup['mesh']>, o: readonly number[]) {
  const v = new Float32Array(m.positions.length);
  for (let i = 0; i < v.length; i++) v[i] = (m.positions[i] as number) - (o[i % 3] as number);
  return createMeshShape(J, v, m.indices, m.material);
}

export function createStaticGroups(w: PhysicsWorld, anchor: Readonly<Vec3d>): StaticGroups {
  const { Jolt, bodies, scratch } = w;
  const list = new Map<string, BodyId[]>();
  const remove = (name: string): void => {
    for (const id of list.get(name) ?? []) {
      bodies.RemoveBody(id);
      bodies.DestroyBody(id);
      Jolt.destroy(id);
    }
    list.delete(name);
  };
  const add = (shape: InstanceType<Jolt['Shape']>, o: readonly number[]): BodyId => {
    const settings = new Jolt.BodyCreationSettings(
      shape,
      scratch.rvec3((o[0] as number) - anchor.x, (o[1] as number) - anchor.y, (o[2] as number) - anchor.z),
      scratch.yawQuat(0),
      Jolt.EMotionType_Static,
      OBJ.STATIC_WORLD,
    );
    const id = new Jolt.BodyID(
      bodies.CreateAndAddBody(settings, Jolt.EActivation_DontActivate).GetIndexAndSequenceNumber(),
    );
    Jolt.destroy(settings);
    shape.Release();
    return id;
  };
  return {
    set(name, g) {
      remove(name);
      if (!g) return;
      const o = originOf(g);
      const ids: BodyId[] = [];
      const b = g.boxes && g.boxes.length > 0 ? boxesShape(Jolt, g.boxes, o) : undefined;
      if (b) ids.push(add(b, o));
      if (g.mesh && g.mesh.indices.length > 0) ids.push(add(meshShape(Jolt, g.mesh, o), o));
      list.set(name, ids);
    },
    shift(dx, dy, dz) {
      for (const ids of list.values())
        for (const id of ids) {
          const p = bodies.GetPosition(id);
          const [x, y, z] = [p.GetX() - dx, p.GetY() - dy, p.GetZ() - dz];
          bodies.SetPosition(id, scratch.rvec3(x, y, z), Jolt.EActivation_DontActivate);
        }
    },
    get count() {
      return list.size;
    },
    dispose() {
      for (const n of [...list.keys()]) remove(n);
    },
  };
}
