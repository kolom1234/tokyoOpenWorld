// 우산(M09-T01 "우산 확률 연동"): 비가 오면 근거리 군중(≤ UMBRELLA_MAX_M) 중 variant 해시 < 확률인 사람 머리 위에 우산(가상 무지 — 로고 없음).
// 팔 자세 연동 없음(손 IK 없음 — 우산대가 몸 앞으로 내려온다). InstancedMesh 1개(행렬·색 CPU 갱신, ≤ 용량).

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';

export const UMBRELLA_CAPACITY = 320;
export const UMBRELLA_MAX_M = 70;
/** 비닐(반투명 흰) 우산이 가장 흔하다 → 팔레트 앞쪽에 몰아 둔다. */
const PALETTE = [0xe8ecef, 0xe8ecef, 0xdfe6ea, 0x1d1f24, 0x1f2a44, 0x7a1d26, 0x2f4f3a, 0x6b6f76];
const CANOPY_Y = 1.98;
const TILT_RAD = 0.12;

/** 비(mm/h) → 우산 쓰는 비율. 0.3 mm/h 미만은 0. */
export function umbrellaShare(rainMmH: number): number {
  return rainMmH < 0.3 ? 0 : Math.min(0.88, 0.4 + rainMmH * 0.1);
}

/** variant(u16) → 0..1 결정론 값(우산 여부·색) — murmur3 fmix32. */
export function variantHash(v: number, salt: number): number {
  let h = (v * 0x9e3779b1 + salt * 0x85ebca77) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

export interface Umbrellas {
  readonly mesh: InstancedMesh;
  begin(share: number): void;
  /** 렌더 좌표 발 위치·yaw·키 배율·variant. 확률·거리 판정은 호출자가 아니라 여기서. */
  add(x: number, y: number, z: number, yaw: number, scale: number, variant: number, dist: number): void;
  end(): void;
  readonly count: number;
  dispose(): void;
}

/** 우산 메시(원뿔 덮개 + 대) — 색 속성을 미리 만든다(처음 비 올 때 instanceColor가 생기면 셰이더가 바뀌어 재컴파일 — 끊김). */
function umbrellaMesh(): InstancedMesh {
  const canopy = new ConeGeometry(0.52, 0.26, 10, 1, true);
  canopy.translate(0, 0.13, 0);
  const pole = new CylinderGeometry(0.008, 0.008, 0.9, 5);
  pole.translate(0, -0.3, 0);
  const geo = mergeGeometries([canopy.toNonIndexed(), pole.toNonIndexed()]) ?? canopy;
  const mat = new MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0, side: DoubleSide });
  mat.name = 'umbrella';
  const mesh = new InstancedMesh(geo, mat, UMBRELLA_CAPACITY);
  mesh.name = 'crowd/umbrellas';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.setColorAt(0, new Color(1, 1, 1));
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

export function createUmbrellas(): Umbrellas {
  const mesh = umbrellaMesh();
  const m4 = new Matrix4();
  const q = new Quaternion();
  const qt = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const side = new Vector3();
  const p = new Vector3();
  const s = new Vector3();
  const c = new Color();
  let share = 0;
  let n = 0;
  return {
    mesh,
    begin(k) {
      share = k;
      n = 0;
    },
    add(x, y, z, yaw, scale, variant, dist) {
      if (share <= 0 || n >= UMBRELLA_CAPACITY || dist > UMBRELLA_MAX_M) return;
      if (variantHash(variant, 1) >= share) return;
      q.setFromAxisAngle(up, yaw);
      side.set(Math.cos(yaw), 0, -Math.sin(yaw));
      qt.setFromAxisAngle(side, -TILT_RAD);
      q.premultiply(qt);
      p.set(x, y + CANOPY_Y * scale, z);
      m4.compose(p, q, s.setScalar(scale));
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(
        n,
        c.setHex(PALETTE[Math.floor(variantHash(variant, 2) * PALETTE.length)] ?? PALETTE[0] ?? 0xffffff),
      );
      n++;
    },
    end() {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    get count() {
      return n;
    },
    dispose() {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardNodeMaterial).dispose();
    },
  };
}
