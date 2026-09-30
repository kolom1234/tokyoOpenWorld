// 공간 질의(08 §10): 레이캐스트·구 캐스트(가장 가까운 충돌, 삼각형 양면) — 위치·법선(WF)·거리·레이어·재질. 필터는 모든 레이어(마스크는 호출 쪽 결과 필터로).
import type { Vec3, Vec3d } from '@sanpo/core';
import type { RayHitMsg } from '../protocol.ts';
import type { PhysicsWorld } from './world.ts';

export interface Queries {
  raycast(originWF: Vec3d, dir: Vec3, maxDist: number): RayHitMsg | null;
  /** 구(반경 radius) 캐스트 — distance = 구 중심 이동 거리(시작부터 겹치면 0). 3인칭 카메라 충돌(09 §3). */
  sphereCast(originWF: Vec3d, dir: Vec3, radius: number, maxDist: number): RayHitMsg | null;
  dispose(): void;
}

type Body = ReturnType<ReturnType<PhysicsWorld['system']['GetBodyLockInterfaceNoLock']>['TryGetBody']>;

/** 셀 콜라이더 userData = 재질 | flags << 8(ADR-0044) → 재질만. */
const materialOf = (b: Body): number => Number(b.GetUserData()) & 0xff;

/** 질의 공용 객체(필터·설정·재사용 레이). */
interface Ctx {
  w: PhysicsWorld;
  anchorWF: Readonly<Vec3d>;
  rayCast: InstanceType<PhysicsWorld['Jolt']['RayCastSettings']>;
  shapeCast: InstanceType<PhysicsWorld['Jolt']['ShapeCastSettings']>;
  bp: InstanceType<PhysicsWorld['Jolt']['BroadPhaseLayerFilter']>;
  obj: InstanceType<PhysicsWorld['Jolt']['ObjectLayerFilter']>;
  body: InstanceType<PhysicsWorld['Jolt']['BodyFilter']>;
  shape: InstanceType<PhysicsWorld['Jolt']['ShapeFilter']>;
  ray: InstanceType<PhysicsWorld['Jolt']['RRayCast']>;
  unit: InstanceType<PhysicsWorld['Jolt']['Vec3']>;
  zero: InstanceType<PhysicsWorld['Jolt']['RVec3']>;
  /** 반경별 구 셰이프(참조 1개 보유 — dispose에서 놓음). */
  spheres: Map<number, InstanceType<PhysicsWorld['Jolt']['SphereShape']>>;
}

function sphereOf(c: Ctx, r: number): InstanceType<PhysicsWorld['Jolt']['SphereShape']> {
  let s = c.spheres.get(r);
  if (!s) {
    s = new c.w.Jolt.SphereShape(r, undefined);
    s.AddRef();
    c.spheres.set(r, s);
  }
  return s;
}

function raycast(c: Ctx, o: Vec3d, dir: Vec3, maxDist: number): RayHitMsg | null {
  const { Jolt, system } = c.w;
  const a = c.anchorWF;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const k = maxDist / len;
  c.ray.mOrigin.Set(o.x - a.x, o.y - a.y, o.z - a.z);
  c.ray.mDirection.Set(dir.x * k, dir.y * k, dir.z * k);
  const collector = new Jolt.CastRayClosestHitCollisionCollector();
  try {
    system.GetNarrowPhaseQuery().CastRay(c.ray, c.rayCast, collector, c.bp, c.obj, c.body, c.shape);
    if (!collector.HadHit()) return null;
    const hit = collector.mHit;
    const p = c.ray.GetPointOnRay(hit.mFraction);
    const body = system.GetBodyLockInterfaceNoLock().TryGetBody(hit.mBodyID);
    const n = body.GetWorldSpaceSurfaceNormal(hit.mSubShapeID2, p);
    return {
      posWF: { x: p.GetX() + a.x, y: p.GetY() + a.y, z: p.GetZ() + a.z },
      normal: { x: n.GetX(), y: n.GetY(), z: n.GetZ() },
      distance: hit.mFraction * maxDist,
      layer: body.GetObjectLayer(),
      material: materialOf(body),
    };
  } finally {
    Jolt.destroy(collector);
  }
}

function sphereCast(c: Ctx, o: Vec3d, dir: Vec3, radius: number, maxDist: number): RayHitMsg | null {
  const { Jolt, system, scratch } = c.w;
  const a = c.anchorWF;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const k = maxDist / len;
  const start = Jolt.RMat44.prototype.sTranslation(scratch.rvec3(o.x - a.x, o.y - a.y, o.z - a.z));
  const cast = new Jolt.RShapeCast(sphereOf(c, radius), c.unit, start, scratch.vec3(dir.x * k, dir.y * k, dir.z * k));
  const collector = new Jolt.CastShapeClosestHitCollisionCollector();
  try {
    system.GetNarrowPhaseQuery().CastShape(cast, c.shapeCast, c.zero, collector, c.bp, c.obj, c.body, c.shape);
    if (!collector.HadHit()) return null;
    const hit = collector.mHit;
    const t = hit.mFraction * maxDist;
    const body = system.GetBodyLockInterfaceNoLock().TryGetBody(hit.mBodyID2);
    const ax = hit.mPenetrationAxis;
    const an = Math.hypot(ax.GetX(), ax.GetY(), ax.GetZ()) || 1;
    return {
      posWF: { x: o.x + (dir.x / len) * t, y: o.y + (dir.y / len) * t, z: o.z + (dir.z / len) * t },
      normal: { x: -ax.GetX() / an, y: -ax.GetY() / an, z: -ax.GetZ() / an },
      distance: t,
      layer: body.GetObjectLayer(),
      material: materialOf(body),
    };
  } finally {
    Jolt.destroy(collector);
    Jolt.destroy(cast);
  }
}

function createCtx(w: PhysicsWorld, anchorWF: Readonly<Vec3d>): Ctx {
  const { Jolt } = w;
  const rayCast = new Jolt.RayCastSettings();
  // PLATEAU 면 감김(winding)이 일관되지 않아 뒷면을 무시하면 바깥에서 쏜 레이가 벽을 통과한다 → 양면.
  rayCast.mBackFaceModeTriangles = Jolt.EBackFaceMode_CollideWithBackFaces;
  const shapeCast = new Jolt.ShapeCastSettings();
  shapeCast.mBackFaceModeTriangles = Jolt.EBackFaceMode_CollideWithBackFaces;
  shapeCast.mBackFaceModeConvex = Jolt.EBackFaceMode_CollideWithBackFaces;
  return {
    w,
    anchorWF,
    rayCast,
    shapeCast,
    bp: new Jolt.BroadPhaseLayerFilter(),
    obj: new Jolt.ObjectLayerFilter(),
    body: new Jolt.BodyFilter(),
    shape: new Jolt.ShapeFilter(),
    ray: new Jolt.RRayCast(new Jolt.RVec3(0, 0, 0), new Jolt.Vec3(0, 0, 0)),
    unit: new Jolt.Vec3(1, 1, 1),
    zero: new Jolt.RVec3(0, 0, 0),
    spheres: new Map(),
  };
}

export function createQueries(w: PhysicsWorld, anchorWF: Readonly<Vec3d>): Queries {
  const c = createCtx(w, anchorWF);
  return {
    raycast: (o, dir, maxDist) => raycast(c, o, dir, maxDist),
    sphereCast: (o, dir, radius, maxDist) => sphereCast(c, o, dir, radius, maxDist),
    dispose() {
      for (const s of c.spheres.values()) s.Release();
      c.spheres.clear();
      for (const x of [c.ray, c.unit, c.zero, c.shape, c.body, c.obj, c.bp, c.rayCast, c.shapeCast]) w.Jolt.destroy(x);
    },
  };
}
