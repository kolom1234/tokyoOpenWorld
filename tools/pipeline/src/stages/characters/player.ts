// 플레이어 아바타 GLB(ADR-0057): 리그 23뼈 노드(모델 공간 m, 휴지 로컬 TRS) + 스킨(IBM = 휴지 월드⁻¹) + 결합 메시(LOD0, 정점색 없음 —
// 텍스처는 같은 이름의 KTX2 아틀라스를 게임이 따로 적재) + 클립(뼈 회전·Bip01 이동, 반복 닫힘 프레임 포함). 씬 extras `sanpoAvatar`.
import { Document, type Node as GltfNode, NodeIO } from '@gltf-transform/core';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CharMesh } from './mesh.ts';
import type { SampledClip } from './pose.ts';
import { RIG_BONES } from './rig.ts';

export interface PlayerGlbInput {
  mesh: CharMesh;
  parents: readonly number[];
  restWorld: readonly Matrix4[];
  clips: readonly SampledClip[];
  fps: number;
  generator: string;
}

function localOf(worlds: readonly Matrix4[], parents: readonly number[], k: number) {
  const m = new Matrix4();
  const p = parents[k] ?? -1;
  m.copy(worlds[k] as Matrix4);
  if (p >= 0) m.premultiply(new Matrix4().copy(worlds[p] as Matrix4).invert());
  const t = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(t, q, s);
  return { t, q };
}

function addMesh(doc: Document, mesh: CharMesh) {
  const buf = doc.getRoot().listBuffers()[0] ?? null;
  const acc = (
    name: string,
    type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR',
    array: Float32Array | Uint8Array | Uint16Array | Uint32Array,
    normalized = false,
  ) => doc.createAccessor(name).setType(type).setArray(array).setNormalized(normalized).setBuffer(buf);
  const idx = mesh.lods[0] ?? new Uint32Array();
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('position', 'VEC3', mesh.pos))
    .setAttribute('NORMAL', acc('normal', 'VEC3', mesh.nrm))
    .setAttribute('TEXCOORD_0', acc('uv', 'VEC2', mesh.uv))
    .setAttribute('JOINTS_0', acc('joints', 'VEC4', mesh.joints))
    .setAttribute('WEIGHTS_0', acc('weights', 'VEC4', mesh.weights, true))
    .setIndices(acc('indices', 'SCALAR', mesh.pos.length / 3 < 0xffff ? Uint16Array.from(idx) : idx))
    .setMaterial(doc.createMaterial('rocketbox').setRoughnessFactor(0.75).setMetallicFactor(0));
  return doc.createMesh('Avatar').addPrimitive(prim);
}

function addClip(
  doc: Document,
  joints: readonly GltfNode[],
  parents: readonly number[],
  clip: SampledClip,
  fps: number,
) {
  const buf = doc.getRoot().listBuffers()[0] ?? null;
  const n = clip.frames + 1;
  const times = new Float32Array(n);
  for (let f = 0; f < n; f++) times[f] = f / fps;
  const input = doc.createAccessor(`${clip.name}/t`).setType('SCALAR').setArray(times).setBuffer(buf);
  const anim = doc.createAnimation(clip.name);
  joints.forEach((node, k) => {
    const rot = new Float32Array(n * 4);
    const tr = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      const { t, q } = localOf(clip.worlds[f % clip.frames] as Matrix4[], parents, k);
      q.toArray(rot, f * 4);
      t.toArray(tr, f * 3);
    }
    const add = (path: 'rotation' | 'translation', array: Float32Array, type: 'VEC4' | 'VEC3') => {
      const out = doc.createAccessor(`${clip.name}/${k}/${path}`).setType(type).setArray(array).setBuffer(buf);
      const s = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
    };
    add('rotation', rot, 'VEC4');
    if (k === 0) add('translation', tr, 'VEC3');
  });
}

export async function writePlayerGlb(o: PlayerGlbInput): Promise<Uint8Array> {
  const doc = new Document();
  doc.createBuffer();
  doc.getRoot().getAsset().generator = o.generator;
  const scene = doc.createScene('Avatar');
  const joints = RIG_BONES.map((name, k) => {
    const { t, q } = localOf(o.restWorld, o.parents, k);
    return doc.createNode(name).setTranslation([t.x, t.y, t.z]).setRotation([q.x, q.y, q.z, q.w]);
  });
  joints.forEach((node, k) => {
    const p = o.parents[k] ?? -1;
    if (p >= 0) joints[p]?.addChild(node);
    else scene.addChild(node);
  });
  const ibm = new Float32Array(joints.length * 16);
  o.restWorld.forEach((m, k) => {
    new Matrix4()
      .copy(m)
      .invert()
      .toArray(ibm, k * 16);
  });
  const skin = doc.createSkin('Avatar').setInverseBindMatrices(
    doc
      .createAccessor('ibm')
      .setType('MAT4')
      .setArray(ibm)
      .setBuffer(doc.getRoot().listBuffers()[0] ?? null),
  );
  for (const j of joints) skin.addJoint(j);
  const root = joints[0];
  if (root) skin.setSkeleton(root);
  scene.addChild(doc.createNode('AvatarMesh').setMesh(addMesh(doc, o.mesh)).setSkin(skin));
  for (const c of o.clips) addClip(doc, joints, o.parents, c, o.fps);
  scene.setExtras({
    sanpoAvatar: {
      version: 2,
      heightM: o.mesh.heightM,
      feetY: o.mesh.feetY,
      clips: o.clips.map((c) => ({ name: c.name, durationS: c.durationS, speedMs: c.speedMs })),
    },
  });
  return new NodeIO().writeBinary(doc);
}
