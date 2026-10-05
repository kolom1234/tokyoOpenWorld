// validate: 시간표(M07-T02) — rail.bin이 있으면 global/timetables/index.json·노선 파일 스키마, 같은 선로 간격 ≥ 90 s, 운행일(04:00–28:00) 안.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TimetableFile, TimetableIndexFile } from '@sanpo/tile-format';
import { checkHeadways, MIN_HEADWAY_S, outsideServiceDay } from './timetables/compile.ts';
import { timetableValidators } from './timetables/index.ts';

export interface TimetablesSummary {
  lines: { line: string; source: string; trips: number; minGapS: number | null }[];
}

export function checkTimetables(dir: string, schemasDir: string, errors: string[]): TimetablesSummary | null {
  if (!existsSync(join(dir, 'global/rail.bin'))) return null;
  const indexPath = join(dir, 'global/timetables/index.json');
  if (!existsSync(indexPath)) {
    errors.push('timetables: global/rail.bin 있는데 global/timetables/index.json 없음');
    return null;
  }
  const v = timetableValidators(schemasDir);
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as TimetableIndexFile;
  if (!v.index(index)) errors.push(`timetables index: schema ${JSON.stringify(v.index.errors?.slice(0, 3))}`);
  const out: TimetablesSummary = { lines: [] };
  for (const l of index.lines ?? []) {
    const f = JSON.parse(readFileSync(join(dir, l.file), 'utf8')) as TimetableFile;
    if (!v.file(f)) errors.push(`timetables ${l.line}: schema ${JSON.stringify(v.file.errors?.slice(0, 3))}`);
    const h = checkHeadways(f);
    for (const x of h.violations.slice(0, 5))
      errors.push(`timetables ${l.line}: ${x.track} ${x.a} → ${x.b} @${x.at} 간격 ${x.gapS} s < ${MIN_HEADWAY_S} s`);
    const outside = outsideServiceDay(f);
    if (outside.length > 0)
      errors.push(`timetables ${l.line}: 운행일(04:00–28:00) 밖 트립 ${outside.slice(0, 5).join(', ')}`);
    const trips = f.calendars.reduce((n, c) => n + c.trips.length, 0);
    out.lines.push({ line: l.line, source: f.source, trips, minGapS: Number.isFinite(h.minGapS) ? h.minGapS : null });
  }
  return out;
}
