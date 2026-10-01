// 잎 아틀라스(M05-T04, 자체 절차 생성 — 외부 사진·텍스처 없음): 512² RGBA, 2 × 2 칸(256²) = 0 활엽 가지(느티·녹나무·관목), 1 은행잎(부채꼴),
// 2 벚나무 작은 잎(꽃철엔 셰이더가 분홍으로), 3 솔잎 다발. RGB = 명암(회색 — 수종·계절 색은 셰이더가 곱한다), A = 덮임(3 × 3 초표본).
// 같은 입력 → 같은 바이트(결정론 난수). see ADR-0052
import { createRng, hash32, type Rng, WORLD_SEED } from '@sanpo/core';

export const ATLAS_SIZE = 512;
const CELL = 256;
const SS = 3;

/** 칸 안 좌표(0..1, y 아래) → 명암(0..1), 밖이면 −1. */
type Shape = (x: number, y: number) => number;

/** 끝이 뾰족한 타원 잎: 잎자루 (bx, by), 방향 a(rad, 0 = 위), 길이 L, 폭 W. 가운데 잎맥은 어둡게. */
function leaf(bx: number, by: number, a: number, L: number, W: number, shade: number): Shape {
  const [s, c] = [Math.sin(a), Math.cos(a)];
  return (x, y) => {
    const dx = x - bx;
    const dy = y - by;
    const u = (dx * s - dy * c) / L;
    const v = (dx * c + dy * s) / W;
    if (u < 0 || u > 1) return -1;
    const half = 0.5 * Math.sin(Math.PI * u) ** 0.7;
    if (Math.abs(v) > half) return -1;
    if (Math.abs(v) < 0.035) return shade * 0.75;
    return shade * (0.92 + 0.08 * (Math.abs(v) / half));
  };
}

/** 은행잎: 잎자루 끝 (bx, by)에서 방향 a로 펼친 부채꼴(±50°, 반지름 0.3L–L), 가운데 갈라짐. */
function fan(bx: number, by: number, a: number, L: number, shade: number): Shape {
  return (x, y) => {
    const dx = x - bx;
    const dy = y - by;
    const r = Math.hypot(dx, dy);
    if (r < L * 0.3 || r > L) return -1;
    let t = Math.atan2(dx, -dy) - a;
    while (t > Math.PI) t -= 2 * Math.PI;
    while (t < -Math.PI) t += 2 * Math.PI;
    const edge = (50 * Math.PI) / 180;
    if (Math.abs(t) > edge * (0.9 + 0.1 * Math.cos((r / L) * 9))) return -1;
    if (Math.abs(t) < 0.06 && r > L * 0.65) return -1;
    return shade * (0.85 + 0.15 * (r / L));
  };
}

/** 선분(솔잎·잔가지): 두께 w. */
function needle(x0: number, y0: number, x1: number, y1: number, w: number, shade: number): Shape {
  const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
  return (x, y) => {
    const t = Math.min(Math.max(((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L2, 0), 1);
    const d = Math.hypot(x - (x0 + (x1 - x0) * t), y - (y0 + (y1 - y0) * t));
    return d <= w * (1 - 0.6 * t) ? shade : -1;
  };
}

const vary = (r: Rng): number => 0.78 + r.next() * 0.22;

function broadleafCell(r: Rng): Shape[] {
  const out: Shape[] = [needle(0.5, 0.97, 0.5, 0.12, 0.012, 0.45)];
  for (let k = 0; k < 9; k++) {
    const y = 0.85 - k * 0.08;
    const side = k % 2 ? 1 : -1;
    out.push(leaf(0.5, y, side * (0.75 + r.next() * 0.35), 0.3 + r.next() * 0.06, 0.15, vary(r)));
  }
  out.push(leaf(0.5, 0.14, 0, 0.13, 0.15, vary(r)));
  return out;
}

function ginkgoCell(r: Rng): Shape[] {
  const out: Shape[] = [];
  for (let k = 0; k < 7; k++) {
    const bx = 0.5 + (r.next() - 0.5) * 0.25;
    const by = 0.95 - k * 0.04;
    const a = (k - 3) * 0.42 + (r.next() - 0.5) * 0.2;
    out.push(needle(0.5, 0.98, bx, by, 0.008, 0.5), fan(bx, by, a, 0.34 + r.next() * 0.08, vary(r)));
  }
  return out;
}

function cherryCell(r: Rng): Shape[] {
  const out: Shape[] = [needle(0.5, 0.97, 0.45, 0.1, 0.01, 0.45)];
  for (let k = 0; k < 13; k++) {
    const y = 0.88 - k * 0.058;
    out.push(leaf(0.48, y, (k % 2 ? 1 : -1) * (0.6 + r.next() * 0.6), 0.2 + r.next() * 0.05, 0.13, vary(r)));
  }
  return out;
}

function pineCell(r: Rng): Shape[] {
  const out: Shape[] = [];
  for (let c = 0; c < 5; c++) {
    const cx = 0.25 + (c % 3) * 0.25 + (r.next() - 0.5) * 0.08;
    const cy = 0.3 + Math.floor(c / 3) * 0.4 + (r.next() - 0.5) * 0.08;
    for (let k = 0; k < 26; k++) {
      const a = -1.4 + (k / 25) * 2.8 + (r.next() - 0.5) * 0.1;
      const L = 0.16 + r.next() * 0.08;
      out.push(needle(cx, cy, cx + Math.sin(a) * L, cy - Math.cos(a) * L, 0.007, vary(r)));
    }
  }
  return out;
}

/** 아틀라스 칸 번호(0–3) → 모양들. */
export function cellShapes(cell: number): Shape[] {
  const r = createRng(hash32(WORLD_SEED, 'trees', 'leaf-atlas', cell));
  return [broadleafCell, ginkgoCell, cherryCell, pineCell][cell]?.(r) ?? [];
}

/** RGBA 512². */
export function drawLeafAtlas(): Uint8Array {
  const px = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let cell = 0; cell < 4; cell++) {
    const shapes = cellShapes(cell);
    const ox = (cell % 2) * CELL;
    const oy = Math.floor(cell / 2) * CELL;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        let cover = 0;
        let shade = 0;
        for (let sy = 0; sy < SS; sy++)
          for (let sx = 0; sx < SS; sx++) {
            const u = (x + (sx + 0.5) / SS) / CELL;
            const v = (y + (sy + 0.5) / SS) / CELL;
            let s = -1;
            for (const f of shapes) s = Math.max(s, f(u, v));
            if (s >= 0) {
              cover++;
              shade += s;
            }
          }
        const k = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        const g = cover > 0 ? Math.round((shade / cover) * 255) : 0;
        px[k] = g;
        px[k + 1] = g;
        px[k + 2] = g;
        px[k + 3] = Math.round((cover / (SS * SS)) * 255);
      }
  }
  return px;
}

/** 아틀라스 칸 안 uv(0..1, y 아래 = PNG 행) → 알파(0..1) — 임포스터 굽기용. */
export function atlasAlpha(px: Uint8Array, cell: number, u: number, v: number): number {
  const x = Math.min(CELL - 1, Math.max(0, Math.floor(u * CELL))) + (cell % 2) * CELL;
  const y = Math.min(CELL - 1, Math.max(0, Math.floor(v * CELL))) + Math.floor(cell / 2) * CELL;
  return (px[(y * ATLAS_SIZE + x) * 4 + 3] as number) / 255;
}

export function atlasShade(px: Uint8Array, cell: number, u: number, v: number): number {
  const x = Math.min(CELL - 1, Math.max(0, Math.floor(u * CELL))) + (cell % 2) * CELL;
  const y = Math.min(CELL - 1, Math.max(0, Math.floor(v * CELL))) + Math.floor(cell / 2) * CELL;
  return (px[(y * ATLAS_SIZE + x) * 4] as number) / 255;
}
