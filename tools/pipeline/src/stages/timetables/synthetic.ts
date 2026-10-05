// JR 합성 시간표(M07-T02, ADR-0008·0071): content/sim/synthetic-lines.json(시간대별 간격·정차·선로 위상) → 근사 시간표.
// JR동일본 ODPT 데이터는 쓰지 않는다(상시 서비스 불가 라이선스). 시각 기준 = 편성이 선로 시작(from)에 있는 시각.
// 같은 선로를 여러 계통(사이쿄·쇼난신주쿠)이 쓰면 합쳐서 앞 열차와 SYNTH_MIN_GAP_S 미만인 열차를 뒤로 민다(결정론).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RailNetwork, TimetableCalendar, TimetableDay, TimetableFile, TimetableTrip } from '@sanpo/tile-format';
import { compileTrip, SERVICE_DAY_END_S, type StopPlan, trackView } from './compile.ts';

/** 합성 시 같은 선로 진입 최소 간격(s) — 수락 기준 90 s보다 넉넉히. */
export const SYNTH_MIN_GAP_S = 120;
const DEFAULT_DWELL_S = 30;

interface Band {
  from: string;
  to: string;
  weekday: number;
  holiday: number;
}
interface SynthService {
  id: string;
  label: { ja: string; en: string; ko?: string };
  color: string;
  /** 선로 id → 위상(s). */
  tracks: Record<string, number>;
  bands: Band[];
}
export interface SyntheticLine {
  line: string;
  services: SynthService[];
  dwellS: Record<string, number>;
}
export interface SyntheticConfig {
  lines: SyntheticLine[];
}

/** 평일·토휴일 두 묶음(토요일 = 휴일 간격 — 근사). */
export const SYNTH_CALENDARS: readonly { id: 'weekday' | 'holiday'; days: TimetableDay[] }[] = [
  { id: 'weekday', days: ['weekday'] },
  { id: 'holiday', days: ['saturday', 'holiday'] },
];

export function readSyntheticConfig(repoRoot: string): SyntheticConfig {
  return JSON.parse(readFileSync(join(repoRoot, 'content/sim/synthetic-lines.json'), 'utf8')) as SyntheticConfig;
}

/** "HH:MM"(24 넘김 허용) → 운행일 0시 기준 초. */
export function parseHm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`synthetic: bad time ${s}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

/** 시간대 표 → 진입 시각들: 첫 시간대 시작 + 위상부터, 지금 시각이 속한 시간대 간격만큼 전진(빈틈은 다음 시간대 시작으로). */
export function bandDepartures(bands: readonly Band[], key: 'weekday' | 'holiday', phaseS: number): number[] {
  const bs = bands.map((b) => ({ a: parseHm(b.from), b: parseHm(b.to), h: b[key] })).sort((p, q) => p.a - q.a);
  const first = bs[0];
  const last = bs.at(-1);
  if (!first || !last) return [];
  const out: number[] = [];
  let t = first.a + phaseS;
  while (t < last.b && t < SERVICE_DAY_END_S) {
    const band = bs.find((b) => t >= b.a && t < b.b);
    if (!band) {
      const next = bs.find((b) => b.a > t);
      if (!next) break;
      t = next.a;
      continue;
    }
    out.push(t);
    t += Math.max(SYNTH_MIN_GAP_S, band.h);
  }
  return out;
}

/** 계통별 진입 시각 합치기 → 시각 순, 앞과 minGap 미만이면 앞 + minGap으로 민다. */
export function mergeOnTrack(
  lists: readonly { route: string; times: readonly number[] }[],
  minGap = SYNTH_MIN_GAP_S,
): { route: string; t: number }[] {
  const all = lists.flatMap((l) => l.times.map((t) => ({ route: l.route, t })));
  all.sort((p, q) => p.t - q.t || (p.route < q.route ? -1 : 1));
  for (let i = 1; i < all.length; i++) {
    const p = all[i - 1] as { t: number };
    const q = all[i] as { t: number };
    if (q.t - p.t < minGap) q.t = p.t + minGap;
  }
  return all;
}

/** 노선 하나 → TimetableFile(source synthetic, approximate). 편성 = rail.bin 노선 편성, 범위 = 선로 양끝에서 편성 반 길이 안. */
export function synthesizeLine(cfg: SyntheticLine, net: RailNetwork): TimetableFile {
  const line = net.lines.find((l) => l.id === cfg.line);
  if (!line) throw new Error(`synthetic: line ${cfg.line} not in rail.bin`);
  const half = (line.formation.cars * line.formation.carLengthM) / 2;
  const trackIds = [...new Set(cfg.services.flatMap((s) => Object.keys(s.tracks)))].sort();
  const calendars: TimetableCalendar[] = SYNTH_CALENDARS.map((c) => {
    const trips: TimetableTrip[] = [];
    for (const id of trackIds) {
      const tv = trackView(net, id);
      const stops: StopPlan[] = [...tv.meta.stops]
        .sort((p, q) => p.s - q.s)
        .map((s) => ({ station: s.station, s: s.s, dwellS: cfg.dwellS[s.station] ?? DEFAULT_DWELL_S }));
      const lists = cfg.services
        .filter((s) => id in s.tracks)
        .map((s) => ({ route: s.id, times: bandDepartures(s.bands, c.id, s.tracks[id] as number) }));
      const n = new Map<string, number>();
      for (const { route, t } of mergeOnTrack(lists)) {
        const k = (n.get(route) ?? 0) + 1;
        n.set(route, k);
        const head = {
          id: `${route}-${c.id}-${tv.meta.heading}-${String(k).padStart(4, '0')}`,
          route,
          cars: line.formation.cars,
          carLengthM: line.formation.carLengthM,
          from: half,
          to: Math.max(half, tv.meta.lengthM - half),
        };
        trips.push(compileTrip(tv, head, { enterS: t }, stops));
      }
    }
    trips.sort((p, q) => p.enterS - q.enterS || (p.id < q.id ? -1 : 1));
    return { id: c.id, days: [...c.days], trips };
  });
  return {
    schema: 1,
    line: cfg.line,
    source: 'synthetic',
    approximate: true,
    routes: cfg.services.map((s) => ({ id: s.id, name: s.label, color: s.color })),
    calendars,
  };
}
