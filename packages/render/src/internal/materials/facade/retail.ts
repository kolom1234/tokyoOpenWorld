// 절차 파사드 ④ 1층 상점(07 §5-6, flags.retail): 쇼윈도(0.3–3.2 m, 베이마다 멀리언), 간판 띠(3.4–4.2 m, 가상 브랜드 아틀라스는 M05-T06 —
// 지금은 무지 색판), 차양 띠, 일부 베이 셔터(골판 세로줄). 영업시간·발광은 M09.
import { abs, float, fract, fwidth, hash, max, mix, select, smoothstep, vec3 } from 'three/tsl';
import type { B, F, FacadeGrid, FacadeInputs, V3 } from './grid.ts';

export interface RetailSample {
  /** 이 픽셀에 상점 레이어가 있는가(상점 1층). */
  active: B;
  glass: F;
  frame: F;
  /** 불투명 부분(간판·차양·셔터)의 색·거칠기·금속도, 없으면 mask 0. */
  paint: V3;
  paintMask: F;
  roughness: F;
  metal: F;
}

/** 간판·차양 색(선형) 6종 — 원색 광고가 아니라 무지 간판판·차양 천 느낌의 채도 낮은 색. */
const SIGN_COLORS: readonly [number, number, number][] = [
  [0.55, 0.08, 0.06],
  [0.05, 0.18, 0.4],
  [0.62, 0.5, 0.1],
  [0.08, 0.3, 0.12],
  [0.7, 0.7, 0.68],
  [0.12, 0.12, 0.13],
];

function signColor(h: F): V3 {
  let c: V3 = vec3(...(SIGN_COLORS[0] as [number, number, number]));
  SIGN_COLORS.forEach((rgb, k) => {
    if (k > 0) c = select(h.mul(SIGN_COLORS.length).floor().equal(k), vec3(...rgb), c);
  });
  return c;
}

export function facadeRetail(i: FacadeInputs, g: FacadeGrid): RetailSample {
  const active = i.retail.and(g.isGround).and(i.faceW.greaterThan(1.5));
  const shop = hash(g.bayIdx.mul(53).add(i.tint.mul(7)).add(i.seed));
  const aa = max(fwidth(g.lx), fwidth(g.ly)).max(1e-4);
  const inBand = (y0: number, y1: number): F =>
    smoothstep(float(y0).sub(aa), float(y0).add(aa), g.ly).mul(
      float(1).sub(smoothstep(float(y1).sub(aa), float(y1).add(aa), g.ly)),
    );
  const shopfront = inBand(0.3, 3.2);
  // 베이 양끝 기둥(0.15 m) + 가운데 멀리언.
  const edge = abs(g.lx.sub(g.bayW.mul(0.5))).sub(g.bayW.mul(0.5).sub(0.15));
  const mullion = float(1).sub(smoothstep(0.03, 0.06, abs(g.lx.sub(g.bayW.mul(0.5)))));
  const pillar = smoothstep(aa.negate(), aa, edge);
  const shutter = shop.lessThan(0.22);
  const glassBase = shopfront.mul(float(1).sub(pillar)).mul(float(1).sub(mullion.mul(0.9)));
  const glass = select(shutter, float(0), glassBase);
  const frame = shopfront.sub(glassBase).max(0);
  const sign = inBand(3.35, 4.2);
  const awning = inBand(3.2, 3.35).mul(select(shop.greaterThan(0.5), float(1), float(0)));
  const ribs = smoothstep(0.35, 0.5, abs(fract(g.ly.mul(12)).sub(0.5)));
  const shutterPaint = vec3(0.45, 0.46, 0.47).mul(ribs.mul(0.25).add(0.8));
  const shutterMask = select(shutter, shopfront.mul(float(1).sub(pillar)), float(0));
  const paintMask = sign.add(awning).add(shutterMask).min(1);
  const colored = mix(signColor(shop), signColor(hash(shop.add(0.3))), awning);
  const paint = mix(colored, shutterPaint, shutterMask);
  return {
    active,
    glass: select(active, glass, float(0)),
    frame: select(active, frame, float(0)),
    paint,
    paintMask: select(active, paintMask, float(0)),
    roughness: mix(float(0.45), float(0.35), shutterMask),
    metal: mix(float(0), float(0.8), shutterMask),
  };
}
