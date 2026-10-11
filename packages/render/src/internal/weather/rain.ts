// 빗줄기·눈(07 §8 비, M09-T01 — ADR-0076): 깊이 인지 화면 공간 층 — 카메라 둘레 원통 4겹(반경 2.2–18 m)에 칸마다 무작위 빗줄기를 두고, 화소 시선이 원통에 닿는 점의
// (각도·높이 + 낙하 × 시각) 무늬로 그린다. 씬 깊이가 원통보다 가까우면(건물 뒤) 가린다. 후처리 TAAU 뒤에 더한다(얇고 빠른 줄기를 TAA 이력이 지우지 않게).
// 상태·정점 없음 → WebGPU·WebGL2 공용(07 §9 "compute 입자 → CPU 입자"·07 §8 "compute 빗줄기" 대신 — 별도 장면 패스는 r186에서 아무것도 그리지 않았다, 실측).
import { depthToViewZ, inverseProjectionMatrix, inverseViewMatrix } from '@takram/three-geospatial/webgpu';
import {
  abs,
  atan,
  float,
  floor,
  fract,
  hash,
  max,
  screenUV,
  select,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { PerspectiveCamera, TextureNode, Node as TslNode, UniformNode } from 'three/webgpu';

type F = TslNode<'float'>;
type V3 = TslNode<'vec3'>;
type U = UniformNode<'float', number>;

/** 원통 겹: 반경(m)·칸 폭(m)·밝기. 가까울수록 굵고 밝다. */
export const RAIN_LAYERS = [
  { r: 2.2, cellW: 0.17, gain: 0.7 },
  { r: 4.5, cellW: 0.21, gain: 0.6 },
  { r: 9, cellW: 0.28, gain: 0.5 },
  { r: 18, cellW: 0.42, gain: 0.4 },
] as const;
/** 칸 높이(m)·빗줄기 길이(m — 노출 1/60 s 남짓 × 낙하 8 m/s의 사진 느낌)·눈송이 크기(m)·띠 높이(카메라 ±, m). */
const CELL_H_M = 1.6;
const STREAK_M = 0.5;
const SNOW_CELL_H_M = 0.55;
const FLAKE_M = 0.012;
const BAND_M = 14;

export interface RainUniforms {
  readonly time: U;
  readonly density: U;
  readonly snow: U;
  readonly windX: U;
  readonly windZ: U;
  readonly brightness: U;
  readonly pxAngle: U;
}

export interface RainField {
  readonly uniforms: RainUniforms;
  /** 비 mm/h·눈 0–1·바람(WF m/s)·밤 0–1, dt(s), 화소 각(rad) — 프레임마다. */
  update(o: {
    rainMmH: number;
    snow: number;
    windX: number;
    windZ: number;
    night: number;
    dtS: number;
    pxAngle: number;
  }): void;
  readonly active: boolean;
  stats(): { count: number; density: number; snow: boolean };
}

export function createRainField(): RainField {
  const u: RainUniforms = {
    time: uniform(0),
    density: uniform(0),
    snow: uniform(0),
    windX: uniform(0),
    windZ: uniform(0),
    brightness: uniform(0.3),
    pxAngle: uniform(0.001),
  };
  let st = { count: 0, density: 0, snow: false };
  return {
    uniforms: u,
    update(o) {
      const snow = o.snow > 0.05 && o.snow * 8 > o.rainMmH;
      const k = snow ? Math.min(o.snow, 1) : Math.min(o.rainMmH / 8, 1);
      // 칸 채움: 약한 비 0.1 … 폭우 0.7(그 이상은 화면이 줄무늬로 덮인다 — 실제 GPU 조정).
      const density = k > 0.005 ? 0.1 + 0.6 * k : 0;
      u.time.value = (u.time.value + o.dtS) % 3600;
      u.density.value = density;
      u.snow.value = snow ? 1 : 0;
      u.windX.value = o.windX * (snow ? 0.6 : 0.35);
      u.windZ.value = o.windZ * (snow ? 0.6 : 0.35);
      u.brightness.value = (snow ? 0.5 : 0.22) * (1 - 0.5 * o.night);
      u.pxAngle.value = o.pxAngle;
      st = { count: density > 0 ? RAIN_LAYERS.length : 0, density, snow };
    },
    get active() {
      return st.density > 0;
    },
    stats: () => ({ ...st }),
  };
}

interface Ray {
  dir: V3;
  hl: F;
  theta: F;
  sceneDist: F;
}

/** 원통 한 겹의 빗줄기·눈송이 세기(0..1). */
function layer(u: RainUniforms, L: (typeof RAIN_LAYERS)[number], salt: number, ray: Ray): F {
  const isSnow = u.snow.greaterThan(0.5);
  const t = float(L.r).div(ray.hl);
  const y = ray.dir.y.mul(t);
  const hx = ray.dir.x.div(ray.hl);
  const hz = ray.dir.z.div(ray.hl);
  const fall = select(isSnow, float(1), float(8));
  // 접선 바람(원통 둘레 방향) → 무늬 기울임(낙하 높이당 수평 이동).
  const wt = u.windX.mul(hz).sub(u.windZ.mul(hx));
  const cells = Math.round((2 * Math.PI * L.r) / L.cellW);
  const cellH = select(isSnow, float(SNOW_CELL_H_M), float(CELL_H_M));
  const wob = select(isSnow, sin(u.time.mul(1.3).add(y.mul(2))).mul(0.25), float(0));
  const uu = ray.theta
    .div(2 * Math.PI)
    .add(0.5)
    .mul(cells)
    .add(y.mul(wt).div(fall).div(L.cellW))
    .add(wob);
  const vv = y.add(u.time.mul(fall)).div(cellH);
  const ci = floor(vec2(uu, vv));
  const f = fract(vec2(uu, vv));
  const seed = ci.x
    .add(ci.y.mod(4096).mul(cells))
    .mul(4)
    .add(salt * 1_000_003);
  const has = hash(seed).lessThan(u.density);
  const x0 = hash(seed.add(1)).mul(0.8).add(0.1);
  const y0 = hash(seed.add(2)).mul(0.6);
  const halfW = max(float(L.r).mul(u.pxAngle), 0.0025).div(L.cellW);
  const dx = abs(f.x.sub(x0));
  const lineU = float(1).sub(smoothstep(halfW.mul(0.5), halfW.mul(1.5), dx));
  const along = f.y.sub(y0).div(STREAK_M / CELL_H_M);
  const lineV = smoothstep(0, 0.2, along).mul(float(1).sub(smoothstep(0.8, 1, along)));
  const fd = vec2(dx.mul(L.cellW), abs(f.y.sub(y0).sub(0.2)).mul(SNOW_CELL_H_M)).length();
  const flake = float(1).sub(smoothstep(FLAKE_M * 0.4, FLAKE_M, fd));
  const shape = select(isSnow, flake, lineU.mul(lineV));
  const band = float(1).sub(smoothstep(BAND_M * 0.6, BAND_M, abs(y)));
  const visible = select(ray.sceneDist.greaterThan(t), float(1), float(0));
  return select(has, shape, float(0)).mul(band).mul(visible).mul(L.gain);
}

/** 후처리: 화소 시선 → 원통 겹 합 × 밝기(노출 뒤 HDR에 더할 값). depth = 씬 패스 깊이(역-Z 포함 — takram depthToViewZ). */
export function rainLayers(u: RainUniforms, depth: TextureNode, camera: PerspectiveCamera): V3 {
  const ndc = vec4(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), 0.5, 1);
  const vp = (inverseProjectionMatrix(camera) as unknown as TslNode<'mat4'>).mul(ndc);
  const dirV = vp.xyz.div(vp.w).normalize();
  const dir = (inverseViewMatrix(camera) as unknown as TslNode<'mat4'>).mul(vec4(dirV, 0)).xyz.normalize();
  const sceneZ = depthToViewZ(depth.sample(screenUV).r, camera);
  const sceneDist = sceneZ.negate().div(dirV.z.negate().max(1e-4));
  const ray: Ray = { dir, hl: dir.xz.length().max(1e-3), theta: atan(dir.x, dir.z), sceneDist };
  let acc: F = float(0);
  for (const [i, L] of RAIN_LAYERS.entries()) acc = acc.add(layer(u, L, i + 1, ray));
  return vec3(
    acc
      .min(1.5)
      .mul(u.brightness)
      .mul(select(u.density.greaterThan(0), float(1), float(0))),
  );
}
