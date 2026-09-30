// `pnpm pipeline avatar`(M05 결정 2): Quaternius UBC Standard(Superhero_Male) + UAL Standard zip(data/raw, sources.lock sha256 검사) →
// 프리미티브 합치기·정점색 굽기(bake.ts) → 클립 4개(anims.ts) → 씬 extras `sanpoAvatar`(키·클립 속력) → GLB(apps/game/src/assets — Vite 해시 에셋).
// 호스트 Node만(외부 바이너리 없음). see docs/adr/0048-quaternius-avatar.md
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Accessor, type Document, type JSONDocument, NodeIO, type Primitive } from '@gltf-transform/core';
import type { Logger } from '@sanpo/core';
import { type DecodedPng, decodePng } from '../../lib/png.ts';
import { readZip, type ZipEntry } from '../../lib/zip.ts';
import { sha256Of } from '../materials/fetch.ts';
import { type ClipInfo, copyAvatarClips } from './anims.ts';
import { type BakeInput, HAIR_SRGB, mergeAndBake } from './bake.ts';

export const UBC_ZIP = 'data/raw/quaternius-ubc/Universal Base Characters[Standard].zip';
export const UAL_ZIP = 'data/raw/quaternius-ual/Universal Animation Library[Standard].zip';
const UBC_DIR = 'Universal Base Characters[Standard]/Base Characters/Godot - UE/';
const UAL_GLB = 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb';
const UAL_RM_GLB = 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard_RM.glb';
export const AVATAR_BODY = 'Superhero_Male_FullBody';
/** 머리 뼈에 리깅된 머리털(같은 65관절 스킨) — 기본색 텍스처는 몸 폴더의 T_Hair_1. */
const HAIR_DIR = 'Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/';
export const AVATAR_HAIR = 'Hair_SimpleParted';
/** 옷을 칠하는 몸 머티리얼(머리털·눈은 텍스처 색만). */
const BODY_MATERIAL = 'MI_Superhero_Male';
/** 회색조 머리털 텍스처 머티리얼(머리털·눈썹) → HAIR_SRGB를 곱한다. */
const HAIR_MATERIAL = /^MI_Hair/;
export const AVATAR_OUT = 'apps/game/src/assets/avatar-ubc-male.glb';

export interface AvatarLock {
  id: string;
  sha256: string;
}

export interface AvatarStats {
  vertices: number;
  triangles: number;
  bytes: number;
  heightM: number;
  clips: ClipInfo[];
}

function verified(repoRoot: string, rel: string, lock: readonly AvatarLock[], id: string): Map<string, ZipEntry> {
  const bytes = new Uint8Array(readFileSync(join(repoRoot, rel)));
  const want = lock.find((l) => l.id === id)?.sha256;
  const got = sha256Of(bytes);
  if (want !== got) throw new Error(`avatar: ${rel} sha256 ${got} ≠ lock ${id} ${want ?? '(missing)'}`);
  return readZip(bytes);
}

function entry(zip: Map<string, ZipEntry>, name: string): Uint8Array<ArrayBuffer> {
  const e = zip.get(name);
  if (!e) throw new Error(`avatar: ${name} not in zip`);
  return e.read();
}

type GltfJson = {
  images?: { uri?: string }[];
  textures?: { source?: number }[];
  samplers?: unknown[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorTexture?: { index: number } } & Record<string, unknown>;
  }[];
  buffers: { uri?: string }[];
} & Record<string, unknown>;

/** 머티리얼 이름 → 기본색 텍스처 uri 기록 후 텍스처·이미지 참조 제거(정점색으로 대체). */
function stripTextures(json: GltfJson): Map<string, string> {
  const base = new Map<string, string>();
  for (const m of json.materials ?? []) {
    const t = m.pbrMetallicRoughness?.baseColorTexture?.index;
    const uri = t === undefined ? undefined : json.images?.[json.textures?.[t]?.source ?? -1]?.uri;
    if (m.name && uri) base.set(m.name, uri);
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete (m as Record<string, unknown>)[k];
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  return base;
}

/** zip 안 glTF(dir/file.gltf + .bin) 읽기 — 텍스처는 떼고, 머티리얼별 기본색은 몸 폴더(UBC_DIR)에서 디코드(imageOf). */
async function readGltf(io: NodeIO, ubc: Map<string, ZipEntry>, dir: string, file: string) {
  const json = JSON.parse(new TextDecoder().decode(entry(ubc, `${dir}${file}.gltf`))) as GltfJson;
  const baseUri = stripTextures(json);
  const resources: JSONDocument['resources'] = {};
  for (const b of json.buffers) if (b.uri) resources[b.uri] = entry(ubc, `${dir}${b.uri}`);
  const doc = await io.readJSON({ json: json as unknown as JSONDocument['json'], resources });
  const images = new Map<string, DecodedPng>();
  const imageOf = (material: string | undefined): DecodedPng | undefined => {
    const uri = material ? baseUri.get(material) : undefined;
    if (!uri) return undefined;
    if (!images.has(uri)) images.set(uri, decodePng(entry(ubc, `${UBC_DIR}${uri}`)));
    return images.get(uri);
  };
  return { doc, imageOf };
}

function yRange(acc: Accessor): [number, number] {
  return [acc.getMin([])[1] ?? 0, acc.getMax([])[1] ?? 0];
}

/** 쓰이지 않는 메시(+ 프리미티브)·머티리얼·속성 정리(루트 외 부모 없음) — 순서대로라야 속성이 고아가 된다. */
function dropOrphans(doc: Document): void {
  const root = doc.getRoot();
  const orphan = (p: { listParents(): unknown[] }): boolean => p.listParents().every((x) => x === root);
  for (const m of root.listMeshes().filter(orphan)) {
    for (const prim of m.listPrimitives()) prim.dispose();
    m.dispose();
  }
  for (const list of [root.listMaterials(), root.listAccessors()]) for (const p of list.filter(orphan)) p.dispose();
}

type ImageOf = (m: string | undefined) => DecodedPng | undefined;

function inputOf(prim: Primitive, imageOf: ImageOf, jointRemap?: readonly number[]): BakeInput {
  const m = prim.getMaterial()?.getName();
  return {
    prim,
    baseColor: imageOf(m),
    outfit: m === BODY_MATERIAL,
    ...(m && HAIR_MATERIAL.test(m) ? { tintSrgb: HAIR_SRGB } : {}),
    ...(jointRemap ? { jointRemap } : {}),
  };
}

/** 다른 문서(머리털)의 스킨 프리미티브 → 몸 관절 번호로 옮긴 굽기 입력. */
function extraInputs(extra: { doc: Document; imageOf: ImageOf }, jointNames: readonly string[]): BakeInput[] {
  return extra.doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh() && n.getSkin())
    .flatMap((n) => {
      const remap = (n.getSkin()?.listJoints() ?? []).map((j) => {
        const k = jointNames.indexOf(j.getName());
        if (k < 0) throw new Error(`avatar: joint ${j.getName()} not in body skin`);
        return k;
      });
      return (n.getMesh()?.listPrimitives() ?? []).map((prim) => inputOf(prim, extra.imageOf, remap));
    });
}

/** 몸 스킨 노드들(+ 머리털)의 프리미티브를 하나로 합쳐 첫 노드에 달고 나머지 메시 노드는 지운다. 반환 = 합친 프리미티브. */
function mergeBody(doc: Document, imageOf: ImageOf, extra: { doc: Document; imageOf: ImageOf }) {
  const skinned = doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh() && n.getSkin());
  const skin = skinned[0]?.getSkin();
  if (!skin || skinned.some((n) => n.getSkin() !== skin)) throw new Error('avatar: expected one shared skin');
  const jointNames = skin.listJoints().map((j) => j.getName());
  const inputs: BakeInput[] = skinned.flatMap((n) =>
    (n.getMesh()?.listPrimitives() ?? []).map((prim: Primitive) => {
      return inputOf(prim, imageOf);
    }),
  );
  inputs.push(...extraInputs(extra, jointNames));
  const merged = mergeAndBake(doc, inputs, jointNames);
  const [keep, ...rest] = skinned;
  keep?.setMesh(doc.createMesh('Avatar').addPrimitive(merged));
  for (const n of rest) n.dispose();
  return { merged, keep };
}

export async function buildAvatar(o: {
  repoRoot: string;
  lock: readonly AvatarLock[];
  log: Logger;
}): Promise<AvatarStats> {
  const io = new NodeIO();
  const ubc = verified(o.repoRoot, UBC_ZIP, o.lock, 'quaternius-ubc');
  const ual = verified(o.repoRoot, UAL_ZIP, o.lock, 'quaternius-ual');
  const { doc, imageOf } = await readGltf(io, ubc, UBC_DIR, AVATAR_BODY);
  const hair = await readGltf(io, ubc, HAIR_DIR, AVATAR_HAIR);
  const { merged } = mergeBody(doc, imageOf, hair);
  dropOrphans(doc);
  const pos = merged.getAttribute('POSITION') as Accessor;
  const [minY, maxY] = yRange(pos);
  const ualDoc = await io.readBinary(entry(ual, UAL_GLB));
  const ualRm = await io.readBinary(entry(ual, UAL_RM_GLB));
  const mannequin = ualDoc.getRoot().listMeshes()[0]?.listPrimitives()[0]?.getAttribute('POSITION');
  const [uMin, uMax] = mannequin ? yRange(mannequin) : [0, 1];
  const clips = copyAvatarClips(doc, ualDoc, ualRm, (maxY - minY) / (uMax - uMin));
  const heightM = maxY - minY;
  doc
    .getRoot()
    .listScenes()[0]
    ?.setExtras({
      sanpoAvatar: {
        version: 1,
        heightM,
        feetY: minY,
        clips: clips.map(({ name, durationS, speedMs }) => ({ name, durationS, speedMs })),
      },
    });
  doc.getRoot().getAsset().generator = 'sanpo pipeline avatar (Quaternius UBC + UAL, CC0)';
  const glb = await io.writeBinary(doc);
  const out = join(o.repoRoot, AVATAR_OUT);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, glb);
  const stats = {
    vertices: pos.getCount(),
    triangles: (merged.getIndices()?.getCount() ?? 0) / 3,
    bytes: glb.byteLength,
    heightM,
    clips,
  };
  o.log.info(`avatar → ${AVATAR_OUT} ${JSON.stringify(stats)}`);
  return stats;
}
