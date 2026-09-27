// GEO(EPSG:6668/6697) ↔ PRJ(EPSG:6677) ↔ WF 변환. 좌표계 변환의 유일한 구현. see docs/01-architecture.md §7
import type { Vec3d } from '@sanpo/core';
import proj4 from 'proj4';
import { type LonLat, type PrjCoord, WORLD_ORIGIN } from '../api.ts';
import { DEF_EPSG_6668, DEF_EPSG_6677 } from './crs-defs.ts';

// 모듈 로드 시 1회 생성(정의 파싱 비용을 호출마다 치르지 않도록).
const geoToPrj = proj4(DEF_EPSG_6668, DEF_EPSG_6677);

function assertFinite(fn: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) throw new RangeError(`${fn}: non-finite input ${v}`);
  }
}

/** EPSG:6668 위경도(도) → EPSG:6677 (미터). 높이는 변환하지 않는다. */
export function lonLatToPrj(ll: LonLat, heightTP = 0): PrjCoord {
  assertFinite('lonLatToPrj', ll.lon, ll.lat, heightTP);
  const [easting, northing] = geoToPrj.forward([ll.lon, ll.lat]) as [number, number];
  return { northing, easting, heightTP };
}

/** EPSG:6677 (미터) → EPSG:6668 위경도(도). */
export function prjToLonLat(prj: PrjCoord): LonLat & { heightTP: number } {
  assertFinite('prjToLonLat', prj.northing, prj.easting, prj.heightTP);
  const [lon, lat] = geoToPrj.inverse([prj.easting, prj.northing]) as [number, number];
  return { lon, lat, heightTP: prj.heightTP };
}

/** EPSG:6677 → WF. 인자 순서는 공식 축순서(X=북, Y=동)를 따른다. */
export function prjToWF(northing: number, easting: number, heightTP: number): Vec3d {
  return { x: easting - WORLD_ORIGIN.E0, y: heightTP, z: -(northing - WORLD_ORIGIN.N0) };
}

/** WF → EPSG:6677. */
export function wfToPrj(p: Vec3d): PrjCoord {
  return { northing: WORLD_ORIGIN.N0 - p.z, easting: p.x + WORLD_ORIGIN.E0, heightTP: p.y };
}

/** 위경도(도, EPSG:6668) + T.P. 표고(m) → WF(m). */
export function lonLatToWF(ll: LonLat, heightTP = 0): Vec3d {
  const prj = lonLatToPrj(ll, heightTP);
  return prjToWF(prj.northing, prj.easting, prj.heightTP);
}

/** WF(m) → 위경도(도, EPSG:6668) + T.P. 표고(m). */
export function wfToLonLat(p: Vec3d): LonLat & { heightTP: number } {
  return prjToLonLat(wfToPrj(p));
}
