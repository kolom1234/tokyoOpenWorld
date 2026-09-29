// 절차 파사드 ④ 실내 매핑(07 §5-4, M03-T05): 베이 × 층 = 방 한 칸. 시선 광선을 방 상자(폭 = 베이, 높이 = 층, 깊이 = 클래스별)에
// 교차 → 교차점 방향으로 실내 큐브맵(배열 레이어 = 방 × 6 + 면, 파이프라인 materials/interiors.ts가 방 중심에서 렌더)을 읽는다.
// 방 종류·좌우 반전은 창별 hash(건물, 층, 베이). 면 좌표 표는 파이프라인 faceDir과 같다. 멀리서는 방 평균색으로(에일리어싱 방지).
import {
  abs,
  cameraPosition,
  Fn,
  float,
  floor,
  fwidth,
  hash,
  If,
  int,
  log2,
  max,
  min,
  mix,
  positionWorld,
  select,
  sign,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import type { MaterialLibrary } from '../library.ts';
import type { F, FacadeGrid, FacadeInputs, I, V3 } from './grid.ts';
import { FACADE_CLASS } from './grid.ts';

/** 방 깊이(m): 오피스·공공·상업·공업 / 주거. */
const DEPTH_OFFICE_M = 7;
const DEPTH_HOME_M = 4.5;
/** 큐브맵 면 한 변(px) — 밉 레벨 추정용(파이프라인 INTERIOR_FACE_SIZE). */
const FACE_PX = 256;
/** 방 id 순서 = 파이프라인 interior-rooms.ts: 0–3 사무, 4–7 주거. */
const HOME_ROOM0 = 4;

export interface InteriorSample {
  /** 실내 색(선형, 큐브맵 그대로 — 밝기 배율은 glass.ts). */
  color: V3;
  /** 방 번호(야간 점등 M09용). */
  room: I;
}

/** 창별 방 번호: 사무(열린 사무실 45 %·회의 20 %·소등 25 %·창고 10 %), 주거 4종 균등. */
function roomOf(i: FacadeInputs, r: F, count: F): I {
  const home = i.cls.equal(FACADE_CLASS.mansion).or(i.cls.equal(FACADE_CLASS.house));
  const office = select(
    r.lessThan(0.45),
    float(0),
    select(r.lessThan(0.65), float(1), select(r.lessThan(0.9), float(2), float(3))),
  );
  const room = select(home, float(HOME_ROOM0).add(floor(r.mul(4))), office);
  return int(min(room, count.sub(1)));
}

/** 방 상자 교차점 방향 → (면, s, t). 면 순서 +X, −X, +Y, −Y, +Z, −Z. */
function cubeFace(h: V3): { face: F; uv: TslVec2 } {
  const a = abs(h);
  const xMajor = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const yMajor = xMajor.not().and(a.y.greaterThanEqual(a.z));
  const face = select(
    xMajor,
    select(h.x.greaterThan(0), float(0), float(1)),
    select(yMajor, select(h.y.greaterThan(0), float(2), float(3)), select(h.z.greaterThan(0), float(4), float(5))),
  );
  const sx = select(h.x.greaterThan(0), h.z.negate(), h.z).div(a.x);
  const tx = h.y.div(a.x);
  const sy = h.x.div(a.y);
  const ty = select(h.y.greaterThan(0), h.z.negate(), h.z).div(a.y);
  const sz = select(h.z.greaterThan(0), h.x, h.x.negate()).div(a.z);
  const tz = h.y.div(a.z);
  const s = select(xMajor, sx, select(yMajor, sy, sz));
  const t = select(xMajor, tx, select(yMajor, ty, tz));
  return { face, uv: vec2(s.mul(0.5).add(0.5), float(0.5).sub(t.mul(0.5))) };
}
type TslVec2 = ReturnType<typeof vec2>;

/** 방 상자 교차 → 큐브맵 표본(선형). px·py = 방 앞면 좌표(−1..1), lod = 밉 레벨. */
function sampleRoom(lib: MaterialLibrary, g: FacadeGrid, t: V3, n: V3, room: I, cell: F, px: F, py: F, lod: F): V3 {
  const flip = select(hash(cell.add(9.1)).greaterThan(0.5), float(-1), float(1));
  const v = positionWorld.sub(cameraPosition).normalize();
  const eps = (x: F): F => select(abs(x).lessThan(1e-4), float(1e-4), x);
  const home = room.greaterThanEqual(HOME_ROOM0);
  const depth = select(home, float(DEPTH_HOME_M), float(DEPTH_OFFICE_M));
  const rd = vec3(
    eps(v.dot(t).div(g.bayW.mul(0.5)).mul(flip)),
    eps(v.y.div(g.thisFloorH.mul(0.5))),
    max(v.dot(n).negate(), 1e-3).div(depth.mul(0.5)),
  );
  const ro = vec3(px.mul(flip), py, -1);
  const tt = sign(rd).sub(ro).div(rd);
  const h = ro.add(rd.mul(min(tt.x, min(tt.y, tt.z))));
  const { face, uv } = cubeFace(h);
  const layer = int(float(room).mul(6).add(face));
  return lib.maps.interiors.sample(uv).depth(layer).level(lod).rgb;
}

/**
 * t = 벽 u 방향(월드), n = 벽 바깥 법선(월드), cell = 창 해시 시드(windows.ts와 같은 식), active = 유리 마스크.
 * 광선 교차·표본은 유리 픽셀에서만(동적 분기 — 모든 파사드 픽셀에서 계산하면 1440p ≈ +2.7 ms). 미분(fwidth)은 분기 밖에서.
 */
export function facadeInterior(
  lib: MaterialLibrary,
  i: FacadeInputs,
  g: FacadeGrid,
  t: V3,
  n: V3,
  cell: F,
  active: F,
): InteriorSample {
  const room = roomOf(i, hash(cell.add(3.7)), lib.roomCount);
  const px = g.lx.div(g.bayW).mul(2).sub(1);
  const py = g.ly.div(g.thisFloorH).mul(2).sub(1);
  const footprint = max(fwidth(px), fwidth(py));
  const color = Fn(() => {
    const avg = lib.roomAvg(room);
    const out = vec3(avg).toVar();
    // 베이가 몇 픽셀 안 되면 평균색(반복 무늬 에일리어싱·광선 교차 불안정 방지).
    If(active.greaterThan(0).and(footprint.lessThan(1.2)), () => {
      const lod = log2(footprint.mul(0.5 * FACE_PX).max(1)).min(8);
      const smp = sampleRoom(lib, g, t, n, room, cell, px, py, lod);
      out.assign(mix(mix(avg, smp, lib.interiorsReady), avg, smoothstep(0.35, 1.2, footprint)));
    });
    return out;
  })();
  return { color, room };
}
