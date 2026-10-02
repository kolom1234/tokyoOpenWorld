// Rocketbox FBX 읽기(three FBXLoader를 Node에서): 텍스처 적재는 막고(TGA는 tga.ts가 직접 읽음) 스킨 메시·뼈·클립만 쓴다.
// FBX = cm, Y 위, 정면 +Z(FBXLoader가 Max Z-up을 변환 — 메시 −90° X 회전 + bindMatrix). see docs/adr/0057-rocketbox-characters.md
import {
  type AnimationClip,
  type Bone,
  type Group,
  type Interpolant,
  type KeyframeTrack,
  type SkinnedMesh,
  Texture,
  TextureLoader,
} from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

let patched = false;

function parse(bytes: Uint8Array): Group {
  if (!patched) {
    // 텍스처 참조는 파일 이름뿐이고 Node엔 Image가 없다 → 빈 텍스처.
    TextureLoader.prototype.load = () => new Texture();
    patched = true;
  }
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // FBXLoader가 지원 안 하는 속성(Max 머티리얼 등)마다 경고를 찍는다 — 파싱 동안만 끈다.
  // biome-ignore lint/suspicious/noConsole: 외부 로더 경고 차단
  const warn = console.warn;
  // biome-ignore lint/suspicious/noConsole: 외부 로더 경고 차단
  console.warn = () => {};
  try {
    return new FBXLoader().parse(ab, '');
  } finally {
    console.warn = warn;
  }
}

export interface FbxAvatar {
  root: Group;
  mesh: SkinnedMesh;
  bone(name: string): Bone;
}

export function loadAvatarFbx(bytes: Uint8Array): FbxAvatar {
  const root = parse(bytes);
  root.updateMatrixWorld(true);
  let mesh: SkinnedMesh | undefined;
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) {
      if (mesh) throw new Error('rocketbox: more than one skinned mesh');
      mesh = o as SkinnedMesh;
    }
  });
  if (!mesh) throw new Error('rocketbox: no skinned mesh');
  const byName = new Map<string, Bone>();
  for (const b of mesh.skeleton.bones) byName.set(b.name, b);
  root.traverse((o) => {
    if ((o as Bone).isBone && !byName.has(o.name)) byName.set(o.name, o as Bone);
  });
  return {
    root,
    mesh,
    bone(name) {
      const b = byName.get(name);
      if (!b) throw new Error(`rocketbox: bone ${name} missing`);
      return b;
    },
  };
}

export interface FbxClip {
  clip: AnimationClip;
  /** 클립 골격의 Bip01 휴지 높이(cm) — 루트 높이를 아바타 비율로 맞출 때. */
  rootRestY: number;
}

export function loadClipFbx(bytes: Uint8Array): FbxClip {
  const root = parse(bytes);
  const clip = root.animations[0];
  if (!clip) throw new Error('rocketbox: clip has no animation');
  let rootRestY = 0;
  root.traverse((o) => {
    if (o.name === 'Bip01') rootRestY = o.position.y;
  });
  return { clip, rootRestY };
}

/** 트랙 보간기(three 런타임 메서드 — @types/three 선언 밖). 사원수 트랙 = 구면 선형. */
export const interpolantOf = (t: KeyframeTrack): Interpolant =>
  (t as unknown as { createInterpolant(): Interpolant }).createInterpolant();
