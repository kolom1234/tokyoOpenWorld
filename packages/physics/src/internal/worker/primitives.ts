// JCOL 프리미티브 셰이프(05 §6 kind 1–3: 박스·캡슐·원기둥) → Jolt 셰이프(참조 1개를 잡아 돌려줌 — 바디 생성 뒤 호출 측이 Release).
// 연석·램프 프록시 박스(M04-T04)·소품(M05). 볼록 껍질(kind 4)은 데이터가 생길 때.
import type { JcolShape } from '@sanpo/tile-format';
import type { Jolt } from './jolt-init.ts';

/** 볼록 반경 상한(m) — 얇은 프리미티브는 반변의 절반 이하로(Jolt 요구). */
const CONVEX_RADIUS = 0.05;
/** 프리미티브 생성 예상 비용(ms). */
export const PRIMITIVE_MS = 0.05;

export function createPrimitiveShape(J: Jolt, sh: JcolShape): InstanceType<Jolt['Shape']> | undefined {
  let shape: InstanceType<Jolt['Shape']>;
  if (sh.kind === 'box') {
    const [x, y, z] = sh.halfExtents;
    const v = new J.Vec3(x, y, z);
    shape = new J.BoxShape(v, Math.min(CONVEX_RADIUS, 0.5 * Math.min(x, y, z)), undefined);
    J.destroy(v);
  } else if (sh.kind === 'capsule') {
    shape = new J.CapsuleShape(sh.halfHeight, sh.radius, undefined);
  } else if (sh.kind === 'cylinder') {
    const r = Math.min(CONVEX_RADIUS, 0.5 * Math.min(sh.halfHeight, sh.radius));
    shape = new J.CylinderShape(sh.halfHeight, sh.radius, r, undefined);
  } else return undefined;
  shape.AddRef();
  return shape;
}
