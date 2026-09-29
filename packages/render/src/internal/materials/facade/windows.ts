// 절차 파사드 ② 창(07 §5-2·4 일부): 베이 안 사각 SDF(프레임 두께·화면 공간 안티에일리어싱) + 클래스별 배치(오피스 띠창, 맨션 발코니 문,
// 주택 드문드문, 커튼월 거의 전면 + 스팬드럴). 유리 셰이딩(반사·실내·블라인드)은 glass.ts·interior.ts(M03-T05).
import { abs, float, fwidth, hash, max, mix, select, smoothstep, vec3 } from 'three/tsl';
import type { B, F, FacadeGrid, FacadeInputs, V3 } from './grid.ts';
import { FACADE_CLASS } from './grid.ts';

/** 창 프레임 두께(m). */
const FRAME_M = 0.07;

export interface WindowMasks {
  /** 창 전체(프레임 포함) 0..1. */
  window: F;
  /** 유리 0..1. */
  glass: F;
  /** 프레임 = window − glass. */
  frame: F;
  /** 유리 선형 색(창마다 조금씩 다름). */
  glassColor: V3;
  /** 0..1 블라인드가 내려온 정도(창 높이 비). */
  blind: F;
  /** 블라인드가 이 픽셀을 덮는가(창 위쪽부터 blind 비율) 0/1. */
  blindMask: F;
  /** 창 해시 시드(실내 방 선택 — interior.ts). */
  cell: F;
}

/** 사각형 SDF 안쪽 마스크(가장자리 1픽셀 부드럽게). d < 0 = 안. */
function fill(d: F, aa: F): F {
  return float(1).sub(smoothstep(aa.negate(), aa, d));
}

function rectSdf(lx: F, ly: F, cx: F, cy: F, hw: F, hh: F): F {
  return max(abs(lx.sub(cx)).sub(hw), abs(ly.sub(cy)).sub(hh));
}

/** 창 하나의 반폭·반높이·중심 높이. 반환 [cy, hw, hh]. */
function layout(i: FacadeInputs, g: FacadeGrid, h1: F): [F, F, F] {
  const fh = g.thisFloorH;
  const officeLike = i.cls.equal(FACADE_CLASS.office).or(i.cls.equal(FACADE_CLASS.public));
  const sill = select(officeLike, fh.mul(0.25), fh.mul(0.32));
  let hh: F = fh.mul(g.params.w).mul(0.5);
  let hw: F = g.bayW.mul(g.params.z).mul(0.5);
  let cy: F = sill.add(hh);
  // 맨션: 베이 절반은 발코니 문(바닥 가까이부터 2.1 m).
  const door = i.cls.equal(FACADE_CLASS.mansion).and(h1.lessThan(0.5));
  hh = select(door, float(1.05), hh);
  cy = select(door, float(1.2), cy);
  // 커튼월: 층 거의 전체 유리, 스팬드럴(층 바닥 0.9 m)만 불투명.
  hh = select(i.curtain, fh.sub(0.95).mul(0.5), hh);
  cy = select(i.curtain, fh.add(0.85).mul(0.5), cy);
  hw = select(i.curtain, g.bayW.mul(0.5).sub(0.05), hw);
  return [cy, hw, hh];
}

export function facadeWindows(i: FacadeInputs, g: FacadeGrid, skip: B): WindowMasks {
  const cell = g.bayIdx.mul(131).add(g.floorIdx.mul(977)).add(i.seed.mul(7919)).add(i.tint.mul(17));
  const h1 = hash(cell);
  const h2 = hash(cell.add(0.5));
  const [cy, hw, hh] = layout(i, g, h1);
  const aa = max(fwidth(g.lx), fwidth(g.ly)).max(1e-4);
  const d = rectSdf(g.lx, g.ly, g.bayW.mul(0.5), cy, hw, hh);
  // 주택은 창의 40%를 빼고, 폭이 좁은 면(< 1.2 m)·난간 띠·(상점 1층은 retail.ts가 그린다)에는 창이 없다.
  const houseSkip = i.cls.equal(FACADE_CLASS.house).and(h2.lessThan(0.4));
  const none = skip.or(houseSkip).or(i.faceW.lessThan(1.2)).or(g.isParapet);
  const window = select(none, float(0), fill(d, aa));
  const glass = select(none, float(0), fill(d.add(FRAME_M), aa));
  const tintJitter = h2.mul(0.5).add(0.75);
  const glassColor = mix(vec3(0.018, 0.024, 0.03), vec3(0.03, 0.036, 0.04), h1).mul(tintJitter);
  const blind = select(i.curtain, float(0), h1.mul(h2).mul(1.4).min(0.7));
  const blindMask = select(g.ly.greaterThan(cy.add(hh).sub(blind.mul(hh).mul(2))), float(1), float(0));
  return { window, glass, frame: window.sub(glass).max(0), glassColor, blind, blindMask, cell };
}
