// 3D LUT 그레이딩(07 §7, M03-T07): 톤매핑·sRGB 뒤에 적용. 외부 .cube 대신 결정론 절차 LUT(라이선스 무관) — 약한 S 커브·채도 +6 %,
// 그림자 살짝 차갑게·하이라이트 살짝 따뜻하게("도쿄 낮" 기본). 시간·날씨별 LUT 전환은 M08(날씨).
import { Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu';

export const LUT_SIZE = 32;

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
/** 중간톤 기준 S 커브(0.5 고정, 세기 k). */
const sCurve = (x: number, k: number): number => clamp01(0.5 + (x - 0.5) * (1 + k) - k * 4 * (x - 0.5) ** 3);

/** 입력 sRGB(0..1) → 출력 sRGB. */
export function grade(r: number, g: number, b: number): [number, number, number] {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = 1.06;
  let [rr, gg, bb] = [luma + (r - luma) * sat, luma + (g - luma) * sat, luma + (b - luma) * sat];
  const shadow = (1 - luma) ** 2 * 0.02;
  const high = luma ** 2 * 0.015;
  rr += high - shadow * 0.5;
  bb += shadow - high * 0.5;
  return [sCurve(clamp01(rr), 0.12), sCurve(clamp01(gg), 0.12), sCurve(clamp01(bb), 0.12)];
}

export function createGradeLut(): Data3DTexture {
  const n = LUT_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  let i = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const [r, g, b] = grade(x / (n - 1), y / (n - 1), z / (n - 1));
        data.set([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255], i);
        i += 4;
      }
    }
  }
  const t = new Data3DTexture(data, n, n, n);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
