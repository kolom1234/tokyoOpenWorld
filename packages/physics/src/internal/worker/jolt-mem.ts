// Jolt 메모리 규칙(08 §1): `new Jolt.X()` 설정 객체는 쓰고 나서 `Jolt.destroy()` 필수 → using()으로 강제.
// 자주 쓰는 Vec3/RVec3/Quat는 모듈 스크래치를 재사용(틱마다 할당 없음).
import type { Jolt } from './jolt-init.ts';

/** fn 뒤에 obj를 반드시 해제(예외여도). */
export function using<T, R>(Jolt: Jolt, obj: T, fn: (o: T) => R): R {
  try {
    return fn(obj);
  } finally {
    Jolt.destroy(obj);
  }
}

/** 여러 객체를 한꺼번에(역순 해제). */
export function usingAll<R>(Jolt: Jolt, objs: readonly unknown[], fn: () => R): R {
  try {
    return fn();
  } finally {
    for (let i = objs.length - 1; i >= 0; i--) Jolt.destroy(objs[i]);
  }
}

export interface Scratch {
  readonly v: InstanceType<Jolt['Vec3']>;
  readonly r: InstanceType<Jolt['RVec3']>;
  readonly q: InstanceType<Jolt['Quat']>;
  vec3(x: number, y: number, z: number): InstanceType<Jolt['Vec3']>;
  rvec3(x: number, y: number, z: number): InstanceType<Jolt['RVec3']>;
  /** Y축 회전(yaw, +Y 반시계 = traversal 규약). */
  yawQuat(yaw: number): InstanceType<Jolt['Quat']>;
  dispose(): void;
}

/** 재사용 스크래치: 반환 객체는 다음 호출에 덮어써진다(바로 Jolt 호출 인자로만 쓸 것). */
export function createScratch(Jolt: Jolt): Scratch {
  const v = new Jolt.Vec3(0, 0, 0);
  const r = new Jolt.RVec3(0, 0, 0);
  const q = new Jolt.Quat(0, 0, 0, 1);
  return {
    v,
    r,
    q,
    vec3(x, y, z) {
      v.Set(x, y, z);
      return v;
    },
    rvec3(x, y, z) {
      r.Set(x, y, z);
      return r;
    },
    yawQuat(yaw) {
      q.Set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
      return q;
    },
    dispose() {
      Jolt.destroy(v);
      Jolt.destroy(r);
      Jolt.destroy(q);
    },
  };
}
