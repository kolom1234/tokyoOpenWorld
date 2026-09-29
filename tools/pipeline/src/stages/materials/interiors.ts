// 실내 큐브맵 생성(M03-T05, 07 §5-4): 방 8종(interior-rooms.ts)을 방 중심에서 6면 광선 추적 → 면 PNG 48장(레이어 = 방 × 6 + 면).
// 조명 = 창(−z) 쪽 주광 + 천장 조명 + 주변광, 모서리 AO·가구 접지 그림자, 바닥 무늬. 결정론(난수 없음). KTX2 인코딩은 run.ts(ETC1S sRGB 배열).
// 면 좌표 표는 render `materials/facade/interior.ts`와 같아야 한다.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePngRgb } from '../../lib/png.ts';
import { type Box, INTERIOR_ROOMS, type Rgb, type Room } from './interior-rooms.ts';

/** 면 한 변(px). */
export const INTERIOR_FACE_SIZE = 256;
/** 생성기 판(캐시 해시에 포함 — 방·조명·표를 바꾸면 올린다). */
export const INTERIOR_VERSION = 1;
export const INTERIOR_FACES = 6;

type V3 = [number, number, number];

/** 면(+X, −X, +Y, −Y, +Z, −Z) 좌표 s(→ 오른쪽)·t(→ 위) ∈ [−1, 1] → 방향. */
export function faceDir(face: number, s: number, t: number): V3 {
  switch (face) {
    case 0:
      return [1, t, -s];
    case 1:
      return [-1, t, s];
    case 2:
      return [s, 1, -t];
    case 3:
      return [s, -1, t];
    case 4:
      return [s, t, 1];
    default:
      return [-s, t, -1];
  }
}

interface Hit {
  t: number;
  p: V3;
  n: V3;
  color: Rgb;
  kind: 'room' | 'box';
}

/** 중심(원점)에서 방 상자 벽까지. */
function hitRoom(d: V3, room: Room): Hit {
  const ax: V3 = [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])];
  const k = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
  const t = 1 / (ax[k] as number);
  const p: V3 = [d[0] * t, d[1] * t, d[2] * t];
  const n: V3 = [0, 0, 0];
  n[k] = -Math.sign(d[k] as number);
  const color = k === 1 ? (d[1] > 0 ? room.ceiling : room.floor) : room.wall;
  return { t, p, n, color, kind: 'room' };
}

/** 상자(slab) 진입점, 없으면 undefined. */
function hitBox(d: V3, b: Box): Hit | undefined {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  let axis = 0;
  for (let k = 0; k < 3; k++) {
    const dk = d[k] as number;
    if (Math.abs(dk) < 1e-9) {
      if (0 < (b.min[k] as number) || 0 > (b.max[k] as number)) return undefined;
      continue;
    }
    const a = (b.min[k] as number) / dk;
    const c = (b.max[k] as number) / dk;
    const near = Math.min(a, c);
    if (near > t0) [t0, axis] = [near, k];
    t1 = Math.min(t1, Math.max(a, c));
  }
  if (t0 <= 0 || t0 > t1) return undefined;
  const n: V3 = [0, 0, 0];
  n[axis] = -Math.sign(d[axis] as number);
  return { t: t0, p: [d[0] * t0, d[1] * t0, d[2] * t0], n, color: b.color, kind: 'box' };
}

const smooth = (a: number, b: number, x: number): number => {
  const u = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return u * u * (3 - 2 * u);
};

/** 결정론 정수 해시 → [0, 1). */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** 바닥 무늬 명도 배율. */
function floorPattern(room: Room, x: number, z: number): number {
  if (room.floorPattern === 'wood') {
    const plank = Math.floor((z + 1) * 8);
    const seam = Math.abs(((z + 1) * 8) % 1) < 0.04 ? 0.7 : 1;
    return (0.85 + 0.3 * hash01(plank, Math.floor((x + 1) * 2 + plank))) * seam;
  }
  if (room.floorPattern === 'tatami') {
    const u = ((x + 1) * 1.5) % 1;
    const v = ((z + 1) * 3) % 1;
    return Math.min(u, 1 - u) < 0.03 || Math.min(v, 1 - v) < 0.05 ? 0.45 : 0.95 + 0.1 * Math.sin(x * 120);
  }
  if (room.floorPattern === 'carpet') {
    const tile = hash01(Math.floor((x + 1) * 4), Math.floor((z + 1) * 4));
    return 0.9 + 0.2 * tile;
  }
  return 1;
}

/** 천장이면 조명판·격자 반영한 색(발광은 1 넘김 → 흰색 포화). */
function ceilingColor(room: Room, p: V3): Rgb | undefined {
  for (const [x0, z0, x1, z1] of room.lights) {
    if (p[0] >= x0 && p[0] <= x1 && p[2] >= z0 && p[2] <= z1) {
      const on = room.lightLevel;
      return on > 0 ? [1.6 * on, 1.55 * on, 1.4 * on] : [0.5, 0.5, 0.5];
    }
  }
  return undefined;
}

/** 모서리 AO: 면 위 점의 다른 두 축 경계까지 거리. */
function cornerAo(p: V3, n: V3): number {
  let ao = 1;
  for (let k = 0; k < 3; k++) {
    if ((n[k] as number) !== 0) continue;
    ao *= 0.72 + 0.28 * smooth(0, 0.22, 1 - Math.abs(p[k] as number));
  }
  return ao;
}

function underBox(room: Room, p: V3): boolean {
  return room.boxes.some(
    (b) => p[0] > b.min[0] - 0.06 && p[0] < b.max[0] + 0.06 && p[2] > b.min[2] - 0.06 && p[2] < b.max[2] + 0.06,
  );
}

/** 표면 조명(선형). */
function shade(room: Room, h: Hit): Rgb {
  const { p, n } = h;
  const lit = room.lightLevel;
  // 창 쪽 주광: 창을 향한 면일수록, 창에서 가까울수록.
  const toWin = [0, 0.33, -0.94];
  const facing = Math.max(0, n[0] * (toWin[0] as number) + n[1] * (toWin[1] as number) + n[2] * (toWin[2] as number));
  const day = facing * (0.55 - 0.18 * (p[2] + 1));
  const top = n[1] > 0.5 ? 0.35 * lit : 0.12 * lit * (p[1] + 1);
  let l = (0.3 + 0.2 * lit + day + top) * (h.kind === 'room' ? cornerAo(p, n) : 1);
  let c = h.color;
  if (h.kind === 'room' && n[1] > 0.5) {
    l *= floorPattern(room, p[0], p[2]) * (underBox(room, p) ? 0.55 : 1);
  }
  if (h.kind === 'room' && n[1] < -0.5) {
    const light = ceilingColor(room, p);
    if (light) return light;
    const grid = Math.abs(((p[0] + 1) * 3) % 1) < 0.02 || Math.abs(((p[2] + 1) * 3) % 1) < 0.02;
    if (grid && room.id.startsWith('office')) l *= 0.8;
  }
  if (h.kind === 'box' && n[1] > 0.5) c = c.map((x) => x * 1.08) as unknown as Rgb;
  return [c[0] * l, c[1] * l, c[2] * l];
}

const toSrgb8 = (x: number): number => {
  const v = Math.min(Math.max(x, 0), 1);
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

/** 방 1개의 면 1장(sRGB 8비트 RGB, 행 0 = 위). */
export function renderFace(room: Room, face: number, size = INTERIOR_FACE_SIZE): Uint8Array {
  const out = new Uint8Array(size * size * 3);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const d = faceDir(face, ((col + 0.5) / size) * 2 - 1, 1 - ((row + 0.5) / size) * 2);
      let hit = hitRoom(d, room);
      for (const b of room.boxes) {
        const bh = hitBox(d, b);
        if (bh && bh.t < hit.t) hit = bh;
      }
      const c = shade(room, hit);
      const i = (row * size + col) * 3;
      out[i] = toSrgb8(c[0]);
      out[i + 1] = toSrgb8(c[1]);
      out[i + 2] = toSrgb8(c[2]);
    }
  }
  return out;
}

export interface InteriorImages {
  /** 레이어 순(방 × 6 + 면) PNG 경로. */
  files: string[];
  /** 방별 평균색(sRGB 0–1, 창 벽 −Z 제외) — 원거리·적재 전 단색. */
  rooms: { id: string; avgColor: [number, number, number] }[];
}

function averageRgb(faces: readonly Uint8Array[]): [number, number, number] {
  const sum = [0, 0, 0];
  let n = 0;
  for (const f of faces) {
    for (let i = 0; i < f.length; i += 3) {
      for (let k = 0; k < 3; k++) sum[k] = (sum[k] as number) + (f[i + k] as number);
      n++;
    }
  }
  return sum.map((v) => Math.round((v / n / 255) * 1000) / 1000) as [number, number, number];
}

export function writeInteriorFaces(dir: string, size = INTERIOR_FACE_SIZE): InteriorImages {
  const files: string[] = [];
  const rooms: InteriorImages['rooms'] = [];
  for (const room of INTERIOR_ROOMS) {
    const faces: Uint8Array[] = [];
    for (let f = 0; f < INTERIOR_FACES; f++) {
      const rgb = renderFace(room, f, size);
      const file = join(dir, `interior_${room.id}_${f}.png`);
      writeFileSync(file, encodePngRgb(size, size, rgb));
      files.push(file);
      if (f !== 5) faces.push(rgb);
    }
    rooms.push({ id: room.id, avgColor: averageRgb(faces) });
  }
  return { files, rooms };
}
