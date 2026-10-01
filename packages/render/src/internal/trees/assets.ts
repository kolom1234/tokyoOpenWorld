// 나무 에셋 적재(M05-T04): 파이프라인 `trees` 산출(trees.json·trees.glb·leaves.png·impostor-color.png) → 수종·LOD·부분별 float 기하 + 텍스처.
// glb는 KHR_mesh_quantization·EXT_meshopt_compression(GLTFLoader + MeshoptDecoder) — 양자화 노드 변환을 위치에 구워 float로 푼다(풀 기하 속성 배치 통일). see ADR-0052
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BufferAttribute, BufferGeometry, NoColorSpace, type Texture, TextureLoader, Vector3 } from 'three/webgpu';
import type { TreeAssetUrls } from '../../api.ts';

export interface TreeManifest {
  version: number;
  species: { name: string; id: number; tile: number; leafCell: number; radius: number }[];
  impostor: { frames: number; framePx: number; tile: number; cols: number; rows: number };
}

export interface TreeAssets {
  manifest: TreeManifest;
  /** `${speciesId}:${lod}:${bark|leaf}` → 기하(위치·법선·UV float, 높이 1 정규화). */
  parts: Map<string, BufferGeometry>;
  leaves: Texture;
  impostor: Texture;
}

interface MeshLike {
  isMesh?: boolean;
  name: string;
  geometry: BufferGeometry;
  material: { name: string };
  matrixWorld: { elements: number[] };
  updateWorldMatrix(parents: boolean, children: boolean): void;
}

/** 양자화 기하 → float(월드 행렬 적용 — GLTFLoader 노드 = 양자화 역변환). */
function toFloat(m: MeshLike): BufferGeometry {
  m.updateWorldMatrix(true, false);
  const src = m.geometry;
  const p = src.getAttribute('position');
  const n = src.getAttribute('normal');
  const t = src.getAttribute('uv');
  const pos = new Float32Array(p.count * 3);
  const nrm = new Float32Array(p.count * 3);
  const uv = new Float32Array(p.count * 2);
  const v = new Vector3();
  const e = m.matrixWorld.elements;
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    pos.set(
      [
        (e[0] as number) * v.x + (e[4] as number) * v.y + (e[8] as number) * v.z + (e[12] as number),
        (e[1] as number) * v.x + (e[5] as number) * v.y + (e[9] as number) * v.z + (e[13] as number),
        (e[2] as number) * v.x + (e[6] as number) * v.y + (e[10] as number) * v.z + (e[14] as number),
      ],
      i * 3,
    );
    v.set(n.getX(i), n.getY(i), n.getZ(i)).normalize();
    nrm.set([v.x, v.y, v.z], i * 3);
    uv.set([t ? t.getX(i) : 0, t ? t.getY(i) : 0], i * 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  if (src.index) g.setIndex(new BufferAttribute(Uint32Array.from(src.index.array), 1));
  g.computeBoundingSphere();
  return g;
}

async function loadTexture(url: string): Promise<Texture> {
  const t = await new TextureLoader().loadAsync(url);
  t.colorSpace = NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 매니페스트(작은 JSON — 번들러가 data: URL로 인라인하면 CSP connect-src 'self'가 fetch를 막는다 → 직접 해석). */
async function readManifest(url: string): Promise<TreeManifest> {
  const m = /^data:application\/json(;base64)?,(.*)$/s.exec(url);
  if (m) return JSON.parse(m[1] ? atob(m[2] ?? '') : decodeURIComponent(m[2] ?? '')) as TreeManifest;
  return (await (await fetch(url)).json()) as TreeManifest;
}

export async function loadTreeAssets(urls: TreeAssetUrls): Promise<TreeAssets> {
  const manifest = await readManifest(urls.manifest);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, leaves, impostor] = await Promise.all([
    loader.loadAsync(urls.glb),
    loadTexture(urls.leaves),
    loadTexture(urls.impostor),
  ]);
  const byName = new Map(manifest.species.map((s) => [s.name, s.id]));
  const parts = new Map<string, BufferGeometry>();
  gltf.scene.traverse((o) => {
    const m = o as unknown as MeshLike;
    if (!m.isMesh) return;
    const [name, lod, part] = m.material.name.split(':');
    const id = byName.get(name ?? '');
    if (id === undefined || lod === undefined || part === undefined) return;
    parts.set(`${id}:${lod}:${part}`, toFloat(m));
    m.geometry.dispose();
  });
  return { manifest, parts, leaves, impostor };
}
