// 열차 절차 모델 공용 부품(M07-T03, 자체 제작 — 실존 회사 로고·정확한 도색 없음, ADR-0072): 차형 치수, 지붕·냉방기, 대차·바퀴,
// 운전실 앞면(등화 = 앞 운전실 전조등·뒤 운전실 미등), 싱글암 팬터그래프(전차선 5.2 m까지), 빗각 막대.
// 칸 로컬: 원점 = 칸 중심 레일 윗면, −Z = 진행 방향(앞), +X = 오른쪽. 노선색 띠 = VPART.paint(셰이더가 인스턴스 색).
import { type VehicleBuilder as B, type Corner, VPART, type VPart } from '../vehicles/builder.ts';

export type CarLod = 0 | 1 | 2;
/** LOD 최대 거리(m) — 열차는 크고 멀리서도 보인다. */
export const TRAIN_LOD_M = [45, 300, 1600] as const;

export interface CarDims {
  /** 칸 길이(연결면 간격) — 차체는 양끝 0.25 m 짧다. */
  L: number;
  W: number;
  /** 문 중심 z(한쪽 — 양쪽 같은 자리). */
  doors: readonly number[];
  doorW: number;
  skirt: number;
  floor: number;
  belt: number;
  winTop: number;
  doorTop: number;
  cornice: number;
  roof: number;
  /** 대차 중심 z(±). */
  bogie: number;
  /** 운전실 길이(m, 앞 칸막이까지). */
  cab: number;
}

/** 차형 0 = 20 m 통근형 4문(JR — sim CAR_TYPE.commuter20), 1 = 16 m 지하철형 3문(긴자선). */
export const CAR_DIMS: readonly CarDims[] = [
  {
    L: 20,
    W: 2.95,
    doors: [-7.35, -2.45, 2.45, 7.35],
    doorW: 1.3,
    skirt: 0.95,
    floor: 1.15,
    belt: 2.0,
    winTop: 2.85,
    doorTop: 3.0,
    cornice: 3.3,
    roof: 3.65,
    bogie: 6.9,
    cab: 2.2,
  },
  {
    L: 16,
    W: 2.55,
    doors: [-5.1, 0, 5.1],
    doorW: 1.3,
    skirt: 0.95,
    floor: 1.1,
    belt: 1.95,
    winTop: 2.8,
    doorTop: 2.95,
    cornice: 3.2,
    roof: 3.5,
    bogie: 5.5,
    cab: 2.0,
  },
];

export const C = {
  stainless: 0xc4c9ce,
  roof: 0x8d9298,
  ac: 0xb8bcc0,
  under: 0x2e3033,
  bogie: 0x24262a,
  glass: 0x10161c,
  front: 0x18191b,
  head: 0xf6f3ea,
  tail: 0xc0140e,
  lampOff: 0x5a5d61,
  panto: 0x3a3d41,
  bellows: 0x2a2b2d,
} as const;

/** 차체 끝(연결면에서 0.25 m 안). */
export const bodyEnd = (d: CarDims): number => d.L / 2 - 0.25;

/** a → c 막대(단면 w × h). 면 방향이 상자와 같게(오른손) 축을 맞춘다. */
export function beam(
  b: B,
  a: readonly [number, number, number],
  c: readonly [number, number, number],
  w: number,
  h: number,
  hex: number,
  code: VPart,
): void {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(u[0] as number, u[1] as number, u[2] as number) || 1;
  const uu = u.map((x) => x / len) as [number, number, number];
  // v = 막대에 수직인 YZ 평면 방향(위쪽 성분 +).
  let v: [number, number, number] = [0, uu[2], -uu[1]];
  if (v[1] < 0) v = [0, -v[1], -v[2]];
  if (Math.hypot(v[1], v[2]) < 1e-6) v = [0, 0, 1];
  // det(ex, v, u) < 0이면 x를 뒤집어 상자 면 순서(바깥 반시계)를 지킨다.
  const det = v[1] * uu[2] - v[2] * uu[1];
  const sx = det < 0 ? -1 : 1;
  const corner: Corner = (ix, iy, iz) => {
    const p = iz ? c : a;
    const ox = sx * (ix - 0.5) * w;
    const oy = (iy - 0.5) * h;
    return [p[0] + ox + v[0] * oy, p[1] + v[1] * oy, p[2] + v[2] * oy];
  };
  b.hexa(corner, hex, code, false);
}

/** 지붕(처마 → 지붕 두 단 들임) + 냉방기 2대(LOD 0–1). */
export function roof(b: B, d: CarDims, lod: CarLod): void {
  const e = bodyEnd(d);
  const mid = d.cornice + (d.roof - d.cornice) * 0.55;
  b.taper(d.cornice, mid, [-e, e], [-e + 0.05, e - 0.05], d.W / 2, d.W * 0.43, C.roof, VPART.fixed);
  b.taper(mid, d.roof, [-e + 0.05, e - 0.05], [-e + 0.15, e - 0.15], d.W * 0.43, d.W * 0.28, C.roof, VPART.fixed);
  if (lod < 2) for (const z of [-d.L / 4, d.L / 4]) b.box(0, d.roof + 0.17, z, 1.9, 0.34, 2.5, C.ac, VPART.fixed);
}

/** 대차 2개(틀 + 바퀴 4) + 바닥 밑 기기. LOD2 = 바닥 밑 상자 하나. */
export function underframe(b: B, d: CarDims, lod: CarLod): void {
  const e = bodyEnd(d);
  if (lod === 2) {
    b.box(0, (0.35 + d.skirt) / 2, 0, d.W * 0.8, d.skirt - 0.35, 2 * e - 0.6, C.under, VPART.fixed);
    return;
  }
  b.box(0, 0.7, 0, d.W * 0.82, 0.5, 2 * (d.bogie - 1.7), C.under, VPART.fixed);
  for (const z of [-d.bogie, d.bogie]) {
    b.box(0, 0.62, z, 2.05, 0.3, 2.6, C.bogie, VPART.fixed);
    for (const s of [-1, 1]) b.box(s * 1.0, 0.55, z, 0.12, 0.42, 2.9, C.bogie, VPART.fixed);
    for (const dz of [-1.05, 1.05])
      for (const s of [-1, 1]) b.wheel(s * 0.82, 0.43, z + dz, 0.14, lod === 0 ? 12 : 6, 0);
  }
}

/**
 * 운전실 앞면(cab = −1 앞 끝·+1 뒤 끝 — 뒤는 앞의 거울): 아래 검은 판 + 노선색 띠 + 전면 유리(LOD0 = 창틀만 — 전면 전망) + 위 판,
 * 전조등·미등 — lit = 'head'(앞 운전실 = 전조등 발광) | 'tail'(뒤 운전실 = 미등 발광).
 */
export function cabFront(b: B, d: CarDims, end: -1 | 1, lit: 'head' | 'tail', lod: CarLod): void {
  const z = end * (bodyEnd(d) + 0.04);
  const w = d.W - 0.04;
  b.box(0, (d.skirt + d.belt) / 2, z, w, d.belt - d.skirt, 0.08, C.front, VPART.fixed);
  b.box(0, d.belt - 0.08, z + end * 0.03, w, 0.12, 0.06, 0xffffff, VPART.paint);
  b.box(0, (d.doorTop + d.cornice) / 2, z, w, d.cornice - d.doorTop, 0.08, C.front, VPART.fixed);
  if (lod === 0)
    for (const x of [-(w / 2 - 0.08), 0, w / 2 - 0.08])
      b.box(x, (d.belt + d.doorTop) / 2, z, x === 0 ? 0.1 : 0.16, d.doorTop - d.belt, 0.08, C.front, VPART.fixed);
  else b.box(0, (d.belt + d.doorTop) / 2, z, w, d.doorTop - d.belt, 0.06, C.glass, VPART.glass);
  // 앞 끝 밑 장애물 제거기·연결기.
  b.box(0, (0.6 + d.skirt) / 2, z + end * 0.12, d.W * 0.78, d.skirt - 0.6, 0.24, C.under, VPART.fixed);
  const ly = d.belt - 0.3;
  for (const s of [-1, 1]) {
    b.box(
      s * (w / 2 - 0.32),
      ly,
      z + end * 0.05,
      0.3,
      0.14,
      0.04,
      lit === 'head' ? C.head : C.lampOff,
      lit === 'head' ? VPART.head : VPART.fixed,
    );
    b.box(
      s * (w / 2 - 0.62),
      ly,
      z + end * 0.05,
      0.18,
      0.14,
      0.04,
      lit === 'tail' ? C.tail : 0x4a1210,
      lit === 'tail' ? VPART.tail : VPART.fixed,
    );
  }
}

/** 싱글암 팬터그래프(지붕 z0, 접판 = 레일 위 5.2 m 전차선). */
export function pantograph(b: B, d: CarDims, z0: number, lod: CarLod): void {
  const y0 = d.roof;
  if (lod < 2) b.box(0, y0 + 0.06, z0, 1.3, 0.12, 1.5, C.panto, VPART.fixed);
  const base: [number, number, number] = [0, y0 + 0.12, z0 + 0.7];
  const knee: [number, number, number] = [0, y0 + 0.95, z0 - 0.55];
  const head: [number, number, number] = [0, 5.16, z0 + 0.1];
  beam(b, base, knee, 0.12, 0.08, C.panto, VPART.fixed);
  beam(b, knee, head, 0.08, 0.06, C.panto, VPART.fixed);
  b.box(0, 5.19, head[2], 1.9, 0.05, 0.14, C.panto, VPART.fixed);
  if (lod === 0) beam(b, [0, y0 + 0.12, z0 + 0.4], [0, y0 + 0.9, z0 - 0.45], 0.03, 0.03, C.panto, VPART.fixed);
}
