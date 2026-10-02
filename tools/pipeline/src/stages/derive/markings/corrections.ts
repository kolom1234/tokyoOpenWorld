// OSM 횡단 선 보정(M06 사전 2): OSM 원본은 고치지 않고, content/markings/osm-crossing-corrections.json(출처 = GSI 항공사진 대조)의
// 웨이별 평행 이동(WF m)·회전(°, 웨이 중심)·폭(m)을 derive 직전에 적용한다. PLATEAU frn 横断歩道가 덮는 곳은 PLATEAU 우선(plateau.ts). see ADR-0058
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OsmRecord } from '../../normalize-osm.ts';

export const CORRECTIONS_FILE = 'content/markings/osm-crossing-corrections.json';

export interface CrossingCorrection {
  /** OSM 웨이 id(예: w355248078). */
  way: string;
  /** WF 평행 이동 [dx 동, dz 남](m). */
  shift?: [number, number];
  /** 웨이 중심 기준 회전(°, 위에서 볼 때 반시계 +). */
  rotateDeg?: number;
  /** 횡단보도 폭(m) — width 태그 대신. */
  widthM?: number;
  note?: string;
}

export interface CorrectionsFile {
  version: 1;
  source: string;
  attribution: string;
  corrections: CrossingCorrection[];
}

export function readCrossingCorrections(root: string): CrossingCorrection[] {
  const f = join(root, CORRECTIONS_FILE);
  if (!existsSync(f)) return [];
  return (JSON.parse(readFileSync(f, 'utf8')) as CorrectionsFile).corrections;
}

/** 보정 적용(복사본). 보정 없는 레코드는 그대로 공유. */
export function applyCrossingCorrections(
  osm: readonly OsmRecord[],
  corrections: readonly CrossingCorrection[],
): OsmRecord[] {
  if (!corrections.length) return [...osm];
  const byWay = new Map(corrections.map((c) => [c.way, c]));
  return osm.map((r) => {
    const c = byWay.get(r.id);
    if (!c) return r;
    const ring = r.rings[0] ?? [];
    let cx = 0;
    let cz = 0;
    const n = ring.length / 2;
    for (let i = 0; i < ring.length; i += 2) {
      cx += ring[i] as number;
      cz += ring[i + 1] as number;
    }
    cx /= n || 1;
    cz /= n || 1;
    // WF: x 동·z 남 → 위에서 볼 때 반시계 = (x, −z) 평면의 반시계.
    const a = ((c.rotateDeg ?? 0) * Math.PI) / 180;
    const [dx, dz] = c.shift ?? [0, 0];
    const out: number[] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const x = (ring[i] as number) - cx;
      const z = (ring[i + 1] as number) - cz;
      out.push(cx + x * Math.cos(a) + z * Math.sin(a) + dx, cz - x * Math.sin(a) + z * Math.cos(a) + dz);
    }
    const tags = c.widthM === undefined ? r.tags : { ...r.tags, width: String(c.widthM) };
    return { ...r, tags, rings: [out, ...r.rings.slice(1)] };
  });
}
