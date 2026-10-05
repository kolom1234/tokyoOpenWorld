// 차량 절차 모델(M06-T06, 자체 제작 — 실존 차명·로고·엠블럼·번호판 없음, ADR-0066): core VEHICLE_TYPES 7종(치수 공유) × LOD 0–2.
// 승용(세단·택시·경 왜건·미니밴) = 아래 차체 + 유리 캐빈 + 지붕 판, 경트럭 = 캡오버 + 짐칸, 택배 트럭 = 캡 + 화물 상자, 버스 = 창 띠 + 줄무늬.
// 색: 도장 = 인스턴스 색(셰이더), 고정 부품 = 정점색. 등화 = 부품 코드(전조등·후미등·좌우 깜빡이·택시 지붕등). LOD0 = 바퀴 살·거울·그릴, LOD2 = 상자 + 바퀴 6각.
import { VEHICLE_TYPES, type VehicleTypeInfo } from '@sanpo/core';
import type { BufferGeometry } from 'three/webgpu';
import { VehicleBuilder as B, VPART } from './builder.ts';

export type VehicleLod = 0 | 1 | 2;
/** LOD 최대 거리(m) — 이 밖은 그리지 않는다(교통 제거 500 m). */
export const VEHICLE_LOD_M = [35, 110, 520] as const;

const C = {
  white: 0xf2f2ee,
  trim: 0x1e1f21,
  grille: 0x2b2d30,
  glass: 0x15191d,
  head: 0xf4f1e6,
  tail: 0xb3120c,
  amber: 0xe88a10,
  lamp: 0xf8f4e0,
  chassis: 0x26272a,
  roofBox: 0x9a9da0,
} as const;

/** 승용 윤곽: 벨트라인·후드·트렁크 길이(앞·뒤 캐빈 기둥 아래 z 거리)·윗창 들임·바퀴. */
interface CarProfile {
  belt: number;
  hood: number;
  rear: number;
  wsRun: number;
  backRun: number;
  inset: number;
  r: number;
  axleIn: number;
}

const PROFILES: Readonly<Record<string, CarProfile>> = {
  sedan: { belt: 0.86, hood: 1.25, rear: 0.95, wsRun: 0.7, backRun: 0.5, inset: 0.2, r: 0.31, axleIn: 0.9 },
  taxi: { belt: 0.9, hood: 1.15, rear: 0.85, wsRun: 0.62, backRun: 0.3, inset: 0.18, r: 0.31, axleIn: 0.88 },
  kei: { belt: 0.86, hood: 0.62, rear: 0.12, wsRun: 0.58, backRun: 0.06, inset: 0.1, r: 0.27, axleIn: 0.55 },
  minivan: { belt: 0.96, hood: 0.88, rear: 0.12, wsRun: 0.7, backRun: 0.08, inset: 0.12, r: 0.32, axleIn: 0.82 },
};

/** 등화·범퍼·그릴(앞 −Z, 뒤 +Z) — 차체 앞뒤 면 바로 밖. */
function lights(b: B, t: VehicleTypeInfo, y: number, lod: VehicleLod, front = true): void {
  const L = t.lengthM / 2;
  const w = t.widthM / 2;
  if (front) {
    for (const s of [-1, 1]) b.box(s * (w - 0.3), y, -L + 0.02, 0.34, 0.13, 0.06, C.head, VPART.head);
    for (const s of [-1, 1])
      b.box(s * (w - 0.08), y - 0.02, -L + 0.04, 0.12, 0.09, 0.06, C.amber, s < 0 ? VPART.blinkL : VPART.blinkR);
    if (lod < 2) b.box(0, y - 0.04, -L + 0.02, w * 0.9, 0.14, 0.05, C.grille, VPART.fixed);
  }
  for (const s of [-1, 1]) b.box(s * (w - 0.22), y + 0.08, L - 0.02, 0.3, 0.14, 0.06, C.tail, VPART.tail);
  for (const s of [-1, 1])
    b.box(s * (w - 0.43), y + 0.08, L - 0.02, 0.1, 0.12, 0.06, C.amber, s < 0 ? VPART.blinkL : VPART.blinkR);
}

function wheels(b: B, t: VehicleTypeInfo, r: number, axles: readonly number[], lod: VehicleLod, width = 0.2): void {
  const seg = ([14, 9, 6] as const)[lod];
  const spokes = lod === 0 ? 5 : 0;
  for (const z of axles) for (const s of [-1, 1]) b.wheel(s * (t.widthM / 2 - 0.03), r, z, width, seg, spokes);
}

function mirrors(b: B, t: VehicleTypeInfo, y: number, z: number): void {
  for (const s of [-1, 1]) b.box(s * (t.widthM / 2 + 0.07), y, z, 0.14, 0.1, 0.14, C.trim, VPART.paint);
}

/** 승용 공통: 아래 차체(사다리꼴) + 유리 캐빈 + 지붕 판 + 바퀴 + 등화. */
function car(t: VehicleTypeInfo, p: CarProfile, lod: VehicleLod): B {
  const b = new B();
  const L = t.lengthM / 2;
  const w = t.widthM / 2;
  const floor = p.r * 0.7;
  b.taper(floor, p.belt, [-L + 0.12, L - 0.1], [-L + 0.04, L - 0.03], w - 0.05, w, C.white, VPART.paint);
  const zb: [number, number] = [-L + p.hood, L - p.rear];
  const zt: [number, number] = [zb[0] + p.wsRun, zb[1] - p.backRun];
  const top = t.heightM - 0.03;
  b.taper(p.belt, top, zb, zt, w - 0.06, w - p.inset, C.glass, VPART.glass);
  b.taper(
    top - 0.02,
    t.heightM,
    [zt[0] - 0.03, zt[1] + 0.03],
    [zt[0] + 0.02, zt[1] - 0.02],
    w - p.inset + 0.01,
    w - p.inset - 0.02,
    C.white,
    VPART.paint,
  );
  wheels(b, t, p.r, [-L + p.axleIn, L - p.axleIn], lod);
  if (lod < 2) lights(b, t, p.belt - 0.2, lod);
  if (lod === 0) {
    mirrors(b, t, p.belt + 0.1, zb[0] + 0.15);
    // B 기둥 — 유리 캐빈 옆면(벨트 → 지붕 들임)을 따라 앞뒤 창을 나눈다.
    const zm = (zb[0] + zb[1]) / 2 + 0.1;
    for (const s of [-1, 1])
      b.hexa(
        (ix, iy, iz) => [
          s * (iy ? w - p.inset : w - 0.06) + (ix - 0.5) * 0.03,
          iy ? top : p.belt,
          zm + (iz - 0.5) * 0.1,
        ],
        C.trim,
        VPART.fixed,
      );
    b.box(0, floor + 0.12, -L + 0.06, t.widthM - 0.1, 0.18, 0.1, C.white, VPART.paint);
    b.box(0, floor + 0.12, L - 0.06, t.widthM - 0.1, 0.18, 0.1, C.white, VPART.paint);
  }
  return b;
}

function taxi(t: VehicleTypeInfo, lod: VehicleLod): B {
  const b = car(t, PROFILES.taxi as CarProfile, lod);
  // 지붕등(가상 일반형 — 글자·로고 없음).
  if (lod < 2) b.taper(t.heightM, t.heightM + 0.17, [-0.42, -0.06], [-0.36, -0.12], 0.26, 0.2, C.lamp, VPART.roofLamp);
  return b;
}

/** 경트럭: 캡오버(엔진 위 캡) + 낮은 문짝 짐칸. */
function keiTruck(t: VehicleTypeInfo, lod: VehicleLod): B {
  const b = new B();
  const L = t.lengthM / 2;
  const w = t.widthM / 2;
  const cabEnd = -L + 1.3;
  b.taper(0.28, 0.98, [-L + 0.06, cabEnd], [-L, cabEnd], w - 0.04, w, C.white, VPART.paint);
  b.taper(
    0.98,
    t.heightM - 0.03,
    [-L + 0.02, cabEnd],
    [-L + 0.3, cabEnd - 0.05],
    w - 0.05,
    w - 0.12,
    C.glass,
    VPART.glass,
  );
  b.box(0, t.heightM - 0.025, cabEnd - 0.5, t.widthM - 0.22, 0.05, 1.02, C.white, VPART.paint);
  b.box(0, 0.62, (cabEnd + L) / 2 + 0.03, t.widthM - 0.02, 0.12, L - cabEnd - 0.06, C.white, VPART.paint);
  for (const s of [-1, 1])
    b.box(s * (w - 0.02), 0.84, (cabEnd + L) / 2 + 0.03, 0.04, 0.32, L - cabEnd - 0.06, C.white, VPART.paint);
  b.box(0, 0.84, L - 0.02, t.widthM - 0.02, 0.32, 0.04, C.white, VPART.paint);
  b.box(0, 0.4, (cabEnd + L) / 2, t.widthM - 0.3, 0.22, L - cabEnd, C.chassis, VPART.fixed);
  wheels(b, t, 0.27, [-L + 0.62, L - 0.72], lod, 0.17);
  if (lod < 2) lights(b, t, 0.58, lod);
  if (lod === 0) mirrors(b, t, 1.05, -L + 0.25);
  return b;
}

/** 택배 트럭(2 t 상자형): 캡 + 섀시 + 화물 상자(액센트 색 — 흰·은·연한 색). */
function deliveryTruck(t: VehicleTypeInfo, lod: VehicleLod): B {
  const b = new B();
  const L = t.lengthM / 2;
  const w = t.widthM / 2;
  const cabEnd = -L + 1.75;
  b.taper(0.42, 1.3, [-L + 0.08, cabEnd], [-L, cabEnd], w - 0.06, w - 0.02, C.white, VPART.paint);
  b.taper(1.3, 2.28, [-L + 0.04, cabEnd], [-L + 0.32, cabEnd - 0.05], w - 0.06, w - 0.16, C.glass, VPART.glass);
  b.box(0, 2.3, cabEnd - 0.68, t.widthM - 0.3, 0.06, 1.32, C.white, VPART.paint);
  b.box(0, 0.68, (cabEnd + L) / 2, t.widthM - 0.5, 0.3, L - cabEnd, C.chassis, VPART.fixed);
  b.box(0, 1.94, (cabEnd + 0.1 + L) / 2, t.widthM, t.heightM - 0.88, L - cabEnd - 0.1, C.white, VPART.accent);
  wheels(b, t, 0.38, [-L + 1.05, L - 1.6], lod, lod === 2 ? 0.25 : 0.32);
  if (lod < 2) lights(b, t, 0.82, lod);
  if (lod < 2) for (const s of [-1, 1]) b.box(s * (w - 0.25), 0.62, L - 0.02, 0.28, 0.12, 0.06, C.tail, VPART.tail);
  if (lod === 0) mirrors(b, t, 1.7, -L + 0.3);
  return b;
}

/** 버스: 아래 차체(도장) + 창 띠(유리) + 위 차체 + 지붕 설비 + 줄무늬(액센트) + 왼쪽(보도 쪽) 문. */
function bus(t: VehicleTypeInfo, lod: VehicleLod): B {
  const b = new B();
  const L = t.lengthM / 2;
  const w = t.widthM / 2;
  b.taper(0.32, 1.22, [-L + 0.05, L - 0.05], [-L, L], w - 0.02, w, C.white, VPART.paint);
  b.taper(1.22, 2.55, [-L, L], [-L + 0.05, L - 0.02], w, w - 0.02, C.glass, VPART.glass);
  b.taper(2.55, 3.0, [-L + 0.05, L - 0.02], [-L + 0.15, L - 0.08], w - 0.02, w - 0.06, C.white, VPART.paint);
  b.box(0, 3.05, 0.6, t.widthM - 0.6, 0.12, 3.2, C.roofBox, VPART.fixed);
  for (const s of [-1, 1]) b.box(s * (w + 0.005), 1.13, 0, 0.02, 0.14, t.lengthM - 0.2, C.white, VPART.accent);
  b.box(0, 1.13, -L - 0.005, t.widthM - 0.1, 0.14, 0.02, C.white, VPART.accent);
  wheels(b, t, 0.5, [-L + 2.3, L - 3.0], lod, 0.3);
  if (lod < 2) lights(b, t, 0.62, lod);
  if (lod === 0) for (const z of [-L + 0.95, -0.2]) b.box(-w - 0.006, 1.3, z, 0.02, 2.0, 1.05, C.glass, VPART.glass);
  return b;
}

/** 차종(core VEHICLE_TYPES 순서) × LOD → 기하. */
export function buildVehicleGeometry(type: number, lod: VehicleLod): BufferGeometry {
  const t = VEHICLE_TYPES[type] ?? (VEHICLE_TYPES[0] as VehicleTypeInfo);
  const profile = PROFILES[t.name];
  if (t.name === 'taxi') return taxi(t, lod).build();
  if (profile) return car(t, profile, lod).build();
  if (t.name === 'keiTruck') return keiTruck(t, lod).build();
  if (t.name === 'deliveryTruck') return deliveryTruck(t, lod).build();
  return bus(t, lod).build();
}

/** 도장 팔레트 32(일본 도로 흔한 비율 — 흰·은·검 위주, 가상): variant 색 5비트 → sRGB hex. */
const PAINT = [
  0xf4f4f0, 0xeeeee8, 0xf2f1ea, 0xe9e9e4, 0xf6f5ef, 0xf0efe9, 0xb9bcbf, 0xa9adb1, 0xc4c6c8, 0x9b9fa3, 0x8d9195,
  0x16171a, 0x1c1d20, 0x121315, 0x202226, 0x1a1b1e, 0x5c6064, 0x4b4f53, 0x6d7276, 0x1f2c4a, 0x2a3c5e, 0x8c1c1c,
  0xa3262a, 0x6e5a44, 0xb7a58a, 0x7f9db5, 0x2f4f3c, 0xc9b23a, 0xc7782e, 0x5d3b52, 0xd6d0c4, 0x34424e,
] as const;
/** 택시(가상 회사색 — 남색·검정·노랑·초록·주황·흰 투톤 없이 단색). */
const TAXI = [0x1d2340, 0x1d2340, 0x1d2340, 0x16171a, 0x16171a, 0xd8b52a, 0x2e6b3f, 0xc7652a] as const;
/** 버스(가상 노선 도색): 차체 흰·연한 색 + 줄무늬. */
const BUS_BODY = [0xf1f1ec, 0xe8ece6, 0xf0ece0] as const;
const BUS_STRIPE = [0x2f6d4e, 0x2a4f8c, 0xb8402e, 0xd59a2a] as const;
const CARGO = [0xf3f3f0, 0xf3f3f0, 0xd9dcdf, 0xc8d6df, 0xe6e1d3] as const;

/** variant → [도장, 액센트] sRGB hex. 경트럭은 흰색 위주(70 %). */
export function vehicleColors(type: number, color: number, seed: number): [number, number] {
  const name = VEHICLE_TYPES[type]?.name;
  const pick = <T extends readonly number[]>(a: T, k: number): number => a[k % a.length] as number;
  if (name === 'taxi') return [pick(TAXI, color), C.white];
  if (name === 'bus') return [pick(BUS_BODY, color), pick(BUS_STRIPE, seed)];
  if (name === 'deliveryTruck') return [pick(PAINT, color % 11), pick(CARGO, seed)];
  if (name === 'keiTruck') return [color < 22 ? C.white : pick(PAINT, color), C.white];
  return [pick(PAINT, color), C.white];
}
