// 세이브 스키마·마이그레이션(M10-T06, 12 §4): 버전 필드 + 단계별 함수 표. v1 = 12 §4 초안 모양(발견 id 배열·사진 메타), v2 = 지금(발견 기록·빠른 이동·사진 명소 연결).
// 가져오기·IndexedDB 읽기 모두 migrateSave를 거친다 — 모르는·망가진 값은 고치거나 버린다(예외 대신 기본값). 순수 함수(테스트).
import type { SaveData, SaveExport } from '../../api.ts';
import { normalizeSettings } from '../settings.ts';

export const SAVE_VERSION = 2;

/** 처음부터 열린 빠른 이동 대상(v1 → v2 기본). */
const START_UNLOCKED = ['shibuya-scramble', 'harajuku-gate', 'shinjuku-west'];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const ID = /^[a-z0-9:_-]{1,64}$/i;

function vec(v: unknown): { x: number; y: number; z: number } {
  const o = obj(v);
  return { x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0) };
}

/** v1(12 §4 초안): { v: 1, posWF, yaw, mode, discovered: string[], photos: {id, atMs}[], stats, gameTimeMs }. */
function v1to2(r: Raw): Raw {
  const at = num(r.gameTimeMs, 0);
  return {
    v: 2,
    savedAt: num(r.savedAt, 0),
    posWF: r.posWF,
    yawRad: num(r.yaw, 0),
    mode: r.mode,
    gameTimeMs: at,
    discoveries: strs(r.discovered).map((id) => ({ id, atMs: at, weather: 'clear', photoIds: [] })),
    unlocked: START_UNLOCKED,
    photos: (Array.isArray(r.photos) ? r.photos : []).map((p) => ({
      id: str(obj(p).id, ''),
      atMs: num(obj(p).atMs, at),
      poiId: null,
    })),
    stats: obj(r.stats),
  };
}

const MIGRATIONS: Readonly<Record<number, (r: Raw) => Raw>> = { 1: v1to2 };

/** v2 모양 검사·정리. */
function normalize(r: Raw): SaveData {
  const photos = (Array.isArray(r.photos) ? r.photos : [])
    .map((p) => obj(p))
    .filter((p) => ID.test(str(p.id, '')))
    .map((p) => ({ id: str(p.id, ''), atMs: num(p.atMs, 0), poiId: typeof p.poiId === 'string' ? p.poiId : null }));
  const discoveries = (Array.isArray(r.discoveries) ? r.discoveries : [])
    .map((d) => obj(d))
    .filter((d) => ID.test(str(d.id, '')))
    .map((d) => ({
      id: str(d.id, ''),
      atMs: num(d.atMs, 0),
      weather: str(d.weather, 'clear'),
      photoIds: strs(d.photoIds),
      ...(d.posWF ? { posWF: vec(d.posWF) } : {}),
    }));
  const mode = str(r.mode, 'walk');
  return {
    v: 2,
    savedAt: num(r.savedAt, 0),
    posWF: vec(r.posWF),
    yawRad: num(r.yawRad, 0),
    mode: mode === 'freecam' ? 'freecam' : 'walk',
    gameTimeMs: num(r.gameTimeMs, 0),
    discoveries,
    unlocked: strs(r.unlocked).filter((id) => ID.test(id)),
    photos,
    stats: { walkedM: num(obj(r.stats).walkedM, 0) },
  };
}

/** 아무 값 → 지금 스키마(없는 버전은 1로 본다). 앞으로의 버전(더 높음)은 거부(null). */
export function migrateSave(raw: unknown): SaveData | null {
  let r = obj(raw);
  if (Object.keys(r).length === 0) return null;
  let v = num(r.v, 1);
  if (v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    r = step(r);
    v = num(r.v, v + 1);
  }
  return normalize(r);
}

const DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;

/** 내보내기 JSON 글 → 검사·마이그레이션(형식이 다르거나 망가지면 null). 썸네일은 이미지 data URL만. */
export function parseSaveExport(text: string): SaveExport | null {
  let raw: Raw;
  try {
    raw = obj(JSON.parse(text));
  } catch {
    return null;
  }
  if (raw.format !== 'tokyo-sanpo-save') return null;
  const save = migrateSave(raw.save);
  if (!save) return null;
  const thumbs: Record<string, string> = {};
  for (const [id, url] of Object.entries(obj(raw.thumbs)))
    if (ID.test(id) && typeof url === 'string' && DATA_URL.test(url) && url.length < 2_000_000) thumbs[id] = url;
  return { format: 'tokyo-sanpo-save', save, settings: normalizeSettings(raw.settings), thumbs };
}
