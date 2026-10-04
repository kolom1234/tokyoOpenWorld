// M05-T02 수락 재검증(M06 사전 2): 횡단보도 띠 위치 vs GSI 항공사진(seamlessphoto z18 ≈ 0.49 m/px, 검증 전용 — photo-tiles.ts).
// 지표 = **직선 띠 양 끝 측면 맞춤**: 띠 둘레 밝기 표본(차도 위만)에 끝마다 측면 위치 ca·cb와 폭을 격자 탐색으로 맞춘다
// (평행 이동 + 회전). 오차 = max(|ca|, |cb|). 길이 방향은 차도(PLATEAU) 경계가 정하므로 재지 않는다.
// 이전 지표(띠 안 − 둘레 밝기 최대 이동)는 보행자·보도 밝기에 끌려 1.3–2.8 m를 냈다(ADR-0058).
// 띠 출처: osm(보정 파일 적용 — content/markings/osm-crossing-corrections.json) | osm-raw(보정 전) | plateau(frn 1110 — 방법 자체 검증용).
// 사용: node tools/pipeline/src/checks/markings-photo.ts [x,z 중심 WF = -22.3,8.6] [반경 m = 60] [osm|osm-raw|plateau]
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cellIdString, createLogger, packCellKey } from '@sanpo/core';
import { readNdjsonGz } from '../lib/ndjson-gz.ts';
import type { MarkingRecord } from '../readers/plateau/frn-markings.ts';
import type { RoadRecord } from '../readers/plateau/types.ts';
import { applyCrossingCorrections, readCrossingCorrections } from '../stages/derive/markings/corrections.ts';
import { crosswalkWidth, isMarkedCrossing } from '../stages/derive/markings/crosswalk.ts';
import { plateauCrosswalkBand, topTriangles } from '../stages/derive/markings/plateau.ts';
import { roadIndex } from '../stages/derive/roads.ts';
import type { OsmRecord } from '../stages/normalize-osm.ts';
import { debugImage, type Mosaic, mosaicAround, sample, wfToPx } from './photo-tiles.ts';

const log = createLogger().child('markings-photo');
const ROOT = resolve(import.meta.dirname, '../../../..');
/** 수락 기준(M05-T02): 형태가 항공사진과 일치(오차 ≤ 0.5 m). */
const TOLERANCE_M = 0.5;
const STEP_M = 0.2;
const SEARCH_M = 3;
const ROOM_M = 2;

interface Band {
  id: string;
  a: [number, number];
  b: [number, number];
  half: number;
}

type OnRoad = (x: number, z: number) => boolean;

function cellsAround(center: readonly [number, number]): string[] {
  const out: string[] = [];
  for (const dz of [-1, 0, 1])
    for (const dx of [-1, 0, 1])
      out.push(cellIdString(packCellKey(0, Math.floor(center[0] / 256) + dx, Math.floor(center[1] / 256) + dz)));
  return out;
}

function readLayer<T extends { id: string }>(layer: string, cells: readonly string[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of cells) {
    const f = join(ROOT, 'data/normalized', layer, `${id}.ndjson.gz`);
    if (existsSync(f)) for (const r of readNdjsonGz<T>(f)) if (!seen.has(r.id) && seen.add(r.id)) out.push(r);
  }
  return out;
}

/** OSM 횡단 선 → 차도 위 구간(처음·마지막으로 차도인 점)의 띠. */
function osmBands(osm: readonly OsmRecord[], onRoad: OnRoad): Band[] {
  const out: Band[] = [];
  for (const r of osm) {
    if (!isMarkedCrossing(r)) continue;
    const xz = r.rings[0] ?? [];
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const a: [number, number] = [xz[i] as number, xz[i + 1] as number];
      const b: [number, number] = [xz[i + 2] as number, xz[i + 3] as number];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const hit: number[] = [];
      for (let s = 0; s <= L; s += 0.1)
        if (onRoad(a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L)) hit.push(s);
      if (hit.length < 20) continue;
      const at = (s: number): [number, number] => [a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L];
      out.push({
        id: `${r.id}#${i / 2}`,
        a: at(hit[0] as number),
        b: at(hit[hit.length - 1] as number),
        half: crosswalkWidth(r) / 2,
      });
    }
  }
  return out;
}

/**
 * 띠의 [s0, s1] 구간 측면 단면 P(t)(t = 중심선 왼쪽 +). 차도 위 표본만. 줄무늬 질감(0.45 m 반주기 밝기 차)도 시험했지만
 * z18 사진에선 막대가 앨리어싱돼 PLATEAU 기준 오차가 더 컸다(중앙값 1.3 m) → 밝기 단면.
 */
function profile(m: Mosaic, bd: Band, s0: number, s1: number, onRoad: OnRoad): Map<number, number> {
  const dx = bd.b[0] - bd.a[0];
  const dz = bd.b[1] - bd.a[1];
  const L = Math.hypot(dx, dz);
  const u = [dx / L, dz / L] as const;
  const v = [u[1], -u[0]] as const;
  const out = new Map<number, number>();
  const reach = bd.half + SEARCH_M + ROOM_M;
  for (let k = Math.round(-reach / STEP_M); k <= Math.round(reach / STEP_M); k++) {
    const t = k * STEP_M;
    let sum = 0;
    let n = 0;
    for (let s = s0; s <= s1; s += 0.25) {
      const x = bd.a[0] + u[0] * s + v[0] * t;
      const z = bd.a[1] + u[1] * s + v[1] * t;
      if (!onRoad(x, z)) continue;
      const g = sample(m, x, z);
      if (!Number.isNaN(g)) {
        sum += g;
        n++;
      }
    }
    if (n >= 3) out.set(k, sum / n);
  }
  return out;
}

/**
 * 직선 띠 양 끝 맞춤: 표본 (s, t, g)를 한 번 모으고, 끝 측면 위치 ca·cb(±SEARCH_M, 0.2 m)·폭 w(2·half − 1 … + 3)를 격자 탐색 —
 * 안(|t − c(s)| ≤ w/2) 평균 − 양옆 1.5 m 평균 최대. 회전(끝마다 다른 측면 오차)까지 잡는다. 반환 = 끝 측면 오차(m).
 */
function fitEnds(m: Mosaic, bd: Band, onRoad: OnRoad) {
  const L = Math.hypot(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]);
  const u = [(bd.b[0] - bd.a[0]) / L, (bd.b[1] - bd.a[1]) / L] as const;
  const v = [u[1], -u[0]] as const;
  const ss: number[] = [];
  const ts: number[] = [];
  const gs: number[] = [];
  const reach = bd.half + SEARCH_M + 4;
  for (let s = 0; s <= L; s += 0.25)
    for (let t = -reach; t <= reach; t += STEP_M) {
      const x = bd.a[0] + u[0] * s + v[0] * t;
      const z = bd.a[1] + u[1] * s + v[1] * t;
      if (!onRoad(x, z)) continue;
      const g = sample(m, x, z);
      if (Number.isNaN(g)) continue;
      ss.push(s / L);
      ts.push(t);
      gs.push(g);
    }
  let best = { ca: 0, cb: 0, w: bd.half * 2, score: Number.NEGATIVE_INFINITY };
  for (let w = Math.max(2, bd.half * 2 - 1); w <= bd.half * 2 + 3 + 1e-9; w += 0.5)
    for (let ca = -SEARCH_M; ca <= SEARCH_M + 1e-9; ca += STEP_M)
      for (let cb = -SEARCH_M; cb <= SEARCH_M + 1e-9; cb += STEP_M) {
        let si = 0;
        let ni = 0;
        let so = 0;
        let no = 0;
        for (let i = 0; i < gs.length; i++) {
          const d = Math.abs((ts[i] as number) - (ca + (cb - ca) * (ss[i] as number)));
          if (d <= w / 2) {
            si += gs[i] as number;
            ni++;
          } else if (d <= w / 2 + 1.5) {
            so += gs[i] as number;
            no++;
          }
        }
        if (ni < 10 || no < 10) continue;
        const score = si / ni - so / no;
        if (score > best.score) best = { ca, cb, w, score };
      }
  return best;
}

function measure(m: Mosaic, bd: Band, onRoad: OnRoad) {
  const L = Math.hypot(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]);
  const pw = profile(m, bd, 0, L, onRoad);
  if (process.env.PROFILE_PRINT)
    log.info(
      `${bd.id} P(t) ${[...pw.entries()].map(([k, g]) => `${(k * STEP_M).toFixed(1)}:${g.toFixed(0)}`).join(' ')}`,
    );
  const f = fitEnds(m, bd, onRoad);
  return {
    id: bd.id,
    lengthM: +L.toFixed(1),
    widthM: +(bd.half * 2).toFixed(2),
    startM: +f.ca.toFixed(2),
    endM: +f.cb.toFixed(2),
    fitWidthM: f.w,
    contrast: +f.score.toFixed(1),
    offsetM: +Math.max(Math.abs(f.ca), Math.abs(f.cb)).toFixed(2),
  };
}

const outline = (bd: Band): [number, number][] => {
  const L = Math.hypot(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]);
  const v = [(bd.b[1] - bd.a[1]) / L, -(bd.b[0] - bd.a[0]) / L] as const;
  return [bd.a, bd.b, bd.b, bd.a].map((p, i) => {
    const t = i < 2 ? bd.half : -bd.half;
    return [p[0] + v[0] * t, p[1] + v[1] * t] as [number, number];
  });
};

/** 육안 대조용 덤프(커밋 안 함): 회색 모자이크 + 띠 중심선·외곽(모자이크 px) + WF→px 국소 아핀(역변환으로 px를 WF로 읽는다). */
function dumpForReview(
  m: Mosaic,
  bands: readonly Band[],
  results: readonly ReturnType<typeof measure>[],
  center: readonly [number, number],
  out: string,
): void {
  const px = (x: number, z: number) => {
    const p = wfToPx(x, z);
    return [p[0] - m.x0, p[1] - m.y0];
  };
  const [o0, o1] = px(center[0], center[1]) as [number, number];
  const [x0, x1] = px(center[0] + 1, center[1]) as [number, number];
  const [z0, z1] = px(center[0], center[1] + 1) as [number, number];
  writeFileSync(
    `${out}.gray`,
    Uint8Array.from(m.gray, (v) => Math.round(v)),
  );
  const json = {
    w: m.w,
    h: m.h,
    center,
    affine: { o: [o0, o1], ex: [x0 - o0, x1 - o1], ez: [z0 - o0, z1 - o1] },
    bands: bands.map((b, i) => ({
      id: b.id,
      a: px(...b.a),
      b: px(...b.b),
      aWF: b.a,
      bWF: b.b,
      half: b.half,
      fit: results[i],
    })),
  };
  writeFileSync(`${out}.json`, JSON.stringify(json));
}

async function main(): Promise<void> {
  const [cArg = '-22.3,8.6', rArg = '60', source = 'osm'] = process.argv.slice(2);
  const center = cArg.split(',').map(Number) as [number, number];
  const radius = Number(rArg);
  const cells = cellsAround(center);
  const roads = roadIndex(readLayer<RoadRecord>('roads', cells));
  const onRoad: OnRoad = (x, z) => roads.classify(x, z) === 'road';
  let bands: Band[];
  const shapes: { color: string; ringXZ: [number, number][] }[] = [];
  if (source === 'plateau') {
    const recs = readLayer<MarkingRecord>('markings', cells).filter(
      (r) => r.function === '1110' || r.function === '1120',
    );
    for (const r of recs)
      for (const t of topTriangles(r)) shapes.push({ color: r.function === '1110' ? 'yellow' : 'cyan', ringXZ: t });
    bands = recs.flatMap((r) => {
      const b = r.function === '1110' ? plateauCrosswalkBand(r) : null;
      return b ? [{ id: r.id, a: b.a, b: b.b, half: b.half }] : [];
    });
  } else {
    let osm = readLayer<OsmRecord>('osm', cells);
    if (source === 'osm') osm = applyCrossingCorrections(osm, readCrossingCorrections(ROOT));
    bands = osmBands(osm, onRoad);
  }
  bands = bands.filter(
    (b) => Math.hypot((b.a[0] + b.b[0]) / 2 - center[0], (b.a[1] + b.b[1]) / 2 - center[1]) <= radius,
  );
  const m = await mosaicAround(ROOT, center, radius + 20);
  const results = bands.map((bd) => measure(m, bd, onRoad));
  for (const x of results) log.info(JSON.stringify(x));
  if (process.env.PHOTO_DEBUG)
    await debugImage(
      ROOT,
      m,
      [...shapes, ...bands.map((b) => ({ color: 'red', ringXZ: outline(b) }))],
      process.env.PHOTO_DEBUG,
    );
  if (process.env.PHOTO_DUMP) dumpForReview(m, bands, results, center, process.env.PHOTO_DUMP);
  const pass = results.filter((x) => x.offsetM <= TOLERANCE_M).length;
  const max = results.length ? Math.max(...results.map((x) => x.offsetM)) : 0;
  log.info(`${source} bands ${results.length}, within ${TOLERANCE_M} m: ${pass}, max offset ${max.toFixed(2)} m`);
  if (pass < results.length) process.exitCode = 1;
}

await main();
