// 차량 주행 봇 공용(M08 — drive.spec.ts): 디버그 핸들 타입, GPU 전력 표본, 코스 부팅·탑승, rAF 표본기, 차선 적재·출발 차선, 보행자 접촉 측정.
import { execFile } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import {
  type buildGraph,
  type CarNow,
  cellKey,
  keysFor,
  LANE_NO_SIGNAL,
  nextLane,
  pursuit,
  type RouteLane,
} from './autopilot.ts';

export const WORLD = process.env.GOLDEN_WORLD === 'api' ? '' : 'world=local&';
const COURSE = 'traffic=0&crowd=0&debug=1';

export interface Sample {
  t: number;
  kmh: number;
  x: number;
  z: number;
  gear: string;
  rpm: number;
  abs: boolean;
  fps: number;
  /** 차체 롤(deg — 오른쪽 축 y 성분). */
  roll: number;
}

/** nvidia-smi 1 s 표본(없으면 빈 배열). */
export function powerSampler(): { stop(): { drawW: number[]; limitW: number[] } } {
  const drawW: number[] = [];
  const limitW: number[] = [];
  const t = setInterval(() => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=power.draw,enforced.power.limit', '--format=csv,noheader,nounits'],
      (err, out) => {
        if (err) return;
        const [d, l] = out.trim().split(',').map(Number);
        if (Number.isFinite(d)) drawW.push(d as number);
        if (Number.isFinite(l)) limitW.push(l as number);
      },
    );
  }, 1000);
  return {
    stop() {
      clearInterval(t);
      return { drawW, limitW };
    },
  };
}

/** 코스 부팅 → 세워 둔 차가 생기면 운전석에 앉힌다(추적 시점). 반환 = 차 핸들. */
export async function boardCourse(page: Page, extra = '', kind: 'sedan' | 'bicycle' = 'sedan'): Promise<number> {
  const course = kind === 'bicycle' ? 'bike-course' : 'drive-course';
  await page.goto(`/?${WORLD}spawn=${course}&${COURSE}${extra}`);
  await page.waitForFunction(
    () => {
      const w = (globalThis as { __SANPO_DEBUG__?: { world?: { traversal?: { mode: string } } } }).__SANPO_DEBUG__
        ?.world;
      return w?.traversal?.mode === 'walk';
    },
    null,
    { timeout: 180_000 },
  );
  const handle = await page.waitForFunction(
    () => {
      const w = (globalThis as unknown as { __SANPO_DEBUG__: { world: { cars?: { list(): { handle?: number }[] } } } })
        .__SANPO_DEBUG__.world;
      return w.cars?.list().find((c) => c.handle !== undefined)?.handle;
    },
    null,
    { timeout: 60_000 },
  );
  const h = (await handle.jsonValue()) as number;
  // 차가 내려앉고 주변 콜라이더가 차도록 잠시.
  await page.waitForTimeout(4000);
  const ok = await page.evaluate(
    ([vehicle, k]) =>
      (
        globalThis as unknown as {
          __SANPO_DEBUG__: { world: { traversal: { request(m: string, p: unknown): boolean } } };
        }
      ).__SANPO_DEBUG__.world.traversal.request(k === 'bicycle' ? 'cycle' : 'drive', { vehicle, kind: k }),
    [h, kind] as const,
  );
  expect(ok).toBe(true);
  await page.waitForTimeout(1500);
  return h;
}

/** 페이지 안 rAF 표본기 시작(전역 배열). */
export async function startSampler(page: Page, handle: number): Promise<void> {
  await page.evaluate((h) => {
    type W = {
      traversal: { hud: { drive?: { speedKmh: number; gear: string; rpm: number; abs: boolean } } };
      physics: {
        pose(
          h: number,
        ): { posWF: { x: number; z: number }; quat: { x: number; y: number; z: number; w: number } } | undefined;
      };
    };
    const g = globalThis as unknown as {
      __SANPO_DEBUG__: { world: W };
      __DRIVE_SAMPLES__: unknown[];
      __DRIVE_ON__: boolean;
    };
    const w = g.__SANPO_DEBUG__.world;
    g.__DRIVE_SAMPLES__ = [];
    g.__DRIVE_ON__ = true;
    let last = performance.now();
    const tick = (now: number): void => {
      const d = w.traversal.hud.drive;
      const p = w.physics.pose(h);
      if (d && p)
        g.__DRIVE_SAMPLES__.push({
          t: now / 1000,
          kmh: d.speedKmh,
          x: p.posWF.x,
          z: p.posWF.z,
          gear: d.gear,
          rpm: d.rpm,
          abs: d.abs,
          fps: 1000 / Math.max(now - last, 1),
          roll: (Math.asin(Math.max(-1, Math.min(1, 2 * (p.quat.x * p.quat.y + p.quat.w * p.quat.z)))) * 180) / Math.PI,
        });
      last = now;
      if (g.__DRIVE_ON__) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, handle);
}

export async function stopSampler(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { __DRIVE_SAMPLES__: Sample[]; __DRIVE_ON__: boolean };
    g.__DRIVE_ON__ = false;
    return g.__DRIVE_SAMPLES__;
  });
}

export const latest = async (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __SANPO_DEBUG__: { world: { traversal: { hud: { drive?: { speedKmh: number } } } } };
        }
      ).__SANPO_DEBUG__.world.traversal.hud.drive?.speedKmh ?? 0,
  );

/** 표본에서 정지 → 목표 속력까지 시간(s): 스로틀 시작 시각 t0부터. */
export function timeTo(samples: readonly Sample[], t0: number, kmh: number): number | undefined {
  const s = samples.find((x) => x.t >= t0 && x.kmh >= kmh);
  return s ? s.t - t0 : undefined;
}

/** 제동 시작 시각 t0부터 멈출 때(< 0.2 km/h)까지 이동 거리(m). */
export function brakeDistance(samples: readonly Sample[], t0: number): number | undefined {
  const start = samples.find((x) => x.t >= t0);
  const stop = samples.find((x) => x.t > t0 + 0.2 && x.kmh < 0.2);
  return start && stop ? Math.hypot(stop.x - start.x, stop.z - start.z) : undefined;
}

export const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : 0;
};

export type Dbg = {
  __SANPO_DEBUG__: {
    world: {
      traversal: {
        mode: string;
        request(m: string, p: unknown): boolean;
        player: { posWF: { x: number; z: number }; yawRad: number };
        hud: { drive?: { speedKmh: number; aeb: boolean } };
      };
      cars: {
        park(p: { x: number; y: number; z: number }, yaw: number, o: string): number;
        list(): { id: number; handle?: number }[];
      };
      streaming: { requestSections(k: number, t: string[]): Promise<{ lanes?: ArrayBuffer }> };
      sim: {
        signalStateAt(c: number): { vehicle: string };
        outputs(): { pedestrians?: { data: Float32Array; anchorWF(): { x: number; z: number }; count(): number } };
      };
      physics: { pose(h: number): { posWF: { x: number; z: number }; quat: { y: number; w: number } } | undefined };
    };
  };
};

export async function lanesAround(
  page: Page,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): Promise<{ ix: number; iz: number; bytes: Uint8Array }[]> {
  const keys: [number, number, number][] = [];
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) keys.push([ix, iz, cellKey(ix, iz)]);
  const got = await page.evaluate(async (ks) => {
    const s = (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.streaming;
    const out: { ix: number; iz: number; b64: string }[] = [];
    for (const [ix, iz, k] of ks) {
      const p = await s.requestSections(k, ['lanes.bin']).catch(() => ({ lanes: undefined }));
      if (!p.lanes) continue;
      const u = new Uint8Array(p.lanes);
      let str = '';
      for (let i = 0; i < u.length; i += 0x8000) str += String.fromCharCode(...u.subarray(i, i + 0x8000));
      out.push({ ix, iz, b64: btoa(str) });
    }
    return out;
  }, keys);
  return got.map((c) => ({ ix: c.ix, iz: c.iz, bytes: new Uint8Array(Buffer.from(c.b64, 'base64')) }));
}

/** 출발 차선: 교차로(원점)로 들어오는 일반 도로 차선 — 끝이 원점 60 m 안, 시작은 35 m 밖(가장 긴 것). */
export function startLane(g: ReturnType<typeof buildGraph>): RouteLane {
  const c = g.lanes
    .filter((l) => l.kind === 0 && l.length > 30)
    .filter((l) => {
      const a = l.pts[0] as [number, number];
      const e = l.pts[l.pts.length - 1] as [number, number];
      return Math.hypot(e[0], e[1]) < 60 && Math.hypot(a[0], a[1]) > 35;
    })
    .sort((a, b) => b.length - a.length);
  const l = c[0];
  if (!l) throw new Error('no start lane near the Scramble');
  return l;
}

export async function carNow(page: Page): Promise<CarNow> {
  return page.evaluate(() => {
    const t = (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.traversal;
    return { x: t.player.posWF.x, z: t.player.posWF.z, yaw: t.player.yawRad, kmh: t.hud.drive?.speedKmh ?? 0 };
  });
}

export const lamp = (page: Page, code: number): Promise<string> =>
  page.evaluate((c) => (globalThis as unknown as Dbg).__SANPO_DEBUG__.world.sim.signalStateAt(c).vehicle, code);

type Meter = {
  frames: number;
  contacts: number;
  minD: number;
  aeb: number;
  near: number;
  kmh: number;
  dist: number;
  lx: number;
  lz: number;
  on: boolean;
  peds: Set<number>;
};

/** 프레임마다 보행자 ↔ 차체 사각형(4.5 × 1.75 m) 최소 거리, 접촉 = 0.3 m(보행자 반경) 안. */
export async function startContactMeter(page: Page, h: number): Promise<void> {
  await page.evaluate((handle) => {
    const w = (globalThis as unknown as Dbg).__SANPO_DEBUG__.world;
    const g = globalThis as unknown as { __M__: Meter };
    const init = { frames: 0, contacts: 0, minD: 99, aeb: 0, near: 0, kmh: 0, dist: 0, lx: Number.NaN, lz: 0 };
    g.__M__ = Object.assign(init, { on: true, peds: new Set<number>() });
    const tick = (): void => {
      const M = g.__M__;
      const p = w.physics.pose(handle);
      const buf = w.sim.outputs().pedestrians;
      const d = w.traversal.hud.drive;
      if (p && buf && d) {
        const yaw = 2 * Math.atan2(p.quat.y, p.quat.w);
        const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
        const a = buf.anchorWF();
        let near = 0;
        for (let i = 0; i < buf.count(); i++) {
          const x = (buf.data[i * 8] as number) + a.x - p.posWF.x;
          const z = (buf.data[i * 8 + 2] as number) + a.z - p.posWF.z;
          if (x * x + z * z > 400) continue;
          near++;
          const qx = Math.max(Math.abs(x * c - z * s) - 0.875, 0);
          const qz = Math.max(Math.abs(x * s + z * c) - 2.25, 0);
          const dist = Math.hypot(qx, qz);
          M.minD = Math.min(M.minD, dist);
          if (dist < 0.3) {
            M.contacts++;
            M.peds.add(i);
          }
        }
        if (!Number.isNaN(M.lx)) M.dist += Math.hypot(p.posWF.x - M.lx, p.posWF.z - M.lz);
        M.lx = p.posWF.x;
        M.lz = p.posWF.z;
        M.near = Math.max(M.near, near);
        M.frames++;
        if (d.aeb) M.aeb++;
        M.kmh += d.speedKmh;
      }
      if (M.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, h);
}

export async function stopContactMeter(page: Page) {
  return page.evaluate(() => {
    const M = (globalThis as unknown as { __M__: Meter }).__M__;
    M.on = false;
    return {
      frames: M.frames,
      contacts: M.contacts,
      pedsInContact: M.peds.size,
      minDistM: Math.round(M.minD * 100) / 100,
      aebFrames: M.aeb,
      maxPedsWithin20m: M.near,
      avgKmh: Math.round((M.kmh / Math.max(1, M.frames)) * 10) / 10,
      distanceM: Math.round(M.dist),
    };
  });
}

/**
 * 차선 자동 운전 secs초(경로 = 출발 차선 + 무작위 다음 차선 — 원점 170 m 안, 15 km/h, 적·황 정지선 정지). 30 s마다 스크린샷(shotPath).
 * ignoreRedAfterS 뒤로는 일부러 신호를 무시한다(보행 현시의 횡단보도로 들어가 AEB가 막는지 — 스트레스).
 */
export async function pilot(
  page: Page,
  graph: ReturnType<typeof buildGraph>,
  start: RouteLane,
  secs: number,
  shotPath: (n: number) => string,
  ignoreRedAfterS = Number.POSITIVE_INFINITY,
): Promise<void> {
  const route: RouteLane[] = [start];
  const held = new Set<string>();
  const t0 = Date.now();
  let rng = 0.37;
  let shot = 0;
  while (Date.now() - t0 < secs * 1000) {
    while (route.length < 4) {
      rng = ((rng * 9301 + 49297) % 233280) / 233280;
      const n = nextLane(graph, route[route.length - 1] as RouteLane, [0, 0], 170, rng);
      if (!n) break;
      route.push(n);
    }
    const car = await carNow(page);
    const p = pursuit(route, car, 6);
    if (p.lane > 0) route.splice(0, p.lane);
    const lane = route[0] as RouteLane;
    const obey = Date.now() - t0 < ignoreRedAfterS * 1000;
    const stop = obey && lane.signal !== LANE_NO_SIGNAL ? await lamp(page, lane.signal) : 'G';
    const keys = keysFor(car, p.target, 15, stop === 'G' ? undefined : p.toEnd);
    for (const [k, on] of Object.entries(keys)) {
      if (on && !held.has(k)) {
        held.add(k);
        await page.keyboard.down(k);
      } else if (!on && held.has(k)) {
        held.delete(k);
        await page.keyboard.up(k);
      }
    }
    if (Date.now() - t0 > shot * 30_000) await page.screenshot({ path: shotPath(shot++) });
    await page.waitForTimeout(60);
  }
  for (const k of held) await page.keyboard.up(k);
}

/** 오디오 상태(M08-T04 — 엔진 합성기 종류·출력 시계 결손 = 언더런 근사). 키 입력이 첫 제스처라 이미 unlock. */
export async function audioStats(page: Page): Promise<{ state: string; engine: string; clockGlitches: number } | null> {
  return page.evaluate(() => {
    const a = (
      globalThis as unknown as {
        __SANPO_DEBUG__: { world: { audio?: { stats(): { state: string; engine: string; clockGlitches: number } } } };
      }
    ).__SANPO_DEBUG__.world.audio;
    if (!a) return null;
    const s = a.stats();
    return { state: s.state, engine: s.engine, clockGlitches: s.clockGlitches };
  });
}
