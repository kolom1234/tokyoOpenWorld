// URL 플래그 보조 파서(boot.ts 400줄 제한으로 분리): 태양·군중·오디오. see docs/15-conventions.md §8
import { parseSunFlag } from './debug/sun-override.ts';
import type { CrowdMode } from './world-late.ts';

export function sunFlag(v: string | null): { sun?: { azDeg: number; elDeg: number } } {
  const sun = parseSunFlag(v);
  return sun ? { sun } : {};
}

export function crowdFlag(v: string | null): { crowd?: CrowdMode } {
  if (v === '0' || v === 'off') return { crowd: 'off' };
  return v === 'dummy' || v === 'scramble' || v === 'agents' ? { crowd: v } : {};
}

/** `?audio=0`·`?vol=`(0–1.5). */
export function audioFlagsOf(q: URLSearchParams): { audio?: { off?: boolean; vol?: number } } {
  const vol = Number(q.get('vol'));
  const a = {
    ...(q.get('audio') === '0' ? { off: true } : {}),
    ...(q.has('vol') && Number.isFinite(vol) ? { vol: Math.min(1.5, Math.max(0, vol)) } : {}),
  };
  return Object.keys(a).length > 0 ? { audio: a } : {};
}
