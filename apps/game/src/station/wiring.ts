// 역 배선(M07-T06 — ADR-0081): content/stations/access.json → 렌더 개찰구·표식 + 물리 캐비닛·울타리, 걷기로 통로를 지나면 카드 접촉·날개 열림/닫힘 합성음과 플랩 애니메이션,
// 계단 입구 ↔ 승강장 계단 발치는 F(상호작용)로 페이드 이동(계단 실기하는 ⚠️ 후속), 역 소리: 접근 차임(승강장)·문 차임(정차 열차 문 열림/닫힘)·차내 LCD 알림(다음 역 바뀔 때).
import type { AudioService } from '@sanpo/audio';
import type { GameSystem, Vec3d } from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { PhysicsService } from '@sanpo/physics';
import type { RenderService } from '@sanpo/render';
import type { SimService } from '@sanpo/sim';
import type { TraversalService } from '@sanpo/traversal';
import { nearestOnTrain } from '../world-audio.ts';
import { type AccessFile, crossedAisle, type ExitSpec, rad, type StationLayout, stationLayout } from './layout.ts';

/** 계단 표식에서 이 거리(m) 안이면 F 안내. */
export const STAIRS_REACH_M = 1.6;
const FLAP_OPEN_S = 0.25;
const FLAP_HOLD_S = 1.1;
const FLAP_CLOSE_S = 0.4;
const FADE_S = 0.3;
const CHIME_R = 160;
const DOOR_R = 70;

export interface StationDeps {
  doc: Document;
  access: AccessFile;
  render: RenderService;
  input: InputService;
  traversal: TraversalService;
  sim: SimService;
  physics: () => PhysicsService | undefined;
  audio: () => AudioService | undefined;
}

/** 통로 플랩 상태: 열린 시각(s) — 열림 곡선 0..1. */
export function flapOpen(sinceS: number): number {
  if (sinceS < 0) return 0;
  if (sinceS < FLAP_OPEN_S) return sinceS / FLAP_OPEN_S;
  if (sinceS < FLAP_OPEN_S + FLAP_HOLD_S) return 1;
  return Math.max(0, 1 - (sinceS - FLAP_OPEN_S - FLAP_HOLD_S) / FLAP_CLOSE_S);
}

const dist2 = (a: Vec3d, p: readonly number[]) =>
  (a.x - (p[0] as number)) ** 2 + (a.y - (p[1] as number)) ** 2 + (a.z - (p[2] as number)) ** 2;
const vec = (p: readonly number[]): Vec3d => ({ x: p[0] as number, y: p[1] as number, z: p[2] as number });

function prompt(doc: Document, text: string | null): void {
  let el = doc.getElementById('station-prompt');
  if (!el && text === null) return;
  if (!el) {
    el = doc.createElement('div');
    el.id = 'station-prompt';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);padding:6px 14px;border-radius:6px;' +
      'background:rgba(20,40,90,.8);color:#fff;font:14px system-ui,sans-serif;pointer-events:none;z-index:50';
    doc.body.append(el);
  }
  el.style.display = text === null ? 'none' : 'block';
  if (text !== null) el.textContent = text;
}

function fade(doc: Document, on: boolean): void {
  let el = doc.getElementById('station-fade');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'station-fade';
    el.style.cssText = `position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:40;transition:opacity ${FADE_S}s`;
    doc.body.append(el);
  }
  el.style.opacity = on ? '1' : '0';
}

interface Passage {
  exit: ExitSpec;
  /** 'down' = 개찰구 안 계단 입구 → 승강장, 'up' = 승강장 → 개찰구 안. */
  dir: 'down' | 'up';
}

/** 지금 위치에서 닿는 계단(없으면 null). */
export function passageAt(access: AccessFile, p: Vec3d): Passage | null {
  for (const s of access.stations)
    for (const e of s.exits) {
      if (dist2(p, e.stairs.posWF) <= STAIRS_REACH_M ** 2) return { exit: e, dir: 'down' };
      if (dist2(p, e.platform.posWF) <= STAIRS_REACH_M ** 2) return { exit: e, dir: 'up' };
    }
  return null;
}

class StationRuntime {
  private readonly d: StationDeps;
  private readonly layout: StationLayout;
  private readonly openAt: number[];
  private readonly flaps: Float32Array;
  private prev: Vec3d | null = null;
  private physicsSet = false;
  private moving = false;
  private readonly chimed = new Set<string>();
  private readonly doors = new Map<string, boolean>();
  private lastNext: string | null = null;
  private lastStop: string | null = null;
  private t = 0;

  constructor(d: StationDeps) {
    this.d = d;
    this.layout = stationLayout(d.access);
    this.openAt = this.layout.aisles.map(() => -100);
    this.flaps = new Float32Array(this.layout.aisles.length);
    d.render.setStationFixtures({
      boxes: Float64Array.from(this.layout.boxes),
      flaps: Float64Array.from(this.layout.flaps),
    });
  }

  update(dtS: number): void {
    this.t += dtS;
    const ph = this.d.physics();
    if (ph && !this.physicsSet) {
      ph.setStaticGroup('stations', { boxes: Float64Array.from(this.layout.physics) });
      this.physicsSet = true;
    }
    const tr = this.d.traversal;
    const p = tr.player.posWF;
    if (tr.mode === 'walk') {
      this.gates(p);
      this.stairs(p);
    } else prompt(this.d.doc, null);
    this.prev = { ...p };
    for (let i = 0; i < this.flaps.length; i++) this.flaps[i] = flapOpen(this.t - (this.openAt[i] as number));
    this.d.render.setGateFlaps(this.flaps);
    this.sounds(tr.camera.posWF);
  }

  private gates(p: Vec3d): void {
    if (!this.prev) return;
    const audio = this.d.audio();
    this.layout.aisles.forEach((a, i) => {
      if (crossedAisle(a, this.prev as Vec3d, p) === 0) return;
      const fresh = this.t - (this.openAt[i] as number) > FLAP_OPEN_S + FLAP_HOLD_S;
      if (fresh) {
        audio?.playAt('cardTouch', { ...a.center, y: a.center.y + 1 });
        audio?.playAt('gateOpen', { ...a.center, y: a.center.y + 0.8 });
        // 닫힘 소리는 플랩이 닫히기 시작할 때.
        globalThis.setTimeout(
          () => audio?.playAt('gateClose', { ...a.center, y: a.center.y + 0.8 }),
          (FLAP_OPEN_S + FLAP_HOLD_S) * 1000,
        );
      }
      this.openAt[i] = fresh ? this.t : Math.min(this.t, (this.openAt[i] as number) + 0.5);
    });
  }

  private stairs(p: Vec3d): void {
    const ps = passageAt(this.d.access, p);
    if (!ps || this.moving) {
      prompt(this.d.doc, null);
      return;
    }
    const n = ps.exit.name;
    prompt(this.d.doc, ps.dir === 'down' ? `F  승강장으로 (${n.ja})` : `F  출구로 — ${n.ko} ${n.ja}`);
    if (!this.d.input.state.justPressed('interact')) return;
    this.moving = true;
    prompt(this.d.doc, null);
    fade(this.d.doc, true);
    const to = ps.dir === 'down' ? ps.exit.platform : ps.exit.stairs;
    // 도착은 표식 바로 앞(다시 F가 걸리지 않게 STAIRS_REACH_M 밖, 진행 방향으로).
    const yaw = rad(ps.dir === 'down' ? to.yawDeg : to.yawDeg + 180);
    const step = STAIRS_REACH_M + 0.6;
    const dest = {
      x: to.posWF[0] - Math.sin(yaw) * step,
      y: to.posWF[1] + 0.05,
      z: to.posWF[2] - Math.cos(yaw) * step,
    };
    globalThis.setTimeout(() => {
      void this.landAt(dest).then((d) => this.d.traversal.teleport(d, yaw));
      this.d.audio()?.playUi('uiClick');
      globalThis.setTimeout(() => {
        fade(this.d.doc, false);
        this.moving = false;
      }, 250);
    }, FADE_S * 1000);
  }

  /** 도착 높이 = 위 3 m에서 아래로 쏜 물리 레이의 첫 면(승강장·바닥) — 내용 파일 높이가 빌드 높이와 조금 달라도 묻히지 않게. */
  private async landAt(p: Vec3d): Promise<Vec3d> {
    const hit = await this.d.physics()?.raycast({ x: p.x, y: p.y + 3, z: p.z }, { x: 0, y: -1, z: 0 }, 8);
    return hit ? { x: p.x, y: hit.posWF.y + 0.05, z: p.z } : p;
  }

  /** 접근 차임(승강장 표식 근처·다음 역 = 이 역)·문 차임(정차 열차 문 열림/닫힘)·차내 LCD 알림. */
  private sounds(l: Vec3d): void {
    const audio = this.d.audio();
    if (!audio) return;
    const hud = this.d.traversal.hud.train;
    if (hud) {
      if (hud.nextStationId !== this.lastNext && this.lastNext !== null) audio.playUi('lcdChime');
      if (hud.stoppedAtStationId !== this.lastStop && hud.stoppedAtStationId !== null) audio.playUi('doorChime');
      this.lastNext = hud.nextStationId;
      this.lastStop = hud.stoppedAtStationId;
      return;
    }
    this.lastNext = this.lastStop = null;
    const plat = this.d.access.stations.flatMap((s) => s.exits.map((e) => ({ s: s.id, p: e.platform.posWF })));
    for (const t of this.d.sim.trainsNear(l, 600)) {
      const here = plat.find((x) => x.s === t.nextStationId && dist2(l, x.p) < CHIME_R ** 2);
      const key = `${t.tripId}:${t.nextStationId}`;
      if (here && !this.chimed.has(key) && t.stoppedAtStationId === null) {
        this.chimed.add(key);
        audio.playAt('stationChime', vec([here.p[0] as number, (here.p[1] as number) + 3, here.p[2] as number]));
      }
      const was = this.doors.get(t.tripId);
      if (was !== undefined && was !== t.doorsOpen) {
        const q = nearestOnTrain(t, l);
        if ((q.x - l.x) ** 2 + (q.z - l.z) ** 2 < DOOR_R ** 2) audio.playAt('doorChime', { ...q, y: q.y + 2.2 });
      }
      this.doors.set(t.tripId, t.doorsOpen);
    }
    if (this.chimed.size > 200) this.chimed.clear();
  }
}

export function stationSystem(d: StationDeps): GameSystem {
  const rt = new StationRuntime(d);
  return {
    id: 'wiring.stations',
    phase: 58,
    update: (f) => rt.update(f.dtReal),
    dispose: () => d.render.setStationFixtures(null),
  };
}
