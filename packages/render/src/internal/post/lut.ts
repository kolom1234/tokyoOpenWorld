// 3D LUT 그레이딩(07 §7, M03-T07 → M12-T03): 톤매핑·sRGB 뒤에 적용. 외부 .cube 대신 결정론 절차 LUT(라이선스 무관).
// 분위기 4종(맑은 낮 = M03-T07 값 그대로·흐림/비·황혼·밤)의 파라미터를 태양 고도·구름·비·안개·밤 가중으로 섞고,
// 섞인 값이 눈에 띄게 바뀔 때만(양자화 키) LUT를 다시 굽는다 — 조각으로 나눠 프레임마다(SLICES_PER_STEP), 다 구우면 교체, 실시간 0.5 s에 한 번까지.
import { Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu';

export const LUT_SIZE = 32;

/** 그레이딩 파라미터(출력 sRGB 공간). */
export interface GradeParams {
  /** 중간톤 기준 S 커브 세기. */
  contrast: number;
  /** 채도 배율(휘도 기준). */
  sat: number;
  /** 그림자 파랑 쪽 이동(× (1 − 휘도)²). */
  shadowCool: number;
  /** 하이라이트 빨강 쪽 이동(× 휘도²). */
  highWarm: number;
  /** 전체 색 이동(r, g, b 가산). */
  tint: readonly [number, number, number];
  /** 검정 들어올림(0 = 없음, 흐린 날 산란광). */
  lift: number;
}

/** 맑은 낮(M03-T07 "도쿄 낮"): 약한 S 커브·채도 +6 %·그림자 차갑게·하이라이트 따뜻하게. */
export const GRADE_DAY: GradeParams = {
  contrast: 0.12,
  sat: 1.06,
  shadowCool: 0.02,
  highWarm: 0.015,
  tint: [0, 0, 0],
  lift: 0,
};
/** 흐림·비·안개: 확산광 → 대비·채도 낮고 약간 차갑고 그림자가 들린다. */
export const GRADE_OVERCAST: GradeParams = {
  contrast: 0.05,
  sat: 0.9,
  shadowCool: 0.025,
  highWarm: 0,
  tint: [-0.004, 0, 0.01],
  lift: 0.015,
};
/** 황혼(태양 고도 ≲ 10°): 하이라이트 더 따뜻하게·채도 약간 위. */
export const GRADE_GOLDEN: GradeParams = {
  contrast: 0.12,
  sat: 1.1,
  shadowCool: 0.025,
  highWarm: 0.045,
  tint: [0.012, 0.004, -0.012],
  lift: 0,
};
/** 밤: 박명시 채도 저하·그림자 차갑게(가로등·창 하이라이트는 따뜻하게 유지). */
export const GRADE_NIGHT: GradeParams = {
  contrast: 0.08,
  sat: 0.92,
  shadowCool: 0.035,
  highWarm: 0.02,
  tint: [0, 0, 0.006],
  lift: 0,
};

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 중간톤 기준 S 커브(0.5 고정, 세기 k). */
const sCurve = (x: number, k: number): number => clamp01(0.5 + (x - 0.5) * (1 + k) - k * 4 * (x - 0.5) ** 3);

/** 입력 sRGB(0..1) → 출력 sRGB. */
export function grade(r: number, g: number, b: number, p: GradeParams = GRADE_DAY): [number, number, number] {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let [rr, gg, bb] = [luma + (r - luma) * p.sat, luma + (g - luma) * p.sat, luma + (b - luma) * p.sat];
  const shadow = (1 - luma) ** 2 * p.shadowCool;
  const high = luma ** 2 * p.highWarm;
  rr += high - shadow * 0.5 + p.tint[0];
  gg += p.tint[1];
  bb += shadow - high * 0.5 + p.tint[2];
  const f = (x: number): number => sCurve(p.lift + clamp01(x) * (1 - p.lift), p.contrast);
  return [f(rr), f(gg), f(bb)];
}

/** 분위기 입력: 태양 방향 y(= sin 고도), 구름 0..1, 비 mm/h, 안개 0..1, 밤 0..1(lighting/night nightU). */
export interface GradeMood {
  sunY: number;
  cover: number;
  rainMmH: number;
  fog: number;
  night: number;
}

/** 분위기 가중(합 1): 밤 > 흐림(구름^1.5·비 2 mm/h·안개 중 큰 값) > 황혼(고도 0–11°) > 나머지 낮. */
export function gradeWeights(m: GradeMood): { day: number; overcast: number; golden: number; night: number } {
  const night = clamp01(m.night);
  const overcast = clamp01(Math.max(clamp01(m.cover) ** 1.5, m.rainMmH / 2, m.fog)) * (1 - night);
  const golden = smoothstep(-0.05, 0.02, m.sunY) * (1 - smoothstep(0.05, 0.19, m.sunY)) * (1 - night) * (1 - overcast);
  return { day: Math.max(0, 1 - night - overcast - golden), overcast, golden, night };
}

export function gradeParamsOf(m: GradeMood): GradeParams {
  const w = gradeWeights(m);
  const presets: [GradeParams, number][] = [
    [GRADE_DAY, w.day],
    [GRADE_OVERCAST, w.overcast],
    [GRADE_GOLDEN, w.golden],
    [GRADE_NIGHT, w.night],
  ];
  const mix = (k: (p: GradeParams) => number): number => presets.reduce((s, [p, x]) => s + k(p) * x, 0);
  return {
    contrast: mix((p) => p.contrast),
    sat: mix((p) => p.sat),
    shadowCool: mix((p) => p.shadowCool),
    highWarm: mix((p) => p.highWarm),
    tint: [mix((p) => p.tint[0]), mix((p) => p.tint[1]), mix((p) => p.tint[2])],
    lift: mix((p) => p.lift),
  };
}

/** 다시 구울지 판단하는 키: 값마다 눈에 띄지 않는 폭(채도 0.01·색 0.002 …)으로 양자화. */
export function gradeKey(p: GradeParams): string {
  const q = (x: number, step: number): number => Math.round(x / step);
  return [
    q(p.contrast, 0.005),
    q(p.sat, 0.01),
    q(p.shadowCool, 0.002),
    q(p.highWarm, 0.002),
    ...p.tint.map((t) => q(t, 0.002)),
    q(p.lift, 0.002),
  ].join(',');
}

/** z 조각 [z0, z1)를 굽는다 — grade()와 같은 식을 할당 없이 펼쳤다(32³ 한 번에 ≈ 10 ms → 조각으로 나눠 프레임당 예산 안). */
function fillSlices(data: Uint8Array, p: GradeParams, z0: number, z1: number): void {
  const n = LUT_SIZE;
  const inv = 1 / (n - 1);
  const { contrast: k, sat, shadowCool, highWarm, lift } = p;
  const [tr, tg, tb] = p.tint;
  const out = (v: number): number => {
    const x = lift + clamp01(v) * (1 - lift) - 0.5;
    return Math.round(clamp01(0.5 + x * (1 + k) - k * 4 * x * x * x) * 255);
  };
  let i = z0 * n * n * 4;
  for (let z = z0; z < z1; z++) {
    const b = z * inv;
    for (let y = 0; y < n; y++) {
      const g = y * inv;
      for (let x = 0; x < n; x++) {
        const r = x * inv;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const shadow = (1 - luma) * (1 - luma) * shadowCool;
        const high = luma * luma * highWarm;
        data[i] = out(luma + (r - luma) * sat + high - shadow * 0.5 + tr);
        data[i + 1] = out(luma + (g - luma) * sat + tg);
        data[i + 2] = out(luma + (b - luma) * sat + shadow - high * 0.5 + tb);
        data[i + 3] = 255;
        i += 4;
      }
    }
  }
}

export function createGradeLut(p: GradeParams = GRADE_DAY): Data3DTexture {
  const n = LUT_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  fillSlices(data, p, 0, n);
  const t = new Data3DTexture(data, n, n, n);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** 프레임당 굽는 z 조각 수(32³의 ⅛ ≈ 0.4 ms 이하) — 다 구운 뒤 한 번에 교체(섞인 LUT가 보이지 않게). */
const SLICES_PER_STEP = 4;

/**
 * 분위기 → LUT 갱신기: 키가 바뀌고 마지막 교체에서 minIntervalS가 지났으면 새 LUT를 임시 버퍼에 조각씩 굽고(프레임당 SLICES_PER_STEP),
 * 다 구우면 텍스처에 복사한다. 반환 = 이번 호출에 텍스처를 교체했는가.
 */
export function createGradeUpdater(
  lut: Data3DTexture,
  minIntervalS = 0.5,
): { update(m: GradeMood, nowS: number): boolean } {
  const staging = new Uint8Array((lut.image.data as Uint8Array).length);
  let key = gradeKey(GRADE_DAY);
  let last = Number.NEGATIVE_INFINITY;
  let job: { p: GradeParams; key: string; z: number } | undefined;
  return {
    update(m, nowS) {
      if (!job) {
        const p = gradeParamsOf(m);
        const k = gradeKey(p);
        if (k === key || nowS - last < minIntervalS) return false;
        job = { p, key: k, z: 0 };
      }
      const z1 = Math.min(job.z + SLICES_PER_STEP, LUT_SIZE);
      fillSlices(staging, job.p, job.z, z1);
      job.z = z1;
      if (z1 < LUT_SIZE) return false;
      (lut.image.data as Uint8Array).set(staging);
      lut.needsUpdate = true;
      key = job.key;
      last = nowS;
      job = undefined;
      return true;
    },
  };
}
