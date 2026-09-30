// 아바타 모델(M05 결정 2, ADR-0048): 속력 블렌드 매듭·재생 속도 자르기, 합성 스키닝 씬 → 키 1.72 m·발 원점·정면 −Z, 마네킹 교체·그림자 머티리얼.

import { uniform } from 'three/tsl';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, QuaternionKeyframeTrack } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createAvatar } from '../src/internal/scene/avatar.ts';
import { AVATAR_HEIGHT_M, blendWeights, clipRate, createAvatarModel } from '../src/internal/scene/avatar-model.ts';

function syntheticScene(): { scene: Group; clips: AnimationClip[] } {
  const scene = new Group();
  const bone = new Group();
  bone.name = 'spine_01';
  const mesh = new Mesh(new BoxGeometry(0.5, 1.82, 0.3), new MeshStandardMaterial());
  scene.add(bone, mesh);
  scene.userData.sanpoAvatar = {
    heightM: 1.82,
    feetY: -0.01,
    clips: [
      { name: 'idle', durationS: 2.5, speedMs: 0 },
      { name: 'walk', durationS: 1.3333, speedMs: 0.97 },
      { name: 'jog', durationS: 0.9333, speedMs: 5.33 },
      { name: 'sprint', durationS: 0.6667, speedMs: 8.2 },
    ],
  };
  const q = new QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]);
  const clips = ['idle', 'walk', 'jog', 'sprint'].map((n) => new AnimationClip(n, 1, [q]));
  return { scene, clips };
}

describe('avatar model', () => {
  it('blends neighbouring clips at the game pace knots and clamps playback rate', () => {
    expect(blendWeights(0)).toEqual({ idle: 1, walk: 0, jog: 0, sprint: 0 });
    expect(blendWeights(1.35)).toEqual({ idle: 0, walk: 1, jog: 0, sprint: 0 });
    const w = blendWeights(1.8);
    expect(w.walk + w.jog).toBeCloseTo(1, 9);
    expect(w.jog).toBeCloseTo(0.45 / 1.65, 9);
    expect(blendWeights(9)).toEqual({ idle: 0, walk: 0, jog: 0, sprint: 1 });
    expect(clipRate(1.35, 0.92)).toBeCloseTo(1.35 / 0.92, 9);
    expect(clipRate(3.0, 5.0)).toBe(0.75);
    expect(clipRate(10, 1)).toBe(1.6);
  });

  it('scales to 1.72 m with feet at the origin, faces −Z, and replaces the mannequin', () => {
    const avatar = createAvatar();
    const { scene, clips } = syntheticScene();
    const model = createAvatarModel(scene, clips, uniform(1));
    expect(scene.scale.x).toBeCloseTo(AVATAR_HEIGHT_M / 1.82, 9);
    expect(scene.position.y).toBeCloseTo((0.01 * AVATAR_HEIGHT_M) / 1.82, 9);
    expect(scene.rotation.y).toBeCloseTo(Math.PI, 9);
    avatar.attach(model);
    expect(avatar.materials).toEqual([model.material]);
    avatar.set({ visible: true, posWF: { x: 0, y: 0, z: 0 }, yawRad: 0, speedMs: 1.35, grounded: true, opacity: 1 });
    for (let i = 0; i < 30; i++) avatar.update(1 / 60, { x: 0, y: 0, z: 0 });
    // 마네킹 몸통·다리 숨김, 모델 = 그룹 자식.
    expect(avatar.group.children.filter((c) => c.visible).map((c) => c === scene)).toEqual([true]);
    avatar.dispose();
  });
});
