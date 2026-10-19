// 열차 동선 봇 공용(route.spec·soak.spec): 상태 읽기, 키 한 번, 목표까지 걷기, 하라주쿠 북행 열차 문 앞 찾기·기다리기.
import type { Page } from '@playwright/test';

export type V = { x: number; y: number; z: number };
// biome-ignore lint/suspicious/noExplicitAny: 디버그 핸들(게임 내부 타입을 테스트에 끌어오지 않는다).
type G = any;

export const st = (page: Page) =>
  page.evaluate(() => {
    const t = (globalThis as G).__SANPO_DEBUG__.world.traversal;
    return {
      mode: t.mode as string,
      p: { ...t.player.posWF } as V,
      hud: { ...t.hud, train: t.hud.train ? { ...t.hud.train } : null },
    };
  });

export async function tap(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(80);
  await page.keyboard.up(code);
  await page.waitForTimeout(150);
}

/** 목표까지 걷기: 0.4 s마다 그 자리 순간이동(위치 그대로)으로 몸·시선을 목표로 돌리고 W(사람이 마우스로 방향을 잡고 W를 누르는 것과 같은 입력). */
export async function walkTo(page: Page, target: V, within = 0.35, maxS = 40): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    const { p } = await st(page);
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d <= within) break;
    await page.evaluate(([q, yaw]) => (globalThis as G).__SANPO_DEBUG__.world.traversal.teleport(q, yaw), [
      p,
      Math.atan2(-(target.x - p.x), -(target.z - p.z)),
    ] as const);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(Math.min(400, (d / 1.35) * 1000));
    await page.keyboard.up('KeyW');
  }
}

/** 북행(외회) 하라주쿠 정차·문 열림 열차 + 플레이어에 가장 가까운 문 앞(차체 중심에서 2.4 m — 홈도어 선 바로 바깥, 문 위치 = core TRAIN_CAR_TYPES 20 m 차 doorsZ). */
export function doorTarget(page: Page) {
  return page.evaluate(() => {
    const w = (globalThis as G).__SANPO_DEBUG__.world;
    const p = w.traversal.player.posWF;
    for (const t of w.sim.trainsNear(p, 300)) {
      if (t.stoppedAtStationId !== 'harajuku' || !t.doorsOpen || w.sim.trainRide(t.tripId)?.heading !== 'outer')
        continue;
      let best: { d: number; pos: V; car: number } | null = null;
      for (let k = 0; k < t.cars; k++) {
        const c = w.sim.trainCar(t.tripId, k);
        if (!c) continue;
        const f = { x: -Math.sin(c.yawRad), z: -Math.cos(c.yawRad) };
        const r = { x: Math.cos(c.yawRad), z: -Math.sin(c.yawRad) };
        const side = Math.sign((p.x - c.posWF.x) * r.x + (p.z - c.posWF.z) * r.z) || 1;
        for (const dz of [-7.35, -2.45, 2.45, 7.35]) {
          const pos = {
            x: c.posWF.x + r.x * side * 2.4 + f.x * -dz,
            y: p.y,
            z: c.posWF.z + r.z * side * 2.4 + f.z * -dz,
          };
          const d = Math.hypot(pos.x - p.x, pos.z - p.z);
          if (!best || d < best.d) best = { d, pos, car: k };
        }
      }
      if (best) return { tripId: t.tripId as string, ...best };
    }
    return null;
  });
}

/** 북행 열차 정차·문 열림까지(최대 maxMs). */
export async function waitDoor(
  page: Page,
  maxMs = 600_000,
): Promise<NonNullable<Awaited<ReturnType<typeof doorTarget>>>> {
  const t0 = Date.now();
  for (;;) {
    const door = await doorTarget(page);
    if (door) return door;
    if (Date.now() - t0 > maxMs) throw new Error('no northbound train with open doors at Harajuku');
    await page.waitForTimeout(1000);
  }
}
