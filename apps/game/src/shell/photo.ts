// 포토 모드(M10-T05, 12 §5): 들어가면 freecam(지금 카메라 자세)·시계 정지·날씨 보관, 파라미터 = 시간 이동(±12 h)·날씨 프리셋·노출 EV·초점 거리 mm(→ FOV)·조리개(→ DOF)·초점 거리 m,
// 나오면 걷던 몸으로(같은 자리 — returnToBody)·시계·날씨·FOV 복원. 사진 = render.screenshot(×1|×2) 원본 PNG(UI가 화이트밸런스·비네팅·그레인 합성) → 썸네일 보관 → 가까운 발견 명소(250 m)에 연결.
import type { CameraState, Vec3d, WeatherParams } from '@sanpo/core';
import type { ClockMode } from '@sanpo/sim';
import type { LocalName, PhotoParams } from '@sanpo/ui';
import WEATHER_CLIMATE from '../../../../content/sim/weather-climate.json';
import { applyWeatherSpec } from '../weather-mode.ts';
import type { WorldView } from '../world-view.ts';
import { pushNotice } from './hud-state.ts';
import type { DiscoveryState } from './pois.ts';

/** 35 mm 환산(센서 높이 24 mm) 초점 거리 → 수직 FOV(도). */
export const fovOfFocal = (mm: number): number => (2 * Math.atan(24 / (2 * mm)) * 180) / Math.PI;

/** 조리개(f) → DOF: f/22 이상 = 끔, 밝을수록 보케 크고 초점 깊이 얕다. */
export function dofOf(
  p: Pick<PhotoParams, 'aperture' | 'focusM'>,
): { focusM: number; rangeM: number; bokeh: number } | null {
  if (p.aperture >= 22 || p.focusM === null) return null;
  const focus = Math.max(0.5, p.focusM);
  return { focusM: focus, rangeM: Math.max(0.5, focus * (p.aperture / 8)), bokeh: Math.min(3, 4 / p.aperture) };
}

function yawPitchOf(q: CameraState['quat']): { yawRad: number; pitchRad: number } {
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fy = 2 * (q.w * q.x - q.y * q.z);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return { yawRad: Math.atan2(-fx, -fz), pitchRad: Math.asin(Math.max(-1, Math.min(1, fy))) };
}

interface Saved {
  mode: string;
  feet: Vec3d;
  yawRad: number;
  clock: ClockMode | null;
  baseMs: number;
  weather: { mode: string; params: WeatherParams };
}

export interface PhotoPhotoRecord {
  id: string;
  thumb: Blob;
  url: string;
  atMs: number;
  poiId: string | null;
}

export interface PhotoControl {
  /** null = 포토 모드 나가기. 처음 non-null = 들어가기(못 들어가면 false — 탈것·열차 중). */
  set(p: PhotoParams | null): boolean;
  readonly active: boolean;
  shoot(scale: 1 | 2): Promise<Blob>;
  store(thumb: Blob): Promise<{ id: string; poiName: LocalName | null }>;
  pickFocus(x: number, y: number): Promise<number | null>;
  photoUrl(id: string): string | undefined;
  photos(): readonly PhotoPhotoRecord[];
  restore(list: readonly { id: string; thumb: Blob; atMs: number; poiId: string | null }[]): void;
}

const clockOf = (w: WorldView): ClockMode | null => {
  const c = w.sim.clock;
  if (c.mode === 'custom') return { kind: 'custom', startMs: c.gameTimeMs, scale: c.timeScale as 1 | 2 | 10 | 60 };
  if (c.mode === 'realtime') return { kind: 'realtime' };
  return null;
};

function enter(w: WorldView): Saved | null {
  const t = w.traversal;
  if (t.mode !== 'walk' && t.mode !== 'freecam') return null;
  const saved: Saved = {
    mode: t.mode,
    feet: { ...t.player.posWF },
    yawRad: t.player.yawRad,
    clock: clockOf(w),
    baseMs: w.sim.clock.gameTimeMs,
    weather: { mode: w.sim.weather.mode, params: { ...w.sim.weather.params } },
  };
  const cam = t.camera;
  if (t.mode === 'walk') t.request('freecam', { posWF: { ...cam.posWF }, ...yawPitchOf(cam.quat) });
  w.sim.clock.setMode({ kind: 'frozen', atMs: saved.baseMs });
  return saved;
}

function leave(w: WorldView, s: Saved, fovDeg: number): void {
  w.render.setPhoto(null);
  w.input.setPointerLockOnClick(true);
  w.traversal.configure({ fovDeg });
  w.sim.clock.setMode(
    s.clock
      ? { ...s.clock, ...(s.clock.kind === 'custom' ? { startMs: s.baseMs } : {}) }
      : { kind: 'frozen', atMs: s.baseMs },
  );
  if (s.weather.mode === 'auto') w.sim.weather.setMode('auto');
  else w.sim.weather.setMode('fixed', s.weather.params);
  if (s.mode === 'walk') w.traversal.request('walk', { posWF: s.feet, yawRad: s.yawRad });
}

export function createPhoto(
  doc: Document,
  world: () => WorldView | undefined,
  discovery: DiscoveryState,
  baseFov: () => number,
): PhotoControl {
  let saved: Saved | null = null;
  let lastWeather: string | null = null;
  const photos: PhotoPhotoRecord[] = [];
  let seq = 0;
  const apply = (w: WorldView, p: PhotoParams, s: Saved) => {
    w.sim.clock.setMode({ kind: 'frozen', atMs: s.baseMs + p.timeOffsetH * 3_600_000 });
    if (p.weather !== lastWeather) {
      lastWeather = p.weather;
      if (p.weather) applyWeatherSpec(w.sim, { mode: 'fixed', preset: p.weather }, WEATHER_CLIMATE as never);
      else if (s.weather.mode === 'auto') w.sim.weather.setMode('auto');
      else w.sim.weather.setMode('fixed', s.weather.params);
    }
    w.traversal.configure({ fovDeg: fovOfFocal(p.focalMm) });
    w.render.setPhoto({ exposureEv: p.exposureEv, dof: dofOf(p) });
  };
  return {
    get active() {
      return saved !== null;
    },
    set(p) {
      const w = world();
      if (!w) return false;
      if (!p) {
        if (saved) leave(w, saved, baseFov());
        saved = null;
        lastWeather = null;
        return true;
      }
      if (!saved) {
        saved = enter(w);
        if (!saved) {
          pushNotice(doc, { key: 'photo.notice.walkOnly' });
          return false;
        }
        // 걷다가 P — 포인터 잠금을 풀고 클릭 잠금도 끈다: 패널·끌기·우클릭 초점에 커서가 필요(풀림은 화면이 photo라 자동 일시정지 안 함).
        w.input.setPointerLockOnClick(false);
        if (doc.pointerLockElement) doc.exitPointerLock();
      }
      apply(w, p, saved);
      return true;
    },
    shoot(scale) {
      const w = world();
      return w ? w.render.screenshot({ scale }) : Promise.reject(new Error('photo: no world'));
    },
    store: (thumb) =>
      storePhoto(world(), discovery, photos, thumb, `p${Date.now().toString(36)}${(seq++).toString(36)}`),
    pickFocus: (x, y) => pickFocus(world(), doc, x, y),
    photoUrl: (id) => photos.find((p) => p.id === id)?.url,
    photos: () => photos,
    restore(list) {
      for (const r of list)
        if (!photos.some((p) => p.id === r.id)) photos.push({ ...r, url: URL.createObjectURL(r.thumb) });
      capPhotos(photos, MAX_PHOTOS, (old) => discovery.detachPhoto(old));
    },
  };
}

/** 도감 사진 상한(12 §5) — 넘으면 가장 오래된 것부터 지운다(썸네일 URL 해제·도감 연결 끊기, IndexedDB 썸네일은 다음 저장 때 save가 정리). */
export const MAX_PHOTOS = 200;

export function capPhotos(photos: PhotoPhotoRecord[], max: number, onEvict: (id: string) => void): void {
  while (photos.length > max) {
    const old = photos.shift() as PhotoPhotoRecord;
    URL.revokeObjectURL(old.url);
    onEvict(old.id);
  }
}

async function storePhoto(
  w: WorldView | undefined,
  discovery: DiscoveryState,
  photos: PhotoPhotoRecord[],
  thumb: Blob,
  id: string,
): Promise<{ id: string; poiName: LocalName | null }> {
  const cam = w?.traversal.camera.posWF;
  const near = cam ? nearestFound(discovery, cam) : null;
  photos.push({
    id,
    thumb,
    url: URL.createObjectURL(thumb),
    atMs: w?.sim.clock.gameTimeMs ?? 0,
    poiId: near?.id ?? null,
  });
  if (near) discovery.attachPhoto(near.id, id);
  capPhotos(photos, MAX_PHOTOS, (old) => discovery.detachPhoto(old));
  return { id, poiName: near?.name ?? null };
}

/** 화면 점 → 물리 레이 거리(m). */
async function pickFocus(w: WorldView | undefined, doc: Document, x: number, y: number): Promise<number | null> {
  const ph = w?.physics;
  if (!w || !ph) return null;
  const hit = await ph.raycast({ ...w.traversal.camera.posWF }, rayDir(w.traversal.camera, x, y, doc), 2000);
  return hit ? Math.round(hit.distance * 10) / 10 : null;
}

function nearestFound(d: DiscoveryState, p: Readonly<Vec3d>): { id: string; name: LocalName } | null {
  const found = new Set(d.records().map((r) => r.id));
  let best: { id: string; name: LocalName; dist: number } | null = null;
  for (const e of d.entries) {
    if (!found.has(e.id)) continue;
    const dist = Math.hypot(e.posWF.x - p.x, e.posWF.z - p.z);
    if (dist < 250 && (!best || dist < best.dist)) best = { id: e.id, name: e.name, dist };
  }
  return best;
}

/** 화면 정규 좌표(0…1) → WF 방향(카메라 FOV·화면비). */
function rayDir(cam: Readonly<CameraState>, x: number, y: number, doc: Document): { x: number; y: number; z: number } {
  const c = doc.getElementById('view') as HTMLCanvasElement | null;
  const aspect = c ? c.clientWidth / Math.max(1, c.clientHeight) : 16 / 9;
  const t = Math.tan((cam.fovDeg * Math.PI) / 360);
  const vx = (x * 2 - 1) * t * aspect;
  const vy = (1 - y * 2) * t;
  const v = { x: vx, y: vy, z: -1 };
  const q = cam.quat;
  // 쿼터니언 회전 v' = q v q*.
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  const r = {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
  const len = Math.hypot(r.x, r.y, r.z) || 1;
  return { x: r.x / len, y: r.y / len, z: r.z / len };
}
