// 절차 파사드 ⑥ 맨션 발코니(07 §5-7, M05-T07): 맨션 클래스 2층 이상 층마다 — 앞 난간판(층 바닥 0.12–1.1 m, 건물마다 유리풍 또는 콘크리트 판),
// 슬래브 끝(0–0.12 m 밝은 콘크리트), 베이 경계 칸막이(0.12 m). 그 뒤 벽·창은 깊이 1.2 m 시차(POM 한 단계 — 시선 방향으로 u·v를 밀어 창 격자를 다시 셈),
// 슬래브 아래 그늘(천장 0.6 m AO). 기하 추가 없음(파이프라인 슬래브 압출은 필요할 때 ADR). see ADR-0055
import {
  cameraPosition,
  float,
  hash,
  max,
  mix,
  normalWorld,
  positionWorld,
  select,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node as TslNode } from 'three/webgpu';
import type { B, F, FacadeGrid, FacadeInputs, V3 } from './grid.ts';
import { FACADE_CLASS } from './grid.ts';

/** 발코니 깊이(m) — 난간판에서 안쪽 벽까지. */
const DEPTH_M = 1.2;
const RAIL_TOP_M = 1.1;
const SLAB_M = 0.12;
const FIN_M = 0.12;

type V2 = TslNode<'vec2'>;

export interface BalconySample {
  /** 이 픽셀이 발코니 층(맨션 2층 이상, 난간 띠·지붕 아님)인가. */
  active: B;
  /** 앞면(슬래브 끝·난간판·칸막이) 덮임 0..1 — 창·유리를 가린다. */
  front: F;
  albedo: V3;
  roughness: F;
  /** 안쪽(시차 면) 차폐 배수. */
  ao: F;
  /** 안쪽 벽 좌표 이동(u, v) m — 창 격자를 다시 셀 때 뺀다. */
  shift: V2;
}

export function facadeBalcony(i: FacadeInputs, g: FacadeGrid, t: V3, b: V3): BalconySample {
  const active = i.cls
    .equal(FACADE_CLASS.mansion)
    .and(g.isGround.not())
    .and(g.isParapet.not())
    .and(i.isRoof.not())
    .and(i.faceW.greaterThan(2));
  const view = cameraPosition.sub(positionWorld).normalize();
  const vn = max(view.dot(normalWorld), 0.25);
  const shift = vec2(view.dot(t), view.dot(b)).mul(float(DEPTH_M).div(vn));
  const slab = float(1).sub(smoothstep(SLAB_M - 0.02, SLAB_M, g.ly));
  const rail = smoothstep(SLAB_M - 0.01, SLAB_M, g.ly).mul(
    float(1).sub(smoothstep(RAIL_TOP_M - 0.02, RAIL_TOP_M, g.ly)),
  );
  const edge = g.lx.min(g.bayW.sub(g.lx));
  const fin = float(1).sub(smoothstep(FIN_M * 0.5 - 0.01, FIN_M * 0.5, edge));
  const front = slab.add(rail).add(fin).min(1);
  const glassy = hash(i.tint.add(0.37)).lessThan(0.5);
  const railColor = select(glassy, vec3(0.32, 0.36, 0.38), vec3(0.52, 0.5, 0.47));
  const albedo = mix(mix(railColor, vec3(0.58, 0.57, 0.55), slab), vec3(0.5, 0.49, 0.47), fin);
  const roughness = mix(select(glassy, float(0.25), float(0.85)), float(0.85), slab.max(fin));
  // 안쪽: 천장(시차 좌표의 층 위쪽) 그늘 + 전체 약간 어둡게.
  const lyIn = g.ly.sub(shift.y);
  const ao = float(0.82).mul(float(1).sub(smoothstep(g.thisFloorH.sub(0.6), g.thisFloorH, lyIn).mul(0.4)));
  return {
    active,
    front: select(active, front, float(0)),
    albedo,
    roughness,
    ao: select(active, ao, float(1)),
    shift: select(active, shift, vec2(0, 0)),
  };
}
