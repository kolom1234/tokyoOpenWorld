// 시간표 단계(M07-T02, ADR-0071): rail.bin + 합성(content/sim/synthetic-lines.json) + GTFS(rail-lines.json `gtfs`, data/raw/<source>)
// → 스키마 검증(schemas/timetable.schema.json) → global/timetables/<lineId>.json + index.json + timetable-report.json.
// GTFS 원천이 없으면(ODPT 키 대기) 그 노선은 건너뛰고 보고에 'waiting-key'. see docs/10-simulation.md §6.1
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import type { RailNetwork, TimetableFile, TimetableIndexFile } from '@sanpo/tile-format';
import Ajv2020 from 'ajv/dist/2020.js';
import { readRailCatalog } from '../build/rail-global.ts';
import { ODPT_ZIP } from '../rail/fetch.ts';
import { checkHeadways, type HeadwayViolation, outsideServiceDay } from './compile.ts';
import { compileGtfsLine, type GtfsCompileStats } from './gtfs.ts';
import { readGtfs } from './gtfs-read.ts';
import { readSyntheticConfig, synthesizeLine } from './synthetic.ts';

export interface TimetableLineReport {
  line: string;
  status: 'ok' | 'waiting-key' | 'empty';
  source: 'synthetic' | 'gtfs';
  trips: number;
  minGapS: number | null;
  violations: HeadwayViolation[];
  outsideServiceDay: string[];
  gtfs?: GtfsCompileStats;
}

export interface TimetableBuildInput {
  repoRoot: string;
  buildDir: string;
  network: RailNetwork;
  log: Logger;
  /** GTFS 원천 덮어쓰기(노선 id → 디렉터리·zip, 테스트·픽스처). 없으면 data/raw/<source>/<zip>. */
  gtfsSource?: Record<string, string>;
}

/** schemas/timetable.schema.json 검사기(노선 파일·index). */
export function timetableValidators(schemasDir: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, 'timetable.schema.json'), 'utf8')));
  const file = ajv.getSchema('sanpo/timetable');
  const index = ajv.getSchema('sanpo/timetable#/$defs/index');
  if (!file || !index) throw new Error('timetable schema missing');
  return { file, index };
}

/** 역 이름(일본어·OSM 이름) → 역 id. */
function stationNames(repoRoot: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of readRailCatalog(repoRoot).stations) for (const n of [s.name.ja, ...s.osmNames]) m.set(n, s.id);
  return m;
}

function gtfsFiles(i: TimetableBuildInput, files: TimetableFile[], report: TimetableLineReport[]): void {
  const names = stationNames(i.repoRoot);
  for (const l of readRailCatalog(i.repoRoot).lines) {
    if (!l.gtfs || !i.network.lines.some((q) => q.id === l.id)) continue;
    const src = i.gtfsSource?.[l.id] ?? join(i.repoRoot, 'data/raw', l.gtfs.source, ODPT_ZIP);
    const base = { line: l.id, source: 'gtfs' as const, minGapS: null, violations: [], outsideServiceDay: [] };
    if (!existsSync(src)) {
      i.log.warn(`timetables ${l.id}: GTFS ${l.gtfs.source} 없음 — 키 대기(ODPT_CONSUMER_KEY → pnpm pipeline fetch)`);
      report.push({ ...base, status: 'waiting-key', trips: 0 });
      continue;
    }
    const { file, stats } = compileGtfsLine(readGtfs(src), l.id, l.gtfs, i.network, names);
    if (stats.trips === 0) {
      report.push({ ...base, status: 'empty', trips: 0, gtfs: stats });
      continue;
    }
    files.push(file);
    report.push({ ...base, status: 'ok', trips: stats.trips, gtfs: stats });
  }
}

/** 시간표 컴파일·검증·쓰기. 스키마 오류는 예외, 간격·운행일 위반은 보고(validate 단계가 오류로 센다). */
export function buildTimetables(i: TimetableBuildInput): TimetableLineReport[] {
  const files: TimetableFile[] = [];
  const report: TimetableLineReport[] = [];
  for (const cfg of readSyntheticConfig(i.repoRoot).lines) {
    if (!i.network.lines.some((l) => l.id === cfg.line)) continue;
    const f = synthesizeLine(cfg, i.network);
    files.push(f);
    const trips = f.calendars.reduce((n, c) => n + c.trips.length, 0);
    report.push({
      line: f.line,
      status: 'ok',
      source: 'synthetic',
      trips,
      minGapS: null,
      violations: [],
      outsideServiceDay: [],
    });
  }
  gtfsFiles(i, files, report);
  const v = timetableValidators(join(i.repoRoot, 'schemas'));
  const dir = join(i.buildDir, 'global', 'timetables');
  mkdirSync(dir, { recursive: true });
  const index: TimetableIndexFile = { schema: 1, lines: [] };
  for (const f of files) {
    if (!v.file(f)) throw new Error(`timetables ${f.line}: schema ${JSON.stringify(v.file.errors?.slice(0, 3))}`);
    const r = report.find((q) => q.line === f.line) as TimetableLineReport;
    const h = checkHeadways(f);
    r.minGapS = Number.isFinite(h.minGapS) ? h.minGapS : null;
    r.violations = h.violations.slice(0, 50);
    r.outsideServiceDay = outsideServiceDay(f);
    writeFileSync(join(dir, `${f.line}.json`), JSON.stringify(f));
    index.lines.push({
      line: f.line,
      file: `global/timetables/${f.line}.json`,
      source: f.source,
      approximate: f.approximate,
      trips: r.trips,
    });
    i.log.info(
      `timetables ${f.line}: ${r.trips} trips (${f.source}${f.approximate ? ', 근사' : ''}), min gap ${r.minGapS} s, violations ${h.violations.length}`,
    );
  }
  if (!v.index(index)) throw new Error(`timetables index: schema ${JSON.stringify(v.index.errors?.slice(0, 3))}`);
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  writeFileSync(join(i.buildDir, 'timetable-report.json'), `${JSON.stringify(report, null, 1)}\n`);
  return report;
}
