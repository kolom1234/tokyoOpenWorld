// M06-T07 수락(리뷰 체크리스트 수치): world-mini 실데이터 스크램블에서 정오 밀도(핫스팟 ×3)로 신호 3주기 —
// (1) 대기 군집 형태: W 직전 횡단 끝마다 대기 인원·깊이·가로 퍼짐, (2) 대각 횡단 비율: 전방향 보행 중 횡단 시작의 대각 몫,
// (3) 신호 전환 반응: W 뒤 출발 지연 분포·점멸(F) 중 새 출발 0·차량 녹색 시작 때 횡단 위 잔류.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { init } from '@recast-navigation/core';
import { packCellKey } from '@sanpo/core';
import { gunzip, NAV_NO_SIGNAL, readTkc } from '@sanpo/tile-format';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CrowdParams, SignalPlansFile } from '../src/api.ts';
import { STATE } from '../src/internal/crowd/appearance.ts';
import { createCrowdSim } from '../src/internal/crowd/crowd-sim.ts';
import { type CrossingRec, createNavWorld, type NavWorld } from '../src/internal/crowd/nav-world.ts';
import { inBand } from '../src/internal/crowd/route.ts';
import { pedWalkLeftS, signalState } from '../src/internal/signals/controller.ts';
import { compilePlans } from '../src/internal/signals/plans.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const MINI = join(REPO, 'tests/fixtures/world-mini');
const params = JSON.parse(readFileSync(join(REPO, 'content/sim/crowd.json'), 'utf8')) as CrowdParams;
const plansFile = JSON.parse(readFileSync(join(REPO, 'content/sim/signal-plans.json'), 'utf8')) as SignalPlansFile;
const plans = compilePlans(plansFile);
const SITE = plansFile.sites[0] as { centerWF: [number, number]; radiusM: number };
const [CX, CZ] = SITE.centerWF;

async function loadMini(): Promise<NavWorld> {
  await init();
  const nav = createNavWorld();
  for (const [ix, iz] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ] as const) {
    const t = readTkc(new Uint8Array(readFileSync(join(MINI, `L0/${ix}/${iz}.tkc`))));
    if (!t.ok) throw new Error(t.error.message);
    const raw = await gunzip(t.value.section('nav.bin') as Uint8Array);
    if (!raw.ok) throw new Error('gunzip');
    nav.addCell(packCellKey(0, ix, iz), raw.value);
  }
  return nav;
}

/** 중심이 중심선에서 이 거리 안이면 대각(교차로 한가운데를 지나는 횡단). */
const DIAGONAL_M = 6;

function segDist(c: CrossingRec, x: number, z: number): number {
  const t = Math.min(Math.max((x - c.a[0]) * c.ux + (z - c.a[2]) * c.uz, 0), c.len);
  return Math.hypot(x - c.a[0] - c.ux * t, z - c.a[2] - c.uz * t);
}

const pct = (a: number[], q: number): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s[Math.min(s.length - 1, Math.floor(s.length * q))] as number) : Number.NaN;
};

interface Metrics {
  ends: { id: string; n: number; depthP50: number; depthP90: number; latSpan: number }[];
  starts: number;
  /** W 중에 와서 바로 건넌 사람(대기 무리 밖). */
  arrivals: number;
  diagonal: number;
  reactP10: number;
  reactP50: number;
  reactP90: number;
  startsOnFlash: number;
  leftAtGreen: number[];
  crossings: { id: number; len: number; diag: boolean }[];
}

/** 대기 군집 스냅샷(W 직전): 횡단 끝마다 인원·깊이(끝에서 보도 쪽)·가로(반폭 단위) 범위. */
function waitSnapshot(sim: ReturnType<typeof createCrowdSim>, scr: Map<number, CrossingRec>): Metrics['ends'] {
  const by = new Map<string, { d: number[]; l: number[] }>();
  for (const a of sim.inspect()) {
    if (a.state !== STATE.wait || !a.hit || !scr.has(a.hit.rec.id)) continue;
    const c = a.hit.rec;
    const s = a.hit.fromA ? c.a : c.b;
    const ux = a.hit.fromA ? c.ux : -c.ux;
    const uz = a.hit.fromA ? c.uz : -c.uz;
    const p = a.ca.position();
    const key = `${c.id}${a.hit.fromA ? 'a' : 'b'}`;
    const e = by.get(key) ?? { d: [], l: [] };
    e.d.push(-((p.x - s[0]) * ux + (p.z - s[2]) * uz));
    e.l.push((-(p.x - s[0]) * uz + (p.z - s[2]) * ux) / c.halfWidth);
    by.set(key, e);
  }
  return [...by].map(([id, e]) => ({
    id,
    n: e.d.length,
    depthP50: +pct(e.d, 0.5).toFixed(1),
    depthP90: +pct(e.d, 0.9).toFixed(1),
    latSpan: +(Math.max(...e.l) - Math.min(...e.l)).toFixed(2),
  }));
}

function run(nav: NavWorld): Metrics {
  const scr = new Map<number, CrossingRec>();
  for (const c of nav.crossingsNear(CX, CZ, SITE.radiusM))
    if (c.signal !== NAV_NO_SIGNAL && segDist(c, CX, CZ) < SITE.radiusM) scr.set(c.id, c);
  const diag = new Set([...scr.values()].filter((c) => segDist(c, CX, CZ) < DIAGONAL_M).map((c) => c.id));
  const code = (scr.values().next().value as CrossingRec).signal;
  let gameS = 1_759_546_800; // 2026-10-04 12:00 JST
  const lamp = () => signalState(plans, code, gameS).ped;
  const sim = createCrowdSim(
    nav,
    params,
    (c) => signalState(plans, c, gameS).ped,
    (c) => pedWalkLeftS(plans, c, gameS),
  );
  const waitingAtW = new Set<number>();
  const out = new Float32Array(1000 * 8);
  sim.setPlayer({ x: -40, y: 0, z: 30 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  const m: Metrics = {
    ends: [],
    starts: 0,
    arrivals: 0,
    diagonal: 0,
    reactP10: 0,
    reactP50: 0,
    reactP90: 0,
    startsOnFlash: 0,
    leftAtGreen: [],
    crossings: [],
  };
  const reacts: number[] = [];
  const prevState = new Map<number, number>();
  let prevLamp = lamp();
  let wAt = Number.NaN;
  let greenAt = Number.NaN;
  const started = new Set<number>();
  const dt = 1 / 30;
  for (let k = 0; k < 30 * 420; k++) {
    gameS += dt;
    const l = lamp();
    const warm = k > 30 * 60;
    if (warm && prevLamp === 'D' && l === 'W' && m.ends.length === 0) m.ends = waitSnapshot(sim, scr);
    if (prevLamp !== 'W' && l === 'W') {
      wAt = gameS;
      waitingAtW.clear();
      started.clear();
      for (const a of sim.inspect())
        if (a.state === STATE.wait && a.hit && scr.has(a.hit.rec.id)) waitingAtW.add(a.seq);
    }
    // 차량 녹색 시작(보행 D 2 s 뒤) — 횡단 띠 안에 실제로 있는 사람.
    if (warm && prevLamp === 'F' && l === 'D') greenAt = gameS + 2;
    if (gameS >= greenAt) {
      m.leftAtGreen.push(
        sim.inspect().filter((a) => {
          const p = a.ca.position();
          return [...scr.values()].some((c) => inBand(c, p.x, p.z));
        }).length,
      );
      greenAt = Number.NaN;
    }
    sim.step(dt, gameS * 1000, out, { x: 0, y: 0, z: 0 });
    for (const a of sim.inspect()) {
      const was = prevState.get(a.seq);
      prevState.set(a.seq, a.state);
      if (!warm || a.state !== STATE.cross || was === STATE.cross || !a.hit || !scr.has(a.hit.rec.id)) continue;
      const first = !started.has(a.seq);
      started.add(a.seq);
      if (!first) continue;
      m.starts++;
      if (diag.has(a.hit.rec.id)) m.diagonal++;
      if (l === 'F') m.startsOnFlash++;
      else if (l === 'W' && waitingAtW.has(a.seq)) reacts.push(gameS - wAt);
      else if (l === 'W') m.arrivals++;
    }
    prevLamp = l;
  }
  m.reactP10 = +pct(reacts, 0.1).toFixed(2);
  m.reactP50 = +pct(reacts, 0.5).toFixed(2);
  m.reactP90 = +pct(reacts, 0.9).toFixed(2);
  m.crossings = [...scr.values()].map((c) => ({ id: c.id, len: Math.round(c.len), diag: diag.has(c.id) }));
  sim.destroy();
  return m;
}

describe('Shibuya scramble showcase (world-mini, noon)', () => {
  let nav: NavWorld;
  beforeAll(async () => {
    nav = await loadMini();
  });

  it('review checklist: waiting clusters, diagonal share, reaction to the signal change', () => {
    const m = run(nav);
    const info = JSON.stringify(m);
    // (1) 대기 군집: 보행 W 직전 끝 8곳 이상에 무리, 합 ≥ 80명, 여러 줄(깊이 p90 2.5–6 m), 8명 이상인 끝은 가로로 퍼짐(≥ 0.6 반폭 — 한 줄 서기 아님).
    const crowded = m.ends.filter((e) => e.n >= 8);
    expect(m.ends.length, info).toBeGreaterThanOrEqual(8);
    expect(
      m.ends.reduce((n, e) => n + e.n, 0),
      info,
    ).toBeGreaterThanOrEqual(80);
    for (const e of crowded) {
      expect(e.depthP90, info).toBeGreaterThanOrEqual(2.5);
      expect(e.depthP90, info).toBeLessThanOrEqual(6);
      expect(e.latSpan, info).toBeGreaterThanOrEqual(0.6);
    }
    // (2) 대각 횡단 비율: 전방향 보행 중 첫 횡단 시작의 20–40 %.
    const share = m.diagonal / m.starts;
    expect(share, info).toBeGreaterThanOrEqual(0.2);
    expect(share, info).toBeLessThanOrEqual(0.4);
    // (3) 신호 전환 반응: 대기 무리는 W 뒤 p50 ≤ 1.5 s·p90 ≤ 3 s에 나서고, 점멸(F) 중 새 출발 0, 보행 적 2 s 뒤(차량 녹색) 횡단 위 ≤ 5명.
    expect(m.reactP50, info).toBeLessThanOrEqual(1.5);
    expect(m.reactP90, info).toBeLessThanOrEqual(3);
    expect(m.startsOnFlash, info).toBe(0);
    expect(m.leftAtGreen.length, info).toBe(3);
    for (const n of m.leftAtGreen) expect(n, info).toBeLessThanOrEqual(5);
  }, 180_000);
});
