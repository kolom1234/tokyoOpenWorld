// PLATEAU 텍스처 = 측정 자료(M12-T06, S1 — ADR-0111): 화면에 띄우지 않고, 건물 벽 텍스처에서 벽 색(창 제외 중앙값)과 유리(창) 비율을 잰다.
// 면 UV 다각형 안을 격자 표본 → 어두운 화소 = 유리/창, 나머지 = 벽. 건물 = 면 넓이 가중. 결과는 facade-tint.ts가 tintIdx·커튼월로 바꾼다.
// 텍스처는 항공 사진 기반이라 조명·그림자가 섞인다 → 색은 중앙값, 밝기는 전체 노출 보정(facade-tint) 뒤 비교.
import type { BuildingRecord } from '../../readers/plateau/types.ts';

/** 디코딩된 텍스처(8-bit RGB, 행 = 위 → 아래). */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface FacadeMeasure {
  /** 벽 색(선형 RGB 0..1, 창 제외 면 중앙값의 넓이 가중 평균). */
  wall: [number, number, number];
  /** 유리(창) 화소 비율 0..1(넓이 가중). */
  glass: number;
  /** 표본 화소 수(신뢰도). */
  samples: number;
}

/** 면당 최대 표본 격자(한 변). */
const GRID = 20;
/** 선형 휘도 이하 = 유리·창(어두운 개구부). */
const GLASS_LUMA = 0.06;
/** 선형 휘도 이상 = 하늘 반사·하이라이트(벽 색에서 뺀다). */
const SPECULAR_LUMA = 0.85;

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** (u, v)가 UV 다각형(평평한 [u0, v0, u1, v1, …]) 안인가 — 짝-홀. */
function insideUv(poly: readonly number[], u: number, v: number): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ui = poly[i * 2] as number;
    const vi = poly[i * 2 + 1] as number;
    const uj = poly[j * 2] as number;
    const vj = poly[j * 2 + 1] as number;
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : 0;
};

/** 면 하나: UV 외곽 링 안 격자 표본 → 벽 화소(선형) 중앙값·유리 비율. CityGML UV 원점 = 왼쪽 아래(v 뒤집기). */
export function sampleSurface(img: RgbImage, uv: readonly number[]): { wall: number[][]; glass: number; n: number } {
  let [u0, v0, u1, v1] = [1, 1, 0, 0];
  for (let i = 0; i + 1 < uv.length; i += 2) {
    u0 = Math.min(u0, uv[i] as number);
    u1 = Math.max(u1, uv[i] as number);
    v0 = Math.min(v0, uv[i + 1] as number);
    v1 = Math.max(v1, uv[i + 1] as number);
  }
  const wall: number[][] = [];
  let glass = 0;
  let n = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const u = u0 + ((gx + 0.5) / GRID) * (u1 - u0);
      const v = v0 + ((gy + 0.5) / GRID) * (v1 - v0);
      if (!insideUv(uv, u, v)) continue;
      const px = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
      const py = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height)));
      const o = (py * img.width + px) * 3;
      const r = srgbToLinear((img.data[o] as number) / 255);
      const g = srgbToLinear((img.data[o + 1] as number) / 255);
      const b = srgbToLinear((img.data[o + 2] as number) / 255);
      const y = luma(r, g, b);
      n++;
      if (y < GLASS_LUMA) glass++;
      else if (y < SPECULAR_LUMA) wall.push([r, g, b]);
    }
  }
  return { wall, glass: n ? glass / n : 0, n };
}

/** 링(WF xyz) 넓이(뉴웰 법선 크기 / 2). */
function ringArea(r: readonly number[]): number {
  let [nx, ny, nz] = [0, 0, 0];
  const k = r.length / 3;
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    const [ax, ay, az] = [r[i * 3] as number, r[i * 3 + 1] as number, r[i * 3 + 2] as number];
    const [bx, by, bz] = [r[j * 3] as number, r[j * 3 + 1] as number, r[j * 3 + 2] as number];
    nx += (ay - by) * (az + bz);
    ny += (az - bz) * (ax + bx);
    nz += (ax - bx) * (ay + by);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

/** 건물 = 텍스처가 있는 벽 면들의 넓이 가중. 텍스처 벽이 없으면 null. image(tex) = 그 텍스처(없으면 null). */
export function measureBuilding(b: BuildingRecord, image: (tex: string) => RgbImage | null): FacadeMeasure | null {
  let area = 0;
  let glass = 0;
  let samples = 0;
  const acc = [0, 0, 0];
  let wallArea = 0;
  for (const s of b.surfaces) {
    if (s.kind !== 'wall' || !s.tex || !s.uv?.[0] || !s.ringsWF[0]) continue;
    const img = image(s.tex);
    if (!img) continue;
    const m = sampleSurface(img, s.uv[0]);
    if (m.n === 0) continue;
    const a = ringArea(s.ringsWF[0]);
    area += a;
    glass += a * m.glass;
    samples += m.n;
    if (m.wall.length >= 4) {
      for (let k = 0; k < 3; k++) acc[k] = (acc[k] as number) + a * median(m.wall.map((p) => p[k] as number));
      wallArea += a;
    }
  }
  if (area <= 0 || wallArea <= 0) return null;
  return {
    wall: acc.map((v) => v / wallArea) as [number, number, number],
    glass: glass / area,
    samples,
  };
}
