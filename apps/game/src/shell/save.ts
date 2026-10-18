// 세이브(M10-T06, 12 §4, ADR-0096): IndexedDB(idb-keyval) `save/v2` = SaveData, `photo/<id>` = 썸네일 Blob. 모음(발견·빠른 이동·사진)은 부팅 때 늘 복원, 이어하기는 위치·시각까지.
// 자동 저장 60 s + 모드 전환 때. 내보내기 = JSON(세이브 + 설정 + 썸네일 data URL), 가져오기 = parseSaveExport(검사·마이그레이션) → 저장 → 적용.
import type { GameSystem } from '@sanpo/core';
import {
  migrateSave,
  parseSaveExport,
  type SaveData,
  type SaveExport,
  type SettingsModel,
  type Signal,
} from '@sanpo/ui';
import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { WorldView } from '../world-view.ts';
import type { PhotoControl } from './photo.ts';
import type { DiscoveryState } from './pois.ts';
import type { TravelState } from './travel.ts';

export const SAVE_KEY = 'save/v2';
const OLD_KEYS = ['save/v1'];
const AUTOSAVE_S = 60;

export interface SaveParts {
  discovery: DiscoveryState;
  travel: TravelState;
  photo: PhotoControl;
  settings: Signal<SettingsModel>;
}

/** 지금 상태 → SaveData. */
export function snapshotOf(w: WorldView, p: SaveParts, walkedM: number): SaveData {
  const t = w.traversal;
  return {
    v: 2,
    savedAt: Date.now(),
    posWF: { ...t.player.posWF },
    yawRad: t.player.yawRad,
    mode: t.mode === 'freecam' ? 'freecam' : 'walk',
    gameTimeMs: w.sim.clock.gameTimeMs,
    discoveries: p.discovery.records().map((r) => ({ ...r, photoIds: [...r.photoIds] })),
    unlocked: [...p.travel.unlocked],
    photos: p.photo.photos().map((ph) => ({ id: ph.id, atMs: ph.atMs, poiId: ph.poiId })),
    stats: { walkedM: Math.round(walkedM) },
  };
}

/** Blob → data URL(브라우저·Node 공통 — FileReader 없이). */
export async function blobToDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/** data URL → Blob(fetch 없이 — 배포 CSP `connect-src 'self'`는 data: fetch를 막는다). base64가 아니면 null. */
export function dataUrlToBlob(u: string): Blob | null {
  const m = /^data:([^;,]*);base64,(.*)$/s.exec(u);
  if (!m) return null;
  try {
    const bin = atob(m[2] as string);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
  } catch {
    return null;
  }
}

export interface SaveStore {
  load(): Promise<SaveData | null>;
  write(s: SaveData, thumbs?: ReadonlyMap<string, Blob>): Promise<void>;
  thumbs(ids: readonly string[]): Promise<Map<string, Blob>>;
}

export function createSaveStore(store: UseStore = createStore('tokyo-sanpo', 'kv')): SaveStore {
  return {
    async load() {
      const cur = await get(SAVE_KEY, store);
      if (cur) return migrateSave(cur);
      for (const k of OLD_KEYS) {
        const old = await get(k, store);
        if (old) return migrateSave(old);
      }
      return null;
    },
    async write(s, thumbs) {
      await set(SAVE_KEY, s, store);
      for (const k of OLD_KEYS) await del(k, store);
      if (thumbs) for (const [id, b] of thumbs) await set(`photo/${id}`, b, store);
    },
    async thumbs(ids) {
      const out = new Map<string, Blob>();
      for (const id of ids) {
        const b = (await get(`photo/${id}`, store)) as Blob | undefined;
        if (b) out.set(id, b);
      }
      return out;
    },
  };
}

/** 세이브의 모음(발견·빠른 이동·사진)을 셸에 적용. */
export async function applyCollection(s: SaveData, p: SaveParts, store: SaveStore): Promise<void> {
  p.travel.restore(s.unlocked);
  const thumbs = await store.thumbs(s.photos.map((ph) => ph.id));
  p.photo.restore(s.photos.flatMap((ph) => (thumbs.has(ph.id) ? [{ ...ph, thumb: thumbs.get(ph.id) as Blob }] : [])));
  p.discovery.restore(s.discoveries);
  for (const d of s.discoveries) {
    const e = p.discovery.entries.find((x) => x.id === d.id);
    if (e) p.travel.addPoi(e.id, e.name, d.posWF ?? e.posWF);
  }
}

export async function exportBlob(s: SaveData, p: SaveParts, store: SaveStore): Promise<Blob> {
  const thumbs: Record<string, string> = {};
  const fromStore = await store.thumbs(s.photos.map((ph) => ph.id));
  for (const ph of p.photo.photos()) fromStore.set(ph.id, ph.thumb);
  for (const [id, b] of fromStore) thumbs[id] = await blobToDataUrl(b);
  const file: SaveExport = { format: 'tokyo-sanpo-save', save: s, settings: p.settings.peek(), thumbs };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** 가져오기: 검사 → 썸네일·세이브 저장 → 반환(적용은 호출 쪽). 잘못된 파일 = 예외. */
export async function importFile(f: Blob, store: SaveStore): Promise<SaveExport> {
  const x = parseSaveExport(await f.text());
  if (!x) throw new Error('invalid save file');
  const thumbs = new Map<string, Blob>();
  for (const [id, url] of Object.entries(x.thumbs)) {
    const b = dataUrlToBlob(url);
    if (b) thumbs.set(id, b);
  }
  await store.write(x.save, thumbs);
  return x;
}

/** 자동 저장(60 s·모드 전환) + 걸은 거리 통계. 저장은 비동기(프레임을 막지 않는다). */
export function autosaveSystem(w: WorldView, p: SaveParts, store: SaveStore, enabled: () => boolean): GameSystem {
  let acc = 0;
  let mode = '';
  let walked = 0;
  let last = { ...w.traversal.player.posWF };
  let busy = false;
  const thumbsSaved = new Set<string>();
  return {
    id: 'shell.autosave',
    phase: 97,
    update(f) {
      const pos = w.traversal.player.posWF;
      if (w.traversal.mode === 'walk') walked += Math.min(20, Math.hypot(pos.x - last.x, pos.z - last.z));
      last = { ...pos };
      acc += f.dtReal;
      const modeChanged = mode !== '' && w.traversal.mode !== mode;
      mode = w.traversal.mode;
      if (!enabled() || busy || (acc < AUTOSAVE_S && !modeChanged)) return;
      acc = 0;
      busy = true;
      const thumbs = new Map(
        p.photo
          .photos()
          .filter((ph) => !thumbsSaved.has(ph.id))
          .map((ph) => [ph.id, ph.thumb] as const),
      );
      void store
        .write(snapshotOf(w, p, walked), thumbs)
        .then(() => {
          for (const id of thumbs.keys()) thumbsSaved.add(id);
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    },
    dispose() {},
  };
}

export interface SaveCommands {
  readonly hasSave: Signal<boolean>;
  /** 부팅 때: 저장된 모음 복원(이어하기 여부와 상관없이). */
  init(): Promise<void>;
  continueGame(): Promise<void>;
  exportSave(): Promise<Blob>;
  importSave(f: Blob): Promise<void>;
}

export function createSaveCommands(
  store: SaveStore | null,
  p: SaveParts,
  world: () => WorldView | undefined,
  travelTo: (posWF: SaveData['posWF'], yawRad: number) => Promise<void>,
  hasSave: Signal<boolean>,
): SaveCommands {
  let loaded: SaveData | null = null;
  return {
    hasSave,
    async init() {
      if (!store) return;
      loaded = await store.load().catch(() => null);
      if (!loaded) return;
      hasSave.value = true;
      await applyCollection(loaded, p, store);
    },
    async continueGame() {
      const s = loaded ?? (await store?.load()) ?? null;
      const w = world();
      if (!s || !w) return;
      const c = w.sim.clock;
      if (c.mode === 'custom') c.setMode({ kind: 'custom', startMs: s.gameTimeMs, scale: c.timeScale as 1 });
      await travelTo(s.posWF, s.yawRad);
    },
    async exportSave() {
      const w = world();
      if (!w || !store) throw new Error('save: not ready');
      return exportBlob(snapshotOf(w, p, 0), p, store);
    },
    async importSave(f) {
      if (!store) throw new Error('save: disabled in this mode');
      const x = await importFile(f, store);
      loaded = x.save;
      await applyCollection(x.save, p, store);
      p.settings.value = x.settings;
      hasSave.value = true;
    },
  };
}
