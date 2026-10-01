// 절차 파사드 ③ 벽 재질(07 §5-3): 클래스 + 건물 해시(tintIdx)로 텍스처 배열 그룹·레이어 선택 × 클래스 팔레트 틴트. 지붕은 평지붕 콘크리트/경사 기와.
import { float, hash, int, mix, normalize, normalWorld, select, uniformArray, vec2, vec3 } from 'three/tsl';
import { Vector3 } from 'three/webgpu';
import { MATERIAL_GROUPS, type MaterialGroup, type MaterialLibrary } from '../library.ts';
import { type LayerSample, sampleLayer } from '../textured.ts';
import type { F, FacadeInputs, I, V3 } from './grid.ts';

/** 클래스별 벽 그룹 후보 4개(해시로 선택) — 순서 = FACADE_CLASS. 같은 그룹 반복 = 가중치. */
const WALL_CHOICES: readonly (readonly MaterialGroup[])[] = [
  ['tile', 'concrete', 'metal', 'alc'], // office
  ['tile', 'tile', 'plaster', 'concrete'], // mansion
  ['siding', 'plaster', 'siding', 'tile'], // house
  ['tile', 'metal', 'plaster', 'concrete'], // commercial
  ['concrete', 'tile', 'concrete', 'alc'], // public
  ['metal', 'alc', 'metal', 'concrete'], // industrial
];

/**
 * 틴트 팔레트(선형 배수) 8색 — 도쿄 거리의 흰·베이지·회색·갈색 계열. tintIdx로 고른다.
 * 텍스처 알베도에 곱하므로 1 근처(과포화 방지).
 */
const PALETTE = [
  new Vector3(1.05, 1.03, 1.0),
  new Vector3(1.0, 0.95, 0.86),
  new Vector3(0.9, 0.9, 0.92),
  new Vector3(0.98, 0.88, 0.76),
  new Vector3(0.78, 0.72, 0.66),
  new Vector3(1.02, 1.0, 0.95),
  new Vector3(0.86, 0.9, 0.95),
  new Vector3(0.95, 0.92, 0.9),
];
const palette = uniformArray<'vec3'>(PALETTE, 'vec3');
const choices = uniformArray<'float'>(
  WALL_CHOICES.flat().map((g) => MATERIAL_GROUPS.indexOf(g)),
  'float',
);

export interface WallSample extends LayerSample {
  /** 월드 기준 T·B(법선 맵용). */
  t: V3;
  b: V3;
}

/** 건물당 한 레이어·한 틴트. 지붕은 평지붕(ny > 0.97) 콘크리트(+ 방수 마감 색, M05-T07), 경사 지붕 = roof 그룹. */
export function facadeWall(lib: MaterialLibrary, i: FacadeInputs): WallSample {
  const h1 = hash(i.tint.add(0.25));
  const h2 = hash(i.tint.add(0.75));
  const pick = int(i.cls.toFloat().mul(4).add(h1.mul(4).floor().min(3)));
  const wallGroup: I = int(choices.element(pick));
  const n = normalWorld;
  const roofGroup = select(
    n.y.greaterThan(0.97),
    int(MATERIAL_GROUPS.indexOf('concrete')),
    int(MATERIAL_GROUPS.indexOf('roof')),
  );
  const layer = lib.layerOfIndex(select(i.isRoof, roofGroup, wallGroup), h2);
  // 벽 UV0 = (m, m) → 이미지 위 = 월드 위(v 반전). 지붕 UV0 = 셀 로컬 (x, z).
  const uv0 = vec2(i.u, i.v);
  const st = select(i.isRoof, uv0, vec2(i.u, i.v.negate())).mul(lib.invTile(layer));
  const s = sampleLayer(lib, layer, st);
  // 평지붕 방수 마감(M05-T07): 건물 해시로 녹색 우레탄 30 %·밝은 시트 20 %·짙은 아스팔트 시트 10 %·콘크리트 그대로 — 상공 조망의 균일한 회색 지붕을 깬다.
  const rh = hash(i.tint.add(0.61));
  const coat = select(
    rh.lessThan(0.3),
    vec3(0.58, 0.78, 0.62),
    select(rh.lessThan(0.5), vec3(1.15, 1.15, 1.12), select(rh.lessThan(0.6), vec3(0.62, 0.62, 0.64), vec3(1))),
  );
  const roofTint = select(n.y.greaterThan(0.97), coat, vec3(1));
  const tint = select(i.isRoof, roofTint, vec3(palette.element(int(i.tint.mod(8)))));
  const tWall = normalize(vec3(n.z, 0, n.x.negate()));
  const t = select(i.isRoof, vec3(1, 0, 0), tWall);
  const b = select(i.isRoof, vec3(0, 0, -1), vec3(0, 1, 0));
  return { albedo: s.albedo.mul(tint), normalTS: s.normalTS, orm: s.orm, t, b };
}

/** 벽 알베도 밝기 안정화: 아주 어두운 텍스처(검은 타일)가 건물 전체를 검게 만들지 않게 하한. */
export function wallFloor(albedo: V3, k: F = float(0.08)): V3 {
  return mix(vec3(k), albedo, float(1).sub(k));
}
