// 역 계단 F 이동 + 선로 구덩이 구조(M07-T06 후속 — ADR-0082).
// 내려가기 도착 = 승강장 윗면 메시(sim railStatic) 위 가장자리 여유 ARRIVAL_CLEARANCE_M 점(높이 = 윗면 — 물리 레이 첫 면에 기대지 않는다: 철도 적재 전·윗면 밖이면 이동 안 함),
// 올라가기 도착 = 개찰구 안 계단 입구 앞(물리 레이 → 거리 바닥). walk 중 발이 승강장 옆 선로 구덩이·승강장 밑이면 0.4 s 뒤 가까운 승강장으로 되돌린다.
import type { AudioService } from '@sanpo/audio';
import type { Vec3d } from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { PhysicsService } from '@sanpo/physics';
import type { SimService } from '@sanpo/sim';
import type { RailNetwork } from '@sanpo/tile-format';
import type { TraversalService } from '@sanpo/traversal';
import { FADE_MS, fade, notice, prompt } from './hud.ts';
import type { AccessFile, ExitSpec } from './layout.ts';
import { forwardOf, rad } from './layout.ts';
import {
  clearTopAt,
  type PlatformTops,
  platformTops,
  safeArrival,
  type TrackPits,
  trackPitsBuilder,
} from './platform-geo.ts';

/** 계단 표식에서 이 거리(m) 안이면 F 안내. */
export const STAIRS_REACH_M = 1.6;
/** 도착은 표식 앞 이 거리(다시 F가 걸리지 않게 STAIRS_REACH_M 밖, 진행 방향으로). */
export const ARRIVAL_STEP_M = STAIRS_REACH_M + 0.6;
const PIT_HOLD_S = 0.4;
const RESCUE_SEARCH_M = 8;
/** 구덩이 격자 표본(프레임당 — MVP ≈ 6만 개를 수 프레임에). */
const PIT_POINTS_PER_FRAME = 12_000;

export interface StairsDeps {
  doc: Document;
  access: AccessFile;
  input: InputService;
  traversal: TraversalService;
  sim: SimService;
  physics: () => PhysicsService | undefined;
  audio: () => AudioService | undefined;
  rail: () => RailNetwork | undefined;
}

export interface Passage {
  exit: ExitSpec;
  /** 'down' = 개찰구 안 계단 입구 → 승강장, 'up' = 승강장 → 개찰구 안. */
  dir: 'down' | 'up';
}

const dist2 = (a: Vec3d, p: readonly number[]) =>
  (a.x - (p[0] as number)) ** 2 + (a.y - (p[1] as number)) ** 2 + (a.z - (p[2] as number)) ** 2;

/** 지금 위치에서 닿는 계단(없으면 null). */
export function passageAt(access: AccessFile, p: Vec3d): Passage | null {
  for (const s of access.stations)
    for (const e of s.exits) {
      if (dist2(p, e.stairs.posWF) <= STAIRS_REACH_M ** 2) return { exit: e, dir: 'down' };
      if (dist2(p, e.platform.posWF) <= STAIRS_REACH_M ** 2) return { exit: e, dir: 'up' };
    }
  return null;
}

/** 이동 목표(내용 파일 기준 — 내려가기는 승강장 윗면으로 다시 맞춘다): 반대쪽 표식 앞 ARRIVAL_STEP_M, 도착 방위. */
export function passageTarget(ps: Passage): { pos: Vec3d; yawRad: number } {
  const to = ps.dir === 'down' ? ps.exit.platform : ps.exit.stairs;
  const yawRad = rad(ps.dir === 'down' ? to.yawDeg : to.yawDeg + 180);
  const f = forwardOf(yawRad);
  return {
    pos: { x: to.posWF[0] + f.x * ARRIVAL_STEP_M, y: to.posWF[1], z: to.posWF[2] + f.z * ARRIVAL_STEP_M },
    yawRad,
  };
}

export class StairsRuntime {
  private readonly d: StairsDeps;
  private moving = false;
  private geo: { mesh: unknown; tops: PlatformTops; pits: TrackPits | undefined } | undefined;
  private pitSince = -1;
  private pitsDue = false;
  private pitBuilder: ReturnType<typeof trackPitsBuilder> | undefined;

  constructor(d: StairsDeps) {
    this.d = d;
  }

  /** 승강장 윗면(철도 적재 뒤 — 메시가 바뀌면 다시). 윗면 격자와 구덩이 격자는 서로 다른 프레임에 만든다(호출당 ≤ 4 ms). */
  tops(): PlatformTops | undefined {
    const mesh = this.d.sim.railStatic()?.platforms;
    if (!mesh) return undefined;
    if (this.geo?.mesh !== mesh) {
      this.geo = { mesh, tops: platformTops(mesh), pits: undefined };
      this.pitsDue = true;
      this.pitBuilder = undefined;
    }
    return this.geo.tops;
  }

  /** 다음 프레임부터: 구덩이 격자(선로 표본 — 철도 적재 뒤, 프레임당 PIT_POINTS_PER_FRAME개). */
  private buildPits(): void {
    const points = this.d.rail()?.points;
    if (!this.pitsDue || !this.geo || !points) return;
    this.pitBuilder ??= trackPitsBuilder(this.geo.tops, points);
    const pits = this.pitBuilder.step(PIT_POINTS_PER_FRAME);
    if (!pits) return;
    this.geo.pits = pits;
    this.pitsDue = false;
    this.pitBuilder = undefined;
  }

  /** walk 중 매 프레임. */
  update(t: number, p: Vec3d): void {
    if (this.geo) this.buildPits();
    else this.tops();
    if (!this.moving && this.geo?.pits?.inPit(p)) {
      if (this.pitSince < 0) this.pitSince = t;
      if (t - this.pitSince >= PIT_HOLD_S) this.rescue(p);
    } else this.pitSince = -1;
    this.stairs(p);
  }

  idle(): void {
    this.pitSince = -1;
  }

  /** 승강장 윗면·선로 격자(카메라 아래 내리기 — 구덩이 격자는 만드는 중이면 undefined). */
  geometry(): { tops: PlatformTops | undefined; pits: TrackPits | undefined } {
    return { tops: this.tops(), pits: this.geo?.pits };
  }

  /** 디버그·실제 GPU 검사 핸들(`?debug=1` — `__SANPO_STATIONS__`). */
  probe() {
    return {
      topAt: (x: number, z: number) => this.tops()?.topAt(x, z),
      clearTopAt: (x: number, z: number, r: number) => {
        const t = this.tops();
        return t ? clearTopAt(t, x, z, r) : undefined;
      },
      inPit: (p: Vec3d) => this.geo?.pits?.inPit(p) ?? false,
      targets: () =>
        this.d.access.stations.flatMap((s) =>
          s.exits.map((exit) => ({ station: s.id, exit: exit.id, down: passageTarget({ exit, dir: 'down' }) })),
        ),
    };
  }

  private stairs(p: Vec3d): void {
    const ps = passageAt(this.d.access, p);
    if (!ps || this.moving) {
      prompt(this.d.doc, !this.moving && this.d.traversal.hud.boardable ? 'F  열차 타기' : null);
      return;
    }
    const n = ps.exit.name;
    const tops = this.tops();
    if (ps.dir === 'down' && !tops) {
      prompt(this.d.doc, `승강장 준비 중… (${n.ja})`);
      return;
    }
    prompt(this.d.doc, ps.dir === 'down' ? `F  승강장으로 (${n.ja})` : `F  출구로 — ${n.ko} ${n.ja}`);
    if (!this.d.input.state.justPressed('interact')) return;
    const target = passageTarget(ps);
    if (ps.dir === 'down') {
      const dest = tops ? safeArrival(tops, target.pos) : undefined;
      if (!dest) {
        notice(this.d.doc, '승강장 위치를 찾지 못했어요 — 잠시 뒤 다시 F');
        return;
      }
      this.move(Promise.resolve(dest), target.yawRad);
    } else this.move(this.landAt(target.pos), target.yawRad);
  }

  /** 페이드 → 이동 → 페이드 아웃. */
  private move(dest: Promise<Vec3d>, yawRad: number, after?: string): void {
    this.moving = true;
    prompt(this.d.doc, null);
    fade(this.d.doc, true);
    globalThis.setTimeout(() => {
      void dest.then((d) => {
        void this.d.traversal.teleport(d, yawRad);
        this.d.audio()?.playUi('uiClick');
        if (after) notice(this.d.doc, after);
        globalThis.setTimeout(() => {
          fade(this.d.doc, false);
          this.moving = false;
          this.pitSince = -1;
        }, 250);
      });
    }, FADE_MS);
  }

  /** 거리 쪽 도착 높이 = 위 3 m에서 아래로 쏜 물리 레이 첫 면(없으면 내용 파일 높이). */
  private async landAt(p: Vec3d): Promise<Vec3d> {
    const hit = await this.d.physics()?.raycast({ x: p.x, y: p.y + 3, z: p.z }, { x: 0, y: -1, z: 0 }, 8);
    return { x: p.x, y: (hit ? hit.posWF.y : p.y) + 0.05, z: p.z };
  }

  /** 구덩이·승강장 밑 → 가까운 승강장 윗면(없으면 가까운 역 승강장 도착점). */
  private rescue(p: Vec3d): void {
    const tops = this.tops();
    if (!tops) return;
    let dest = safeArrival(tops, p, 1.2, RESCUE_SEARCH_M);
    let yaw = this.d.traversal.player.yawRad;
    if (!dest) {
      const exits = this.d.access.stations.flatMap((s) => s.exits);
      const near = exits
        .map((e) => passageTarget({ exit: e, dir: 'down' }))
        .sort((a, b) => dist2(p, [a.pos.x, a.pos.y, a.pos.z]) - dist2(p, [b.pos.x, b.pos.y, b.pos.z]))[0];
      dest = near ? safeArrival(tops, near.pos) : undefined;
      if (near) yaw = near.yawRad;
    }
    if (!dest) return;
    this.move(Promise.resolve(dest), yaw, '선로·승강장 아래로는 내려갈 수 없어요 — 승강장으로 돌아왔어요');
  }
}
