// 날씨 하늘(M09-T02 — ADR-0077): 공중원근 뒤 하늘 화소에 2D 구름층(고도 1.6 km 평면, 값 잡음 fbm 4옥타브, 바람에 흐름) + 비·안개 연무(거리 지수).
// 구름 밝기 = 그 화소 하늘 휘도 × (얇은 = 2.2 … 두꺼운 밑면 = 0.75) + 태양 쪽 은빛 가장자리 — 대기 모델의 절대 단위를 몰라도 하늘과 어울린다(흐린 날 = 회색 하늘).
// 연무 색 = 자동 노출이 잰 장면 평균 휘도 × 1.5(낮 밝은 회색, 밤 어두움) — CPU 갱신. 밤에는 구름 밑면·연무에 도시 불빛 반사(주황, 장면 평균 휘도 비례).
// see docs/07-rendering.md §8(구름), ADR-0076
import { depthToViewZ, inverseProjectionMatrix, inverseViewMatrix } from '@takram/three-geospatial/webgpu';
import {
  dot,
  exp,
  Fn,
  float,
  floor,
  fract,
  hash,
  If,
  max,
  mix,
  pow,
  screenUV,
  select,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  type PerspectiveCamera,
  type TextureNode,
  type Node as TslNode,
  type UniformNode,
  Vector3,
} from 'three/webgpu';

type F = TslNode<'float'>;
type V2 = TslNode<'vec2'>;
type V3 = TslNode<'vec3'>;
type V4 = TslNode<'vec4'>;

/** 구름 밑면 고도(WF y, m)·무늬 축척(m)·바람 배율(상공 바람 = 지상 × 4). */
const CLOUD_BASE_M = 1600;
const CLOUD_SCALE_M = 2400;
const UPPER_WIND = 4;
/** 맑은 날 연무 최소 밀도(1/m)·안개 1일 때 밀도(시정 ≈ 600 m)·비 mm/h당. */
const HAZE_MIN = 0;
const FOG_DENSITY = 0.005;
const RAIN_HAZE = 0.00012;

export interface WeatherSkyUniforms {
  readonly cover: UniformNode<'float', number>;
  readonly time: UniformNode<'float', number>;
  readonly windX: UniformNode<'float', number>;
  readonly windZ: UniformNode<'float', number>;
  readonly sunDir: UniformNode<'vec3', Vector3>;
  readonly haze: UniformNode<'float', number>;
  readonly hazeLum: UniformNode<'float', number>;
  readonly night: UniformNode<'float', number>;
}

export function createWeatherSkyUniforms(): WeatherSkyUniforms {
  return {
    cover: uniform(0),
    time: uniform(0),
    windX: uniform(0),
    windZ: uniform(0),
    sunDir: uniform(new Vector3(0, 1, 0)),
    haze: uniform(HAZE_MIN),
    hazeLum: uniform(0.1),
    night: uniform(0),
  };
}

/** 프레임마다: 구름량·바람·태양·안개·비·밤·자동 노출 평균 휘도. */
export function updateWeatherSky(
  u: WeatherSkyUniforms,
  o: {
    cover: number;
    windX: number;
    windZ: number;
    sun: { x: number; y: number; z: number };
    fog: number;
    rainMmH: number;
    night: number;
    sceneLum: number | undefined;
    dtS: number;
  },
): void {
  u.cover.value = Math.min(Math.max(o.cover, 0), 1);
  u.time.value = (u.time.value + o.dtS) % 7200;
  u.windX.value = o.windX * UPPER_WIND;
  u.windZ.value = o.windZ * UPPER_WIND;
  u.sunDir.value.set(o.sun.x, o.sun.y, o.sun.z).normalize();
  // 안개는 제곱(약한 흐림 0.05 = 시정 수백 km → 거의 0, 안개 상태 0.75 = 시정 ≈ 1 km).
  u.haze.value = HAZE_MIN + Math.max(o.fog, 0) ** 2 * FOG_DENSITY + Math.max(o.rainMmH, 0) * RAIN_HAZE;
  if (o.sceneLum !== undefined && Number.isFinite(o.sceneLum)) u.hazeLum.value = o.sceneLum * 1.5;
  u.night.value = o.night;
}

/** 잡음 격자 양수 오프셋·행 폭: 씨앗 = ix + iz × 행 < 2^24(float32 정수 정확 — GPU·CPU 같은 값). */
const NOISE_OFFSET = 1000;
const NOISE_ROW = 2003;

/** 격자 값 잡음(정수 격자 해시 — TSL hash는 uint로 자르므로 양수 오프셋). */
function valueNoise(p: V2): F {
  const q = p.add(NOISE_OFFSET);
  const i = floor(q);
  const f = fract(q);
  const s = f.mul(f).mul(f.mul(-2).add(3));
  const h = (dx: number, dz: number): F => hash(i.x.add(dx).add(i.y.add(dz).mul(NOISE_ROW)));
  return mix(mix(h(0, 0), h(1, 0), s.x), mix(h(0, 1), h(1, 1), s.x), s.y);
}

function fbm(p: V2): F {
  let sum: F = float(0);
  let amp = 0.5;
  let pp = p;
  for (let k = 0; k < 4; k++) {
    sum = sum.add(valueNoise(pp).mul(amp));
    pp = pp.mul(2.03).add(vec2(17.3, 9.1));
    amp *= 0.5;
  }
  return sum.div(0.9375);
}

interface ViewRay {
  dir: V3;
  dist: F;
  sky: TslNode<'bool'>;
}

function viewRay(depth: TextureNode, camera: PerspectiveCamera, reversed: boolean): ViewRay {
  const ndc = vec4(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), 0.5, 1);
  const vp = (inverseProjectionMatrix(camera) as unknown as TslNode<'mat4'>).mul(ndc);
  const dirV = vp.xyz.div(vp.w).normalize();
  const dir = (inverseViewMatrix(camera) as unknown as TslNode<'mat4'>).mul(vec4(dirV, 0)).xyz.normalize();
  const d = depth.sample(screenUV).r;
  const z = depthToViewZ(d, camera);
  const sky = reversed ? d.lessThanEqual(0) : d.greaterThanEqual(1);
  return { dir, dist: z.negate().div(dirV.z.negate().max(1e-4)), sky };
}

/** 구름 덮임(0..1)·두께 — 하늘 화소에서만 의미. camY = 카메라 WF 높이(렌더 원점 y 포함). */
function cloudAt(u: WeatherSkyUniforms, dir: V3, camWF: V3): { a: F; thick: F } {
  const t = float(CLOUD_BASE_M).sub(camWF.y).div(dir.y.max(0.02));
  const xz = camWF.xz.add(dir.xz.mul(t)).sub(vec2(u.windX, u.windZ).mul(u.time));
  const n = fbm(xz.div(CLOUD_SCALE_M));
  // fbm 분포가 좁다(≈ 0.5 ± 0.12) → 문턱 = 0.75 − 0.5 × 구름량이면 덮인 비율 ≈ 구름량.
  const edge = float(0.75).sub(u.cover.mul(0.5));
  const a = smoothstep(edge.sub(0.04), edge.add(0.12), n).mul(smoothstep(0.015, 0.1, dir.y));
  const thick = smoothstep(edge, edge.add(0.25), n).mul(u.cover.mul(0.6).add(0.4));
  return { a: a.mul(smoothstep(0, 0.05, u.cover)), thick };
}

/**
 * 공중원근 결과(노출 전) → 구름(하늘 화소)·연무(전 화소). camWF = 카메라 WF 위치(렌더 원점 + 카메라 — uniform).
 * 반환 rgb = 합성 색, a = 구름 덮임(밤 도시 불빛 반사 마스크).
 */
export function weatherSky(
  color: V4,
  depth: TextureNode,
  camera: PerspectiveCamera,
  u: WeatherSkyUniforms,
  camWF: UniformNode<'vec3', Vector3>,
  reversed: boolean,
): V4 {
  return Fn(() => {
    const ray = viewRay(depth, camera, reversed);
    const out = vec3(color.rgb).toVar();
    const mask = float(0).toVar();
    If(ray.sky, () => {
      const c = cloudAt(u, ray.dir, camWF);
      const lum = dot(out, vec3(0.2126, 0.7152, 0.0722));
      const silver = pow(max(dot(ray.dir, u.sunDir), 0), 12)
        .mul(float(1).sub(c.thick))
        .mul(1.8);
      const k = mix(float(2.2), float(0.75), c.thick).add(silver);
      out.assign(mix(out, vec3(lum.mul(k)), c.a));
      mask.assign(c.a);
    });
    const dist = select(ray.sky, float(6000), ray.dist);
    const fog = float(1)
      .sub(exp(dist.mul(u.haze).negate()))
      .mul(select(ray.sky, float(0.8), float(1)));
    out.assign(mix(out, vec3(u.hazeLum), fog));
    // 밤: 구름 밑면·연무에 도시 불빛 반사(주황) — 장면 평균 휘도 비례.
    const glow = mask.max(fog.mul(0.5)).mul(u.night).mul(u.cover.mul(0.7).add(0.2));
    out.addAssign(vec3(1, 0.62, 0.38).mul(u.hazeLum.mul(1.4)).mul(glow));
    return vec4(out, color.a);
  })() as unknown as V4;
}

// ── CPU 짝(태양 가림): 셰이더와 같은 잡음으로 태양 방향 구름 덮임을 계산 → 직사광 감쇠(구름 그림자가 흘러간다). ──

/** three TSL `hash`(PCG — Hash.js)와 같은 값. */
export function tslHash(seed: number): number {
  const state = (Math.imul(Math.trunc(seed) >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 2 ** 32;
}

function valueNoiseCpu(x: number, z: number): number {
  const qx = x + NOISE_OFFSET;
  const qz = z + NOISE_OFFSET;
  const ix = Math.floor(qx);
  const iz = Math.floor(qz);
  const fx = qx - ix;
  const fz = qz - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const h = (dx: number, dz: number) => tslHash(ix + dx + (iz + dz) * NOISE_ROW);
  const a = h(0, 0) + (h(1, 0) - h(0, 0)) * sx;
  const b = h(0, 1) + (h(1, 1) - h(0, 1)) * sx;
  return a + (b - a) * sz;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 셰이더 cloudAt의 덮임(a) — dir = 단위 시선(WF), camWF = 카메라 WF. */
export function cloudAlphaCpu(
  u: WeatherSkyUniforms,
  dir: { x: number; y: number; z: number },
  camWF: { x: number; y: number; z: number },
): number {
  const t = (CLOUD_BASE_M - camWF.y) / Math.max(dir.y, 0.02);
  let x = (camWF.x + dir.x * t - u.windX.value * u.time.value) / CLOUD_SCALE_M;
  let z = (camWF.z + dir.z * t - u.windZ.value * u.time.value) / CLOUD_SCALE_M;
  let sum = 0;
  let amp = 0.5;
  for (let k = 0; k < 4; k++) {
    sum += valueNoiseCpu(x, z) * amp;
    x = x * 2.03 + 17.3;
    z = z * 2.03 + 9.1;
    amp *= 0.5;
  }
  const n = sum / 0.9375;
  const edge = 0.75 - 0.5 * u.cover.value;
  return smooth(edge - 0.04, edge + 0.12, n) * smooth(0.015, 0.1, dir.y) * smooth(0, 0.05, u.cover.value);
}
