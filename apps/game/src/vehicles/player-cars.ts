// 플레이어 차(M08-T01): 세워 둔 차(스폰 프리셋·카셰어)와 부른 차 — 물리 차체(physics.spawnVehicle, content/vehicles/sedan.json)를 콜라이더 적재 뒤 지면에 맞춰 만들고,
// 프레임마다 포즈·바퀴·등화(운전 중 = traversal hud.drive)를 렌더 플레이어 차 레이어로, 노면 젖음을 물리로. 부른 차는 플레이어가 멀어지면(걷기 중 200 m) 치운다.
// 차는 가상 카셰어 도장(흰 차체 + 청록 띠 — 실제 브랜드·로고·번호판 없음).
import type { GameSystem, Vec3d } from '@sanpo/core';
import { packCellKey } from '@sanpo/core';
import type { BodyHandle, PhysicsService, SedanParams } from '@sanpo/physics';
import type { PlayerVehicleDraw, RenderService } from '@sanpo/render';
import type { EnterableVehicle, HazardCircle, TraversalService } from '@sanpo/traversal';
import SEDAN from '../../../../content/vehicles/sedan.json';
import { carCircles } from './hazards.ts';

export const SEDAN_PARAMS = SEDAN as unknown as SedanParams;
/** 가상 카셰어 도장(sRGB 24비트). */
export const SHARE_PAINT = 0xf1f1ec;
export const SHARE_ACCENT = 0x13a3a8;
/** 동시에 둘 플레이어 차(물리 상한 4 — 자전거 몫 1). */
const MAX_CARS = 3;
/** 부른 차: 걷는 플레이어가 이보다 멀면 치운다(m). */
const SUMMON_KEEP_M = 200;
/** 차 바닥 높이 맞추기: 위 → 아래 레이(m). */
const SNAP_UP_M = 3;
const SNAP_DOWN_M = 8;
const NPC_KINEMATIC = 5;

export type CarOrigin = 'preset' | 'summon' | 'share';

interface Car {
  id: number;
  origin: CarOrigin;
  spawnWF: Vec3d;
  yawRad: number;
  handle: BodyHandle | undefined;
  /** 만드는 중(지면 레이). */
  pending: boolean;
  turns: number;
  draw: PlayerVehicleDraw;
}

export interface PlayerCars {
  readonly system: GameSystem;
  /** 그 자리(차체 바닥 중심 WF)에 세워 둔다 — 콜라이더가 오면 만든다. 반환 = 차 ID. */
  park(posWF: Vec3d, yawRad: number, origin: CarOrigin): number;
  /** traversal 컨텍스트: walk에서 F로 탈 수 있는 차. */
  enterables(): EnterableVehicle[];
  /** 운전 중이 아닌 차(세워 둔·부른)의 차체 원 — AEB 위험물. */
  parkedCircles(): HazardCircle[];
  /** 물리 핸들이 있는 차 수. */
  readonly live: number;
  /** 디버그·봇: 차 목록(ID·핸들·출처). */
  list(): { id: number; handle: BodyHandle | undefined; origin: CarOrigin }[];
  dispose(): void;
}

const cellOf = (p: Readonly<Vec3d>) => packCellKey(0, Math.floor(p.x / 256), Math.floor(p.z / 256));

function newDraw(id: number): PlayerVehicleDraw {
  return {
    id,
    posWF: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    type: 0,
    paint: SHARE_PAINT,
    accent: SHARE_ACCENT,
    wheelTurns: 0,
    flags: 0,
  };
}

/** 운전 중 HUD → 등화 flags(bit0 제동·1 왼·2 오른·3 전조등). */
function lightFlags(t: TraversalService, h: BodyHandle | undefined): number {
  const d = t.hud.drive;
  if (!d || d.vehicle !== h) return 0;
  return (d.braking ? 1 : 0) | (d.indicator < 0 ? 2 : 0) | (d.indicator > 0 ? 4 : 0) | (d.lights ? 8 : 0);
}

interface Deps {
  physics: () => PhysicsService | undefined;
  render: RenderService;
  traversal: TraversalService;
  /** 노면 젖음 0..1(sim 날씨 + 디버그 덮어쓰기). */
  wetness: () => number;
}

interface State {
  readonly d: Deps;
  readonly cars: Car[];
  nextId: number;
  wetT: number;
  lastWet: number;
}

const driving = (st: State, c: Car): boolean =>
  st.d.traversal.mode === 'drive' && st.d.traversal.hud.drive?.vehicle === c.handle;

function remove(st: State, c: Car): void {
  if (c.handle !== undefined) st.d.physics()?.despawn(c.handle);
  st.cars.splice(st.cars.indexOf(c), 1);
}

/** 콜라이더가 있으면 지면 레이로 높이를 맞춰 만든다(지나가는 교통 차(NPC_KINEMATIC) 위면 다음 프레임에 다시). */
function trySpawn(st: State, ph: PhysicsService, c: Car): void {
  if (c.pending || !ph.hasCell(cellOf(c.spawnWF))) return;
  c.pending = true;
  const o = { x: c.spawnWF.x, y: c.spawnWF.y + SNAP_UP_M, z: c.spawnWF.z };
  void ph.raycast(o, { x: 0, y: -1, z: 0 }, SNAP_UP_M + SNAP_DOWN_M).then((hit) => {
    c.pending = false;
    if (!st.cars.includes(c) || c.handle !== undefined || hit?.layer === NPC_KINEMATIC) return;
    const y = hit ? hit.posWF.y : c.spawnWF.y;
    c.handle = ph.spawnVehicle('sedan', { x: c.spawnWF.x, y: y + 0.05, z: c.spawnWF.z }, c.yawRad, SEDAN_PARAMS);
  });
}

function frameCar(st: State, ph: PhysicsService, c: Car, dt: number): PlayerVehicleDraw | undefined {
  if (c.handle === undefined) {
    trySpawn(st, ph, c);
    return undefined;
  }
  const pose = ph.pose(c.handle);
  if (!pose) return undefined;
  const speed = ph.vehicleState(c.handle)?.speedMs ?? 0;
  c.turns += (speed * dt) / (2 * Math.PI * SEDAN_PARAMS.tire.radiusM);
  Object.assign(c.draw.posWF, pose.posWF);
  Object.assign(c.draw.quat, pose.quat);
  c.draw.wheelTurns = c.turns;
  c.draw.flags = lightFlags(st.d.traversal, c.handle);
  return c.draw;
}

/** 부른 차가 걷는 플레이어에게서 멀어졌나(세운 자리·지금 자리 둘 다). */
function strayed(st: State, ph: PhysicsService, c: Car, me: Readonly<Vec3d>): boolean {
  if (c.origin !== 'summon' || driving(st, c)) return false;
  if (Math.hypot(c.spawnWF.x - me.x, c.spawnWF.z - me.z) <= SUMMON_KEEP_M) return false;
  const p = c.handle !== undefined ? ph.pose(c.handle) : undefined;
  return !p || Math.hypot(p.posWF.x - me.x, p.posWF.z - me.z) > SUMMON_KEEP_M;
}

/** phase 32(물리 뒤): 젖음(1 s마다) → 물리, 차마다 만들기·포즈 → 렌더 목록. */
function updateCars(st: State, dt: number): void {
  const ph = st.d.physics();
  if (!ph) return;
  st.wetT -= dt;
  if (st.wetT <= 0) {
    st.wetT = 1;
    const w = st.d.wetness();
    if (Math.abs(w - st.lastWet) > 0.02) {
      st.lastWet = w;
      ph.setSurfaceWetness(w);
    }
  }
  const me = st.d.traversal.player.posWF;
  const list: PlayerVehicleDraw[] = [];
  for (const c of [...st.cars]) {
    if (strayed(st, ph, c, me)) {
      remove(st, c);
      continue;
    }
    const dr = frameCar(st, ph, c, dt);
    if (dr) list.push(dr);
  }
  st.d.render.vehicles.setPlayers(list);
}

export function createPlayerCars(d: Deps): PlayerCars {
  const st: State = { d, cars: [], nextId: 1, wetT: 0, lastWet: -1 };
  const { cars } = st;
  const system: GameSystem = {
    id: 'wiring.playerCars',
    phase: 32,
    update: (f) => updateCars(st, f.dtReal),
    dispose() {},
  };
  return {
    system,
    park(posWF, yawRad, origin) {
      // 상한: 운전 중이 아닌 가장 오래된 부른 차(없으면 가장 오래된 차)를 치운다.
      while (cars.length >= MAX_CARS) {
        const old = cars.find((c) => c.origin === 'summon' && !driving(st, c)) ?? cars.find((c) => !driving(st, c));
        if (!old) break;
        remove(st, old);
      }
      const id = st.nextId++;
      cars.push({
        id,
        origin,
        spawnWF: { ...posWF },
        yawRad,
        handle: undefined,
        pending: false,
        turns: 0,
        draw: newDraw(id),
      });
      return id;
    },
    enterables() {
      const out: EnterableVehicle[] = [];
      const ph = d.physics();
      for (const c of cars) {
        if (c.handle === undefined || driving(st, c)) continue;
        const p = ph?.pose(c.handle);
        if (!p) continue;
        const yaw = 2 * Math.atan2(p.quat.y, p.quat.w);
        out.push({ vehicle: c.handle, kind: 'sedan', posWF: p.posWF, yawRad: yaw, driveSide: SEDAN_PARAMS.driveSide });
      }
      return out;
    },
    parkedCircles() {
      const out: HazardCircle[] = [];
      const ph = d.physics();
      for (const c of cars) {
        if (c.handle === undefined || driving(st, c)) continue;
        const p = ph?.pose(c.handle);
        if (p) carCircles(p.posWF.x, p.posWF.z, 2 * Math.atan2(p.quat.y, p.quat.w), 4.5, 1.75, out);
      }
      return out;
    },
    get live() {
      return cars.filter((c) => c.handle !== undefined).length;
    },
    list: () => cars.map((c) => ({ id: c.id, handle: c.handle, origin: c.origin })),
    dispose() {
      for (const c of [...cars]) remove(st, c);
    },
  };
}
