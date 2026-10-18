// 빠른 이동 대상(M10-T03, 12 §2 "발견한 역만"): 스폰 프리셋 중 역 개찰구·장소(승강장·시험 코스·거점 = 개발용 제외). 타이틀 시작 지점 3곳은 처음부터 열림,
// 나머지는 60 m 안에 가 보면 열린다(1 s마다 검사). 열린 목록은 세이브(T06)가 저장·복원한다.
import type { GameSystem, Vec3d } from '@sanpo/core';
import type { Signal, TravelPlace } from '@sanpo/ui';
import { spawnPreset } from '../spawn-presets.ts';

/** 타이틀 "새 산책" 시작 지점(스폰 프리셋 id — 처음부터 열림). */
export const START_POINTS = ['shibuya-scramble', 'harajuku-gate', 'shinjuku-west'] as const;

export const TRAVEL_DEFS: readonly { id: string; kind: TravelPlace['kind'] }[] = [
  { id: 'shibuya-scramble', kind: 'place' },
  { id: 'shibuya-hachiko-gate', kind: 'station' },
  { id: 'harajuku-gate', kind: 'station' },
  { id: 'yoyogi-west', kind: 'station' },
  { id: 'shinjuku-west', kind: 'station' },
  { id: 'omotesando', kind: 'place' },
  { id: 'yoyogi-park', kind: 'place' },
];
const UNLOCK_M = 60;

export function travelPlaces(unlocked: ReadonlySet<string>): TravelPlace[] {
  return TRAVEL_DEFS.flatMap((d) => {
    const p = spawnPreset(d.id);
    if (!p) return [];
    const [x, y, z] = p.posWF;
    return [{ id: d.id, name: p.name, kind: d.kind, posWF: { x, y, z }, unlocked: unlocked.has(d.id) }];
  });
}

export interface TravelState {
  readonly unlocked: ReadonlySet<string>;
  isUnlocked(id: string): boolean;
  restore(ids: readonly string[]): void;
  system(player: () => Readonly<Vec3d>): GameSystem;
}

export function createTravelState(places: Signal<readonly TravelPlace[]>): TravelState {
  const unlocked = new Set<string>(START_POINTS);
  const publish = () => {
    places.value = travelPlaces(unlocked);
  };
  publish();
  return {
    unlocked,
    isUnlocked: (id) => unlocked.has(id),
    restore(ids) {
      for (const id of ids) if (TRAVEL_DEFS.some((d) => d.id === id)) unlocked.add(id);
      publish();
    },
    system(player) {
      let acc = 0;
      return {
        id: 'shell.travel',
        phase: 96,
        update(f) {
          acc += f.dtReal;
          if (acc < 1) return;
          acc = 0;
          const p = player();
          let changed = false;
          for (const pl of places.peek())
            if (!pl.unlocked && Math.hypot(pl.posWF.x - p.x, pl.posWF.z - p.z) < UNLOCK_M) {
              unlocked.add(pl.id);
              changed = true;
            }
          if (changed) publish();
        },
        dispose() {},
      };
    },
  };
}
