// 소품 머티리얼(M05-T03, 07 §4): 절차 모델 정점색 × 인스턴스 색(자판기 가상 브랜드, 그 밖 흰색) — 전 종류 한 머티리얼·한 파이프라인.
// 전선(power_wire): 어두운 무광 리본, 양면. 위치 = 중심선, `_off` = 모서리 방향 → 반폭 = max(1.5 cm, 거리 × WIRE_PX_K)로 펴서
// 멀리서도 ≈ 1 px 선이 남는다(3 cm 리본은 20 m 밖에서 1 px 미만 → TAAU가 지운다). see ADR-0051
import { attribute, cameraPosition, max, modelWorldMatrix, positionLocal, vec4 } from 'three/tsl';
import { DoubleSide, type Material, MeshStandardNodeMaterial } from 'three/webgpu';

/** 전선 실제 반폭(m). */
const WIRE_HALF_M = 0.015;
/** 거리당 반폭 — 전체 폭 ≈ 1.5 px(720p·렌더 스케일 0.7·세로 FOV 70°의 내부 해상도 기준, 1080p 네이티브 ≈ 2 px). */
const WIRE_PX_K = 0.0018;

export function createPropMaterial(): Material {
  const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.1 });
  m.name = 'street_prop';
  return m;
}

export function createWireMaterial(): Material {
  const m = new MeshStandardNodeMaterial({ color: 0x1e1e1e, roughness: 0.7, metalness: 0.2, side: DoubleSide });
  m.name = 'power_wire';
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const half = max(WIRE_HALF_M, cameraPosition.distance(world).mul(WIRE_PX_K));
  m.positionNode = positionLocal.add(attribute('_off', 'vec3').mul(half));
  return m;
}
