// 생활형 자전거 + 탄 사람(M08-T03 — 자체 제작, 실존 제품·로고 없음): 낮은 프레임(스텝 스루), 앞 바구니, 흙받이, 체인 커버, 전조등·후미등,
// 앉은 사람(절차 마네킹 — 몸통·머리·팔·다리 막대). 도장 = 프레임(인스턴스 색), 액센트 = 바구니·흙받이. 원점 = 바닥 중심, 전방 −Z. LOD 0–2.
import type { VehicleTypeInfo } from '@sanpo/core';
import { VehicleBuilder as B, type VehicleLod, VPART } from './builder.ts';

type P3 = readonly [number, number, number];

const SKIN = 0xc9a183;
const SHIRT = 0x3a4a63;
const PANTS = 0x2a2c31;
const HAIR = 0x1d1a18;
const DARK = 0x1e1f21;
const LAMP = 0xf4f1e6;
const TAIL = 0xb3120c;
const SEAT = 0x26272a;

/** 두 점 사이 사각 막대(두께 t). 단면 축 u ⟂ 진행, v = d × u — (u, v, d) 오른손 → 상자 면 감기 그대로. */
export function bar(b: B, a: P3, c: P3, t: number, hex: number, code: (typeof VPART)[keyof typeof VPART]): B {
  const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const l = Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0) || 1;
  const n = [(d[0] ?? 0) / l, (d[1] ?? 0) / l, (d[2] ?? 0) / l] as const;
  const ref = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [
    n[1] * (ref[2] ?? 0) - n[2] * (ref[1] ?? 0),
    n[2] * (ref[0] ?? 0) - n[0] * (ref[2] ?? 0),
    n[0] * (ref[1] ?? 0) - n[1] * (ref[0] ?? 0),
  ];
  const ul = Math.hypot(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0) || 1;
  u = u.map((x) => x / ul);
  const v = [
    n[1] * (u[2] ?? 0) - n[2] * (u[1] ?? 0),
    n[2] * (u[0] ?? 0) - n[0] * (u[2] ?? 0),
    n[0] * (u[1] ?? 0) - n[1] * (u[0] ?? 0),
  ];
  return b.hexa(
    (ix, iy, iz) => {
      const e = iz ? c : a;
      const su = (ix - 0.5) * t;
      const sv = (iy - 0.5) * t;
      return [
        e[0] + (u[0] ?? 0) * su + (v[0] ?? 0) * sv,
        e[1] + (u[1] ?? 0) * su + (v[1] ?? 0) * sv,
        e[2] + (u[2] ?? 0) * su + (v[2] ?? 0) * sv,
      ];
    },
    hex,
    code,
    false,
  );
}

/** 앉은 사람(안장 위 — 손 = 핸들, 발 = 페달 높이). */
function rider(b: B, lod: VehicleLod): void {
  b.taper(1.0, 1.52, [0.0, 0.3], [-0.06, 0.18], 0.17, 0.19, SHIRT, VPART.fixed);
  b.box(0, 1.66, 0.06, 0.19, 0.24, 0.21, SKIN, VPART.fixed);
  if (lod < 2) b.box(0, 1.78, 0.08, 0.2, 0.05, 0.22, HAIR, VPART.fixed);
  for (const s of [-1, 1]) {
    bar(b, [s * 0.2, 1.46, 0.08], [s * 0.26, 1.02, -0.4], 0.09, SHIRT, VPART.fixed);
    bar(b, [s * 0.1, 0.98, 0.2], [s * 0.12, 0.82, -0.16], 0.14, PANTS, VPART.fixed);
    bar(b, [s * 0.12, 0.82, -0.16], [s * 0.13, 0.36, 0.0], 0.11, PANTS, VPART.fixed);
    if (lod === 0) b.box(s * 0.13, 0.33, -0.04, 0.1, 0.07, 0.22, DARK, VPART.fixed);
  }
}

/** 프레임·바퀴·부속. */
function frame(b: B, r: number, zf: number, zr: number, lod: VehicleLod): void {
  const tube = lod === 2 ? 0.06 : 0.045;
  const head: P3 = [0, 0.9, zf + 0.12];
  const bb: P3 = [0, 0.32, 0.02];
  const seatTop: P3 = [0, 0.94, 0.18];
  bar(b, head, [0, r, zf], tube, DARK, VPART.paint);
  bar(b, head, bb, tube, DARK, VPART.paint);
  bar(b, bb, seatTop, tube, DARK, VPART.paint);
  bar(b, bb, [0, r, zr], tube * 0.8, DARK, VPART.paint);
  bar(b, seatTop, [0, r, zr], tube * 0.8, DARK, VPART.paint);
  b.box(0, 0.98, 0.2, 0.17, 0.06, 0.26, SEAT, VPART.fixed);
  bar(b, [0, 0.9, zf + 0.12], [0, 1.02, zf + 0.2], tube, DARK, VPART.paint);
  b.box(0, 1.03, zf + 0.2, 0.56, 0.035, 0.035, DARK, VPART.fixed);
  if (lod < 2) {
    // 바구니(액센트 — 은색 철망 근사)·흙받이·체인 커버.
    b.box(0, 0.86, zf - 0.08, 0.36, 0.26, 0.3, 0xffffff, VPART.accent);
    for (const z of [zf, zr]) b.box(0, r + r * 0.98, z, 0.07, 0.03, r * 1.3, 0xffffff, VPART.accent);
    b.box(0.06, 0.34, (0.02 + zr) / 2, 0.02, 0.12, Math.abs(zr - 0.02) + 0.1, 0xffffff, VPART.paint);
    b.box(0, 0.86, zf + 0.09, 0.09, 0.07, 0.05, LAMP, VPART.head);
    b.box(0, r + r * 0.98, zr + r * 0.6, 0.06, 0.04, 0.02, TAIL, VPART.tail);
  }
  const seg = ([18, 10, 6] as const)[lod];
  const spokes = lod === 0 ? 8 : 0;
  for (const z of [zf, zr]) for (const s of [-1, 1]) b.wheel(s * 0.028, r, z, 0.028, seg, spokes);
}

export function bicycleModel(t: VehicleTypeInfo, lod: VehicleLod): B {
  const b = new B();
  const r = 0.33;
  const half = 1.12 / 2;
  frame(b, r, -half, half, lod);
  rider(b, lod);
  void t;
  return b;
}
