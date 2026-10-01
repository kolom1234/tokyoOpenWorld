// 간판 아틀라스 공용 노드(M05-T06): 간판 인스턴스(signs/material)와 파사드 1층 간판 띠(facade/retail)가 같은 텍스처를 쓴다.
// 아틀라스 = 브랜드 색까지 구운 sRGB(파이프라인 signage/atlas.ts — 판 밖은 틀색) → 표본 1회, uniform 배열 없음(파사드 셰이더 단계당 uniform 버퍼 12개 한도).
// 적재 전 = 1×1 자리 텍스처 + signReady 0(파사드는 무지 색판). see ADR-0054
import { floor, select, texture, uniform, vec2, vec3 } from 'three/tsl';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
  type Node as TslNode,
} from 'three/webgpu';

type F = TslNode<'float'>;
type V2 = TslNode<'vec2'>;
type V3 = TslNode<'vec3'>;
type B = TslNode<'bool'>;

export const SIGN_BRANDS = 64;
/** 아틀라스 배치(파이프라인 ATLAS와 같다): 1024 × 2048, 가로 타일 256 × 64(4열), 세로 타일 64 × 256(16열, y 1024부터). */
const W = 1024;
const H = 2048;

const placeholder = new DataTexture(new Uint8Array([74, 74, 77, 255]), 1, 1);
placeholder.needsUpdate = true;

/** 간판 텍스처 노드(값 교체 = 적재). */
export const signAtlasNode = texture(placeholder);
export const signReady = uniform(0);

export function setSignAtlas(t: Texture): void {
  t.colorSpace = SRGBColorSpace;
  t.flipY = false;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  signAtlasNode.value = t;
  signReady.value = 1;
}

/** 브랜드 b(0..63)의 타일 안 uv(0..1, 오른쪽·아래) → 아틀라스 uv. vertical = 세로 타일. */
function atlasUv(b: F, local: V2, vertical: boolean): V2 {
  if (vertical) {
    const col = b.sub(floor(b.div(16)).mul(16));
    const row = floor(b.div(16));
    return vec2(col.mul(64).add(local.x.mul(64)).div(W), row.mul(256).add(1024).add(local.y.mul(256)).div(H));
  }
  const col = b.sub(floor(b.div(4)).mul(4));
  const row = floor(b.div(4));
  return vec2(col.mul(256).add(local.x.mul(256)).div(W), row.mul(64).add(local.y.mul(64)).div(H));
}

/** 간판 면 색(선형). vertical = 세로 타일인가(노드). 타일 가장자리 0.5 텍셀 안으로 당겨 이웃 타일 번짐을 줄인다. 표본 1회. */
export function signFace(brand: F, local: V2, vertical: B): V3 {
  const b = floor(brand.add(0.5));
  const inset = select(vertical, vec2(0.5 / 64, 0.5 / 256), vec2(0.5 / 256, 0.5 / 64));
  const l = local.clamp(inset, vec2(1).sub(inset));
  return vec3(signAtlasNode.sample(select(vertical, atlasUv(b, l, true), atlasUv(b, l, false))).rgb);
}

/** 브랜드 바탕색(선형) — 가로 타일 왼쪽 글자 앞 빈 판(u 0.025, v 0.35)을 표본(파사드 간판 띠의 판 밖). */
export function signBg(brand: F): V3 {
  return vec3(signAtlasNode.sample(atlasUv(floor(brand.add(0.5)), vec2(0.025, 0.35), false)).rgb);
}
