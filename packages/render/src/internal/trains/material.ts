// 열차 머티리얼(07 §4 M_VEHICLE 계열, M07-T03 — ADR-0072): 스테인리스(금속)·어두운 유리·노선색 띠(인스턴스 24비트 색)·고정 부품(정점색),
// 미닫이 문짝(`_vpart.y` 방향 × 열림 × 0.62 m — 열림 = max(0, 문 × `_vpart.z` 쪽)), 등화 발광(전조등 — 낮에도 켬·미등·실내등·안내 화면).
// 인스턴싱 = InstancedBufferGeometry 속성(차량과 같은 이유): `_ipos`(x, y, z 렌더 좌표, yaw — 전방 로컬 −Z), `_ivar`(pitch, 문 −1..1, 노선색, 0),
// `_imove`(지난 프레임 변위 x,y,z, 0 — 모션 벡터·TAA). 정점 `_vpart`(부품 코드, 문짝 방향, 문짝 쪽, 0). 정점 버퍼 7 ≤ 8.
import {
  attribute,
  cos,
  Fn,
  float,
  floor,
  max,
  mod,
  normalLocal,
  positionGeometry,
  positionLocal,
  positionPrevious,
  pow,
  select,
  sin,
  vec3,
  vertexColor,
} from 'three/tsl';
import { MeshPhysicalNodeMaterial, type Node as TslNode } from 'three/webgpu';
import { VPART } from '../vehicles/builder.ts';
import type { VehicleUniforms } from '../vehicles/material.ts';

type F = TslNode<'float'>;
type V3 = TslNode<'vec3'>;

/** 문짝 미닫이 거리(m) — 문 폭 1.3 m의 반쪽이 거의 다 들어간다. */
export const DOOR_SLIDE_M = 0.62;

const vpart = attribute('_vpart', 'vec4');
const ipos = attribute('_ipos', 'vec4');
const ivar = attribute('_ivar', 'vec4');
const imove = attribute('_imove', 'vec4');

const isPart = (code: number) => vpart.x.sub(code).abs().lessThan(0.5);

function unpackColor(c: F): V3 {
  const r = floor(c.div(65536));
  const g = floor(mod(c.div(256), 256));
  const b = mod(c, 256);
  return pow(vec3(r, g, b).div(255), vec3(2.2)) as unknown as V3;
}

/** 로컬 → 문짝 미닫이(점만) → pitch(X축, 앞 −Z가 위로 +) → yaw(Y축 — 차량과 같은 규약). */
function orient(v: V3, point: boolean): V3 {
  const open = max(ivar.y.mul(vpart.z), 0);
  const slide = select(isPart(VPART.doorLeaf), vpart.y.mul(open).mul(DOOR_SLIDE_M), float(0));
  const p = point ? vec3(v.x, v.y, v.z.add(slide)) : v;
  const cp = cos(ivar.x);
  const sp = sin(ivar.x);
  const y1 = p.y.mul(cp).sub(p.z.mul(sp));
  const z1 = p.y.mul(sp).add(p.z.mul(cp));
  const c = cos(ipos.w);
  const s = sin(ipos.w);
  return vec3(p.x.mul(c).add(z1.mul(s)), y1, z1.mul(c).sub(p.x.mul(s))) as unknown as V3;
}

function emissive(night: F): V3 {
  const head = night.mul(4).add(1.5);
  const lcd = vec3(0.12, 0.3, 0.55).mul(2.2);
  const k = select(
    isPart(VPART.head),
    head,
    select(isPart(VPART.tail), float(2.5), select(isPart(VPART.cabinLight), night.add(2.2), float(0))),
  );
  return select(isPart(VPART.lcd), lcd, vertexColor().rgb.mul(k)) as unknown as V3;
}

export function createTrainMaterial(u: VehicleUniforms): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.55, metalness: 0 });
  m.name = 'train';
  m.positionNode = Fn(() => {
    // 모션 벡터(TAA): 이전 위치 = 같은 자세에서 지난 프레임 변위만큼 뒤(열차는 프레임마다 정확한 값 — 외삽 없음).
    positionPrevious.assign(orient(positionGeometry, true).add(ipos.xyz.sub(imove.xyz)));
    normalLocal.assign(orient(normalLocal.xyz, false));
    return orient(positionLocal, true).add(ipos.xyz);
  })();
  const paint = isPart(VPART.paint);
  const steel = isPart(VPART.stainless).or(isPart(VPART.doorLeaf));
  const glass = isPart(VPART.glass);
  m.colorNode = select(paint, unpackColor(ivar.z as unknown as F), vertexColor().rgb);
  // 스테인리스: 금속도 0.7은 옆면이 지평선 아래 환경을 비춰 짙은 회색(실제 GPU — M07-T04) → 0.35·거칠기 0.4로 밝은 은색.
  m.roughnessNode = select(steel, float(0.4), select(glass, float(0.05), select(paint, float(0.4), float(0.6))));
  m.metalnessNode = select(steel, float(0.35), select(paint, float(0.15), float(0)));
  m.clearcoatNode = select(glass.or(paint), float(1), float(0));
  m.clearcoatRoughnessNode = float(0.06);
  m.emissiveNode = emissive(u.night as unknown as F);
  return m;
}
