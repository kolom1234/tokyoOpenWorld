// 소품 머티리얼(M05-T03, 07 §4): 절차 모델 정점색 × 인스턴스 색(자판기 가상 브랜드, 그 밖 흰색) — 전 종류 한 머티리얼·LOD당 풀 1개.
// 전선(power_wire): 어두운 무광 리본, 양면. 위치 = 중심선, `_off` = 모서리 방향 → 반폭 = max(1.5 cm, 거리 × WIRE_PX_K)로 펴서
// ≈ 1.5 px 선을 남기고(3 cm 리본은 20 m 밖에서 1 px 미만 → TAAU가 지운다), 110–170 m에서 폭 0으로 사라진다. see ADR-0051
import {
  attribute,
  cameraPosition,
  float,
  max,
  modelWorldMatrix,
  positionLocal,
  select,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl';
import { DoubleSide, type Material, MeshStandardNodeMaterial } from 'three/webgpu';

/** 전선 실제 반폭(m). */
const WIRE_HALF_M = 0.015;
/** 거리당 반폭 — 전체 폭 ≈ 1.5 px(1080p·렌더 스케일 0.85·세로 FOV 70° 내부 해상도 기준). */
const WIRE_PX_K = 0.0012;
/** 이 거리 사이에서 폭을 0으로 — 먼 전선이 겹쳐 검은 띠가 되지 않게(골든뷰 저층 주거지에서 확인). */
const WIRE_FADE_M = [110, 170] as const;

/** 풀 기하 = 전 종류 합침(정점 `_ptype`), 인스턴스 `_itype` — 다른 종류 정점은 원점으로 모아 퇴화(래스터에서 버려짐). */
export function createPropMaterial(): Material {
  const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.1 });
  m.name = 'street_prop';
  const same = attribute('_ptype', 'float').sub(attribute('_itype', 'float')).abs().lessThan(0.5);
  m.positionNode = select(same, positionLocal, vec3(0, 0, 0));
  return m;
}

export function createWireMaterial(): Material {
  const m = new MeshStandardNodeMaterial({ color: 0x1e1e1e, roughness: 0.7, metalness: 0.2, side: DoubleSide });
  m.name = 'power_wire';
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const dist = cameraPosition.distance(world);
  const half = max(WIRE_HALF_M, dist.mul(WIRE_PX_K)).mul(
    float(1).sub(smoothstep(WIRE_FADE_M[0], WIRE_FADE_M[1], dist)),
  );
  m.positionNode = positionLocal.add(attribute('_off', 'vec3').mul(half));
  return m;
}
