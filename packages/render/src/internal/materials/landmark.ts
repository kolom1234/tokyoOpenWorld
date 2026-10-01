// 랜드마크 머티리얼(M05-T05, overrides.mesh): 정점 `_LMAT`(파이프라인 overrides/spec.ts LMAT 순서) → 표 색·거칠기·금속도 + 종류별 절차 무늬
// (커튼월 멀리언, 세로 핀, 석재 줄눈, 화강암 창 격자, 금속 패널 이음, 자갈·나뭇결·청동 녹) + 화면(가상 영상 — 글자·로고 없는 색면·원·띠).
// UV0 = 미터(벽: 수평 거리·건물 바닥부터 높이, 수평면: x·z, 화면: 시드×1000 + m). 무늬 선은 fwidth로 거리 평균화(앨리어싱 방지). see ADR-0053
import {
  abs,
  attribute,
  cos,
  float,
  floor,
  fract,
  fwidth,
  int,
  max,
  mix,
  select,
  sin,
  smoothstep,
  time,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { type Material, MeshStandardNodeMaterial, type Node as TslNode, Vector2, Vector3 } from 'three/webgpu';
import { glassRoughness } from './glass.ts';
import { lattice } from './noise.ts';

type F = TslNode<'float'>;
type V2 = TslNode<'vec2'>;
type V3 = TslNode<'vec3'>;

/** LMAT 순서: 콘크리트·석재·커튼월·투명 유리·금속 패널·데크·목재·주홍·화면·청동·짙은 강판·화강암 격자·자갈·핀 커튼월·녹지·FRP(옥상 물탱크, M05-T07). */
const SPEC: readonly [number, number, number, number, number][] = [
  [0.34, 0.33, 0.3, 0.85, 0],
  [0.45, 0.41, 0.35, 0.6, 0],
  [0.12, 0.145, 0.17, 0.06, 0.45],
  [0.06, 0.075, 0.08, 0.05, 0],
  [0.5, 0.51, 0.52, 0.35, 0.85],
  [0.22, 0.22, 0.21, 0.9, 0],
  [0.27, 0.2, 0.13, 0.75, 0],
  [0.6, 0.035, 0.012, 0.6, 0],
  [0.01, 0.01, 0.012, 0.3, 0],
  [0.2, 0.15, 0.08, 0.5, 0.85],
  [0.085, 0.09, 0.095, 0.45, 0.7],
  [0.5, 0.48, 0.44, 0.55, 0],
  [0.44, 0.39, 0.3, 0.95, 0],
  [0.15, 0.18, 0.21, 0.07, 0.4],
  [0.045, 0.1, 0.03, 0.9, 0],
  [0.42, 0.5, 0.55, 0.45, 0],
];
export const LANDMARK_KINDS = SPEC.length;
const ID = {
  stone: 1,
  curtain: 2,
  metal: 4,
  wood: 6,
  screen: 8,
  bronze: 9,
  steel: 10,
  granite: 11,
  gravel: 12,
  fins: 13,
  green: 14,
};

/** 화면 밝기(발광 배율) — 낮에도 보이는 LED 전광판. */
export const screenExposure = uniform(1.2);

const albedoTable = uniformArray<'vec3'>(
  SPEC.map(([r, g, b]) => new Vector3(r, g, b)),
  'vec3',
);
const rmTable = uniformArray<'vec2'>(
  SPEC.map(([, , , r, m]) => new Vector2(r, m)),
  'vec2',
);

/** 주기 period의 선(반폭 hw) 덮임 0..1 — 화면 픽셀보다 선이 가늘어지면 평균 덮임(2hw/period)으로. */
export function lines(x: F, period: number, hw: number): F {
  const d = abs(fract(x.div(period).add(0.5)).sub(0.5)).mul(period);
  const w = max(fwidth(x), 1e-4);
  const cov = float(1).sub(smoothstep(float(hw).sub(w), float(hw).add(w), d));
  return mix(cov, float((2 * hw) / period), smoothstep(period * 0.2, period * 0.6, w));
}

const is = (id: F, k: number) => abs(id.sub(k)).lessThan(0.5);

/** 가상 영상: 시드·장면(9 s)마다 색상 쌍, 움직이는 부드러운 원 3개 + 흐르는 띠 + LED 화소 격자. 글자 없음. */
function screenColor(p: V2): V3 {
  const seed = floor(p.x.div(1000));
  const q = vec2(p.x.sub(seed.mul(1000)), p.y);
  const t = time.add(seed.mul(3.7));
  const scene = floor(t.div(9));
  const hue = fract(seed.mul(0.137).add(scene.mul(0.311)));
  const pal = (h: F): V3 => vec3(0.5).add(cos(vec3(h, h.add(0.33), h.add(0.67)).mul(6.2832)).mul(0.5));
  const a = pal(hue);
  const b = pal(hue.add(0.45));
  let col: V3 = mix(
    a.mul(0.25),
    b.mul(0.35),
    smoothstep(-4, 4, sin(q.x.mul(0.21).add(q.y.mul(0.13)).add(t.mul(0.4))).mul(4)),
  );
  for (let k = 0; k < 3; k++) {
    const c = vec2(
      sin(t.mul(0.31 + k * 0.17).add(seed.add(k * 2.1)))
        .mul(6)
        .add(8 + k * 5),
      cos(t.mul(0.27 + k * 0.11).add(k * 1.3))
        .mul(3)
        .add(5),
    );
    const blob = float(1).sub(smoothstep(1.5, 4.5, q.sub(c).length()));
    col = mix(col, k === 1 ? b : a, blob.mul(0.85));
  }
  const band = smoothstep(0.85, 1, fract(q.y.mul(0.08).sub(t.mul(0.15))));
  col = col.add(vec3(band.mul(0.25)));
  // LED 화소(6 cm): 가까이서만 보이는 격자 어둠.
  const led = lines(q.x, 0.06, 0.012).max(lines(q.y, 0.06, 0.012));
  return col.mul(float(1).sub(led.mul(0.5)));
}

export function createLandmarkMaterial(): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  m.name = 'landmark';
  const id = attribute('_lmat', 'float');
  const idx = int(id.add(0.5).min(LANDMARK_KINDS - 1));
  const p = uv();
  const n9 = lattice(p.mul(0.35));
  const n1 = lattice(p.mul(4));
  let albedo: V3 = vec3(albedoTable.element(idx));
  const rm: V2 = vec2(rmTable.element(idx));
  let rough: F = rm.x;
  let metal: F = rm.y;
  // 커튼월: 1.5 m 멀리언 + 4.2 m 층 띠(알루미늄).
  const mullion = lines(p.x, 1.5, 0.04).max(lines(p.y, 4.2, 0.09));
  // 핀 커튼월: 1.2 m 간격 흰 세로 핀(0.34 m) — 40 m(약 9층)마다 반 칸 엇갈림 + 4.5 m 층 띠.
  const stagger = fract(floor(p.y.div(40)).mul(0.5)).mul(1.2);
  const fin = lines(p.x.add(stagger), 1.2, 0.17).max(lines(p.y, 4.5, 0.1));
  const frame = select(is(id, ID.curtain), mullion, select(is(id, ID.fins), fin, float(0)));
  const frameColor = select(is(id, ID.fins), vec3(0.66, 0.67, 0.67), vec3(0.32, 0.33, 0.34));
  albedo = mix(albedo, frameColor, frame);
  rough = mix(select(is(id, ID.curtain).or(is(id, ID.fins)), glassRoughness, rough), float(0.45), frame);
  metal = mix(metal, select(is(id, ID.fins), float(0.2), float(0.8)), frame);
  // 석재 줄눈(1.2 × 0.6 m)·금속 패널 이음(1 × 3 m)·강판 돌출 이음(0.6 m).
  const joints = select(
    is(id, ID.stone),
    lines(p.x, 1.2, 0.006)
      .max(lines(p.y, 0.6, 0.006))
      .mul(0.35),
    select(
      is(id, ID.metal),
      lines(p.x, 1, 0.008)
        .max(lines(p.y, 3, 0.008))
        .mul(0.3),
      float(0),
    ),
  );
  albedo = albedo.mul(float(1).sub(joints));
  albedo = albedo.mul(select(is(id, ID.steel), float(1).add(lines(p.x, 0.6, 0.02).mul(0.6)), float(1)));
  // 화강암 창 격자(도청형): 1.6 × 3.9 m 칸에 0.8 × 1.7 m 짙은 창, 4번째 기둥 줄은 어두운 돌.
  const win = lines(p.x, 1.6, 0.4).mul(lines(p.y.sub(2.2), 3.9, 0.85));
  const darkCol = select(fract(floor(p.x.div(1.6)).div(4)).lessThan(0.1), float(0.7), float(1));
  const isGranite = is(id, ID.granite);
  albedo = select(isGranite, mix(albedo.mul(darkCol), vec3(0.04, 0.05, 0.06), win), albedo);
  rough = select(isGranite, mix(rough, float(0.1), win), rough);
  // 자갈·녹지·나뭇결·청동 녹: 저주파 + 고주파 노이즈.
  const speck = n1.x.mul(0.5).add(n9.y.mul(0.5)).sub(0.5);
  albedo = albedo.mul(select(is(id, ID.gravel), float(1).add(speck.mul(0.5)), float(1)));
  albedo = albedo.mul(select(is(id, ID.green), float(1).add(speck.mul(0.9)), float(1)));
  const grain = lattice(vec2(p.x.mul(9), p.y.mul(0.4))).z.sub(0.5);
  albedo = albedo.mul(select(is(id, ID.wood), float(1).add(grain.mul(0.35)), float(1)));
  const patina = smoothstep(0.15, 0.45, n9.w.mul(n1.y));
  albedo = select(is(id, ID.bronze), mix(albedo, vec3(0.07, 0.11, 0.08), patina.mul(0.6)), albedo);
  const isScreen = is(id, ID.screen);
  m.colorNode = albedo;
  m.roughnessNode = rough;
  m.metalnessNode = metal;
  m.emissiveNode = select(isScreen, screenColor(p).mul(screenExposure), vec3(0));
  return m;
}
