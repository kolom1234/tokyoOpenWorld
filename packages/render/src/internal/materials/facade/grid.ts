// 절차 파사드 ① 입력·층/베이 격자(07 §5-1·2): `_FACADE`(unorm8×4 → class·floors·tint·flags), UV0 = (면 시작점부터 m, 건물 바닥부터 m),
// UV1 = (면 폭, 건물 높이) → 층 높이·층 번호·층 안 높이, 베이 폭(면 폭에 정수 개로 맞춤)·베이 번호·베이 안 위치.
// 클래스 코드표는 tools/pipeline/src/stages/build/facade-params.ts와 같다.
import {
  attribute,
  float,
  floor,
  fract,
  int,
  max,
  min,
  normalWorld,
  select,
  uniformArray,
  varying,
  vec4,
} from 'three/tsl';
import { type Node as TslNode, Vector4 } from 'three/webgpu';

export type F = TslNode<'float'>;
export type I = TslNode<'int'>;
export type B = TslNode<'bool'>;
export type V3 = TslNode<'vec3'>;

/** `_FACADE.class` = 파이프라인 FACADE_CLASS. */
export const FACADE_CLASS = { office: 0, mansion: 1, house: 2, commercial: 3, public: 4, industrial: 5 } as const;
export const FACADE_CLASS_COUNT = 6;
/** L0 `_FACADE.flags`. */
export const FACADE_FLAG = { retail: 1, curtainWall: 2 } as const;

/**
 * 클래스별 기본값 (x 층고 m, y 베이 폭 m, z 창 폭 비, w 창 높이 비) — 07 §5: 오피스 3.8/1.8, 주거 2.9, 맨션 베이 3.0, 주택 1.8(창 드문드문).
 * 순서 = FACADE_CLASS.
 */
const CLASS_TABLE = [
  new Vector4(3.8, 1.8, 0.82, 0.55), // office
  new Vector4(2.9, 3.0, 0.62, 0.62), // mansion
  new Vector4(2.9, 2.2, 0.5, 0.45), // house
  new Vector4(3.6, 2.6, 0.78, 0.5), // commercial
  new Vector4(3.8, 3.0, 0.7, 0.5), // public
  new Vector4(4.5, 6.0, 0.35, 0.25), // industrial
];
/** 상점 1층 층고(m, 07 §5-1). */
export const RETAIL_FLOOR_M = 4.5;
/** 층고 보정 범위(`floors`로 나눈 값이 이상할 때). */
const FLOOR_MIN_M = 2.5;
const FLOOR_MAX_M = 6.0;

export interface FacadeInputs {
  cls: I;
  floors: F;
  /** 0..255 건물 해시. */
  tint: F;
  flags: F;
  /** 0..15 창 패턴 시드(flags 상위 4비트). */
  seed: F;
  retail: B;
  curtain: B;
  isRoof: B;
  u: F;
  v: F;
  faceW: F;
  bldgH: F;
}

/** flags의 비트 b(1, 2, 4 …): floor(flags / b)가 홀수인가. */
const bit = (flags: F, b: number): B => fract(flags.div(b).floor().div(2)).greaterThan(0.25);

export function facadeInputs(): FacadeInputs {
  // 면·건물 상수(`_facade`, UV1)는 flat varying: 같은 값을 보간해도 b0+b1+b2 ≠ 1 오차가 생겨, 면 폭/베이 폭 + 0.5가 정수 경계(건축 모듈상 흔함)면
  // 베이 수가 픽셀마다 뒤집혀 창 격자가 흘러내린 줄무늬가 된다(실측). 정수 반올림은 그래도 프래그먼트에서 한 번 더.
  const f = varying(attribute('_facade', 'vec4').mul(255), 'v_facade').setInterpolation('flat').add(0.5).floor();
  const uv0 = attribute('uv', 'vec2');
  const uv1 = varying(attribute('uv1', 'vec2'), 'v_uv1').setInterpolation('flat');
  const flags = f.w;
  return {
    cls: int(f.x.min(FACADE_CLASS_COUNT - 1)),
    floors: f.y,
    tint: f.z,
    flags,
    seed: flags.div(16).floor(),
    retail: bit(flags, FACADE_FLAG.retail),
    curtain: bit(flags, FACADE_FLAG.curtainWall),
    isRoof: normalWorld.y.abs().greaterThan(0.7),
    u: uv0.x,
    v: uv0.y,
    faceW: uv1.x,
    bldgH: uv1.y,
  };
}

export interface FacadeGrid {
  /** (층고, 베이 폭, 창 폭 비, 창 높이 비) 클래스 기본값. */
  params: TslNode<'vec4'>;
  floorH: F;
  /** 0 = 1층. */
  floorIdx: F;
  /** 층 바닥부터 높이(m). */
  ly: F;
  /** 이 층의 높이(m) — 상점 1층은 RETAIL_FLOOR_M. */
  thisFloorH: F;
  bayW: F;
  bayIdx: F;
  /** 베이 왼쪽부터(m). */
  lx: F;
  isGround: B;
  /** 옥상 난간 띠(건물 높이 − 0.8 m 이상) — 창 없음. */
  isParapet: B;
}

const table = uniformArray<'vec4'>(CLASS_TABLE, 'vec4');

export function facadeGrid(i: FacadeInputs): FacadeGrid {
  const params = vec4(table.element(i.cls));
  const groundH = select(i.retail, float(RETAIL_FLOOR_M), params.x);
  // floors가 있으면 (건물 높이 − 1층) / (floors − 1)로 보정, 범위 밖이면 클래스 기본값.
  const restFloors = max(i.floors.sub(1), 1);
  const fitted = i.bldgH.sub(groundH).div(restFloors);
  const floorH = select(fitted.greaterThan(FLOOR_MIN_M).and(fitted.lessThan(FLOOR_MAX_M)), fitted, params.x);
  const above = i.v.sub(groundH);
  const isGround = above.lessThan(0);
  const floorIdx = select(isGround, float(0), floor(above.div(floorH)).add(1));
  const ly = select(isGround, i.v, above.sub(floorIdx.sub(1).mul(floorH)));
  const thisFloorH = select(isGround, groundH, floorH);
  const bayTarget = select(i.curtain, float(1.5), params.y);
  const bays = max(floor(i.faceW.div(bayTarget).add(0.5)), 1);
  const bayW = i.faceW.div(bays).max(0.01);
  const bayIdx = min(floor(i.u.div(bayW)), bays.sub(1));
  const lx = i.u.sub(bayIdx.mul(bayW));
  return {
    params,
    floorH,
    floorIdx,
    ly,
    thisFloorH,
    bayW,
    bayIdx,
    lx,
    isGround,
    isParapet: i.v.greaterThan(i.bldgH.sub(0.8)),
  };
}
