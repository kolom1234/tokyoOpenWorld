// M07-T02 시간표: CSV·GTFS 시각, 합성(시간대 간격·계통 합치기·실제 synthetic-lines.json), GTFS 픽스처(가상 데이터) 컴파일,
// 스키마(schemas/timetable.schema.json), 같은 선로 간격 ≥ 90 s, 운행일 04:00 경계, 주행 곡선 = 정차 시각.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLogger, tripLegs } from '@sanpo/core';
import { lonLatToWF } from '@sanpo/geo';
import type { RailNetwork, RailTrackMeta, TimetableFile } from '@sanpo/tile-format';
import { afterAll, describe, expect, it } from 'vitest';
import { checkHeadways, MIN_HEADWAY_S, outsideServiceDay } from '../src/stages/timetables/compile.ts';
import { compileGtfsLine } from '../src/stages/timetables/gtfs.ts';
import { gtfsTime, parseCsv, readGtfs } from '../src/stages/timetables/gtfs-read.ts';
import { buildTimetables, timetableValidators } from '../src/stages/timetables/index.ts';
import {
  bandDepartures,
  mergeOnTrack,
  readSyntheticConfig,
  SYNTH_MIN_GAP_S,
  synthesizeLine,
} from '../src/stages/timetables/synthetic.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(ROOT, 'tests/fixtures/gtfs-mini');
const V = timetableValidators(join(ROOT, 'schemas'));
const tmp = mkdtempSync(join(tmpdir(), 'sanpo-tt-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Line = RailNetwork['lines'][number];
const lineMeta = (id: string, cars: number, carLengthM: number): Line => ({
  id,
  name: { ja: id, en: id },
  color: '#123456',
  kind: 'jr',
  rideable: false,
  maxSpeedKmh: 90,
  gaugeM: 1.067,
  formation: { cars, carLengthM },
});

/** 직선 선로들(시작점·단위 방향·길이·정차) → RailNetwork(0.5 m 표본, 제한 vmax). */
function makeNet(
  lines: Line[],
  defs: {
    id: string;
    line: string;
    heading: string;
    p0: [number, number];
    dir: [number, number];
    len: number;
    stops: [string, number][];
  }[],
  vmax = 20,
): RailNetwork {
  const pts: number[] = [];
  const tracks: RailTrackMeta[] = [];
  for (const d of defs) {
    const n = Math.round(d.len / 0.5) + 1;
    tracks.push({
      id: d.id,
      line: d.line,
      heading: d.heading,
      ptOffset: pts.length / 3,
      ptCount: n,
      lengthM: d.len,
      stepM: 0.5,
      stops: d.stops.map(([station, s]) => ({ station, s, side: 'L', platformLengthM: 200 })),
    });
    for (let k = 0; k < n; k++) pts.push(d.p0[0] + d.dir[0] * k * 0.5, 0, d.p0[1] + d.dir[1] * k * 0.5);
  }
  const n = pts.length / 3;
  return {
    lines,
    tracks,
    stations: [],
    platforms: [],
    points: Float32Array.from(pts),
    speed: new Float32Array(n).fill(vmax),
    flags: new Uint8Array(n),
  };
}

describe('gtfs csv', () => {
  it('parses quotes, doubled quotes, CRLF and BOM; times past 24:00', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', ''],
    ]);
    expect(gtfsTime('24:20:05')).toBe(87_605);
    expect(gtfsTime('5:00:00')).toBe(18_000);
  });
});

describe('synthetic timetable', () => {
  it('steps through headway bands and merges services on one track with a minimum gap', () => {
    const bands = [
      { from: '05:00', to: '06:00', weekday: 600, holiday: 900 },
      { from: '07:00', to: '08:00', weekday: 300, holiday: 600 },
    ];
    const t = bandDepartures(bands, 'weekday', 0);
    expect(t.slice(0, 2)).toEqual([18_000, 18_600]);
    expect(t).toContain(25_200); // 빈틈(06–07) 건너뛰고 다음 시간대 시작
    expect(t.at(-1)).toBe(28_500);
    const m = mergeOnTrack([
      { route: 'a', times: [0, 420, 840] },
      { route: 'b', times: [330, 800] },
    ]);
    for (let i = 1; i < m.length; i++)
      expect((m[i]?.t as number) - (m[i - 1]?.t as number)).toBeGreaterThanOrEqual(SYNTH_MIN_GAP_S);
  });

  it('compiles the real synthetic-lines.json on stand-in tracks: schema, headway ≥ 90 s, service day, run times', () => {
    const lines = [lineMeta('yamanote', 11, 20), lineMeta('yamanote-freight', 10, 20)];
    const T = (id: string, line: string, heading: string, stops: [string, number][]) => ({
      id,
      line,
      heading,
      p0: [0, 0] as [number, number],
      dir: [0, -1] as [number, number],
      len: 9300,
      stops,
    });
    const net = makeNet(lines, [
      T('yamanote-outer', 'yamanote', 'outer', [
        ['shibuya', 3007],
        ['harajuku', 4488],
        ['yoyogi', 5934],
        ['shinjuku', 6664],
      ]),
      T('yamanote-inner', 'yamanote', 'inner', [
        ['shinjuku', 2643],
        ['yoyogi', 3374],
        ['harajuku', 4838],
        ['shibuya', 6298],
      ]),
      T('yamanote-freight-north', 'yamanote-freight', 'north', [
        ['shibuya', 2978],
        ['shinjuku', 6448],
      ]),
      T('yamanote-freight-south', 'yamanote-freight', 'south', [
        ['shinjuku', 2739],
        ['shibuya', 6229],
      ]),
    ]);
    for (const cfg of readSyntheticConfig(ROOT).lines) {
      const f = synthesizeLine(cfg, net);
      expect(V.file(f), JSON.stringify(V.file.errors)).toBe(true);
      expect(f.approximate).toBe(true);
      const h = checkHeadways(f);
      expect(h.violations).toEqual([]);
      expect(h.minGapS).toBeGreaterThanOrEqual(MIN_HEADWAY_S);
      expect(outsideServiceDay(f)).toEqual([]);
      const wd = f.calendars.find((c) => c.id === 'weekday');
      expect(wd?.trips.length).toBeGreaterThan(100);
      // 첫 정차 도착 − 진입 = core 주행 곡선(진입 속도 = 제한 → 정차) 시간.
      const tr = wd?.trips[0];
      const tv = net.tracks.find((q) => q.id === tr?.track) as RailTrackMeta;
      const legs = tripLegs(
        net.speed.subarray(tv.ptOffset, tv.ptOffset + tv.ptCount),
        0.5,
        tr?.from as number,
        tr?.to as number,
        tr?.stops.map((s) => s.s) ?? [],
      );
      expect((tr?.stops[0]?.arrS as number) - (tr?.enterS as number)).toBeCloseTo(legs[0]?.duration as number, 0);
    }
  });
});

/** 긴자선 대역: 渋谷 → 表参道 방향 직선(asakusa), 반대(shibuya). 渋谷 정차 = 선로 시작 + 54 m / 끝 − 54 m. */
function ginzaNet(): RailNetwork {
  const S = lonLatToWF({ lon: 139.7016, lat: 35.659 });
  const O = lonLatToWF({ lon: 139.7122, lat: 35.6654 });
  const L = Math.hypot(O.x - S.x, O.z - S.z);
  const d: [number, number] = [(O.x - S.x) / L, (O.z - S.z) / L];
  return makeNet(
    [{ ...lineMeta('ginza', 6, 16), kind: 'metro' }],
    [
      {
        id: 'ginza-asakusa',
        line: 'ginza',
        heading: 'asakusa',
        p0: [S.x - d[0] * 54, S.z - d[1] * 54],
        dir: d,
        len: 1600,
        stops: [['shibuya', 54]],
      },
      {
        id: 'ginza-shibuya',
        line: 'ginza',
        heading: 'shibuya',
        p0: [S.x + d[0] * 1546, S.z + d[1] * 1546],
        dir: [-d[0], -d[1]],
        len: 1600,
        stops: [['shibuya', 1546]],
      },
    ],
    18,
  );
}

const MAP = { source: 'odpt-tokyometro', routes: ['銀座線'], originDwellS: 90, terminalDwellS: 60, minDwellS: 20 };
const NAMES = new Map([
  ['渋谷', 'shibuya'],
  ['表参道', 'omotesando'],
]);

describe('gtfs timetable (made-up fixture)', () => {
  const g = readGtfs(FIXTURE);
  const { file, stats } = compileGtfsLine(g, 'ginza', MAP, ginzaNet(), NAMES);
  const trip = (id: string) => file.calendars.flatMap((c) => c.trips).find((t) => t.id.endsWith(id));

  it('keeps only the route, groups calendars by day set and validates', () => {
    expect(stats).toEqual({ trips: 7, skippedNoStop: 0, skippedNoDays: 0 });
    expect(file.calendars.map((c) => c.id)).toEqual(['saturday-holiday', 'weekday']);
    expect(V.file(file), JSON.stringify(V.file.errors)).toBe(true);
    expect(file.approximate).toBe(false);
  });

  it('terminates arrivals on the Shibuya-bound track at the GTFS time and starts departures at the platform', () => {
    const a = trip('G_WD_01');
    expect(a?.track).toBe('ginza-shibuya');
    expect(a?.stops[0]?.arrS).toBe(gtfsTime('05:04:00'));
    expect(a?.to).toBe(1546);
    expect(a?.exitS).toBe((a?.stops[0]?.arrS as number) + 60);
    const d = trip('G_WD_02');
    expect(d?.track).toBe('ginza-asakusa');
    expect(d?.from).toBe(54);
    expect(d?.enterS).toBe(gtfsTime('05:10:00') - 90);
    expect(d?.stops[0]?.depS).toBe(gtfsTime('05:10:00'));
    expect(d?.exitS).toBeGreaterThan(gtfsTime('05:10:00') + 60);
    // 자정 넘김(24:24) 트립은 같은 운행일(04:00 경계) 안.
    expect(trip('G_WD_05')?.stops[0]?.arrS).toBe(gtfsTime('24:24:00'));
    expect(outsideServiceDay(file)).toEqual([]);
    expect(checkHeadways(file).violations).toEqual([]);
  });

  it('flags trips closer than 90 s on the same track', () => {
    const a = trip('G_WD_01') as TimetableFile['calendars'][number]['trips'][number];
    const b = {
      ...a,
      id: 'ginza-weekday-close',
      enterS: a.enterS + 60,
      exitS: a.exitS + 60,
      stops: a.stops.map((s) => ({ ...s, arrS: s.arrS + 60, depS: s.depS + 60 })),
    };
    const f: TimetableFile = { ...file, calendars: [{ id: 'weekday', days: ['weekday'], trips: [a, b] }] };
    const h = checkHeadways(f);
    expect(h.minGapS).toBe(60);
    expect(h.violations.length).toBeGreaterThan(0);
  });
});

describe('timetables stage', () => {
  it('writes line files + index and reports waiting-key without a GTFS source', () => {
    const net = ginzaNet();
    const log = createLogger({ level: 'error' });
    const ok = buildTimetables({
      repoRoot: ROOT,
      buildDir: join(tmp, 'a'),
      network: net,
      log,
      gtfsSource: { ginza: FIXTURE },
    });
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ line: 'ginza', status: 'ok', trips: 7, violations: [] });
    const index = JSON.parse(readFileSync(join(tmp, 'a/global/timetables/index.json'), 'utf8'));
    expect(V.index(index)).toBe(true);
    expect(index.lines[0].file).toBe('global/timetables/ginza.json');
    const missing = buildTimetables({
      repoRoot: ROOT,
      buildDir: join(tmp, 'b'),
      network: net,
      log,
      gtfsSource: { ginza: join(tmp, 'none.zip') },
    });
    expect(missing[0]?.status).toBe('waiting-key');
  });
});
