// 차량 머티리얼(07 §4 M_VEHICLE, M06-T06 — ADR-0066): 클리어코트 도장(인스턴스 색)·어두운 유리·고정 부품(정점색), 바퀴 = 축 둘레 회전(인스턴스 회전 수),
// 등화 발광 = 전조등(밤 + 낮 주간등 약하게)·후미등(밤 + 제동 flags bit0)·좌우 깜빡이(bit1·bit2, 1.5 Hz)·택시 지붕등.
// 인스턴싱 = InstancedBufferGeometry 속성(군중과 같은 이유 — 노드 빌드 1번을 풀 21개가 공유): `_ipos`(x, y, z 렌더 좌표, yaw — 전방 로컬 −Z),
// `_ivar`(바퀴 회전 수, flags, 도장 sRGB 24비트, 액센트 sRGB 24비트), `_imove`(지난 프레임 변위 x,y,z·바퀴 회전 수 — 모션 벡터). 정점 `_vpart`(부품 코드, 바퀴 축 z, 축 y, 0).
import {
  attribute,
  cos,
  Fn,
  float,
  floor,
  fract,
  mod,
  normalLocal,
  positionGeometry,
  positionLocal,
  positionPrevious,
  pow,
  select,
  sin,
  step,
  time,
  uniform,
  vec3,
  vertexColor,
} from 'three/tsl';
import { MeshPhysicalNodeMaterial, type Node as TslNode, type UniformNode } from 'three/webgpu';
import { VPART } from './builder.ts';

type F = TslNode<'float'>;
type V3 = TslNode<'vec3'>;

/** 등화 발광 배율(HDR — 신호 렌즈 6과 맞춤). */
const HEAD_EMISSIVE = 5;
const TAIL_NIGHT = 1.2;
const BRAKE_EMISSIVE = 4;
const BLINK_EMISSIVE = 6;
const BLINK_HZ = 1.5;

export interface VehicleUniforms {
  /** 밤 0..1(태양 고도 — setEnvironment). */
  readonly night: UniformNode<'float', number>;
}

export function createVehicleUniforms(): VehicleUniforms {
  return { night: uniform(0) };
}

const vpart = attribute('_vpart', 'vec4');
const ipos = attribute('_ipos', 'vec4');
const ivar = attribute('_ivar', 'vec4');
const imove = attribute('_imove', 'vec4');

const isPart = (code: number) => vpart.x.sub(code).abs().lessThan(0.5);

/** 24비트 sRGB(r·65536 + g·256 + b) → 선형. */
function unpackColor(c: F): V3 {
  const r = floor(c.div(65536));
  const g = floor(mod(c.div(256), 256));
  const b = mod(c, 256);
  return pow(vec3(r, g, b).div(255), vec3(2.2)) as unknown as V3;
}

/** flags 비트 k(0 제동·1 좌·2 우) → 0/1. */
const bit = (k: number): F => step(0.5, mod(floor(ivar.y.div(2 ** k)), 2)) as unknown as F;

function emissive(night: F): V3 {
  const blink = step(0.5, fract(time.mul(BLINK_HZ).add(ipos.x.mul(0.013)))).mul(BLINK_EMISSIVE);
  const head = night.mul(HEAD_EMISSIVE).add(0.15);
  const tail = night.mul(TAIL_NIGHT).add(bit(0).mul(BRAKE_EMISSIVE));
  const k = select(
    isPart(VPART.head),
    head,
    select(
      isPart(VPART.tail),
      tail,
      select(
        isPart(VPART.blinkL),
        bit(1).mul(blink),
        select(
          isPart(VPART.blinkR),
          bit(2).mul(blink),
          select(isPart(VPART.roofLamp), night.mul(2).add(0.3), float(0)),
        ),
      ),
    ),
  );
  return vertexColor().rgb.mul(k) as unknown as V3;
}

/** 바퀴 축 둘레 X축 회전(전진(−Z)이면 위가 앞으로 — 각 = −2π·회전 수) → yaw(+Y 반시계: x' = x·c + z·s, z' = z·c − x·s). normal = 축 이동 없음. */
function turn(v: V3, turns: F, normal: boolean): V3 {
  const wheel = isPart(VPART.wheel);
  const a = turns.mul(-2 * Math.PI);
  const ca = cos(a);
  const sa = sin(a);
  const py = normal ? v.y : v.y.sub(vpart.z);
  const pz = normal ? v.z : v.z.sub(vpart.y);
  const wy = py.mul(ca).sub(pz.mul(sa));
  const wz = py.mul(sa).add(pz.mul(ca));
  const r = select(wheel, vec3(v.x, normal ? wy : wy.add(vpart.z), normal ? wz : wz.add(vpart.y)), v);
  const c = cos(ipos.w);
  const s = sin(ipos.w);
  return vec3(r.x.mul(c).add(r.z.mul(s)), r.y, r.z.mul(c).sub(r.x.mul(s))) as unknown as V3;
}

const place = (p: V3, turns: F, at: V3): V3 => turn(p, turns, false).add(at) as unknown as V3;

export function createVehicleMaterial(u: VehicleUniforms): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.5, metalness: 0 });
  m.name = 'vehicle';
  m.positionNode = Fn(() => {
    // 모션 벡터(TAA): 이전 위치 = 지난 프레임 변위(`_imove`)만큼 되돌린 같은 변환 — 없으면 three 속도 노드가 변환 전 정점을 써서 히스토리를 버린다(계단 현상).
    positionPrevious.assign(place(positionGeometry, ivar.x.sub(imove.w), ipos.xyz.sub(imove.xyz)));
    normalLocal.assign(turn(normalLocal.xyz, ivar.x, true));
    return place(positionLocal, ivar.x, ipos.xyz);
  })();
  const paint = isPart(VPART.paint);
  const accent = isPart(VPART.accent);
  const coated = paint.or(accent);
  const glass = isPart(VPART.glass);
  m.colorNode = select(
    paint,
    unpackColor(ivar.z as unknown as F),
    select(accent, unpackColor(ivar.w as unknown as F), vertexColor().rgb),
  );
  m.roughnessNode = select(
    coated,
    float(0.34),
    select(glass, float(0.05), select(isPart(VPART.wheel), float(0.85), float(0.55))),
  );
  m.metalnessNode = select(coated, float(0.2), float(0));
  m.clearcoatNode = select(coated.or(glass), float(1), float(0));
  m.clearcoatRoughnessNode = float(0.08);
  m.emissiveNode = emissive(u.night as unknown as F);
  return m;
}

/** 태양 방향 y(사인 고도) → 밤 0..1(고도 +4.6° → −2.9°). */
export function nightFromSun(sunY: number): number {
  const t = Math.min(Math.max((0.08 - sunY) / 0.13, 0), 1);
  return t * t * (3 - 2 * t);
}
