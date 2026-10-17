// 플레이어 차량(M08-T01): 물리 차체(카셰어·운전 중) 몇 대를 교통과 같은 가상 절차 모델(LOD0)·머티리얼로 — 인스턴스 1개짜리 메시 + 메시 변환(차체 자세 그대로,
// 경사·서스펜션 기울기 포함). `_ipos` = 원점·yaw 0(변환은 메시), `_ivar` = 바퀴 회전 수·flags(0 제동·1 좌·2 우 깜빡이·3 전조등)·도장·액센트,
// `_imove.w` = 지난 프레임 바퀴 회전(모션 벡터 — 차체 이동은 three 이전 모델 행렬이 맡는다). 첫 표시 전 장면 밖에서 선컴파일.
import type { Vec3d } from '@sanpo/core';
import {
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  Mesh,
  type Object3D,
} from 'three/webgpu';
import type { PlayerVehicleDraw } from '../../api.ts';
import { buildVehicleGeometry } from './models.ts';

export type { PlayerVehicleDraw } from '../../api.ts';

interface Slot {
  mesh: Mesh;
  vars: InstancedBufferAttribute;
  move: InstancedBufferAttribute;
  lastTurns: number;
  seen: boolean;
}

export interface PlayerVehicles {
  readonly root: Group;
  /** 머티리얼이 생기면(교통 bind 또는 처음 set) 붙인다. */
  attach(material: Material): void;
  readonly attached: boolean;
  /** 목록 교체(게임 배선 — 프레임마다). 그리기는 update(renderPrep, 원점 재설정 뒤). */
  set(list: readonly PlayerVehicleDraw[]): void;
  /** renderPrep: 목록 → 메시(없어진 ID 정리). */
  update(renderOriginWF: Readonly<Vec3d>): void;
  /** 선컴파일용: 차종별 한 대씩 잠깐 만든다 → 되돌리기. */
  primeForCompile(types: readonly number[]): () => void;
  readonly count: number;
  dispose(): void;
}

function createSlot(type: number, material: Material): Slot {
  const base = buildVehicleGeometry(type, 0);
  const geo = new InstancedBufferGeometry();
  for (const [name, a] of Object.entries(base.attributes)) geo.setAttribute(name, a);
  geo.setIndex(base.index);
  geo.setAttribute('_ipos', new InstancedBufferAttribute(new Float32Array(4), 4));
  const vars = new InstancedBufferAttribute(new Float32Array(4), 4);
  const move = new InstancedBufferAttribute(new Float32Array(4), 4);
  geo.setAttribute('_ivar', vars);
  geo.setAttribute('_imove', move);
  geo.instanceCount = 1;
  const mesh = new Mesh(geo, material);
  mesh.name = `vehicle/player/${type}`;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = type;
  return { mesh, vars, move, lastTurns: 0, seen: false };
}

function write(s: Slot, v: PlayerVehicleDraw, o: Readonly<Vec3d>): void {
  s.mesh.position.set(v.posWF.x - o.x, v.posWF.y - o.y, v.posWF.z - o.z);
  s.mesh.quaternion.set(v.quat.x, v.quat.y, v.quat.z, v.quat.w);
  s.vars.array.set([v.wheelTurns % 1, v.flags, v.paint, v.accent]);
  s.move.array[3] = s.seen ? v.wheelTurns - s.lastTurns : 0;
  s.lastTurns = v.wheelTurns;
  s.vars.needsUpdate = true;
  s.move.needsUpdate = true;
  s.mesh.visible = true;
  s.seen = true;
}

function dropSlot(slots: Map<number, Slot>, id: number, s: Slot): void {
  s.mesh.removeFromParent();
  s.mesh.geometry.dispose();
  slots.delete(id);
}

/** 목록 → 메시(차종이 바뀌면 새로, 없어진 ID는 정리). root = 새 메시를 붙일 그룹. */
function updateSlots(
  slots: Map<number, Slot>,
  list: readonly PlayerVehicleDraw[],
  material: Material,
  o: Readonly<Vec3d>,
  root: Group,
): void {
  const live = new Set<number>();
  for (const v of list) {
    let s = slots.get(v.id);
    if (s && s.mesh.userData.type !== v.type) {
      dropSlot(slots, v.id, s);
      s = undefined;
    }
    if (!s) {
      s = createSlot(v.type, material);
      slots.set(v.id, s);
      root.add(s.mesh);
    }
    write(s, v, o);
    live.add(v.id);
  }
  for (const [id, s] of slots) if (!live.has(id)) dropSlot(slots, id, s);
}

export function createPlayerVehicles(): PlayerVehicles {
  const root = new Group();
  root.name = 'vehicles/player';
  const slots = new Map<number, Slot>();
  let material: Material | undefined;
  let current: readonly PlayerVehicleDraw[] = [];
  return {
    root,
    attach(m) {
      material ??= m;
    },
    get attached() {
      return material !== undefined;
    },
    set(list) {
      current = list;
    },
    update(o) {
      if (material) updateSlots(slots, current, material, o, root);
    },
    primeForCompile(types) {
      if (!material) return () => undefined;
      const made: Object3D[] = [];
      for (const t of types) {
        const s = createSlot(t, material);
        s.mesh.position.set(0, -1000, 0);
        root.add(s.mesh);
        made.push(s.mesh);
      }
      return () => {
        for (const m of made) {
          m.removeFromParent();
          (m as Mesh).geometry.dispose();
        }
      };
    },
    get count() {
      return slots.size;
    },
    dispose() {
      for (const [id, s] of slots) dropSlot(slots, id, s);
    },
  };
}
