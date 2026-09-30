// M05-T02 수락 검증: 스크램블 교차로 횡단보도 띠(OSM 횡단 선 + 차도 구간 + 규칙 폭) 위치 vs GSI 항공사진(seamlessphoto z18 ≈ 0.49 m/px).
// 띠마다 (dx, dz) ±3 m(0.25 m 간격) 이동해 "띠 안 밝기 − 둘레 2 m 고리 밝기"가 최대인 이동량 = 위치 오차. 사진은 검증 전용
// (data/raw/gsi-photo/z18 캐시, 게임 데이터에 굽지 않음). 네트워크·ImageMagick 필요 → 컨테이너 전용, CI 제외.
// 사용: node tools/pipeline/src/checks/markings-photo.ts [x,z 중심 WF = -22.3,8.6] [반경 m = 60]
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { cellIdString, createLogger, packCellKey } from '@sanpo/core';
import { wfToLonLat } from '@sanpo/geo';
import { readNdjsonGz } from '../lib/ndjson-gz.ts';
import type { RoadRecord } from '../readers/plateau/types.ts';
import { crosswalkWidth, isMarkedCrossing } from '../stages/derive/markings/crosswalk.ts';
import { roadIndex } from '../stages/derive/roads.ts';
import type { OsmRecord } from '../stages/normalize-osm.ts';

const run = promisify(execFile);
const log = createLogger().child('markings-photo');
const ROOT = resolve(import.meta.dirname, '../../../..');
const Z = 18;
const TILE_URL = (x: number, y: number) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${Z}/${x}/${y}.jpg`;
/** 수락 기준(M05-T02): 형태가 항공사진과 일치(오차 ≤ 0.5 m). */
const TOLERANCE_M = 0.5;
const SEARCH_M = 2;
const SEARCH_STEP_M = 0.25;
const RING_M = 2;
const SAMPLE_M = 0.25;

const toPx = (lon: number, lat: number): [number, number] => {
  const n = 256 * 2 ** Z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};

interface Mosaic {
  x0: number;
  y0: number;
  w: number;
  h: number;
  gray: Float32Array;
}

async function mosaic(minPx: [number, number], maxPx: [number, number]): Promise<Mosaic> {
  const [tx0, ty0] = [Math.floor(minPx[0] / 256), Math.floor(minPx[1] / 256)];
  const [tx1, ty1] = [Math.floor(maxPx[0] / 256), Math.floor(maxPx[1] / 256)];
  const w = (tx1 - tx0 + 1) * 256;
  const h = (ty1 - ty0 + 1) * 256;
  const gray = new Float32Array(w * h);
  const dir = join(ROOT, 'data/raw/gsi-photo', `z${Z}`);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const f = join(dir, String(tx), `${ty}.jpg`);
      if (!existsSync(f)) {
        mkdirSync(join(dir, String(tx)), { recursive: true });
        const res = await fetch(TILE_URL(tx, ty));
        if (!res.ok) throw new Error(`tile ${tx}/${ty}: HTTP ${res.status}`);
        writeFileSync(f, new Uint8Array(await res.arrayBuffer()));
      }
      const { stdout } = await run('convert', [f, '-colorspace', 'Gray', '-depth', '8', 'gray:-'], {
        encoding: 'buffer',
        maxBuffer: 1 << 20,
      });
      const px = stdout as unknown as Buffer;
      for (let r = 0; r < 256; r++)
        for (let c = 0; c < 256; c++)
          gray[((ty - ty0) * 256 + r) * w + (tx - tx0) * 256 + c] = px[r * 256 + c] as number;
    }
  }
  return { x0: tx0 * 256, y0: ty0 * 256, w, h, gray };
}

function sample(m: Mosaic, x: number, z: number): number {
  const ll = wfToLonLat({ x, y: 0, z });
  const [px, py] = toPx(ll.lon, ll.lat);
  const fx = px - m.x0 - 0.5;
  const fy = py - m.y0 - 0.5;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  if (i < 0 || j < 0 || i + 1 >= m.w || j + 1 >= m.h) return Number.NaN;
  const tx = fx - i;
  const ty = fy - j;
  const g = (a: number, b: number): number => m.gray[b * m.w + a] as number;
  return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty;
}

interface Band {
  id: string;
  a: [number, number];
  b: [number, number];
  half: number;
}

/** 띠 점들(안 = 띠 사각형, 고리 = 바깥 RING_M) — 중심선 로컬 (s, t). */
function bandPoints(bd: Band): { inside: [number, number][]; ring: [number, number][] } {
  const dx = bd.b[0] - bd.a[0];
  const dz = bd.b[1] - bd.a[1];
  const L = Math.hypot(dx, dz);
  const u = [dx / L, dz / L];
  const v = [u[1] as number, -(u[0] as number)];
  const inside: [number, number][] = [];
  const ring: [number, number][] = [];
  for (let s = -RING_M; s <= L + RING_M; s += SAMPLE_M) {
    for (let t = -bd.half - RING_M; t <= bd.half + RING_M; t += SAMPLE_M) {
      const p: [number, number] = [
        bd.a[0] + (u[0] as number) * s + (v[0] as number) * t,
        bd.a[1] + (u[1] as number) * s + (v[1] as number) * t,
      ];
      if (s >= 0 && s <= L && Math.abs(t) <= bd.half) inside.push(p);
      else if (s >= 0 && s <= L) ring.push(p);
    }
  }
  return { inside, ring };
}

function contrast(
  m: Mosaic,
  pts: { inside: [number, number][]; ring: [number, number][] },
  ox: number,
  oz: number,
  onRoad: (x: number, z: number) => boolean,
): number {
  // 차도(PLATEAU carriageway) 위 표본만 — 밝은 보도 쪽으로 최대가 끌려가는 편향 제거.
  const mean = (ps: [number, number][]): number => {
    let s = 0;
    let n = 0;
    for (const p of ps) {
      if (!onRoad(p[0] + ox, p[1] + oz)) continue;
      const g = sample(m, p[0] + ox, p[1] + oz);
      if (!Number.isNaN(g)) {
        s += g;
        n++;
      }
    }
    return n > 0 ? s / n : Number.NaN;
  };
  return mean(pts.inside) - mean(pts.ring);
}

/** 횡단 선 → 차도 위 구간(시작·끝 = 처음·마지막으로 차도인 점)의 띠. */
function bandsNear(
  center: [number, number],
  radius: number,
): { bands: Band[]; onRoad: (x: number, z: number) => boolean; junctions: number[][] } {
  const cells = new Set<string>();
  for (const dz of [-1, 0, 1])
    for (const dx of [-1, 0, 1])
      cells.add(cellIdString(packCellKey(0, Math.floor(center[0] / 256) + dx, Math.floor(center[1] / 256) + dz)));
  const osm: OsmRecord[] = [];
  const roads: RoadRecord[] = [];
  const seen = new Set<string>();
  for (const id of cells) {
    const fo = join(ROOT, 'data/normalized/osm', `${id}.ndjson.gz`);
    const fr = join(ROOT, 'data/normalized/roads', `${id}.ndjson.gz`);
    if (existsSync(fo)) for (const r of readNdjsonGz<OsmRecord>(fo)) if (!seen.has(r.id) && seen.add(r.id)) osm.push(r);
    if (existsSync(fr)) roads.push(...readNdjsonGz<RoadRecord>(fr));
  }
  const idx = roadIndex(roads);
  const out: Band[] = [];
  for (const r of osm) {
    if (!isMarkedCrossing(r)) continue;
    const xz = r.rings[0] ?? [];
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const a: [number, number] = [xz[i] as number, xz[i + 1] as number];
      const b: [number, number] = [xz[i + 2] as number, xz[i + 3] as number];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const onRoad: number[] = [];
      for (let s = 0; s <= L; s += 0.1)
        if (idx.classify(a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L) === 'road') onRoad.push(s);
      if (onRoad.length < 20) continue;
      const [s0, s1] = [onRoad[0] as number, onRoad[onRoad.length - 1] as number];
      const pa: [number, number] = [a[0] + ((b[0] - a[0]) * s0) / L, a[1] + ((b[1] - a[1]) * s0) / L];
      const pb: [number, number] = [a[0] + ((b[0] - a[0]) * s1) / L, a[1] + ((b[1] - a[1]) * s1) / L];
      if (Math.hypot((pa[0] + pb[0]) / 2 - center[0], (pa[1] + pb[1]) / 2 - center[1]) > radius) continue;
      out.push({ id: `${r.id}#${i / 2}`, a: pa, b: pb, half: crosswalkWidth(r) / 2 });
    }
  }
  const junctions = roads.filter((r) => r.functionCode === 'TrafficArea:1020').map((r) => r.polygonWF[0] ?? []);
  return { bands: out, onRoad: (x, z) => idx.classify(x, z) === 'road', junctions };
}

/** 검증 이미지(커밋 안 함): 모자이크 + 띠 외곽선(빨강) — 방법 자체 점검용. */
async function debugImage(
  m: Mosaic,
  bands: readonly Band[],
  out: string,
  extra: readonly number[][] = [],
): Promise<void> {
  const raw = join(ROOT, 'data/derived/markings-photo.gray');
  writeFileSync(
    raw,
    Uint8Array.from(m.gray, (v) => Math.round(v)),
  );
  const toMosaic = (x: number, z: number): string => {
    const ll = wfToLonLat({ x, y: 0, z });
    const [px, py] = toPx(ll.lon, ll.lat);
    return `${(px - m.x0).toFixed(1)},${(py - m.y0).toFixed(1)}`;
  };
  const draws: string[] = [];
  for (const bd of bands) {
    const dx = bd.b[0] - bd.a[0];
    const dz = bd.b[1] - bd.a[1];
    const L = Math.hypot(dx, dz);
    const v = [dz / L, -dx / L] as const;
    const c = [bd.a, bd.b, bd.b, bd.a].map((p, i) => {
      const t = i < 2 ? bd.half : -bd.half;
      return toMosaic(p[0] + v[0] * t, p[1] + v[1] * t);
    });
    draws.push('-draw', `polygon ${c.join(' ')}`);
  }
  await run('convert', [
    '-size',
    `${m.w}x${m.h}`,
    '-depth',
    '8',
    `gray:${raw}`,
    '-colorspace',
    'sRGB',
    '-fill',
    'none',
    '-stroke',
    'red',
    '-strokewidth',
    '1',
    ...draws,
    out,
  ]);
}

async function main(): Promise<void> {
  const [cArg = '-22.3,8.6', rArg = '60'] = process.argv.slice(2);
  const center = cArg.split(',').map(Number) as [number, number];
  const radius = Number(rArg);
  const { bands, onRoad, junctions } = bandsNear(center, radius);
  const corner = (x: number, z: number) => {
    const ll = wfToLonLat({ x, y: 0, z });
    return toPx(ll.lon, ll.lat);
  };
  const r = radius + 20;
  const nw = corner(center[0] - r, center[1] - r);
  const se = corner(center[0] + r, center[1] + r);
  const m = await mosaic(
    [Math.min(nw[0], se[0]), Math.min(nw[1], se[1])],
    [Math.max(nw[0], se[0]), Math.max(nw[1], se[1])],
  );
  const results = bands.map((bd) => {
    const pts = bandPoints(bd);
    let best = { dx: 0, dz: 0, c: Number.NEGATIVE_INFINITY };
    for (let dx = -SEARCH_M; dx <= SEARCH_M + 1e-9; dx += SEARCH_STEP_M)
      for (let dz = -SEARCH_M; dz <= SEARCH_M + 1e-9; dz += SEARCH_STEP_M) {
        const c = contrast(m, pts, dx, dz, onRoad);
        if (c > best.c) best = { dx, dz, c };
      }
    const zero = contrast(m, pts, 0, 0, onRoad);
    return {
      id: bd.id,
      lengthM: +Math.hypot(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]).toFixed(1),
      widthM: bd.half * 2,
      offsetM: +Math.hypot(best.dx, best.dz).toFixed(2),
      best: [best.dx, best.dz],
      contrastAt0: +zero.toFixed(1),
      contrastBest: +best.c.toFixed(1),
    };
  });
  for (const x of results) log.info(JSON.stringify(x));
  if (process.env.PHOTO_DEBUG) await debugImage(m, bands, process.env.PHOTO_DEBUG, junctions);
  const pass = results.filter((x) => x.offsetM <= TOLERANCE_M).length;
  log.info(
    `bands ${results.length}, within ${TOLERANCE_M} m: ${pass}, max offset ${Math.max(...results.map((x) => x.offsetM)).toFixed(2)} m`,
  );
  if (pass < results.length) process.exitCode = 1;
}

await main();
