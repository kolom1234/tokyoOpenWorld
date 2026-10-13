// 역 개찰구·계단 표식 배치(M07-T06 — ADR-0081): content/stations/access.json 출구 → 렌더 상자(캐비닛·윗판·울타리·표식)·플랩·물리 상자·통과 판정 선.
// 순수 함수(단위 테스트). 방위 규약 = 프로젝트 공통(yaw 0 = 앞 −Z, 앞 = (−sin, 0, −cos)). 가상 배치 — 실제 기기 모양·로고 없음.
import type { Vec3d } from '@sanpo/core';
import type { StationSign } from '@sanpo/render';

export interface ExitSpec {
  id: string;
  name: { ja: string; en: string; ko: string };
  gate: { posWF: [number, number, number]; yawDeg: number; aisles: number };
  stairs: { posWF: [number, number, number]; yawDeg: number };
  platform: { posWF: [number, number, number]; yawDeg: number };
}
export interface StationSpec {
  id: string;
  name: { ja: string; en: string; ko: string };
  exits: ExitSpec[];
}
export interface AccessFile {
  stations: StationSpec[];
}

/** 렌더 상자 색 번호(render stations 팔레트와 같은 순서). */
export const FIXTURE_COLOR = { cabinet: 0, top: 1, flap: 2, fence: 3, sign: 4, floor: 5, edge: 6 } as const;

const CAB_W = 0.2;
const CAB_L = 1.2;
const CAB_H = 1.0;
const AISLE_W = 0.75;
const FENCE_M = 2.5;
const FLAP_H = 0.35;

export interface StationLayout {
  /** cx, cy, cz, hx, hy, hz, yaw, color × n(렌더). */
  boxes: number[];
  /** cx, cy, cz, hx, hy, hz, yaw, side(+1 = 오른쪽 캐비닛 쪽으로 접힘) × n — 통로당 2개(왼·오른). */
  flaps: number[];
  /** cx, cy, cz, hx, hy, hz, yaw, material × n(물리 — 캐비닛·울타리). */
  physics: number[];
  /** 통로(개찰구 통과 판정): 출구 id·통로 번호·중심 WF·앞 방향. */
  aisles: { exit: string; index: number; center: Vec3d; forward: Vec3d }[];
  /** 글자 안내판(가상 디자인 — render signs.ts): 개찰구 위·바깥 역 기둥·계단 표식·승강장 출구 표식. */
  signs: StationSign[];
}

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const forwardOf = (yaw: number): Vec3d => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
/** 앞을 볼 때 오른쪽. */
export const rightOf = (yaw: number): Vec3d => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) });

const at = (p: readonly number[], r: Vec3d, lat: number, f: Vec3d, lon: number, dy: number): Vec3d => ({
  x: (p[0] as number) + r.x * lat + f.x * lon,
  y: (p[1] as number) + dy,
  z: (p[2] as number) + r.z * lat + f.z * lon,
});

function gateOf(e: ExitSpec, out: StationLayout): void {
  const yaw = rad(e.gate.yawDeg);
  const f = forwardOf(yaw);
  const r = rightOf(yaw);
  const n = e.gate.aisles;
  const pitch = CAB_W + AISLE_W;
  const p = e.gate.posWF;
  for (let i = 0; i <= n; i++) {
    const lat = (i - n / 2) * pitch;
    const c = at(p, r, lat, f, 0, CAB_H / 2);
    out.boxes.push(c.x, c.y, c.z, CAB_W / 2, CAB_H / 2, CAB_L / 2, yaw, FIXTURE_COLOR.cabinet);
    out.boxes.push(
      c.x,
      c.y + CAB_H / 2 + 0.01,
      c.z,
      CAB_W / 2 + 0.005,
      0.012,
      CAB_L / 2 + 0.005,
      yaw,
      FIXTURE_COLOR.top,
    );
    out.physics.push(c.x, c.y, c.z, CAB_W / 2, CAB_H / 2, CAB_L / 2, yaw, 2);
  }
  for (let i = 0; i < n; i++) {
    const lat = (i + 0.5 - n / 2) * pitch;
    for (const side of [-1, 1]) {
      const c = at(p, r, lat + side * (AISLE_W / 4), f, 0, 0.6 + FLAP_H / 2);
      out.flaps.push(c.x, c.y, c.z, AISLE_W / 4, FLAP_H / 2, 0.012, yaw, side);
    }
    out.aisles.push({ exit: e.id, index: i, center: at(p, r, lat, f, 0, 0), forward: f });
  }
  // 울타리: 끝 캐비닛 바깥으로 FENCE_M씩(우회는 막지 않는 낮은 난간 높이 1 m — 요금 체계 없음).
  for (const side of [-1, 1]) {
    const lat = side * ((n / 2) * pitch + CAB_W / 2 + FENCE_M / 2);
    const c = at(p, r, lat, f, 0, 0.5);
    out.boxes.push(c.x, c.y, c.z, FENCE_M / 2, 0.5, 0.03, yaw, FIXTURE_COLOR.fence);
    out.physics.push(c.x, c.y, c.z, FENCE_M / 2, 0.5, 0.03, yaw, 2);
  }
}

/** 계단 입구 표식: 바닥 판(어두운 1.4 × 2 m) + 노란 테두리 + 기둥·안내판(글 = text — 다가오는 쪽 −앞을 본다). */
function stairsMarker(
  pos: readonly number[],
  yawDeg: number,
  text: Pick<StationSign, 'icon' | 'title' | 'sub'>,
  out: StationLayout,
): void {
  const yaw = rad(yawDeg);
  const f = forwardOf(yaw);
  const r = rightOf(yaw);
  const c = at(pos, r, 0, f, 0, 0.012);
  out.boxes.push(c.x, c.y, c.z, 0.7, 0.012, 1.0, yaw, FIXTURE_COLOR.floor);
  for (const side of [-1, 1]) {
    const e = at(pos, r, side * 0.72, f, 0, 0.014);
    out.boxes.push(e.x, e.y, e.z, 0.04, 0.014, 1.04, yaw, FIXTURE_COLOR.edge);
  }
  const post = at(pos, r, 0.9, f, -1.1, 1.1);
  out.boxes.push(post.x, post.y, post.z, 0.04, 1.1, 0.04, yaw, FIXTURE_COLOR.cabinet);
  const board = at(pos, r, 0.9, f, -1.1, 2.4);
  sign(out, board, yaw + Math.PI, 1.6, 0.4, text);
}

/** 안내판 = 뒤판 상자(어두운 파랑) + 앞뒤 글 면(render). 판 앞면 법선 = (−sin, 0, −cos)(yaw). */
function sign(
  out: StationLayout,
  c: Vec3d,
  yaw: number,
  w: number,
  h: number,
  text: Pick<StationSign, 'icon' | 'title' | 'sub'>,
): void {
  out.boxes.push(c.x, c.y, c.z, w / 2 + 0.02, h / 2 + 0.02, 0.02, yaw, FIXTURE_COLOR.sign);
  out.signs.push({ posWF: [c.x, c.y, c.z], yawRad: yaw, widthM: w, heightM: h, ...text });
}

/** 개찰구 위 안내판(기둥 둘) + 거리 쪽 7 m 역 이름 기둥 — 둘 다 다가오는 쪽(−들어가는 방향)을 본다. */
function gateSigns(s: StationSpec, e: ExitSpec, out: StationLayout): void {
  const yaw = rad(e.gate.yawDeg);
  const f = forwardOf(yaw);
  const r = rightOf(yaw);
  const p = e.gate.posWF;
  const half = (e.gate.aisles * (CAB_W + AISLE_W) + CAB_W) / 2;
  for (const side of [-1, 1]) {
    const post = at(p, r, side * (half + 0.15), f, 0, 1.6);
    out.boxes.push(post.x, post.y, post.z, 0.05, 1.6, 0.05, yaw, FIXTURE_COLOR.cabinet);
  }
  const ex = `${e.name.ja} ${e.name.en}`;
  sign(out, at(p, r, 0, f, 0, 2.75), yaw + Math.PI, Math.min(4, 2 * half), Math.min(4, 2 * half) / 4, {
    icon: 'gate',
    title: '改札 Ticket Gates · 개찰구',
    sub: `${s.name.ja}駅 ${ex} · ${s.name.ko}역 ${e.name.ko}`,
  });
  const totem = at(p, r, half + FENCE_M + 0.8, f, -7, 1.5);
  out.boxes.push(totem.x, totem.y, totem.z, 0.06, 1.5, 0.06, yaw, FIXTURE_COLOR.cabinet);
  sign(out, { ...totem, y: totem.y + 1.75 }, yaw + Math.PI, 2.4, 0.6, {
    icon: 'station',
    title: `${s.name.ja}駅 ${s.name.en} Sta.`,
    sub: `${s.name.ko}역 · 改札 ${e.name.ja} → 7 m`,
  });
}

export function stationLayout(file: AccessFile): StationLayout {
  const out: StationLayout = { boxes: [], flaps: [], physics: [], aisles: [], signs: [] };
  for (const s of file.stations)
    for (const e of s.exits) {
      gateOf(e, out);
      gateSigns(s, e, out);
      stairsMarker(
        e.stairs.posWF,
        e.stairs.yawDeg,
        { icon: 'stairs', title: 'ホーム Platforms', sub: 'F · 승강장으로' },
        out,
      );
      stairsMarker(
        e.platform.posWF,
        e.platform.yawDeg + 180,
        { icon: 'exit', title: `出口 Exit · ${e.name.ja}`, sub: `F · ${e.name.en} · ${e.name.ko}` },
        out,
      );
    }
  return out;
}

/** 통로 통과: 이전 → 지금 위치가 통로 선(가로 ±AISLE_W/2, 앞뒤 경계)을 건넜으면 방향(+1 들어감·−1 나감), 아니면 0. */
export function crossedAisle(a: { center: Vec3d; forward: Vec3d }, prev: Vec3d, now: Vec3d): -1 | 0 | 1 {
  const s0 = (prev.x - a.center.x) * a.forward.x + (prev.z - a.center.z) * a.forward.z;
  const s1 = (now.x - a.center.x) * a.forward.x + (now.z - a.center.z) * a.forward.z;
  if (Math.sign(s0) === Math.sign(s1) || s0 === s1) return 0;
  const t = s0 / (s0 - s1);
  const x = prev.x + (now.x - prev.x) * t - a.center.x;
  const z = prev.z + (now.z - prev.z) * t - a.center.z;
  const lat = Math.abs(x * -a.forward.z + z * a.forward.x);
  if (lat > AISLE_W / 2 + 0.05 || Math.abs(prev.y - a.center.y) > 2) return 0;
  return s1 > s0 ? 1 : -1;
}
