// 플레이어 아바타(09 §3 3인칭, M04-T05, ADR-0045): 자체 제작 절차 마네킹(캡슐 몸통·팔다리·구 머리 — 외부 에셋 없음. Quaternius 모델 교체는 다운로드 승인 뒤),
// 속도 블렌드 대기·걷기·달리기(팔다리 진자 진폭·주기·몸 기울기가 속력에 연속), 근접 디더 페이드(opacity → alphaHash). 위치 = WF − 렌더 원점(renderPrep).
import type { AvatarState, Vec3d } from '@sanpo/core';
import { uniform } from 'three/tsl';
import { CapsuleGeometry, Group, type Material, Mesh, MeshStandardNodeMaterial, SphereGeometry } from 'three/webgpu';
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
  readonly materials: readonly Material[];
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
  const { group, body, legL, legR, armL, armR } = buildRig(cloth, pants, skin);
  const st: AvatarState = {
    visible: false,
    posWF: { x: 0, y: 0, z: 0 },
    yawRad: 0,
    speedMs: 0,
    grounded: true,
    opacity: 1,
  };
  let phase = 0;
  let amp = 0;
  let time = 0;
  return {
    group,
    materials: [cloth, pants, skin],
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
      time += dt;
      phase += Math.min(st.speedMs / (2 * STRIDE_M), MAX_CYCLE_HZ) * dt;
      const want = Math.min(st.speedMs * LEG_PER_MS, LEG_MAX) * (st.grounded ? 1 : 0.3);
      amp += (want - amp) * (1 - Math.exp(-BLEND_PER_S * dt));
      const s = Math.sin(2 * Math.PI * phase);
      legL.rotation.x = amp * s;
      legR.rotation.x = -amp * s;
      armL.rotation.x = -amp * ARM_RATIO * s;
      armR.rotation.x = amp * ARM_RATIO * s;
      body.rotation.x = -Math.min(Math.max((st.speedMs - LEAN_FROM_MS) * LEAN_PER_MS, 0), LEAN_MAX);
      // 대기 호흡(1 % 세로), 걸음마다 몸 1.5 cm 오르내림.
      body.scale.y = 1 + 0.01 * Math.sin(time * 1.6);
      body.position.y = 0.9 + 0.015 * amp * Math.abs(s);
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      for (const m of [cloth, pants, skin]) m.dispose();
    },
  };
}
