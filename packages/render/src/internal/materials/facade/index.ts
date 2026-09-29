// 절차 파사드 머티리얼(M_FACADE, 07 §5): 격자(grid) → 벽 재질(walls) + 창(windows) + 1층 상점(retail) + 디테일(details) → PBR.
// 창·상점 유리는 어두운 반사 유전체(환경 프로브가 하늘을 비춘다). 실내 매핑·커튼월 반사 강화는 M03-T05, 야간 점등은 M09.
import { float, mix, normalWorld, select, vec3 } from 'three/tsl';
import { type Material, MeshStandardNodeMaterial } from 'three/webgpu';
import type { MaterialLibrary } from '../library.ts';
import { perturbWorld } from '../textured.ts';
import { facadeDetails } from './details.ts';
import { facadeGrid, facadeInputs } from './grid.ts';
import { facadeRetail } from './retail.ts';
import { facadeWall, wallFloor } from './walls.ts';
import { facadeWindows } from './windows.ts';

/** 창 프레임(알루미늄 새시) 선형 색·거칠기. */
const FRAME_COLOR = vec3(0.32, 0.33, 0.34);
const GLASS_ROUGHNESS = 0.06;

export function createFacadeMaterial(lib: MaterialLibrary): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  m.name = 'facade_default';
  const i = facadeInputs();
  const g = facadeGrid(i);
  const wall = facadeWall(lib, i);
  const r = facadeRetail(i, g);
  const w = facadeWindows(i, g, i.isRoof.or(r.active));
  const d = facadeDetails(i, g);
  const wallAlbedo = wallFloor(wall.albedo).mul(d.albedoMul);
  const glass = w.glass.add(r.glass).min(1);
  const frame = w.frame.add(r.frame).min(1);
  // 블라인드: 유리 위쪽 일부를 밝은 천으로(실내 매핑 전 임시 깊이감).
  const blindTop = select(
    g.ly.greaterThan(g.thisFloorH.mul(0.85).sub(w.blind.mul(g.thisFloorH).mul(0.5))),
    w.blind,
    float(0),
  );
  const glassColor = mix(w.glassColor, vec3(0.35, 0.34, 0.32), blindTop.mul(w.glass));
  let albedo = mix(wallAlbedo, FRAME_COLOR, frame);
  albedo = mix(albedo, r.paint, r.paintMask);
  albedo = mix(albedo, glassColor, glass);
  const wallRough = wall.orm.y.add(d.roughAdd).min(1);
  let rough = mix(wallRough, float(0.4), frame);
  rough = mix(rough, r.roughness, r.paintMask);
  rough = mix(rough, float(GLASS_ROUGHNESS), glass.mul(float(1).sub(blindTop)));
  const metal = mix(mix(wall.orm.z, float(0.7), frame), r.metal, r.paintMask).mul(float(1).sub(glass));
  const opaque = float(1).sub(glass).sub(frame).sub(r.paintMask).max(0);
  m.colorNode = albedo;
  m.roughnessNode = rough;
  m.metalnessNode = metal;
  m.aoNode = mix(float(1), wall.orm.x, opaque).mul(d.ao);
  // 벽 법선 맵은 불투명 벽 부분에만(유리·프레임은 평면).
  const nTS = mix(vec3(0, 0, 1), wall.normalTS, opaque);
  m.normalNode = perturbWorld(nTS, wall.t, wall.b, normalWorld);
  return m;
}
