// 캐릭터 단계(ADR-0057): TGA 디코드(무압축·RLE, 원점), 리그 가중치 u8(합 255), 클립 표본(제자리·자연 속력·잘라 반복 이음), 아틀라스 사분면·알파·번짐.
import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { buildAtlasLayer } from '../src/stages/characters/atlas.ts';
import type { FbxAvatar } from '../src/stages/characters/fbx.ts';
import { type CharMesh, quantizeTop4 } from '../src/stages/characters/mesh.ts';
import { sampleClip } from '../src/stages/characters/pose.ts';
import { RIG_BONES } from '../src/stages/characters/rig.ts';
import { decodeTga } from '../src/stages/characters/tga.ts';

function tga(
  width: number,
  height: number,
  depth: 24 | 32,
  body: number[],
  o: { rle?: boolean; topDown?: boolean } = {},
) {
  const h = new Uint8Array(18);
  h[2] = o.rle ? 10 : 2;
  h[12] = width;
  h[14] = height;
  h[16] = depth;
  h[17] = o.topDown ? 0x20 : 0;
  return new Uint8Array([...h, ...body]);
}

/** 리그 뼈 사슬(Bip01 높이 90 cm) — sampleClip은 bone()·root만 쓴다. */
function syntheticAvatar(): FbxAvatar {
  const root = new Group();
  const bones = new Map<string, Bone>();
  let parent: Group | Bone = root;
  for (const n of RIG_BONES) {
    const b = new Bone();
    b.name = n;
    if (n === 'Bip01') b.position.set(0, 90, 0);
    else b.position.set(0, 5, 0);
    parent.add(b);
    bones.set(n, b);
    parent = b;
  }
  root.updateMatrixWorld(true);
  return {
    root,
    mesh: undefined as unknown as FbxAvatar['mesh'],
    bone: (n) => bones.get(n) as Bone,
  };
}

describe('characters', () => {
  it('decodes uncompressed bottom-up and RLE top-down TGA to RGBA rows top first', () => {
    // 2×2, 24비트, 아래 행부터: 아래 = 빨강·초록, 위 = 파랑·흰(BGR 순).
    const a = decodeTga(tga(2, 2, 24, [0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255]));
    expect([...a.data.subarray(0, 8)]).toEqual([0, 0, 255, 255, 255, 255, 255, 255]);
    expect([...a.data.subarray(8, 16)]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    // RLE 32비트: 반복 패킷 4픽셀(BGRA 10,20,30,40).
    const b = decodeTga(tga(2, 2, 32, [0x83, 10, 20, 30, 40], { rle: true, topDown: true }));
    expect([...b.data.subarray(12, 16)]).toEqual([30, 20, 10, 40]);
  });

  it('keeps the four heaviest rig weights as u8 summing to exactly 255', () => {
    const q = quantizeTop4(
      new Map([
        [3, 0.5],
        [1, 0.3],
        [7, 0.15],
        [2, 0.04],
        [9, 0.01],
      ]),
    );
    expect(q.j).toEqual([3, 1, 7, 2]);
    expect(q.w.reduce((s, x) => s + x, 0)).toBe(255);
    expect(quantizeTop4(new Map([[5, 1]]))).toEqual({ j: [5, 0, 0, 0], w: [255, 0, 0, 0] });
  });

  it('samples a walk in place and reports its natural speed', () => {
    const av = syntheticAvatar();
    const root = new VectorKeyframeTrack('Bip01.position', [0, 0.5, 1], [0, 90, 0, 0, 88, 50, 0, 90, 100]);
    const s = sampleClip(av, { clip: new AnimationClip('walk', 1, [root]), rootRestY: 90 }, { name: 'walk', fps: 30 });
    expect(s.frames).toBe(30);
    expect(s.speedMs).toBeCloseTo(1, 6);
    const z = s.worlds.map((w) => new Vector3().setFromMatrixPosition(w[0] as never).z);
    expect(Math.max(...z.map(Math.abs))).toBeLessThan(1e-6);
    // 루트 높이(m): 0.90 → 0.88(반주기).
    expect(new Vector3().setFromMatrixPosition(s.worlds[15]?.[0] as never).y).toBeCloseTo(0.88, 6);
  });

  it('trims long idle clips into a seamless loop', () => {
    const av = syntheticAvatar();
    const times: number[] = [];
    const values: number[] = [];
    for (let t = 0; t <= 10; t += 0.1) {
      times.push(t);
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.sin(t * 1.3) * 0.6).toArray(values, values.length);
    }
    const spine = new QuaternionKeyframeTrack('Bip01_Spine.quaternion', times, values);
    const root = new VectorKeyframeTrack('Bip01.position', [0, 10], [0, 90, 0, 0, 90, 0]);
    const s = sampleClip(
      av,
      { clip: new AnimationClip('idle', 10, [spine, root]), rootRestY: 90 },
      { name: 'idle', fps: 30, trim: { lengthS: 6, blendS: 0.5 } },
    );
    expect(s.frames).toBe(180);
    const k = RIG_BONES.indexOf('Bip01_Spine');
    const rot = (f: number) => new Quaternion().setFromRotationMatrix(s.worlds[f]?.[k] as never);
    const steps = Array.from({ length: 179 }, (_, f) => rot(f).angleTo(rot(f + 1)));
    const wrap = rot(179).angleTo(rot(0));
    expect(wrap).toBeLessThan(Math.max(...steps) * 1.5 + 1e-6);
  });

  it('places parts in atlas quadrants, keeps hair alpha and bleeds colour past island edges', () => {
    // 몸 부위 사각형 하나(UV 왼쪽 절반만) + 머리털 부위 사각형(전체).
    const mesh = {
      lods: [new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])],
      part: new Uint8Array([0, 0, 0, 0, 2, 2, 2, 2]),
      partUv: new Float32Array([0, 0, 0.5, 0, 0.5, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]),
    } as unknown as CharMesh;
    const solid = (rgba: number[], n: number) => ({
      width: n,
      height: n,
      data: new Uint8Array(
        Array(n * n)
          .fill(rgba)
          .flat(),
      ),
    });
    const body = solid([200, 10, 10, 255], 8);
    const hair = solid([50, 40, 30, 0], 8);
    hair.data.set([90, 60, 30, 255], 0);
    const layer = buildAtlasLayer(mesh, [body, undefined, hair], 4);
    const px = (x: number, y: number) => [...layer.data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];
    expect(layer.width).toBe(8);
    expect(px(0, 0)).toEqual([200, 10, 10, 255]);
    // 몸 섬 오른쪽(덮임 밖)도 번진 빨강(검정 아님).
    expect(px(3, 3)).toEqual([200, 10, 10, 255]);
    // 머리 사분면(없음) = 회색, 머리털 = 왼쪽 위만 불투명 일부, 나머지 알파 0 + 번진 색.
    expect(px(5, 1)).toEqual([128, 128, 128, 255]);
    expect(px(0, 4)[3]).toBe(64);
    expect(px(3, 7)).toEqual([90, 60, 30, 0]);
  });
});
