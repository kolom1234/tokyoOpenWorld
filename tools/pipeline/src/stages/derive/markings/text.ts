// 노면 문자 「止まれ」(M05-T02): 자체 제작 획 폰트(단위 상자 선분 — 외부 폰트·상표 없음)를 진행 차로 가로로 세 글자, 글자마다 진행 방향 2.5 m로 늘림
// (일본 노면 문자 관례: 운전자가 왼쪽→오른쪽으로 읽고 세로로 길게). 획 폭 0.15 m 흰 페인트.
import { add, leftOf, type MarkCtx, mul, PAINT, stripe, type V2 } from './common.ts';
import { edgeDistance } from './lanes.ts';

/** 글자 획: 단위 상자(x = 운전자 기준 왼→오, y = 가까운 쪽 0 → 먼 쪽 1) 꺾은선들. */
export const GLYPHS: Readonly<Record<string, readonly (readonly V2[])[]>> = {
  止: [
    [
      [0.5, 0.05],
      [0.5, 0.95],
    ],
    [
      [0.5, 0.55],
      [0.85, 0.55],
    ],
    [
      [0.2, 0.05],
      [0.2, 0.45],
    ],
    [
      [0.05, 0.05],
      [0.95, 0.05],
    ],
  ],
  ま: [
    [
      [0.15, 0.82],
      [0.85, 0.82],
    ],
    [
      [0.2, 0.62],
      [0.8, 0.62],
    ],
    [
      [0.5, 0.95],
      [0.5, 0.3],
      [0.35, 0.2],
      [0.3, 0.1],
      [0.45, 0.04],
      [0.6, 0.12],
      [0.9, 0.05],
    ],
  ],
  れ: [
    [
      [0.25, 0.95],
      [0.25, 0.05],
    ],
    [
      [0.05, 0.62],
      [0.3, 0.62],
      [0.08, 0.3],
    ],
    [
      [0.25, 0.45],
      [0.55, 0.7],
      [0.6, 0.2],
      [0.72, 0.07],
      [0.95, 0.18],
    ],
  ],
};

const CHAR_LEN_M = 2.5;
const CHAR_MAX_W_M = 1;
const STROKE_M = 0.15;
const TEXT = '止まれ';

/**
 * 글자 줄 중심 = 진행 차로 가로 중앙(`left` = 양방향 — 선 위치부터 왼쪽 가장자리까지, `full` = 전폭), 가까운 끝 = at.
 * 반환 = 그린 획 조각 수.
 */
export function addStopText(c: MarkCtx, at: V2, d: V2, span: 'left' | 'full'): number {
  const v = leftOf(d);
  const right: V2 = mul(v, -1);
  const eL = edgeDistance(c, at, v);
  const eR = edgeDistance(c, at, right);
  const lane = span === 'left' ? eL : eL + eR;
  if (lane < 2) return 0;
  const mid = span === 'left' ? add(at, mul(v, eL / 2)) : add(at, mul(v, (eL - eR) / 2));
  const cw = Math.min(CHAR_MAX_W_M, (lane - 0.4) / TEXT.length);
  const origin = add(mid, mul(right, (-cw * TEXT.length) / 2)); // 줄 왼쪽 끝(운전자 기준)
  let n = 0;
  [...TEXT].forEach((ch, i) => {
    for (const stroke of GLYPHS[ch] ?? []) {
      const pt = (g: V2): V2 => add(add(origin, mul(right, cw * (i + g[0]))), mul(d, CHAR_LEN_M * g[1]));
      for (let k = 0; k + 1 < stroke.length; k++)
        n += stripe(c, pt(stroke[k] as V2), pt(stroke[k + 1] as V2), STROKE_M, PAINT.white);
    }
  });
  return n;
}
