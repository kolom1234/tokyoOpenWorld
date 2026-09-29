// 라이브러리 텍스처를 쓰는 기본 머티리얼(M03-T01): 지형(`_SURF` 그룹, 월드 XZ 평면 투영) · 파사드(건물 해시로 벽 그룹·레이어, UV0 = 벽 미터).
// 절차 파사드(T04)·지형 스플랫(T06)이 이 파일의 표본 함수(sampleLayer·perturbWorld)를 재사용한다. see docs/07-rendering.md §4–5
import {
  attribute,
  cameraViewMatrix,
  cross,
  float,
  hash,
  int,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  select,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { type Material, MeshStandardNodeMaterial, type Object3D, type Node as TslNode } from 'three/webgpu';
import { MATERIAL_GROUPS, type MaterialGroup, type MaterialLibrary } from './library.ts';

type F = TslNode<'float'>;
type I = TslNode<'int'>;
type V3 = TslNode<'vec3'>;

export interface LayerSample {
  /** 선형 알베도. */
  albedo: V3;
  /** 탄젠트 공간 법선(−1..1). */
  normalTS: V3;
  /** (ao, roughness, metalness). */
  orm: V3;
}

/** 레이어 1장 표본: 적재 전엔 평균값, 적재 뒤엔 텍스처(ready 혼합). st = 텍스처 좌표(타일 단위). */
export function sampleLayer(lib: MaterialLibrary, layer: I, st: TslNode<'vec2'>): LayerSample {
  const a = lib.maps.albedo.sample(st).depth(layer).rgb;
  const n = lib.maps.normal.sample(st).depth(layer).rgb.mul(2).sub(1);
  const o = lib.maps.orm.sample(st).depth(layer).rgb;
  return {
    albedo: mix(lib.avgColor(layer), a, lib.ready),
    normalTS: mix(vec3(0, 0, 1), n, lib.ready),
    orm: mix(lib.avgOrm(layer), o, lib.ready),
  };
}

/** 탄젠트 공간 법선 → 뷰 공간(material.normalNode). T·B = 월드 방향(텍스처 +u·+v(이미지 위)). */
export function perturbWorld(nTS: V3, t: V3, b: V3, n: V3): V3 {
  const w = normalize(t.mul(nTS.x).add(b.mul(nTS.y)).add(n.mul(nTS.z)));
  return normalize(cameraViewMatrix.mul(vec4(w, 0)).xyz);
}

/** `_SURF`(05 §4) → 그룹. 5 water는 M_WATER 전까지 soil, 6 ballast → gravel, 7 plaza → concrete. */
const SURF_GROUP: readonly MaterialGroup[] = [
  'asphalt',
  'sidewalk',
  'grass',
  'soil',
  'gravel',
  'soil',
  'gravel',
  'concrete',
];

export function createTerrainMaterial(lib: MaterialLibrary): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  m.name = 'terrain_ground';
  const surf = attribute('_surf', 'float').toVarying('v_surf');
  const s = int(surf.add(0.5).floor().clamp(0, 7));
  let g: I = int(MATERIAL_GROUPS.indexOf('concrete'));
  SURF_GROUP.forEach((group, i) => {
    g = select(s.equal(i), int(MATERIAL_GROUPS.indexOf(group)), g);
  });
  const layer = lib.layerOfIndex(g, float(0));
  const xz = positionWorld.xz.add(lib.worldOffset);
  const smp = sampleLayer(lib, layer, xz.mul(lib.invTile(layer)));
  m.colorNode = smp.albedo;
  m.roughnessNode = smp.orm.y;
  m.metalnessNode = float(0);
  m.aoNode = smp.orm.x;
  // 이미지 위 = 북(−Z), 오른쪽 = 동(+X). 경사면은 법선에 직교화.
  const n = normalWorld;
  const t = normalize(vec3(1, 0, 0).sub(n.mul(n.x)));
  m.normalNode = perturbWorld(smp.normalTS, t, cross(n, t), n);
  return m;
}

/** 벽 그룹 후보(해시로 선택). 같은 건물은 한 그룹·한 레이어. */
const WALL_GROUPS: readonly MaterialGroup[] = [
  'tile',
  'tile',
  'plaster',
  'concrete',
  'alc',
  'siding',
  'metal',
  'brick',
];

function cellSeedOf(object: Object3D | null | undefined): number {
  return (object?.userData as { cellSeed?: number } | undefined)?.cellSeed ?? 0;
}

/**
 * 건물별 해시 3개(0..1). `_bldg`(≤ 65535)만 varying으로 넘기고 프래그먼트에서 반올림 → 셀 시드(uniform)와 uint로 결합.
 * 큰 float(시드·65536)를 보간하면 삼각형 안에서 값이 흔들려 픽셀마다 다른 레이어가 골라진다(에일리어싱처럼 보이는 노이즈).
 */
export function buildingHashes(): { h1: F; h2: F; h3: F } {
  const cellSeed = uniform(0).onObjectUpdate(({ object }) => cellSeedOf(object));
  const bldg = attribute('_bldg', 'float').toVarying('v_bldg').add(0.5).floor().toUint();
  const seed = bldg.add(cellSeed.toUint().mul(65536));
  return { h1: hash(seed), h2: hash(seed.bitXor(0x9e3779b9)), h3: hash(seed.bitXor(0x85ebca6b)) };
}

export function createFacadeMaterial(lib: MaterialLibrary): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  m.name = 'facade_default';
  const { h1, h2, h3 } = buildingHashes();
  const n = normalWorld;
  const isRoof = n.y.abs().greaterThan(0.7);
  let wall: I = int(MATERIAL_GROUPS.indexOf('tile'));
  const k = h1.mul(WALL_GROUPS.length).floor();
  WALL_GROUPS.forEach((group, i) => {
    wall = select(k.equal(i), int(MATERIAL_GROUPS.indexOf(group)), wall);
  });
  const roofGroup = select(
    n.y.greaterThan(0.97),
    int(MATERIAL_GROUPS.indexOf('concrete')),
    int(MATERIAL_GROUPS.indexOf('roof')),
  );
  const layer = lib.layerOfIndex(select(isRoof, roofGroup, wall), h2);
  // 벽 UV0 = (벽 길이 m, 높이 m) → 이미지 위 = 월드 위이도록 v 반전. 지붕 UV0 = 셀 로컬 (x, z).
  const uv0 = attribute('uv', 'vec2');
  const st = select(isRoof, uv0, vec2(uv0.x, uv0.y.negate())).mul(lib.invTile(layer));
  const smp = sampleLayer(lib, layer, st);
  const tint = mix(vec3(0.92), vec3(1.06), h3);
  m.colorNode = smp.albedo.mul(tint);
  m.roughnessNode = smp.orm.y;
  // 환경 반사(M03-T02 env-probe) 전에는 금속면이 검게 보인다 → 금속도 상한 0.3(T02에서 해제).
  m.metalnessNode = smp.orm.z.min(0.3);
  m.aoNode = smp.orm.x;
  // 벽: T = 수평(u 증가 방향 = up × n), B = 위. 지붕: T = +X, B = −Z(북, 이미지 위).
  const tWall = normalize(vec3(n.z, 0, n.x.negate()));
  const t = select(isRoof, vec3(1, 0, 0), tWall);
  const b = select(isRoof, vec3(0, 0, -1), vec3(0, 1, 0));
  m.normalNode = perturbWorld(smp.normalTS, t, b, n);
  return m;
}
