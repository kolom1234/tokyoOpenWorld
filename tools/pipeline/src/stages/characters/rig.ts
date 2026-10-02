// 군중·플레이어 공용 리그(ADR-0057): Rocketbox Biped 81뼈 → 23뼈(Bip01 + 몸통·팔다리). 얼굴 뼈는 머리로, 손가락은 걷기 클립 첫 프레임의
// 편 손 자세를 메시에 구운 뒤 손으로 합친다(정지 화면 T자 손가락 방지). 모델 공간 = m, Y 위, 정면 +Z, 발 = y 0 근처(FBX cm × 0.01).
import { type Bone, Matrix4, Quaternion, Vector3 } from 'three';
import { type FbxAvatar, type FbxClip, interpolantOf } from './fbx.ts';

/** 남기는 뼈(부모가 먼저 — 계층이 닫혀 있다: 각 뼈의 부모도 목록에 있음). 0 = Bip01(가중치 없음, 루트). */
export const RIG_BONES = [
  'Bip01',
  'Bip01_Pelvis',
  'Bip01_Spine',
  'Bip01_L_Thigh',
  'Bip01_L_Calf',
  'Bip01_L_Foot',
  'Bip01_L_Toe0',
  'Bip01_R_Thigh',
  'Bip01_R_Calf',
  'Bip01_R_Foot',
  'Bip01_R_Toe0',
  'Bip01_Spine1',
  'Bip01_Spine2',
  'Bip01_Neck',
  'Bip01_Head',
  'Bip01_L_Clavicle',
  'Bip01_L_UpperArm',
  'Bip01_L_Forearm',
  'Bip01_L_Hand',
  'Bip01_R_Clavicle',
  'Bip01_R_UpperArm',
  'Bip01_R_Forearm',
  'Bip01_R_Hand',
] as const;
export const CM = 0.01;
const FINGER = /_Finger\d+$/;

/** 원본 뼈 → 가장 가까운 남긴 조상(자신 포함)의 리그 번호. */
export function rigIndexOf(bone: Bone): number {
  for (let b: Bone | null = bone; b; b = (b.parent as Bone | null) ?? null) {
    const k = (RIG_BONES as readonly string[]).indexOf(b.name);
    if (k >= 0) return k;
    if (!(b.parent as Bone | null)?.isBone) break;
  }
  throw new Error(`rig: ${bone.name} has no rig ancestor`);
}

/** 리그 부모 번호(−1 = 루트). */
export function rigParents(av: FbxAvatar): number[] {
  return RIG_BONES.map((n) => {
    const p = av.bone(n).parent;
    return p && (p as Bone).isBone ? (RIG_BONES as readonly string[]).indexOf(p.name) : -1;
  });
}

/** 손가락 뼈를 클립 첫 프레임 로컬 회전으로(편 손 자세). 호출 뒤 root.updateMatrixWorld. */
export function relaxFingers(av: FbxAvatar, clip: FbxClip): void {
  for (const t of clip.clip.tracks) {
    const [name, prop] = t.name.split('.');
    if (prop !== 'quaternion' || !name || !FINGER.test(name)) continue;
    const b = av.mesh.skeleton.bones.find((x) => x.name === name);
    if (!b) continue;
    const v = interpolantOf(t).evaluate(0);
    b.quaternion.set(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1);
  }
  av.root.updateMatrixWorld(true);
}

const S = new Matrix4().makeScale(CM, CM, CM);
const S_INV = new Matrix4().makeScale(1 / CM, 1 / CM, 1 / CM);

/** 뼈 월드 행렬(cm) → 모델 공간(m). */
export const toModel = (world: Matrix4, out = new Matrix4()): Matrix4 => out.multiplyMatrices(S, world).multiply(S_INV);

/** 리그 뼈의 현재 모델 공간 월드 행렬(m). */
export function rigWorld(av: FbxAvatar): Matrix4[] {
  return RIG_BONES.map((n) => toModel(av.bone(n).matrixWorld));
}

/** 팔레트 원소 = 회전 사원수 + 이동(m): K = 현재 월드 × 휴지 월드⁻¹(모델 공간). */
export interface PaletteEntry {
  q: Quaternion;
  t: Vector3;
}

export function paletteOf(current: readonly Matrix4[], restInv: readonly Matrix4[]): PaletteEntry[] {
  const k = new Matrix4();
  const sc = new Vector3();
  return current.map((m, i) => {
    k.multiplyMatrices(m, restInv[i] as Matrix4);
    const q = new Quaternion();
    const t = new Vector3();
    k.decompose(t, q, sc);
    return { q, t };
  });
}
