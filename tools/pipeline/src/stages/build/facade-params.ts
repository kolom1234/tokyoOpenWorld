// 절차 파사드 파라미터(M03-T04, 07 §5): PLATEAU 건물 용도 코드·높이·층수 → `_FACADE`(u8×4: class, floors, tintIdx, flags).
// 렌더 파사드 셰이더(packages/render materials/facade/*)가 같은 코드표를 쓴다 — 바꾸면 양쪽 + 05 §4를 함께 갱신.
import { hash32, WORLD_SEED } from '@sanpo/core';

/** `_FACADE.class`(05 §4). 렌더 `FACADE_CLASS`와 같은 값. */
export const FACADE_CLASS = { office: 0, mansion: 1, house: 2, commercial: 3, public: 4, industrial: 5 } as const;
export type FacadeClass = (typeof FACADE_CLASS)[keyof typeof FACADE_CLASS];

/** L0 `_FACADE.flags` 비트(HLOD는 다른 의미 — 05 §4 hlod.mesh). */
export const FACADE_FLAG = {
  /** 1층 상점(셔터·차양·쇼윈도). */
  retail: 1,
  /** 유리 커튼월 위주(초고층 오피스) — 유리·반사는 M03-T05. */
  curtainWall: 2,
} as const;

/** 건물 용도 코드(PLATEAU Building_usage, 建物利用現況) → 클래스. 없는 코드는 높이로 판단. */
const USAGE_CLASS: Readonly<Record<string, FacadeClass>> = {
  '401': FACADE_CLASS.office,
  '402': FACADE_CLASS.commercial,
  '403': FACADE_CLASS.mansion, // 숙박(호텔) — 반복 객실 창
  '404': FACADE_CLASS.commercial,
  '411': FACADE_CLASS.house,
  '412': FACADE_CLASS.mansion,
  '413': FACADE_CLASS.house, // 점포 겸용 주택
  '414': FACADE_CLASS.mansion, // 점포 겸용 공동주택
  '415': FACADE_CLASS.house,
  '421': FACADE_CLASS.public,
  '422': FACADE_CLASS.public,
  '431': FACADE_CLASS.industrial,
  '441': FACADE_CLASS.industrial,
};
/** 1층 상점이 있는 용도(점포 겸용). 상업 클래스는 항상. */
const RETAIL_USAGE = new Set(['413', '414']);
/** 주택이 이보다 높으면 맨션으로(PLATEAU 411 오분류·대형 주택 대응). */
const HOUSE_MAX_M = 15;
/** 커튼월: 오피스가 이 높이 이상이면 항상, OFFICE_GLASS_M 이상이면 해시 40%. */
const TOWER_GLASS_M = 90;
const OFFICE_GLASS_M = 35;

function classOf(usage: string | null, heightM: number): FacadeClass {
  const c = usage ? USAGE_CLASS[usage] : undefined;
  if (c === FACADE_CLASS.house && heightM > HOUSE_MAX_M) return FACADE_CLASS.mansion;
  if (c !== undefined) return c;
  // 미상(454·461·null): 높이로 추정.
  if (heightM >= 31) return FACADE_CLASS.office;
  return heightM >= 10 ? FACADE_CLASS.mansion : FACADE_CLASS.house;
}

export interface FacadeInput {
  /** 결정론 시드(gmlId 등). */
  id: string;
  usage: string | null;
  heightM: number;
  floors: number;
}

/** `_FACADE` 4바이트. tintIdx = 건물 해시(재질·색 선택), flags 상위 4비트 = 창 패턴 시드. */
export function facadeParams(b: FacadeInput): [number, number, number, number] {
  const h = hash32(WORLD_SEED, 'facade', b.id);
  const cls = classOf(b.usage, b.heightM);
  let flags = (h >>> 12) & 0xf0;
  const retail =
    cls === FACADE_CLASS.commercial ||
    (b.usage !== null && RETAIL_USAGE.has(b.usage)) ||
    (cls === FACADE_CLASS.office && b.heightM < 60 && (h & 0x300) !== 0);
  if (retail && b.floors >= 1) flags |= FACADE_FLAG.retail;
  const glassy =
    cls === FACADE_CLASS.office &&
    (b.heightM >= TOWER_GLASS_M || (b.heightM >= OFFICE_GLASS_M && ((h >>> 20) & 0xff) < 102));
  if (glassy) flags |= FACADE_FLAG.curtainWall;
  return [cls, Math.min(Math.max(b.floors, 1), 255), h & 0xff, flags];
}
