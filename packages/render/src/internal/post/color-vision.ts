// 색각 보정(M11-T04 — 12 §6): Machado 2009(심도 1.0) 시뮬레이션 행렬 S + 오차 재분배(daltonize — 빨강 오차를 초록·파랑으로) D →
// 보정 = c + D·(c − S·c) = (I + D·(I − S))·c, 선형 HDR에 행렬 한 번(유니폼 — 바꿔도 재컴파일 없음, 끔 = 단위 행렬).
import { Matrix3 } from 'three';
import { uniform } from 'three/tsl';
import type { ColorVision } from '../../api.ts';

type M = readonly [number, number, number, number, number, number, number, number, number];

/** 행 우선 3×3. */
const SIM: Record<Exclude<ColorVision, 'off'>, M> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
/** 오차 재분배(Fidaner 2005 — 보이지 않는 성분을 보이는 채널로). */
const SHIFT: M = [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1];

const mul = (a: readonly number[], b: readonly number[]): number[] =>
  [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => [0, 1, 2].reduce((s, k) => s + (a[r * 3 + k] as number) * (b[k * 3 + c] as number), 0)),
  );

/** 모드 → 보정 행렬(행 우선). */
export function colorVisionMatrix(mode: ColorVision): number[] {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (mode === 'off') return I;
  const d = mul(
    SHIFT,
    SIM[mode].map((v, i) => (I[i] as number) - v),
  );
  return I.map((v, i) => v + (d[i] as number));
}

export const colorVisionU = uniform(new Matrix3());

export function setColorVision(mode: ColorVision): void {
  const m = colorVisionMatrix(mode);
  (colorVisionU.value as Matrix3).set(
    ...(m as [number, number, number, number, number, number, number, number, number]),
  );
}
