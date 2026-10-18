// UiBridge 명령 구현(M10): 일시정지·시작(새 산책 = 시작 지점 빠른 이동)·빠른 이동. 이후 태스크가 사진·세이브·시간·날씨를 더한다.
import type { Vec3d } from '@sanpo/core';
import type { UiCommands } from '@sanpo/ui';
import { spawnPreset } from '../spawn-presets.ts';
import type { WorldView } from '../world-view.ts';
import { fastTravel } from './fast-travel.ts';
import type { PauseControl } from './pause.ts';
import { START_POINTS, type TravelState } from './travel.ts';

export interface CommandContext {
  doc: Document;
  world(): WorldView | undefined;
  pause: PauseControl;
  travel: Pick<TravelState, 'isUnlocked' | 'poiPos'>;
}

/** 스폰 프리셋으로 빠른 이동(승강장 프리셋 제외 — 역 배선 전용). */
export function travelToPreset(ctx: CommandContext, id: string): Promise<void> {
  const p = spawnPreset(id);
  const w = ctx.world();
  if (!w || !p || p.surface === 'platform') return Promise.resolve();
  const [x, y, z] = p.posWF;
  return fastTravel(
    {
      doc: ctx.doc,
      traversal: w.traversal,
      physics: () => w.physics,
      settled: () => {
        const st = w.streaming?.stats();
        return !st || st.queued + st.fetching + st.decoding + st.pendingReady === 0;
      },
    },
    { posWF: { x, y, z }, yawRad: (p.yawDeg * Math.PI) / 180, exact: p.surface === 'exact' },
  ).then(() => undefined);
}

/** 명소 위치로(지면은 walk가 찾는다 — 건물 안이면 가까운 거리로). */
export function travelToPos(ctx: CommandContext, posWF: Vec3d): Promise<void> {
  const w = ctx.world();
  if (!w) return Promise.resolve();
  return fastTravel(
    { doc: ctx.doc, traversal: w.traversal, physics: () => w.physics },
    { posWF, yawRad: 0, arriveM: 120 },
  ).then(() => undefined);
}

export function startPoints(): { id: string; name: { ko: string; ja: string; en: string } }[] {
  return START_POINTS.flatMap((id) => {
    const p = spawnPreset(id);
    return p ? [{ id, name: p.name }] : [];
  });
}

export function createCommands(ctx: CommandContext): UiCommands {
  return {
    pause: (on) => ctx.pause.set(on),
    start: (c) => (c.kind === 'new' ? travelToPreset(ctx, c.at) : Promise.resolve()),
    fastTravel: (id) => {
      if (!ctx.travel.isUnlocked(id)) return Promise.resolve();
      const poi = ctx.travel.poiPos(id);
      return poi ? travelToPos(ctx, poi) : travelToPreset(ctx, id);
    },
    setTime: () => {},
    setWeather: () => {},
    takePhoto: () => Promise.reject(new Error('photo mode: M10-T05')),
    setPhotoParams: () => {},
    exportSave: () => Promise.reject(new Error('save: M10-T06')),
    importSave: () => Promise.reject(new Error('save: M10-T06')),
  };
}
