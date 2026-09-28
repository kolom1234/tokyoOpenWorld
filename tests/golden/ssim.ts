// SSIM(구조 유사도, Wang et al. 2004) — 8-bit 휘도 배열 두 장, 8×8 창·보폭 4, 표준 상수(K1 0.01, K2 0.03, L 255). 골든뷰 비교(14 §3).
// 창마다 평균·분산·공분산을 직접 합산(창 64픽셀) — 2560×1440 ≈ 23만 창, Node에서 < 1 s.

const WIN = 8;
const STRIDE = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

export function ssimGray(a: Uint8Array, b: Uint8Array, width: number, height: number): number {
  if (a.length !== width * height || b.length !== a.length) throw new Error('ssim: size mismatch');
  const n = WIN * WIN;
  let sum = 0;
  let windows = 0;
  for (let y = 0; y + WIN <= height; y += STRIDE) {
    for (let x = 0; x + WIN <= width; x += STRIDE) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let j = 0; j < WIN; j++) {
        const row = (y + j) * width + x;
        for (let i = 0; i < WIN; i++) {
          const va = a[row + i] as number;
          const vb = b[row + i] as number;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const ma = sa / n;
      const mb = sb / n;
      const va = saa / n - ma * ma;
      const vb = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows++;
    }
  }
  return windows === 0 ? 1 : sum / windows;
}

/** RGBA → Rec.709 휘도(8-bit). */
export function lumaOf(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = Math.round(
      0.2126 * (rgba[i] as number) + 0.7152 * (rgba[i + 1] as number) + 0.0722 * (rgba[i + 2] as number),
    );
  }
  return out;
}
