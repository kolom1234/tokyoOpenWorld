// 공유 머티리얼 라이브러리(M03-T01, 07 §4): KTX2 텍스처 배열 3장(albedo sRGB·normal·ORM) + manifest(그룹·타일 크기·평균색).
// 셰이더는 부팅 때 자리표시 배열(1×1)로 컴파일되고, manifest → 평균색, KTX2 적재 → 텍스처 교체(`TextureNode.value`) + ready = 1.
// 바인딩 형식(texture_2d_array<f32>)이 같아 파이프라인 재컴파일이 없다. see docs/07-rendering.md §4, docs/modules/render.md
import type { Logger, Vec3d } from '@sanpo/core';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { float, int, texture, uniform, uniformArray, vec2, vec3 } from 'three/tsl';
import {
  type CompressedArrayTexture,
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type Node as TslNode,
  Vector2,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';

/** 셰이더가 아는 그룹(파이프라인 content/materials/library.json의 group과 같은 이름). 추가 = 끝에만. */
export const MATERIAL_GROUPS = [
  'asphalt',
  'sidewalk',
  'concrete',
  'tile',
  'metal',
  'plaster',
  'siding',
  'alc',
  'brick',
  'roof',
  'grass',
  'soil',
  'gravel',
] as const;
export type MaterialGroup = (typeof MATERIAL_GROUPS)[number];
/** uniform 배열 길이(레이어 상한). */
export const MAX_LAYERS = 64;
/** 텍스처 원점 오프셋 주기(m): 렌더 원점 이동(256 m 격자)과 무관하게 월드 고정 무늬. 모든 tileM의 배수일 필요는 없다(오차 = 주기 경계에서만). */
const WORLD_UV_PERIOD_M = 4096;

export interface MaterialsManifest {
  schema: 1;
  layerCount: number;
  textures: Record<'albedo' | 'normal' | 'orm', { file: string; bytes: number; size: number }>;
  layers: { id: string; group: string; index: number; tileM: number; avgColor: number[]; avgOrm: number[] }[];
  groups: Record<string, number[]>;
  hash: string;
}

export type LibraryState = 'none' | 'manifest' | 'ready' | 'failed';

export interface LibraryStats {
  state: LibraryState;
  layers: number;
  /** 받은 KTX2 바이트. */
  downloadBytes: number;
  /** 트랜스코드 후 GPU 업로드 바이트(밉맵 포함). */
  gpuBytes: number;
  loadMs: number;
}

type F = TslNode<'float'>;
type I = TslNode<'int'>;
type TexNode = ReturnType<typeof texture<'vec4'>>;

export interface MaterialLibrary {
  readonly maps: { albedo: TexNode; normal: TexNode; orm: TexNode };
  /** 적재 전 0, 텍스처 교체 후 1(평균색 → 텍스처 혼합). */
  readonly ready: F;
  /** WF xz를 WORLD_UV_PERIOD_M로 접은 렌더 원점(렌더 좌표 + offset = 월드 고정 UV). */
  readonly worldOffset: TslNode<'vec2'>;
  /** 그룹 안에서 h∈[0,1)로 고른 레이어 인덱스(int). 그룹이 비었으면 0. */
  layerOf(group: MaterialGroup, h: F): I;
  /** 그룹 인덱스(MATERIAL_GROUPS 순서, int 노드)로 고르는 동적 버전. */
  layerOfIndex(groupIndex: I, h: F): I;
  /** 레이어 평균 알베도(선형)·평균 ORM·1/tileM. */
  avgColor(layer: I): TslNode<'vec3'>;
  avgOrm(layer: I): TslNode<'vec3'>;
  invTile(layer: I): F;
  setOrigin(originWF: Readonly<Vec3d>): void;
  /** manifest URL → 평균값 적용 → KTX2 3장 적재 → 교체. 실패는 reject(평균색 유지). */
  load(manifestUrl: string, renderer: WebGPURenderer, log: Logger): Promise<LibraryStats>;
  stats(): LibraryStats;
  dispose(): void;
}

/** 샘플러는 부팅 때 자리표시 텍스처 기준으로 만들어진다 → 최종 KTX2와 같은 필터(밉맵 선형·이방성)를 미리 준다(아니면 LOD 0 고정 에일리어싱). */
const ANISOTROPY = 8;

function placeholder(rgba: [number, number, number, number], srgb: boolean): DataArrayTexture {
  const t = new DataArrayTexture(new Uint8Array(rgba), 1, 1, 1);
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = false;
  t.anisotropy = ANISOTROPY;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function uploadBytes(t: CompressedArrayTexture): number {
  let n = 0;
  for (const m of t.mipmaps ?? []) n += (m as { data: ArrayBufferView }).data.byteLength;
  return n;
}

/** 레이어·그룹 uniform 배열(MAX_LAYERS 고정 길이 — 셰이더 불변) + manifest 적용. */
function createLayerUniforms() {
  const avgColors = Array.from({ length: MAX_LAYERS }, () => new Vector3(0.6, 0.6, 0.6));
  const avgOrms = Array.from({ length: MAX_LAYERS }, () => new Vector3(1, 0.8, 0));
  const invTiles = new Array<number>(MAX_LAYERS).fill(0.5);
  const ranges = MATERIAL_GROUPS.map(() => new Vector2(0, 1));
  return {
    uAvg: uniformArray<'vec3'>(avgColors, 'vec3'),
    uOrm: uniformArray<'vec3'>(avgOrms, 'vec3'),
    uInv: uniformArray<'float'>(invTiles, 'float'),
    uRange: uniformArray<'vec2'>(ranges, 'vec2'),
    apply(m: MaterialsManifest): void {
      if (m.schema !== 1 || m.layerCount > MAX_LAYERS)
        throw new Error(`materials manifest: schema/layers ${m.layerCount}`);
      for (const l of m.layers) {
        const [r = 0.6, g = 0.6, b = 0.6] = l.avgColor;
        avgColors[l.index]?.set(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
        const [ao = 1, ro = 0.8, me = 0] = l.avgOrm;
        avgOrms[l.index]?.set(ao, ro, me);
        invTiles[l.index] = 1 / l.tileM;
      }
      MATERIAL_GROUPS.forEach((g, i) => {
        const idx = m.groups[g] ?? [];
        ranges[i]?.set(idx[0] ?? 0, Math.max(1, idx.length));
      });
    },
  };
}

/** KTX2 배열 1장 적재(반복 래핑·이방성·밉맵 필터, 법선·ORM은 선형). */
async function loadArray(loader: KTX2Loader, url: string, linear: boolean): Promise<CompressedArrayTexture> {
  const t = (await loader.loadAsync(url)) as CompressedArrayTexture;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = ANISOTROPY;
  if (t.mipmaps && t.mipmaps.length > 1) t.minFilter = LinearMipmapLinearFilter;
  if (linear) t.colorSpace = NoColorSpace;
  return t;
}

/** manifest → onManifest(평균값 먼저) → KTX2 3장 병렬 적재. */
async function fetchLibrary(
  manifestUrl: string,
  renderer: WebGPURenderer,
  basisPath: string,
  onManifest: (m: MaterialsManifest) => void,
) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`materials manifest HTTP ${res.status}`);
  const m = (await res.json()) as MaterialsManifest;
  onManifest(m);
  const loader = new KTX2Loader().setTranscoderPath(basisPath).detectSupport(renderer);
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  const [albedo, normal, orm] = await Promise.all([
    loadArray(loader, base + m.textures.albedo.file, false),
    loadArray(loader, base + m.textures.normal.file, true),
    loadArray(loader, base + m.textures.orm.file, true),
  ]);
  const bytes = m.textures.albedo.bytes + m.textures.normal.bytes + m.textures.orm.bytes;
  return { loader, albedo, normal, orm, bytes };
}

function createMaps() {
  const holders = {
    albedo: placeholder([200, 200, 200, 255], true),
    normal: placeholder([128, 128, 255, 255], false),
    orm: placeholder([255, 204, 0, 255], false),
  };
  const maps = {
    albedo: texture<'vec4'>(holders.albedo),
    normal: texture<'vec4'>(holders.normal),
    orm: texture<'vec4'>(holders.orm),
  };
  return { holders, maps };
}

/** 소요 시간 기록 + 실패 상태·경고 + 완료 로그. */
async function timed(st: LibraryStats, log: Logger, fn: () => Promise<void>): Promise<LibraryStats> {
  const t0 = performance.now();
  try {
    await fn();
  } catch (e) {
    st.state = 'failed';
    log.warn('material library', e);
    throw e;
  } finally {
    st.loadMs = Math.round(performance.now() - t0);
  }
  const mb = (b: number): string => (b / 1e6).toFixed(1);
  log.info(`materials ${st.layers} layers: ${mb(st.downloadBytes)} MB → GPU ${mb(st.gpuBytes)} MB in ${st.loadMs} ms`);
  return { ...st };
}

export function createMaterialLibrary(basisPath: string): MaterialLibrary {
  const { holders, maps } = createMaps();
  const u = createLayerUniforms();
  const ready = uniform(0);
  const offset = new Vector2(0, 0);
  const loaded: Texture[] = [];
  let loader: KTX2Loader | undefined;
  const st: LibraryStats = { state: 'none', layers: 0, downloadBytes: 0, gpuBytes: 0, loadMs: 0 };

  const layerOfIndex = (groupIndex: I, h: F): I => {
    const r = vec2(u.uRange.element(groupIndex));
    return int(r.x.add(h.mul(r.y).floor().min(r.y.sub(1))));
  };

  const loadAll = async (manifestUrl: string, renderer: WebGPURenderer): Promise<void> => {
    const r = await fetchLibrary(manifestUrl, renderer, basisPath, (m) => {
      u.apply(m);
      st.layers = m.layerCount;
      st.state = 'manifest';
    });
    loader = r.loader;
    loaded.push(r.albedo, r.normal, r.orm);
    maps.albedo.value = r.albedo;
    maps.normal.value = r.normal;
    maps.orm.value = r.orm;
    ready.value = 1;
    st.gpuBytes = uploadBytes(r.albedo) + uploadBytes(r.normal) + uploadBytes(r.orm);
    st.downloadBytes = r.bytes;
    st.state = 'ready';
  };

  return {
    maps,
    ready,
    worldOffset: uniform(offset),
    layerOf: (group, h) => layerOfIndex(int(MATERIAL_GROUPS.indexOf(group)), h),
    layerOfIndex,
    avgColor: (layer) => vec3(u.uAvg.element(layer)),
    avgOrm: (layer) => vec3(u.uOrm.element(layer)),
    invTile: (layer) => float(u.uInv.element(layer)),
    setOrigin(o) {
      offset.set(o.x % WORLD_UV_PERIOD_M, o.z % WORLD_UV_PERIOD_M);
    },
    load: (manifestUrl, renderer, log) => timed(st, log, () => loadAll(manifestUrl, renderer)),
    stats: () => ({ ...st }),
    dispose() {
      for (const t of [...Object.values(holders), ...loaded]) t.dispose();
      loader?.dispose();
    },
  };
}
