// M_DECAL(07 §4, M05-T02): 노면 표시 — 정점 `_PAINT`(0 흰·1 황) 색, 도료 마모 = 노이즈 알파 테스트(벗겨진 곳은 버려 아스팔트가 보임),
// 조금 매끈한 도료 거칠기(젖으면 더 매끈). 지형 위 2 cm 기하 오프셋(파이프라인)이라 깊이 편향 없음. see docs/07-rendering.md §4
import { attribute, float, mix, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { type Material, MeshStandardNodeMaterial } from 'three/webgpu';
import type { EnvUniforms } from '../weather/wetness.ts';
import type { MaterialLibrary } from './library.ts';
import { noiseBank } from './noise.ts';

/** 도료 색(선형): 흰색·황색(일본 중앙선 황색). */
const WHITE = [0.8, 0.8, 0.78] as const;
const YELLOW = [0.78, 0.52, 0.08] as const;
/** 마모 문턱: 노이즈 합이 이 아래면 벗겨짐(≈ 15–20 % 조각). */
const WEAR_LO = 0.26;
const WEAR_HI = 0.3;

export function createDecalMaterial(lib: MaterialLibrary, env: EnvUniforms): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
  m.name = 'road_marking';
  const paint = attribute('_paint', 'float');
  const xz = positionWorld.xz.add(lib.worldOffset);
  const nb = noiseBank(xz);
  const wear = nb.n1.x.mul(0.45).add(nb.n3.w.mul(0.35)).add(nb.n9.x.mul(0.2));
  const dirt = nb.n29.y.mul(0.2).add(0.8).mul(nb.n3.z.mul(0.1).add(0.9));
  m.colorNode = mix(vec3(...WHITE), vec3(...YELLOW), paint).mul(dirt);
  m.roughnessNode = float(0.55).mul(float(1).sub(env.wetness.mul(0.55)));
  m.opacityNode = smoothstep(WEAR_LO, WEAR_HI, wear);
  m.alphaTest = 0.5;
  return m;
}
