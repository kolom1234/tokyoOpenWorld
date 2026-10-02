// freecam 지오메트리 진입 방지(M06 사전 3): 교량 상판·건물 안에 카메라가 들어가 화면이 검게(블룸이 NaN을 번져 전체가) 되던 문제.
// 1) 쓸기: 마지막 안전 위치 → 이번 위치를 반경 0.3 m 구 캐스트(워커 — 비동기 ≈ 1프레임). 맞으면 접촉 앞(여유 5 cm)으로 되돌리고
//    장애물 쪽 속도 성분을 없앤다(벽을 따라 미끄러짐). 시작부터 닿아 있고 멀어지는 방향이면 무시(벽에서 떨어질 수 있게).
// 2) 시작 위치 확인: 진입·순간이동처럼 안전 위치를 모를 때 6방향 레이(120 m) — 3방향 이상이 뒷면(법선이 레이와 같은 쪽)을 맞히면
//    닫힌 부피 안 → 가장 가까운 뒷면 너머(+ 반경 + 여유)로 밀어낸다. see docs/09-traversal.md §2 freecam, ADR-0059
import type { Vec3, Vec3d } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { FreeRigState } from './free-rig.ts';

export const CAMERA_RADIUS_M = 0.3;
const MARGIN_M = 0.05;
const PROBE_M = 120;
/** 닫힌 부피 판정: 뒷면을 맞힌 방향 수(뒷면은 부피 안에서만 보인다 — 열린 면 하나(보도육교 윗면 아래)는 1방향뿐). 고층 건물 안 = 위 놓침·아래 지면(앞면) → 옆 4방향. */
const INSIDE_HITS = 3;
const DIRS: readonly Vec3[] = [
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

type Phys = Pick<PhysicsService, 'sphereCast' | 'raycast'>;

interface Correction {
  safe: Vec3d;
  /** 카메라를 옮길 위치(없으면 안전 위치만 갱신). */
  pos?: Vec3d;
  /** 장애물 법선(쓸기 접촉) — 그 쪽 속도 성분 제거. 없으면(밀어내기) 속도 0. */
  normal?: Vec3;
}

export interface FreeGuard {
  safe: Vec3d;
  /** 안전 위치를 안다(시작 위치 확인 끝). */
  valid: boolean;
  pending: boolean;
  /** 진입·순간이동마다 증가 — 늦게 온 결과 버림. */
  gen: number;
  ready: Correction | null;
  /** 밀어내기·멈춤 횟수(디버그·테스트). */
  pushes: number;
}

export const createFreeGuard = (): FreeGuard => ({
  safe: { x: 0, y: 0, z: 0 },
  valid: false,
  pending: false,
  gen: 0,
  ready: null,
  pushes: 0,
});

/** 진입·순간이동: 안전 위치를 다시 확인한다. */
export function resetFreeGuard(g: FreeGuard): void {
  g.gen++;
  g.valid = false;
  g.pending = false;
  g.ready = null;
}

function probeStart(g: FreeGuard, physics: Phys, at: Vec3d): void {
  const gen = g.gen;
  const from: Vec3d = { ...at };
  Promise.all(DIRS.map((d) => physics.raycast(from, d, PROBE_M))).then(
    (hits) => {
      if (gen !== g.gen) return;
      g.pending = false;
      let exit: { d: Vec3; dist: number } | undefined;
      let back = 0;
      hits.forEach((h, i) => {
        const d = DIRS[i] as Vec3;
        if (!h || h.normal.x * d.x + h.normal.y * d.y + h.normal.z * d.z <= 0) return;
        back++;
        if (!exit || h.distance < exit.dist) exit = { d, dist: h.distance };
      });
      if (back >= INSIDE_HITS && exit) {
        const k = exit.dist + CAMERA_RADIUS_M + MARGIN_M;
        const pos = { x: from.x + exit.d.x * k, y: from.y + exit.d.y * k, z: from.z + exit.d.z * k };
        g.ready = { pos, safe: pos };
      } else g.ready = { safe: from };
      g.valid = true;
    },
    () => {
      if (gen === g.gen) g.pending = false;
    },
  );
}

function sweep(g: FreeGuard, physics: Phys, to: Vec3d): void {
  const gen = g.gen;
  const from: Vec3d = { ...g.safe };
  const target: Vec3d = { ...to };
  const d = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const len = Math.hypot(d.x, d.y, d.z);
  physics.sphereCast(from, d, CAMERA_RADIUS_M, len).then(
    (hit) => {
      if (gen !== g.gen) return;
      g.pending = false;
      // 시작부터 닿아 있고(≤ 여유) 표면 안쪽으로 가지 않으면(접선·멀어짐) 막지 않는다 — 벽을 따라·떨어져 움직일 수 있게.
      const into = hit ? (hit.normal.x * d.x + hit.normal.y * d.y + hit.normal.z * d.z) / (len || 1) < -0.1 : false;
      if (!hit || hit.distance >= len || (!into && hit.distance <= MARGIN_M)) {
        g.safe = target;
        return;
      }
      const t = Math.max(0, hit.distance - MARGIN_M) / len;
      const pos = { x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t };
      g.ready = { pos, normal: hit.normal, safe: pos };
    },
    () => {
      if (gen === g.gen) g.pending = false;
    },
  );
}

/** 한 프레임(적분 뒤): 도착한 교정을 적용하고 다음 질의를 쏜다. 반환 = 이번 프레임에 위치를 고쳤는지. */
export function stepFreeGuard(g: FreeGuard, rig: FreeRigState, physics: Phys | undefined): boolean {
  if (!physics) return false;
  let moved = false;
  const c = g.ready;
  if (c) {
    g.ready = null;
    g.safe = c.safe;
    if (c.pos) {
      Object.assign(rig.posWF, c.pos);
      moved = true;
      g.pushes++;
      const n = c.normal;
      if (n) {
        const vn = rig.velWF.x * n.x + rig.velWF.y * n.y + rig.velWF.z * n.z;
        if (vn < 0) {
          rig.velWF.x -= vn * n.x;
          rig.velWF.y -= vn * n.y;
          rig.velWF.z -= vn * n.z;
        }
      } else rig.velWF.x = rig.velWF.y = rig.velWF.z = 0;
    }
  }
  if (g.pending) return moved;
  if (!g.valid) {
    g.pending = true;
    probeStart(g, physics, rig.posWF);
    return moved;
  }
  if (Math.hypot(rig.posWF.x - g.safe.x, rig.posWF.y - g.safe.y, rig.posWF.z - g.safe.z) > 1e-3) {
    g.pending = true;
    sweep(g, physics, rig.posWF);
  }
  return moved;
}
