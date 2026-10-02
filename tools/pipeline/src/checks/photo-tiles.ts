// 검증 전용 GSI 항공사진(seamlessphoto z18 ≈ 0.49 m/px) 모자이크: 타일 캐시(data/raw/gsi-photo/z18) → 회색조 → WF 쌍선형 표본,
// 띠 외곽선 디버그 이미지. 게임 데이터에 굽지 않는다. ImageMagick(convert) 필요 → 컨테이너 전용. M05-T02 markings-photo에서 분리(M06 사전 2).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { wfToLonLat } from '@sanpo/geo';

const run = promisify(execFile);
export const PHOTO_Z = 18;
const TILE_URL = (x: number, y: number) =>
  `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${PHOTO_Z}/${x}/${y}.jpg`;

export const toPx = (lon: number, lat: number): [number, number] => {
  const n = 256 * 2 ** PHOTO_Z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};

export const wfToPx = (x: number, z: number): [number, number] => {
  const ll = wfToLonLat({ x, y: 0, z });
  return toPx(ll.lon, ll.lat);
};

export interface Mosaic {
  x0: number;
  y0: number;
  w: number;
  h: number;
  gray: Float32Array;
}

/** WF 정사각(중심 ± r) 을 덮는 타일 모자이크. */
export async function mosaicAround(root: string, center: readonly [number, number], r: number): Promise<Mosaic> {
  const nw = wfToPx(center[0] - r, center[1] - r);
  const se = wfToPx(center[0] + r, center[1] + r);
  const [tx0, ty0] = [Math.floor(Math.min(nw[0], se[0]) / 256), Math.floor(Math.min(nw[1], se[1]) / 256)];
  const [tx1, ty1] = [Math.floor(Math.max(nw[0], se[0]) / 256), Math.floor(Math.max(nw[1], se[1]) / 256)];
  const w = (tx1 - tx0 + 1) * 256;
  const h = (ty1 - ty0 + 1) * 256;
  const gray = new Float32Array(w * h);
  const dir = join(root, 'data/raw/gsi-photo', `z${PHOTO_Z}`);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const f = join(dir, String(tx), `${ty}.jpg`);
      if (!existsSync(f)) {
        mkdirSync(join(dir, String(tx)), { recursive: true });
        const res = await fetch(TILE_URL(tx, ty));
        if (!res.ok) throw new Error(`tile ${tx}/${ty}: HTTP ${res.status}`);
        writeFileSync(f, new Uint8Array(await res.arrayBuffer()));
      }
      const { stdout } = await run('convert', [f, '-colorspace', 'Gray', '-depth', '8', 'gray:-'], {
        encoding: 'buffer',
        maxBuffer: 1 << 20,
      });
      const px = stdout as unknown as Buffer;
      for (let r2 = 0; r2 < 256; r2++)
        for (let c = 0; c < 256; c++)
          gray[((ty - ty0) * 256 + r2) * w + (tx - tx0) * 256 + c] = px[r2 * 256 + c] as number;
    }
  }
  return { x0: tx0 * 256, y0: ty0 * 256, w, h, gray };
}

/** WF 점의 회색값(쌍선형, 범위 밖 NaN). */
export function sample(m: Mosaic, x: number, z: number): number {
  const [px, py] = wfToPx(x, z);
  const fx = px - m.x0 - 0.5;
  const fy = py - m.y0 - 0.5;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  if (i < 0 || j < 0 || i + 1 >= m.w || j + 1 >= m.h) return Number.NaN;
  const tx = fx - i;
  const ty = fy - j;
  const g = (a: number, b: number): number => m.gray[b * m.w + a] as number;
  return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty;
}

/** 디버그 이미지(커밋 안 함): 모자이크 + 다각형 외곽선(색별). */
export async function debugImage(
  root: string,
  m: Mosaic,
  shapes: readonly { color: string; ringXZ: readonly [number, number][] }[],
  out: string,
): Promise<void> {
  const raw = join(root, 'data/derived/markings-photo.gray');
  writeFileSync(
    raw,
    Uint8Array.from(m.gray, (v) => Math.round(v)),
  );
  const draws: string[] = [];
  for (const s of shapes) {
    const pts = s.ringXZ.map(([x, z]) => {
      const [px, py] = wfToPx(x, z);
      return `${(px - m.x0).toFixed(1)},${(py - m.y0).toFixed(1)}`;
    });
    draws.push('-stroke', s.color, '-draw', `polygon ${pts.join(' ')}`);
  }
  await run('convert', [
    '-size',
    `${m.w}x${m.h}`,
    '-depth',
    '8',
    `gray:${raw}`,
    '-colorspace',
    'sRGB',
    '-fill',
    'none',
    '-strokewidth',
    '1',
    ...draws,
    out,
  ]);
}
