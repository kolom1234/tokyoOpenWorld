// JIS X 0410 지역 메시(3차, ≈1 km) 코드. PLATEAU 원천 파일은 3차 메시 단위로 나뉜다. see docs/modules/geo.md
import type { LonLatBBox } from '../api.ts';

/** 3차 메시 한 칸: 위도 30″(1/120°), 경도 45″(1/80°). */
const LAT_STEPS_PER_DEG = 120;
const LON_STEPS_PER_DEG = 80;
/** 1차 메시 경도 코드 = 경도 − 100. */
const LON_ORIGIN_DEG = 100;
/** 1차 메시는 3차 메시 80칸, 2차 메시는 10칸. */
const PRIMARY_STEPS = 80;
const SECONDARY_STEPS = 10;
/** 부동소수 경계 보정(도). 1e-9° ≈ 0.1 mm. 경계 위 점은 북·동쪽 메시에 속한다. */
const EPS_DEG = 1e-9;

function codeOf(latIdx: number, lonIdx: number): string {
  const p = Math.floor(latIdx / PRIMARY_STEPS);
  const u = Math.floor(lonIdx / PRIMARY_STEPS);
  const a = Math.floor((latIdx % PRIMARY_STEPS) / SECONDARY_STEPS);
  const b = Math.floor((lonIdx % PRIMARY_STEPS) / SECONDARY_STEPS);
  return `${p}${u}${a}${b}${latIdx % SECONDARY_STEPS}${lonIdx % SECONDARY_STEPS}`;
}

function latIndex(lat: number): number {
  return Math.floor(lat * LAT_STEPS_PER_DEG + EPS_DEG);
}

function lonIndex(lon: number): number {
  return Math.floor((lon - LON_ORIGIN_DEG) * LON_STEPS_PER_DEG + EPS_DEG);
}

/** 위경도(EPSG:6668) 한 점의 3차 메시 코드(8자리). 일본 영역(위도 20–46°, 경도 122–154°) 밖은 RangeError. */
export function jisMesh3Of(lat: number, lon: number): string {
  if (!(lat >= 20 && lat < 46 && lon >= 122 && lon < 154)) {
    throw new RangeError(`jisMesh3Of: (${lat}, ${lon}) outside Japan mesh range`);
  }
  return codeOf(latIndex(lat), lonIndex(lon));
}

/** 위경도 상자와 겹치는 3차 메시 코드(남→북, 서→동 순). */
export function jisMesh3CodesInBBox(b: LonLatBBox): string[] {
  jisMesh3Of(b.south, b.west);
  jisMesh3Of(b.north, b.east);
  const out: string[] = [];
  for (let i = latIndex(b.south); i <= latIndex(b.north); i++) {
    for (let j = lonIndex(b.west); j <= lonIndex(b.east); j++) out.push(codeOf(i, j));
  }
  return out;
}
