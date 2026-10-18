// 빠른 이동(타이틀 시작 지점·지도 — M10): 검은 막 → walk 재진입(먼 기준점 = 그 아래 지면을 콜라이더 적재 뒤 찾는다, ADR-0084 경로) → 착지 확인 → 막 걷기.
// surface 'exact'(처마 아래) = 착지 뒤 물리 레이로 바닥에 다시 놓음. 'platform'은 역 배선(world-extras)만 — 빠른 이동 대상에서 뺀다.
import type { Vec3d } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { TraversalService } from '@sanpo/traversal';
import { setFade } from './hud-state.ts';

export interface TravelTarget {
  posWF: Vec3d;
  yawRad: number;
  exact?: boolean;
}

export interface FastTravelDeps {
  doc: Document;
  traversal: Pick<TraversalService, 'mode' | 'request' | 'player' | 'hud' | 'teleport'>;
  physics: () => Pick<PhysicsService, 'raycast'> | undefined;
  /** 스트리밍이 조용한가(대기·받기·디코드 0) — 막을 걷기 전 주변 셀까지 기다린다(최대 SETTLE_MAX_MS). */
  settled?: () => boolean;
  /** 테스트용 시계·대기. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const FADE_MS = 320;
const POLL_MS = 100;
const TIMEOUT_MS = 30_000;
/** 이만큼 안이면 이미 거기(이동 생략). */
const NEAR_M = 30;
/** 착지 판정: 목표 수평 거리. */
const ARRIVE_M = 12;
/** 착지 뒤 주변 셀을 기다리는 최대 시간. */
const SETTLE_MAX_MS = 8000;

const horiz = (a: Vec3d, b: Vec3d) => Math.hypot(a.x - b.x, a.z - b.z);

/** 착지했나: walk·지면 대기 아님·목표 가까이·속도 작음. */
export function arrived(t: FastTravelDeps['traversal'], to: Vec3d): boolean {
  const v = t.player.velWF;
  return (
    t.mode === 'walk' &&
    !t.hud.groundLoading &&
    horiz(t.player.posWF, to) < ARRIVE_M &&
    Math.hypot(v.x, v.y, v.z) < 2 &&
    Math.abs(t.player.posWF.y - to.y) < 25
  );
}

export async function fastTravel(d: FastTravelDeps, to: TravelTarget): Promise<boolean> {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = d.now ?? (() => performance.now());
  if (d.traversal.mode === 'walk' && horiz(d.traversal.player.posWF, to.posWF) < NEAR_M) return true;
  setFade(d.doc, true);
  await sleep(FADE_MS);
  if (!d.traversal.request('walk', { posWF: to.posWF, yawRad: to.yawRad, pitchRad: 0 })) {
    setFade(d.doc, false);
    return false;
  }
  const t0 = now();
  let ok = false;
  // 첫 몇 프레임은 옛 자리 — 목표 근처 + 정지 상태가 연속 3번이면 착지.
  let streak = 0;
  let landedAt = -1;
  while (now() - t0 < TIMEOUT_MS) {
    await sleep(POLL_MS);
    streak = arrived(d.traversal, to.posWF) ? streak + 1 : 0;
    if (streak >= 3 && landedAt < 0) landedAt = now();
    if (landedAt >= 0 && ((d.settled?.() ?? true) || now() - landedAt > SETTLE_MAX_MS)) {
      ok = true;
      break;
    }
  }
  if (ok && to.exact) await placeExact(d, to);
  setFade(d.doc, false);
  return ok;
}

/** 처마·차양 아래 = 하늘 레이 착지가 옆으로 비킨다 → 그 자리 위 3 m에서 아래로 레이(8 m) 첫 면. */
async function placeExact(d: FastTravelDeps, to: TravelTarget): Promise<void> {
  const ph = d.physics();
  if (!ph) return;
  const { x, y, z } = to.posWF;
  const hit = await ph.raycast({ x, y: y + 3, z }, { x: 0, y: -1, z: 0 }, 8);
  if (hit && Math.abs(hit.posWF.y - y) <= 1.5) await d.traversal.teleport({ x, y: hit.posWF.y + 0.02, z }, to.yawRad);
}
