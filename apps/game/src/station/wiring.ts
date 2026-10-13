// 역 배선(M07-T06 — ADR-0081): content/stations/access.json → 렌더 개찰구·표식 + 물리 캐비닛·울타리, 걷기로 통로를 지나면 카드 접촉·날개 열림/닫힘 합성음과 플랩 애니메이션,
// 계단 입구 ↔ 승강장 계단 발치 F 이동·선로 구덩이 구조 = stairs.ts(ADR-0082 — 계단 실기하는 ⚠️ 후속), 역 소리: 접근 차임(승강장)·문 차임(정차 열차 문 열림/닫힘)·차내 LCD 알림(다음 역 바뀔 때).
import type { AudioService } from '@sanpo/audio';
import type { GameSystem, Vec3d } from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { PhysicsService } from '@sanpo/physics';
import type { RenderService } from '@sanpo/render';
import type { SimService } from '@sanpo/sim';
import type { RailNetwork } from '@sanpo/tile-format';
import type { TraversalService } from '@sanpo/traversal';
import { nearestOnTrain } from '../world-audio.ts';
import { guideText } from './guide.ts';
import { guide, prompt } from './hud.ts';
import { type AccessFile, crossedAisle, type StationLayout, stationLayout } from './layout.ts';
import { StairsRuntime } from './stairs.ts';

const FLAP_OPEN_S = 0.25;
const FLAP_HOLD_S = 1.1;
const FLAP_CLOSE_S = 0.4;
const CHIME_R = 160;
const DOOR_R = 70;
/** 근접 안내 갱신 간격(s). */
const GUIDE_S = 0.2;

/** 카메라 쿼터니언 → 수평 시선 yaw(0 = −Z, 반시계 +). */
function yawOf(q: { x: number; y: number; z: number; w: number }): number {
  // 앞(0, 0, −1)을 회전: fx = −2(xz + wy), fz = −(1 − 2(x² + y²)).
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.atan2(-fx, -fz);
}

export interface StationDeps {
  doc: Document;
  access: AccessFile;
  render: RenderService;
  input: InputService;
  traversal: TraversalService;
  sim: SimService;
  physics: () => PhysicsService | undefined;
  audio: () => AudioService | undefined;
  /** 적재된 철도(선로 표본 — 구덩이 판정). */
  rail: () => RailNetwork | undefined;
  /** `?debug=1`: `globalThis.__SANPO_STATIONS__`(승강장 윗면·구덩이 질의 — 실제 GPU 역 검사). */
  debug?: boolean;
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

class StationRuntime {
  private readonly d: StationDeps;
  private readonly layout: StationLayout;
  private readonly openAt: number[];
  private readonly flaps: Float32Array;
  private prev: Vec3d | null = null;
  private physicsSet = false;
  private readonly stairsRt: StairsRuntime;
  private readonly chimed = new Set<string>();
  private readonly doors = new Map<string, boolean>();
  private lastNext: string | null = null;
  private lastStop: string | null = null;
  private t = 0;
  private guideAt = -1;
  private lastMode = '';

  constructor(d: StationDeps) {
    this.d = d;
    this.layout = stationLayout(d.access);
    this.openAt = this.layout.aisles.map(() => -100);
    this.flaps = new Float32Array(this.layout.aisles.length);
    this.stairsRt = new StairsRuntime(d);
    if (d.debug) Object.assign(globalThis, { __SANPO_STATIONS__: this.stairsRt.probe() });
    d.render.setStationFixtures({
      boxes: Float64Array.from(this.layout.boxes),
      flaps: Float64Array.from(this.layout.flaps),
      signs: this.layout.signs,
    });
  }

  geometry() {
    return this.stairsRt.geometry();
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
      this.stairsRt.update(this.t, p);
      if (this.t - this.guideAt >= GUIDE_S) {
        this.guideAt = this.t;
        const top = this.stairsRt.geometry().tops?.topAt(p.x, p.z);
        const onPlatform = top !== undefined && Math.abs(top - p.y) < 0.4;
        guide(this.d.doc, guideText(this.d.access, p, yawOf(tr.camera.quat), onPlatform));
      }
    } else if (this.lastMode === 'walk') {
      // walk를 나갈 때 한 번만(freecam G 안내 등 다른 배선의 prompt를 매 프레임 지우지 않게).
      prompt(this.d.doc, null);
      guide(this.d.doc, null);
      this.stairsRt.idle();
    }
    this.lastMode = tr.mode;
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

/** 역 시스템 + 승강장·선로 격자(카메라 아래 내리기 — ADR-0083). */
export function stationSystem(d: StationDeps): GameSystem & { geometry: StairsRuntime['geometry'] } {
  const rt = new StationRuntime(d);
  return {
    id: 'wiring.stations',
    phase: 58,
    update: (f) => rt.update(f.dtReal),
    dispose: () => d.render.setStationFixtures(null),
    geometry: () => rt.geometry(),
  };
}
