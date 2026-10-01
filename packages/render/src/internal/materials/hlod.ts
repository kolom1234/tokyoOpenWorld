// HLOD 머티리얼: 기본 단색 PBR + 자식 16영역 표시·디더 페이드. 셀별 페이드 16개는 per-object uniform(vec4 × 4, objectGroup)으로,
// 정점 `_child`(0..15)가 자기 값을 고른다 → 셀당 draw 2개로 자식을 따로 숨긴다. 페이드 0 = 정점 붕괴(래스터 없음), 0 < f < 1 = alphaHash 디더.
// 디더(discard)는 깊이 쓰기를 늦춰 원경 겹침 비용을 키운다 → 평소엔 불투명 변형, 페이드 중인 셀만 alphaHash 변형(ADR-0039, cell-node syncHlodMaterials).
// see docs/06-world-streaming.md §5, docs/05-tile-format.md §4(hlod.mesh), ADR-0024
import {
  abs,
  attribute,
  dot,
  float,
  hash,
  max,
  normalWorld,
  positionLocal,
  select,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { type Material, MeshStandardNodeMaterial, type Object3D, type Node as TslNode, Vector4 } from 'three/webgpu';

/** 셀 메시 userData에 두는 페이드(자식 4개씩 vec4 × 4). 같은 셀의 지형·건물 메시가 같은 배열을 공유한다. */
export interface HlodFadeData {
  hlodFade: readonly [Vector4, Vector4, Vector4, Vector4];
}

export function createHlodFades(): HlodFadeData['hlodFade'] {
  return [new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1)];
}

const FALLBACK = [new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1)];

function fadesOf(object: Object3D | null | undefined): readonly Vector4[] {
  return (object?.userData as Partial<HlodFadeData> | undefined)?.hlodFade ?? FALLBACK;
}

/**
 * 건물 HLOD 색 변화(M05-T07): `_facade.z`(건물 해시)로 벽 명도 ±15 %, 평지붕(ny > 0.97)은 L0 파사드(walls.ts)와 같은 방수 마감 색
 * (녹색 우레탄·밝은 시트·짙은 시트) — 상공 원경의 균일한 회색 지붕을 깬다.
 */
function buildingTint(base: number): TslNode<'vec3'> {
  const tint = attribute('_facade', 'vec4').z.mul(255).add(0.5).floor();
  const rh = hash(tint.add(0.61));
  const coat = select(
    rh.lessThan(0.3),
    vec3(0.58, 0.78, 0.62),
    select(rh.lessThan(0.5), vec3(1.15, 1.15, 1.12), select(rh.lessThan(0.6), vec3(0.62, 0.62, 0.64), vec3(1))),
  );
  const wall = vec3(float(0.85).add(hash(tint.add(0.25)).mul(0.3)));
  const c = [(base >> 16) & 255, (base >> 8) & 255, base & 255].map((v) => (v / 255) ** 2.2) as [
    number,
    number,
    number,
  ];
  return vec3(...c).mul(select(normalWorld.y.greaterThan(0.97), coat, wall));
}

/** color·roughness 단색 PBR + 자식 페이드. 머티리얼 ID × {불투명, 페이드} 1개씩(모든 HLOD 셀 공유 → 파이프라인 2개). 건물(facade_default)은 해시 색 변화. */
export function createHlodMaterial(name: string, color: number, roughness: number, fading = false): Material {
  const m = new MeshStandardNodeMaterial({ color, roughness, metalness: 0 });
  if (name === 'facade_default') m.colorNode = buildingTint(color);
  m.name = fading ? `hlod:${name}:fade` : `hlod:${name}`;
  m.alphaHash = fading;
  const groups = [0, 1, 2, 3].map((g) =>
    uniform(new Vector4(1, 1, 1, 1), 'vec4').onObjectUpdate(({ object }) => fadesOf(object)[g]),
  );
  const child = attribute('_child', 'float');
  // 원-핫 가중: max(0, 1 − |child − k|) — 정수 child에서 정확히 한 성분만 1.
  const weight = (g: number) =>
    max(vec4(0), vec4(1).sub(abs(vec4(child).sub(vec4(g * 4, g * 4 + 1, g * 4 + 2, g * 4 + 3)))));
  const [g0, g1, g2, g3] = groups as [
    (typeof groups)[number],
    (typeof groups)[number],
    (typeof groups)[number],
    (typeof groups)[number],
  ];
  const fade = dot(g0, weight(0))
    .add(dot(g1, weight(1)))
    .add(dot(g2, weight(2)))
    .add(dot(g3, weight(3)));
  m.opacityNode = fade;
  // 완전히 숨긴 자식은 정점을 원점으로 붕괴 → 삼각형 퇴화(프래그먼트 비용 0).
  m.positionNode = positionLocal.mul(step(0.001, fade));
  return m;
}
