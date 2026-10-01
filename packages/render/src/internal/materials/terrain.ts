// M_TERRAIN(07 §4, M03-T06): `_SURF` 스플랫 — 정점 원-핫(8클래스, 보간) → 픽셀마다 상위 2클래스 노이즈 경계 혼합.
// 주 클래스 = 안티타일링(회전·축척 2표본, 분산 보존 혼합) + 경사 triplanar(측면 투영 알베도, 옵션 — 기본 끔). 보조 클래스 = 단일 표본(경계 띠에서만 보임).
// 이어서 도로 변형(road.ts), 거시 명암, 젖음(weather/wetness.ts). 텍스처 표본 = 주 3+2(+측면 1) + 보조 2 + 노이즈 4(noiseBank). 법선은 주 클래스 첫 표본만.
// noiseBank 채널: n1.x 경계, n3.x·n9.x 안티타일링 가중, n9.y·n29.w·n1.w 물웅덩이, 나머지는 road.ts.
import {
  attribute,
  float,
  int,
  mix,
  normalWorld,
  positionWorld,
  select,
  smoothstep,
  sqrt,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { type Material, MeshStandardNodeMaterial, type Node as TslNode } from 'three/webgpu';
import type { EnvUniforms } from '../weather/wetness.ts';
import { applyWetness } from '../weather/wetness.ts';
import { MATERIAL_GROUPS, type MaterialGroup, type MaterialLibrary } from './library.ts';
import { type NoiseBank, noiseBank } from './noise.ts';
import { asphaltVariation, macroTint, NO_VARIATION, pavingVariation, type Variation } from './road.ts';
import { sampleLayer, tsToWorld, worldToView } from './textured.ts';

type F = TslNode<'float'>;
type I = TslNode<'int'>;
type V2 = TslNode<'vec2'>;
type V3 = TslNode<'vec3'>;

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
/** 클래스별 흡수율(젖으면 어두워지는 정도)·물웅덩이 허용. */
const POROSITY = [0.9, 0.7, 1, 1, 0.6, 1, 0.6, 0.7];
const PUDDLE = [1, 1, 0, 0.4, 0.5, 0, 0.3, 1];
/** 안티타일링 두 번째 표본: 회전(rad)·축척·오프셋(타일). */
const ROT = 0.83;
const SCALE2 = 0.61;
/** 클래스 경계 혼합 폭(정규화 가중 ±)·노이즈 진폭. */
const EDGE_K = 0.08;
const EDGE_NOISE = 0.05;

/** 클래스(float 0..7) → 상수 표 값. */
function pick(table: readonly number[], c: F): F {
  let v: F = float(table[0] as number);
  for (let k = 1; k < table.length; k++) v = select(c.equal(k), float(table[k] as number), v);
  return v;
}

function groupOf(c: F): I {
  let g: I = int(MATERIAL_GROUPS.indexOf(SURF_GROUP[0] as MaterialGroup));
  SURF_GROUP.forEach((group, k) => {
    g = select(c.equal(k), int(MATERIAL_GROUPS.indexOf(group)), g);
  });
  return g;
}

interface Top2 {
  c1: F;
  c2: F;
  /** 보조 클래스 최종 가중(0..1). */
  s: F;
}

/** 보간된 원-핫 8개 → 상위 2클래스 + 경계 혼합(클래스 순서에 반대칭인 노이즈 → 주/보조가 바뀌는 선에서도 연속). */
function topTwo(w: readonly F[], edgeNoise: F): Top2 {
  let c1: F = float(0);
  let w1: F = w[0] as F;
  for (let k = 1; k < 8; k++) {
    const gt = (w[k] as F).greaterThan(w1);
    c1 = select(gt, float(k), c1);
    w1 = select(gt, w[k] as F, w1);
  }
  c1 = c1.toVar();
  w1 = w1.toVar();
  let c2: F = float(-1);
  let w2: F = float(-1);
  for (let k = 0; k < 8; k++) {
    const wk = select(c1.equal(k), float(-1), w[k] as F);
    const gt = wk.greaterThan(w2);
    c2 = select(gt, float(k), c2);
    w2 = select(gt, wk, w2);
  }
  c2 = c2.toVar();
  const w2n = w2.max(0).div(w1.add(w2.max(0)).max(1e-4));
  const sign = select(c2.greaterThan(c1), float(1), float(-1));
  const s = smoothstep(0.5 - EDGE_K, 0.5 + EDGE_K, w2n.add(edgeNoise.mul(sign)));
  return { c1, c2, s: s.toVar() };
}

/** 표본 결과. nTS = 위 투영 기본 틀(+u = 동, 이미지 위 = 북)의 탄젠트 공간 법선. */
interface Shaded {
  albedo: V3;
  orm: V3;
  nTS: V3;
}

/**
 * 주 클래스 위 투영: 2표본(두 번째는 회전·축척) 분산 보존 혼합. 법선은 첫 표본만 —
 * 두 번째 표본·보조 클래스·측면까지 법선을 받으면 1440p에서 1.2–2.2 ms 더 들었다(레지스터 압박, ADR-0031).
 */
function primaryTop(lib: MaterialLibrary, layer: I, xz: V2, nb: NoiseBank): Shaded {
  const inv = lib.invTile(layer);
  const [c, s] = [Math.cos(ROT), Math.sin(ROT)];
  const a = sampleLayer(lib, layer, xz.mul(inv));
  const xz2 = vec2(xz.x.mul(c).sub(xz.y.mul(s)), xz.x.mul(s).add(xz.y.mul(c)));
  const b = sampleLayer(lib, layer, xz2.mul(inv.mul(SCALE2)).add(vec2(0.37, 0.71)));
  // 혼합 가중: n9.x(주)·n3.x(세) — 약 6 m 규모.
  const w = smoothstep(0.25, 0.75, nb.n9.x.mul(0.65).add(nb.n3.x.mul(0.35))).toVar();
  const k = float(1).div(sqrt(w.mul(w).add(w.oneMinus().mul(w.oneMinus()))));
  const keepVar = (m: V3, x: V3, y: V3): V3 => m.add(mix(x, y, w).sub(m).mul(k));
  return {
    albedo: keepVar(lib.avgColor(layer), a.albedo, b.albedo).max(0),
    orm: keepVar(lib.avgOrm(layer), a.orm, b.orm).clamp(0, 1),
    nTS: a.normalTS,
  };
}

/** 경사면(법선 y 0.85 → 0.6) 측면 투영 알베도: 수평 법선의 접선 방향 u, 높이 v(이미지 위 = +Y). 반환 = (알베도, 가중). */
function sideAlbedo(lib: MaterialLibrary, layer: I, xz: V2, n: V3): { albedo: V3; w: F } {
  const h = vec2(n.x, n.z);
  const tH = vec2(h.y, h.x.negate()).div(h.length().max(1e-4));
  const st = vec2(xz.dot(tH), positionWorld.y.negate()).mul(lib.invTile(layer));
  return { albedo: sampleLayer(lib, layer, st).albedo, w: smoothstep(0.85, 0.6, n.y) };
}

function variationOf(c: F, asphalt: Variation, paving: Variation): Variation {
  const by = (f: keyof Variation): F => select(c.equal(0), asphalt[f], select(c.equal(1), paving[f], NO_VARIATION[f]));
  return { albedoMul: by('albedoMul'), roughMul: by('roughMul'), roughAdd: by('roughAdd') };
}

function varied(albedo: V3, rough: F, v: Variation): { albedo: V3; rough: F } {
  return { albedo: albedo.mul(v.albedoMul), rough: rough.mul(v.roughMul).add(v.roughAdd) };
}

export interface TerrainOptions {
  /** 경사면 측면 투영(텍스처 표본 +1). 1440p RTX 3050 Laptop에서 +0.7–1.3 ms → 기본 끔, 품질 티어(M03-T08)가 켠다. */
  triplanar?: boolean;
}

export function createTerrainMaterial(lib: MaterialLibrary, env: EnvUniforms, opts: TerrainOptions = {}): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  m.name = 'terrain_ground';
  const cls = attribute('_surf', 'float').add(0.5).floor();
  const oh = (k: number): F => select(cls.equal(k), float(1), float(0));
  const lo = vec4(oh(0), oh(1), oh(2), oh(3)).toVarying('v_surfLo');
  const hi = vec4(oh(4), oh(5), oh(6), oh(7)).toVarying('v_surfHi');
  const xz = positionWorld.xz.add(lib.worldOffset).toVar();
  const nb = noiseBank(xz);
  const n = normalWorld.toVar();
  // 세로 면(보도 연석·치마, M05-T01): 위 투영은 한 줄로 늘어진다 → 면 접선(수평)·높이 투영. 표본 수는 같다(주·보조 좌표만 바꿈).
  const hN = vec2(n.x, n.z);
  const tH = vec2(hN.y, hN.x.negate()).div(hN.length().max(1e-4));
  const vertical = n.y.lessThan(0.5);
  const st = select(vertical, vec2(xz.dot(tH), positionWorld.y.negate()), xz).toVar();
  const top = topTwo([lo.x, lo.y, lo.z, lo.w, hi.x, hi.y, hi.z, hi.w], nb.n1.x.sub(0.5).mul(EDGE_NOISE));
  const l1 = lib.layerOfIndex(groupOf(top.c1), float(0));
  const l2 = lib.layerOfIndex(groupOf(top.c2.max(0)), float(0));
  const p = primaryTop(lib, l1, st, nb);
  const side = opts.triplanar ? sideAlbedo(lib, l1, xz, n) : { albedo: vec3(0), w: float(0) };
  const q = sampleLayer(lib, l2, st.mul(lib.invTile(l2)));
  const pAlbedo = opts.triplanar ? mix(p.albedo, side.albedo, side.w) : p.albedo;
  const pOrm = p.orm;
  const asphalt = asphaltVariation(nb);
  const paving = pavingVariation(nb);
  const a = varied(pAlbedo, pOrm.y, variationOf(top.c1, asphalt, paving));
  const b = varied(q.albedo, q.orm.y, variationOf(top.c2, asphalt, paving));
  // 법선: 주 클래스 위 투영만(보조 몫·경사면 몫은 기하 법선으로 옅게).
  const t = select(vertical, vec3(tH.x, 0, tH.y), vec3(1, 0, 0).sub(n.mul(n.x)).normalize());
  const flat = opts.triplanar ? top.s.add(side.w).min(1) : top.s;
  const normalW = tsToWorld(mix(p.nTS, vec3(0, 0, 1), flat), t, n.cross(t), n);
  const wet = applyWetness(
    {
      albedo: mix(a.albedo, b.albedo, top.s).mul(macroTint(nb)),
      roughness: mix(a.rough, b.rough, top.s).clamp(0.02, 1),
      normalW,
      porosity: mix(pick(POROSITY, top.c1), pick(POROSITY, top.c2.max(0)), top.s),
      puddle: mix(pick(PUDDLE, top.c1), pick(PUDDLE, top.c2.max(0)), top.s),
      puddleNoise: nb.n9.y.mul(0.6).add(nb.n29.w.mul(0.25)).add(nb.n1.w.mul(0.15)),
      flatY: n.y,
      geomNormalW: n,
    },
    env.wetness,
  );
  m.colorNode = wet.albedo;
  m.roughnessNode = wet.roughness;
  m.metalnessNode = float(0);
  m.aoNode = mix(pOrm.x, q.orm.x, top.s);
  m.normalNode = worldToView(wet.normalW);
  return m;
}
