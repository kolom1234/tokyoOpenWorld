// `pnpm pipeline normalize --layer areas`(M10-T02): e-Stat 소지역 2020(구별 shp, JGD2011 경위도) + KEN_ALL 가나 → data/normalized/areas/places.json
// { code, name{ja,en,ko}, rings: [[x, z]…][] (WF m, 바깥 링만 — 단순화 1.5 m) }. 영역 밖 町丁은 버린다. HCODE 8101(町丁・字等)만(8154 수면 제외).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { lonLatToWF } from '@sanpo/geo';
import type { I18nText } from '@sanpo/tile-format';
import { parseKenAll, placeName } from './names.ts';
import { readDbf, readShpPolygons } from './shapefile.ts';

export interface PlaceRecord {
  code: string;
  name: I18nText;
  /** WF (x, z) 바깥 링(닫힘 점 제외). */
  rings: [number, number][][];
}

export interface BoundsWF {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 단순화 허용 오차(m) — HUD 지명 경계(≤ 0.5 s 갱신)에 충분, 셀 meta 크기 절약. */
const SIMPLIFY_M = 1.5;

/** Douglas–Peucker(닫힌 링 — 첫·끝 고정). */
export function simplifyRing(pts: readonly [number, number][], tol: number): [number, number][] {
  if (pts.length <= 4) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, az] = pts[a] as [number, number];
    const [bx, bz] = pts[b] as [number, number];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, pz] = pts[i] as [number, number];
      const d = Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/** 신발끈 면적(부호 — 시계 방향 바깥 = ESRI 경위도에서 음). */
function signedArea(r: readonly [number, number][]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i] as [number, number];
    const [x1, y1] = r[(i + 1) % r.length] as [number, number];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

function toWF(ring: readonly [number, number][]): [number, number][] {
  return ring.map(([lon, lat]) => {
    const p = lonLatToWF({ lon, lat });
    return [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100] as [number, number];
  });
}

const overlaps = (r: readonly [number, number][], b: BoundsWF): boolean =>
  r.some(([x, z]) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);

export interface AreasResult {
  places: PlaceRecord[];
  missingReadings: string[];
}

/** 원천 디렉터리 → 영역 안 町丁 목록. */
export function normalizeAreas(estatDir: string, kenAllCsv: string, bounds: BoundsWF): AreasResult {
  const files = readdirShp(estatDir);
  const wardCodes = new Set(files.map((f) => `13${f.code}`));
  const readings = parseKenAll(kenAllCsv, wardCodes);
  const places: PlaceRecord[] = [];
  const missing: string[] = [];
  for (const f of files) {
    const polys = readShpPolygons(readFileSync(join(estatDir, `r2ka13${f.code}.shp`)));
    const recs = readDbf(readFileSync(join(estatDir, `r2ka13${f.code}.dbf`)));
    recs.forEach((rec, i) => {
      if (rec.HCODE !== '8101') return;
      // 바깥 링 = 시계 방향(경위도 신발끈 음수).
      const outers = (polys[i]?.rings ?? []).filter((r) => signedArea(r) < 0).map(toWF);
      const rings = outers.filter((r) => overlaps(r, bounds)).map((r) => simplifyRing(r.slice(0, -1), SIMPLIFY_M));
      if (rings.length === 0) return;
      const { name, missing: miss } = placeName(`13${f.code}`, rec.CITY_NAME ?? '', rec.S_NAME ?? '', readings);
      if (miss) missing.push(name.ja);
      places.push({ code: rec.KEY_CODE ?? '', name, rings });
    });
  }
  return { places, missingReadings: missing };
}

function readdirShp(dir: string): { code: string }[] {
  const codes = ['103', '104', '110', '112', '113', '114'];
  return codes.filter((c) => existsSync(join(dir, `r2ka13${c}.shp`))).map((code) => ({ code }));
}

export function writeAreas(outDir: string, r: AreasResult, log: Logger): string {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, 'places.json');
  writeFileSync(file, `${JSON.stringify({ places: r.places })}\n`);
  const pts = r.places.reduce((s, p) => s + p.rings.reduce((a, q) => a + q.length, 0), 0);
  log.info(
    `areas: ${r.places.length} 町丁, ${pts} points, readings missing ${r.missingReadings.length} ${r.missingReadings.slice(0, 8).join(' / ')}`,
  );
  return file;
}
