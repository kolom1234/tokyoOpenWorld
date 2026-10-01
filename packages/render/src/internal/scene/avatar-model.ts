// 플레이어 아바타 모델(ADR-0048 → ADR-0057): Microsoft Rocketbox GLB(파이프라인 `characters` — 리그 23뼈, 클립 idle·walk·jog·sprint)
// + KTX2 아틀라스(몸·머리·머리털 사분면, 머리털 알파) → SkinnedMesh + 속력 블렌드. 이웃 두 클립을 게임 속력 매듭(0·1.35·3.0·5.0 m/s)으로 선형 블렌드, 이동 클립은 위상 공유(발 박자 일치),
// 재생 속도 = 속력 ÷ 클립 자연 속력(루트 모션 실측 × 키 배율)을 [0.75, 1.6]으로 자름(과한 슬로모션 대신 약간의 발 미끄럼). see docs/09-traversal.md §3
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { texture, uv } from 'three/tsl';
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  ClampToEdgeWrapping,
  type Group,
  LinearMipmapLinearFilter,
  type Material,
  type Mesh,
  MeshStandardNodeMaterial,
  type Object3D,
  type Texture,
  type UniformNode,
} from 'three/webgpu';
import type { AvatarAssetUrls } from '../../api.ts';

/** 게임 키(m) — 캐릭터 캡슐 1.70 m(08 §5)·눈높이 1.60 m와 맞춘다. */
export const AVATAR_HEIGHT_M = 1.72;
/** 블렌드 매듭: idle 0 · walk = 기본 걸음 1.35 · jog = 조깅 3.0 · sprint = 달리기 5.0(m/s, 09 §2). */
const KNOTS = [
  ['idle', 0],
  ['walk', 1.35],
  ['jog', 3.0],
  ['sprint', 5.0],
] as const;
export type AvatarClipName = (typeof KNOTS)[number][0];
const MIN_RATE = 0.75;
const MAX_RATE = 1.6;
/** 블렌드 속력 따라가기(1/s). */
const FOLLOW_PER_S = 8;

export interface AvatarModelMeta {
  heightM: number;
  feetY: number;
  clips: { name: string; durationS: number; speedMs: number }[];
}

/** 속력(m/s) → 클립별 가중치(합 1, 이웃 두 매듭 선형). */
export function blendWeights(v: number): Record<AvatarClipName, number> {
  const w: Record<AvatarClipName, number> = { idle: 0, walk: 0, jog: 0, sprint: 0 };
  const last = KNOTS[KNOTS.length - 1] as (typeof KNOTS)[number];
  if (v >= last[1]) {
    w[last[0]] = 1;
    return w;
  }
  for (let i = 1; i < KNOTS.length; i++) {
    const [a, va] = KNOTS[i - 1] as (typeof KNOTS)[number];
    const [b, vb] = KNOTS[i] as (typeof KNOTS)[number];
    if (v <= vb) {
      const t = Math.max(0, (v - va) / (vb - va));
      w[a] = 1 - t;
      w[b] = t;
      return w;
    }
  }
  return w;
}

/** 이동 클립 재생 속도 = 속력 ÷ 자연 속력(게임 단위), [MIN_RATE, MAX_RATE]. */
export function clipRate(v: number, naturalMs: number): number {
  return naturalMs > 0 ? Math.min(Math.max(v / naturalMs, MIN_RATE), MAX_RATE) : 1;
}

export interface AvatarModel {
  readonly root: Object3D;
  readonly material: Material;
  /** 속력(m/s)으로 블렌드·재생. */
  update(dt: number, speedMs: number): void;
  dispose(): void;
}

interface Track {
  action: AnimationAction;
  durationS: number;
  naturalMs: number;
}

/** 아틀라스 머티리얼: 기본색 = 텍스처(sRGB), 불투명도 = 텍스처 알파(머리털) × 공용 opacity — alphaHash 디더(TAAU가 다듬음). */
export function avatarMaterial(
  atlas: Texture | undefined,
  opacity: UniformNode<'float', number>,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0, vertexColors: !atlas });
  if (atlas) {
    const t = texture(atlas, uv());
    material.colorNode = t.rgb;
    material.opacityNode = t.a.mul(opacity);
  } else material.opacityNode = opacity;
  material.alphaHash = true;
  return material;
}

/**
 * 파싱된 GLB 씬(+ 클립)을 게임 아바타로: 키 1.72 m·발 = 원점·정면 −Z(glTF +Z → Y축 π), 머티리얼 = 아틀라스(없으면 정점색) + 공용 opacity(디더 페이드).
 * opacity = 절차 마네킹과 같은 uniform(avatar.ts).
 */
export function createAvatarModel(
  scene: Group,
  clips: readonly AnimationClip[],
  opacity: UniformNode<'float', number>,
  atlas?: Texture,
): AvatarModel {
  const meta = scene.userData.sanpoAvatar as AvatarModelMeta | undefined;
  if (!meta) throw new Error('avatar model: scene extras sanpoAvatar missing');
  const k = AVATAR_HEIGHT_M / meta.heightM;
  scene.scale.setScalar(k);
  scene.position.y = -meta.feetY * k;
  scene.rotation.y = Math.PI;
  const material = avatarMaterial(atlas, opacity);
  // isMesh(덕 타이핑): GLTFLoader는 `three`를 import한다 — 게임은 three/webgpu로 alias, Node 테스트는 별도 인스턴스.
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    (m.material as Material).dispose();
    m.material = material;
    m.castShadow = true;
    m.frustumCulled = false;
  });
  const mixer = new AnimationMixer(scene);
  const tracks = new Map<AvatarClipName, Track>();
  for (const c of meta.clips) {
    const clip = clips.find((x) => x.name === c.name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(0);
    if (c.name !== 'idle') action.timeScale = 0;
    tracks.set(c.name as AvatarClipName, { action, durationS: c.durationS, naturalMs: c.speedMs * k });
  }
  let v = 0;
  let phase = 0;
  return {
    root: scene,
    material,
    update(dt, speedMs) {
      v += (speedMs - v) * (1 - Math.exp(-FOLLOW_PER_S * dt));
      const w = blendWeights(v);
      let dp = 0;
      for (const [name, t] of tracks) {
        t.action.setEffectiveWeight(w[name]);
        if (name !== 'idle') dp += (w[name] * clipRate(v, t.naturalMs)) / t.durationS;
      }
      phase = (phase + dp * dt) % 1;
      for (const [name, t] of tracks) if (name !== 'idle') t.action.time = phase * t.durationS;
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      scene.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
      });
      material.dispose();
      atlas?.dispose();
    },
  };
}

/** GLB + KTX2 아틀라스 받기·파싱 → 모델(실패는 reject — 호출 측이 절차 마네킹 유지). */
export async function loadAvatarModel(
  urls: AvatarAssetUrls,
  opacity: UniformNode<'float', number>,
  ktx2: KTX2Loader,
): Promise<AvatarModel> {
  const [gltf, atlas] = await Promise.all([new GLTFLoader().loadAsync(urls.glb), ktx2.loadAsync(urls.texture)]);
  const tex = atlas as unknown as Texture;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  if (tex.mipmaps && tex.mipmaps.length > 1) tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return createAvatarModel(gltf.scene as unknown as Group, gltf.animations as unknown as AnimationClip[], opacity, tex);
}
