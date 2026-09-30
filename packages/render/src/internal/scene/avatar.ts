// 플레이어 아바타(09 §3 3인칭, M04-T05, ADR-0045): 자체 제작 절차 마네킹(캡슐 몸통·팔다리·구 머리)으로 시작 → `attach`로 Quaternius 모델(ADR-0048,
// avatar-model.ts)이 붙으면 교체. 마네킹 = 속도 블렌드 대기·걷기·달리기(팔다리 진자 진폭·주기·몸 기울기가 속력에 연속), 근접 디더 페이드(opacity → alphaHash).
// 위치 = WF − 렌더 원점(renderPrep).
import type { AvatarState, Vec3d } from '@sanpo/core';
import { uniform } from 'three/tsl';
import {
  CapsuleGeometry,
  Group,
  type Material,
  Mesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
  type UniformNode,
} from 'three/webgpu';
import type { AvatarModel } from './avatar-model.ts';
import { toRender } from './origin.ts';

/** 한 걸음 보폭(m) — 주기(두 걸음) = 속력 / (2 × 보폭), 최대 1.6 Hz. */
const STRIDE_M = 0.7;
const MAX_CYCLE_HZ = 1.6;
/** 다리 진폭(rad) = 속력 × 0.32, 최대 0.75(달리기). 팔 = 다리 × 0.8 반대 위상. */
const LEG_PER_MS = 0.32;
const LEG_MAX = 0.75;
const ARM_RATIO = 0.8;
/** 달리기 앞 기울기: 1.8 m/s부터 0.06 rad/(m/s), 최대 0.18. */
const LEAN_FROM_MS = 1.8;
const LEAN_PER_MS = 0.06;
const LEAN_MAX = 0.18;
/** 진폭 따라가기(1/s) — 멈춤·출발 때 팔다리가 튀지 않게. */
const BLEND_PER_S = 8;

export interface Avatar {
  readonly group: Group;
  set(a: Readonly<AvatarState>): void;
  /** renderPrep: 위치(원점 기준)·자세. */
  update(dt: number, originWF: Readonly<Vec3d>): void;
  /** 그림자 캐스케이드 갱신 대상(모델이 붙으면 모델 머티리얼). */
  readonly materials: readonly Material[];
  /** 마네킹과 같은 opacity uniform(모델 머티리얼이 공유). */
  readonly opacity: UniformNode<'float', number>;
  /** 모델로 교체(마네킹 숨김). 다시 부르면 이전 모델 폐기. */
  attach(model: AvatarModel): void;
  dispose(): void;
}

function limb(radius: number, length: number, m: Material, pivot: [number, number, number]): Group {
  const g = new Group();
  g.position.set(...pivot);
  const mesh = new Mesh(new CapsuleGeometry(radius, length, 4, 8), m);
  mesh.position.y = -(length / 2 + radius);
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

function part(mesh: Mesh, y: number): Mesh {
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
}

interface Rig {
  group: Group;
  body: Group;
  legL: Group;
  legR: Group;
  armL: Group;
  armR: Group;
}

/** 모델 정면 = −Z(yaw 0 = 도북, 09 §3 규약), 발 = 원점. 캡슐 몸통·구 머리, 다리 0.92 m·팔 어깨 피벗. */
function buildRig(cloth: Material, pants: Material, skin: Material): Rig {
  const group = new Group();
  group.name = 'avatar';
  group.visible = false;
  const body = new Group();
  body.position.y = 0.9;
  body.add(part(new Mesh(new CapsuleGeometry(0.16, 0.36, 4, 10), cloth), 0.33));
  body.add(part(new Mesh(new SphereGeometry(0.11, 12, 10), skin), 0.73));
  const legL = limb(0.07, 0.72, pants, [-0.09, 0.92, 0]);
  const legR = limb(0.07, 0.72, pants, [0.09, 0.92, 0]);
  const armL = limb(0.05, 0.52, cloth, [-0.22, 0.52, 0]);
  const armR = limb(0.05, 0.52, cloth, [0.22, 0.52, 0]);
  body.add(armL, armR);
  group.add(body, legL, legR);
  return { group, body, legL, legR, armL, armR };
}

/** 마네킹 걸음 상태(위상·진폭·호흡 시간). */
interface Gait {
  phase: number;
  amp: number;
  time: number;
}

/** 마네킹 자세: 팔다리 진자·몸 기울기·호흡·걸음 오르내림. */
function poseRig(r: Rig, g: Gait, st: Readonly<AvatarState>, dt: number): void {
  g.time += dt;
  g.phase += Math.min(st.speedMs / (2 * STRIDE_M), MAX_CYCLE_HZ) * dt;
  const want = Math.min(st.speedMs * LEG_PER_MS, LEG_MAX) * (st.grounded ? 1 : 0.3);
  g.amp += (want - g.amp) * (1 - Math.exp(-BLEND_PER_S * dt));
  const s = Math.sin(2 * Math.PI * g.phase);
  r.legL.rotation.x = g.amp * s;
  r.legR.rotation.x = -g.amp * s;
  r.armL.rotation.x = -g.amp * ARM_RATIO * s;
  r.armR.rotation.x = g.amp * ARM_RATIO * s;
  r.body.rotation.x = -Math.min(Math.max((st.speedMs - LEAN_FROM_MS) * LEAN_PER_MS, 0), LEAN_MAX);
  // 대기 호흡(1 % 세로), 걸음마다 몸 1.5 cm 오르내림.
  r.body.scale.y = 1 + 0.01 * Math.sin(g.time * 1.6);
  r.body.position.y = 0.9 + 0.015 * g.amp * Math.abs(s);
}

export function createAvatar(): Avatar {
  const opacity = uniform(1);
  const mat = (color: number, roughness: number): MeshStandardNodeMaterial => {
    const m = new MeshStandardNodeMaterial({ color, roughness });
    m.opacityNode = opacity;
    m.alphaHash = true;
    return m;
  };
  const cloth = mat(0x3b4a5e, 0.85);
  const pants = mat(0x2a2d33, 0.9);
  const skin = mat(0xd4a888, 0.6);
  const rig = buildRig(cloth, pants, skin);
  const { group } = rig;
  const st: AvatarState = {
    visible: false,
    posWF: { x: 0, y: 0, z: 0 },
    yawRad: 0,
    speedMs: 0,
    grounded: true,
    opacity: 1,
  };
  const gait: Gait = { phase: 0, amp: 0, time: 0 };
  let model: AvatarModel | undefined;
  return {
    group,
    opacity,
    get materials() {
      return model ? [model.material] : [cloth, pants, skin];
    },
    attach(m) {
      model?.dispose();
      if (model) group.remove(model.root);
      model = m;
      group.add(m.root);
      for (const o of [rig.body, rig.legL, rig.legR]) o.visible = false;
    },
    set(a) {
      st.visible = a.visible;
      Object.assign(st.posWF, a.posWF);
      st.yawRad = a.yawRad;
      st.speedMs = a.speedMs;
      st.grounded = a.grounded;
      st.opacity = a.opacity;
    },
    update(dt, originWF) {
      group.visible = st.visible && st.opacity > 0.02;
      if (!group.visible) return;
      opacity.value = Math.min(1, st.opacity);
      toRender(group.position, st.posWF, originWF);
      group.rotation.y = st.yawRad;
      if (model) model.update(dt, st.grounded ? st.speedMs : 0);
      else poseRig(rig, gait, st, dt);
    },
    dispose() {
      model?.dispose();
      group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      for (const m of [cloth, pants, skin]) m.dispose();
    },
  };
}
