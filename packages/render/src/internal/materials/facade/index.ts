// 절차 파사드 머티리얼(M_FACADE, 07 §5): 격자(grid) → 벽 재질(walls) + 창(windows) + 1층 상점(retail) + 디테일(details) + 맨션 발코니(balcony, 시차 격자) → PBR.
// 유리 = 반사 유전체 + 실내 매핑(interior.ts) + 블라인드(glass.ts, M03-T05). 야간 점등은 M09.
import { float, mix, normalWorld, vec3 } from 'three/tsl';
import { type Material, MeshStandardNodeMaterial } from 'three/webgpu';
import { glassShading } from '../glass.ts';
import type { MaterialLibrary } from '../library.ts';
import { perturbWorld } from '../textured.ts';
import { facadeBalcony } from './balcony.ts';
import { facadeDetails } from './details.ts';
import { facadeGrid, facadeInputs } from './grid.ts';
import { facadeInterior } from './interior.ts';
import { facadeRetail } from './retail.ts';
import { facadeWall, wallFloor } from './walls.ts';
import { facadeWindows } from './windows.ts';

/** 창 프레임(알루미늄 새시) 선형 색·거칠기. */
const FRAME_COLOR = vec3(0.32, 0.33, 0.34);

export function createFacadeMaterial(lib: MaterialLibrary): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  m.name = 'facade_default';
  const i = facadeInputs();
  const g = facadeGrid(i);
  const wall = facadeWall(lib, i);
  // 맨션 발코니: 안쪽 벽·창은 시선 방향으로 민 좌표의 격자(gIn) — 다른 클래스는 이동 0이라 g와 같다.
  const bal = facadeBalcony(i, g, wall.t, wall.b);
  const gIn = facadeGrid({ ...i, u: i.u.sub(bal.shift.x), v: i.v.sub(bal.shift.y) });
  const r = facadeRetail(i, g);
  const w = facadeWindows(i, gIn, i.isRoof.or(r.active));
  const d = facadeDetails(i, g);
  const wallAlbedo = wallFloor(wall.albedo).mul(d.albedoMul);
  const open = float(1).sub(bal.front);
  const glass = w.glass.add(r.glass).min(1).mul(open);
  const frame = w.frame.add(r.frame).min(1).mul(open);
  const interior = facadeInterior(lib, i, gIn, wall.t, normalWorld, w.cell, glass);
  const gs = glassShading({
    glass,
    interior: interior.color,
    blind: w.blindMask.mul(w.glass),
    y: gIn.ly,
    curtain: i.curtain,
    tint: w.glassColor,
    n: normalWorld,
  });
  let albedo = mix(wallAlbedo, FRAME_COLOR, frame);
  albedo = mix(albedo, r.paint, r.paintMask);
  albedo = mix(albedo, gs.albedo, glass);
  const wallRough = wall.orm.y.add(d.roughAdd).min(1);
  let rough = mix(wallRough, float(0.4), frame);
  rough = mix(rough, r.roughness, r.paintMask);
  rough = mix(rough, gs.roughness, glass);
  albedo = mix(albedo, bal.albedo, bal.front);
  rough = mix(rough, bal.roughness, bal.front);
  const metal = mix(mix(wall.orm.z, float(0.7), frame), r.metal, r.paintMask).mul(float(1).sub(glass));
  const opaque = float(1).sub(glass).sub(frame).sub(r.paintMask).max(0);
  m.colorNode = albedo;
  m.emissiveNode = gs.emissive;
  m.roughnessNode = rough;
  m.metalnessNode = metal;
  m.aoNode = mix(float(1), wall.orm.x, opaque)
    .mul(d.ao)
    .mul(mix(bal.ao, float(1), bal.front));
  // 벽 법선 맵은 불투명 벽 부분에만(유리·프레임은 평면).
  const nTS = mix(vec3(0, 0, 1), wall.normalTS, opaque);
  m.normalNode = perturbWorld(nTS, wall.t, wall.b, normalWorld);
  return m;
}
