// JCOL 프리미티브 셰이프(05 §6 kind 1–3: 박스·캡슐·원기둥) → Jolt 셰이프(참조 1개를 잡아 돌려줌 — 바디 생성 뒤 호출 측이 Release).
// 연석·램프 프록시 박스(M04-T04)·소품(M05 — 합성 셰이프로 묶음). 볼록 껍질(kind 4)은 데이터가 생길 때.
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

/**
 * 프리미티브 여러 개 → StaticCompoundShape 1개(셀 로컬 posLocal·quat 그대로, 바디는 셀 원점) — 소품(M05-T03)이 셀당 수백 개라
 * 바디 1개씩이면 Jolt 바디 상한(16k)을 넘는다. 64 m 블록·재질·flags가 같은 것끼리 묶는다(cell-colliders). 참조 1개를 잡아 돌려줌.
 */
export function createPrimitiveCompound(
  J: Jolt,
  shapes: readonly JcolShape[],
): InstanceType<Jolt['Shape']> | undefined {
  const settings = new J.StaticCompoundShapeSettings();
  const v = new J.Vec3(0, 0, 0);
  const q = new J.Quat(0, 0, 0, 1);
  try {
    let n = 0;
    for (const sh of shapes) {
      const s = createPrimitiveShape(J, sh);
      if (!s) continue;
      v.Set(sh.posLocal[0], sh.posLocal[1], sh.posLocal[2]);
      q.Set(sh.quat[0], sh.quat[1], sh.quat[2], sh.quat[3]);
      settings.AddShapeShape(v, q, s, 0);
      s.Release();
      n++;
    }
    if (n === 0) return undefined;
    const r = settings.Create();
    if (!r.IsValid()) throw new Error(`compound shape: ${r.GetError().c_str()}`);
    const shape = r.Get();
    shape.AddRef();
    return shape;
  } finally {
    J.destroy(v);
    J.destroy(q);
    J.destroy(settings);
  }
}
