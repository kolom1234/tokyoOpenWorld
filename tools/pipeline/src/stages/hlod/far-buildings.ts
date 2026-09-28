// 원경 건물 레코드(FarBuilding): PLATEAU 건물 → 중심점·방향 사각형(OBB)·바닥 높이·높이·바닥 면적·용도. L2/L3·영역 밖 L1 HLOD 입력.
// 중심점 = normalize와 같은 centroidXZ(모든 면 외곽 링 정점 평균) → 레벨 간 셀 소속이 일치한다. see docs/04-data-pipeline.md §4.5
import { hash32, WORLD_SEED } from '@sanpo/core';
import { convexHull, minAreaRect, type Obb, type P2, polygonArea } from '../../lib/geom2d.ts';
import { centroidXZ } from '../../readers/plateau/geometry.ts';
import type { BuildingRecord } from '../../readers/plateau/types.ts';

export interface FarBuilding {
  id: string;
  cx: number;
  cz: number;
  /** 최저 정점 높이(WF y). */
  y0: number;
  /** 최고 − 최저(m). */
  h: number;
  /** 바닥면(ground) 수평 면적, 없으면 볼록 껍질 면적(m²). */
  area: number;
  obb: Obb;
  usage: string | null;
  storeys: number | null;
}

/** 이보다 낮은 건물(구조물 조각 등)은 원경에서 버린다(m). */
const MIN_HEIGHT_M = 2;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export function farBuildingOf(b: BuildingRecord): FarBuilding | null {
  const c = centroidXZ(b.surfaces.map((s) => s.ringsWF));
  if (!c) return null;
  const pts: P2[] = [];
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  let groundArea = 0;
  for (const s of b.surfaces) {
    const outer = s.ringsWF[0] ?? [];
    const ring: P2[] = [];
    for (let i = 0; i + 2 < outer.length; i += 3) {
      const p: P2 = [outer[i] as number, outer[i + 2] as number];
      ring.push(p);
      pts.push(p);
      y0 = Math.min(y0, outer[i + 1] as number);
      y1 = Math.max(y1, outer[i + 1] as number);
    }
    if (s.kind === 'ground') groundArea += polygonArea(ring);
  }
  const h = y1 - y0;
  if (!(h >= MIN_HEIGHT_M) || pts.length < 3) return null;
  const hull = convexHull(pts);
  const obb = minAreaRect(hull);
  const area = groundArea > 0 ? groundArea : polygonArea(hull);
  return { id: b.gmlId, cx: c.x, cz: c.z, y0, h, area, obb, usage: b.usage, storeys: b.storeys };
}

/** 한 줄 직렬화(배열, cm 반올림) — 파일이 작고 키 순서 문제가 없다. */
export function farToLine(f: FarBuilding): string {
  const o = f.obb;
  return JSON.stringify([
    f.id,
    r2(f.cx),
    r2(f.cz),
    r2(f.y0),
    r2(f.h),
    r2(f.area),
    r2(o.cx),
    r2(o.cz),
    Math.round(o.ux * 1e6) / 1e6,
    Math.round(o.uz * 1e6) / 1e6,
    r2(o.hu),
    r2(o.hv),
    f.usage,
    f.storeys,
  ]);
}

type Row = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string | null,
  number | null,
];

export function farFromRow(r: Row): FarBuilding {
  const [id, cx, cz, y0, h, area, ocx, ocz, ux, uz, hu, hv, usage, storeys] = r;
  return { id, cx, cz, y0, h, area, obb: { cx: ocx, cz: ocz, ux, uz, hu, hv }, usage, storeys };
}

/** 층수: storeys 또는 높이 / 3.5 m, 1…255. */
export function floorsOf(storeys: number | null, h: number): number {
  return Math.min(Math.max(storeys ?? Math.round(h / 3.5), 1), 255);
}

/**
 * 야간 창 발광 단계(0–15) — 용도 코드(PLATEAU Building_usage)별 점등률. 상업·업무가 밝고 창고·공장은 어둡다.
 * 코드표: 401 業務, 402 商業, 403 宿泊, 404 商業系複合, 411–415 住宅系, 421 官公庁, 422 文教厚生, 431 運輸倉庫, 441 工場.
 */
const NIGHT_LEVEL: Readonly<Record<string, number>> = {
  '401': 10,
  '402': 13,
  '403': 9,
  '404': 12,
  '411': 6,
  '412': 7,
  '413': 8,
  '414': 8,
  '415': 7,
  '421': 5,
  '422': 4,
  '431': 2,
  '441': 2,
};
const NIGHT_DEFAULT = 6;

/**
 * `_FACADE.flags`(HLOD 전용, 05 §4 hlod.mesh): 하위 4비트 = 야간 점등 단계, 상위 4비트 = 창 패턴 시드(건물 id 해시).
 * 렌더(M03 대기·조명)가 `단계/15 × 층수` 비율로 창을 켠다.
 */
export function nightFlags(usage: string | null, id: string): number {
  const level = (usage ? NIGHT_LEVEL[usage] : undefined) ?? NIGHT_DEFAULT;
  const seed = hash32(WORLD_SEED, 'hlod-night', id) & 0xf;
  return (level & 0xf) | (seed << 4);
}
