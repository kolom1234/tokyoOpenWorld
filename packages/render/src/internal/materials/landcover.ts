// 원경 지면 분류(M12-T04, ADR-0109): 파이프라인 `landcover` 텍스처(RGBA = 물·녹지·도로·선로 비율, 16 m, hlodExtentWF 전체)를
// HLOD 지형이 월드 xz로 샘플링 → L0 지형과 같은 레이어 평균색(도시 바닥 = 콘크리트 + 아스팔트 일부, 도로 = 아스팔트, 녹지 = 잔디, 선로 = 자갈)과
// 물(어두운 반사면)을 섞는다. 텍스처가 없으면(옛 빌드) 비율 0 → 도시 바닥 한 색 = 예전 단색과 같은 역할.
import { float, mix, positionWorld, texture, uniform, vec2, vec3 } from 'three/tsl';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  Texture,
  type Node as TslNode,
  Vector3,
  Vector4,
} from 'three/webgpu';
import type { MaterialGroup, MaterialLibrary } from './library.ts';

type F = TslNode<'float'>;
type V3 = TslNode<'vec3'>;

/** 렌더 원점 WF(프레임마다 frame.ts가 갱신) — 화면 공간 위치 + 원점 = WF. */
export const landcoverOriginU = uniform(new Vector3());
/** (x0, z0, 1/(폭·간격), 1/(높이·간격)) — WF xz → 텍스처 uv. */
const rectU = uniform(new Vector4(0, 0, 0, 0));
/** 0 = 텍스처 없음(비율 0). */
const onU = uniform(0);
const placeholder = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
placeholder.needsUpdate = true;
const texNode = texture(placeholder);

/** 도시 바닥 = 콘크리트에 아스팔트(골목·주차장)를 이만큼 섞는다. */
const URBAN_ASPHALT = 0.35;
/** 선로 회랑 = 자갈에 도시 바닥을 섞는다(도상 + 침목·레일·승강장 — 자갈 그대로는 너무 어둡게 튄다). */
const RAIL_URBAN = 0.35;
/** 물: 짙은 청록 알베도·낮은 거칠기(하늘 반사는 환경광이 한다). */
const WATER_ALBEDO = vec3(0.025, 0.045, 0.05);
const WATER_ROUGHNESS = 0.12;

export interface LandcoverMeta {
  x0: number;
  z0: number;
  step: number;
  width: number;
  height: number;
  file: string;
}

const groupLayer = (lib: MaterialLibrary, g: MaterialGroup) => lib.layerOf(g, float(0));

/** HLOD 지형 색·거칠기 노드. */
export function landcoverNodes(lib: MaterialLibrary): { color: V3; roughness: F } {
  const wf = positionWorld.add(landcoverOriginU);
  const uv = vec2(wf.x.sub(rectU.x).mul(rectU.z), wf.z.sub(rectU.y).mul(rectU.w));
  const w = texNode.sample(uv).mul(onU);
  const asphalt = lib.avgColor(groupLayer(lib, 'asphalt'));
  const urban = mix(lib.avgColor(groupLayer(lib, 'concrete')), asphalt, URBAN_ASPHALT);
  const rest = float(1).sub(w.r).sub(w.g).sub(w.b).sub(w.a).max(0);
  const color = urban
    .mul(rest)
    .add(WATER_ALBEDO.mul(w.r))
    .add(lib.avgColor(groupLayer(lib, 'grass')).mul(w.g))
    .add(asphalt.mul(w.b))
    .add(mix(lib.avgColor(groupLayer(lib, 'gravel')), urban, RAIL_URBAN).mul(w.a));
  const roughness = mix(float(0.92), float(WATER_ROUGHNESS), w.r);
  return { color, roughness };
}

/** 메타 → 텍스처 적용(테스트·로더 공용). */
export function applyLandcover(meta: LandcoverMeta, tex: Texture): void {
  tex.colorSpace = NoColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  texNode.value = tex;
  rectU.value.set(meta.x0, meta.z0, 1 / (meta.width * meta.step), 1 / (meta.height * meta.step));
  onU.value = 1;
}

/** landcover.json URL → PNG(비율은 데이터 — 색공간 변환·알파 곱 없이) → 텍스처. */
export async function loadLandcover(url: string, fetchFn: typeof fetch = fetch): Promise<LandcoverMeta> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`landcover ${url}: HTTP ${res.status}`);
  const meta = (await res.json()) as LandcoverMeta;
  const img = await fetchFn(new URL(meta.file, new URL(url, location.href)).href);
  if (!img.ok) throw new Error(`landcover ${meta.file}: HTTP ${img.status}`);
  const bitmap = await createImageBitmap(await img.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  applyLandcover(meta, new Texture(bitmap));
  return meta;
}

/** 프레임마다: 렌더 원점(원점 재설정 뒤 값). */
export function setLandcoverOrigin(o: { x: number; y: number; z: number }): void {
  landcoverOriginU.value.set(o.x, o.y, o.z);
}
