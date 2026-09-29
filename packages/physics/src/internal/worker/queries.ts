// 공간 질의(08 §10): 레이캐스트(가장 가까운 충돌, 삼각형 양면) — 위치·법선(WF)·거리·레이어·재질. 필터는 모든 레이어(마스크는 호출 쪽 결과 필터로).
import type { Vec3, Vec3d } from '@sanpo/core';
import type { RayHitMsg } from '../protocol.ts';
import type { PhysicsWorld } from './world.ts';

export interface Queries {
  raycast(originWF: Vec3d, dir: Vec3, maxDist: number): RayHitMsg | null;
  dispose(): void;
}

export function createQueries(w: PhysicsWorld, anchorWF: Readonly<Vec3d>): Queries {
  const { Jolt, system } = w;
  const settings = new Jolt.RayCastSettings();
  // PLATEAU 면 감김(winding)이 일관되지 않아 뒷면을 무시하면 바깥에서 쏜 레이가 벽을 통과한다 → 양면.
  settings.mBackFaceModeTriangles = Jolt.EBackFaceMode_CollideWithBackFaces;
  const bpFilter = new Jolt.BroadPhaseLayerFilter();
  const objFilter = new Jolt.ObjectLayerFilter();
  const bodyFilter = new Jolt.BodyFilter();
  const shapeFilter = new Jolt.ShapeFilter();
  const origin = new Jolt.RVec3(0, 0, 0);
  const direction = new Jolt.Vec3(0, 0, 0);
  const ray = new Jolt.RRayCast(origin, direction);
  return {
    raycast(o, dir, maxDist) {
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const k = maxDist / len;
      ray.mOrigin.Set(o.x - anchorWF.x, o.y - anchorWF.y, o.z - anchorWF.z);
      ray.mDirection.Set(dir.x * k, dir.y * k, dir.z * k);
      const collector = new Jolt.CastRayClosestHitCollisionCollector();
      try {
        system.GetNarrowPhaseQuery().CastRay(ray, settings, collector, bpFilter, objFilter, bodyFilter, shapeFilter);
        if (!collector.HadHit()) return null;
        const hit = collector.mHit;
        const p = ray.GetPointOnRay(hit.mFraction);
        const body = system.GetBodyLockInterfaceNoLock().TryGetBody(hit.mBodyID);
        const n = body.GetWorldSpaceSurfaceNormal(hit.mSubShapeID2, p);
        return {
          posWF: { x: p.GetX() + anchorWF.x, y: p.GetY() + anchorWF.y, z: p.GetZ() + anchorWF.z },
          normal: { x: n.GetX(), y: n.GetY(), z: n.GetZ() },
          distance: hit.mFraction * maxDist,
          layer: body.GetObjectLayer(),
          material: body.GetUserData(),
        };
      } finally {
        Jolt.destroy(collector);
      }
    },
    dispose() {
      for (const x of [ray, direction, origin, shapeFilter, bodyFilter, objFilter, bpFilter, settings]) Jolt.destroy(x);
    },
  };
}
