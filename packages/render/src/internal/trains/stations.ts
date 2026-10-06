// 승강장·홈도어 그리기(M07-T04, ADR-0073): sim 배치(WF) → 열차 머티리얼(`train`) 재사용 — 파이프라인 추가 없음.
// 승강장 = 윗면·옆면 삼각형(면마다 법선 — 비색인), 홈도어 고정 판 = 조각마다 기울인 상자(스테인리스 틀 + 어두운 판 + 노선색 띠) → 정적 메시 1개(원점 = 첫 점).
// 문(gate) = 문짝 2장(doorLeaf, 미닫이 ±1.5 → 0.93 m) 인스턴스 — `_ivar.y` = 열림(+1 쪽). 위치 = 원점 − 렌더 원점(프레임마다, float64 차).
import type { Vec3d } from '@sanpo/core';
import {
  type BufferGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  Mesh,
} from 'three/webgpu';
import type { TrainStationsData } from '../../api.ts';
import { VehicleBuilder as B, VPART, type VPart } from '../vehicles/builder.ts';

type P3 = readonly [number, number, number];

/** 홈도어 조각 레코드 f64 × 5: x, y(승강장 윗면), z, yaw, 길이 — sim RailStaticLayout와 같다. */
const PIECE = 5;
const PSD_H = 1.3;
const COLOR = { platform: 0xa9a7a0, platformSide: 0x7d7b76, frame: 0xc4c9ce, panel: 0x3a4148 } as const;

/** 원점 기준 정적 메시에 넣을 기울인 상자(조각 로컬: −Z 앞, +X 옆). */
function pieceBox(
  b: B,
  o: Vec3d,
  x: number,
  y: number,
  z: number,
  yaw: number,
  box: [number, number, number, number, number, number],
  hex: number,
  code: VPart,
): void {
  const [cx, cy, cz, sx, sy, sz] = box;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  b.hexa(
    (ix, iy, iz) => {
      const lx = cx + (ix - 0.5) * sx;
      const lz = cz + (iz - 0.5) * sz;
      return [x - o.x + lx * c + lz * s, y - o.y + cy + (iy - 0.5) * sy, z - o.z + lz * c - lx * s];
    },
    hex,
    code,
    false,
  );
}

/** 승강장(면 법선 비색인) + 홈도어 고정 판 → 한 메시 기하(원점 o 기준). */
export function stationGeometry(d: TrainStationsData, o: Vec3d): BufferGeometry {
  const b = new B();
  const P = d.platforms.positions;
  const I = d.platforms.indices;
  for (let i = 0; i + 2 < I.length; i += 3) {
    const v = [I[i], I[i + 1], I[i + 2]].map(
      (k) =>
        [
          (P[(k as number) * 3] as number) - o.x,
          (P[(k as number) * 3 + 1] as number) - o.y,
          (P[(k as number) * 3 + 2] as number) - o.z,
        ] as const,
    );
    const flat = Math.abs((v[0]?.[1] ?? 0) - (v[1]?.[1] ?? 0)) + Math.abs((v[0]?.[1] ?? 0) - (v[2]?.[1] ?? 0)) < 1e-6;
    const [p0, p1, p2] = v as [P3, P3, P3];
    b.triangle(p0, p1, p2, flat ? COLOR.platform : COLOR.platformSide, VPART.fixed);
  }
  for (let k = 0; k + PIECE <= d.panels.length; k += PIECE) {
    const [x, y, z, yaw, len] = [0, 1, 2, 3, 4].map((j) => d.panels[k + j] as number) as [
      number,
      number,
      number,
      number,
      number,
    ];
    pieceBox(b, o, x, y, z, yaw, [0, 0.1, 0, 0.08, 0.2, len], COLOR.frame, VPART.stainless);
    pieceBox(b, o, x, y, z, yaw, [0, (0.2 + PSD_H - 0.1) / 2, 0, 0.04, PSD_H - 0.3, len], COLOR.panel, VPART.glass);
    pieceBox(b, o, x, y, z, yaw, [0, PSD_H - 0.05, 0, 0.12, 0.1, len], 0xffffff, VPART.paint);
  }
  return b.build();
}

/** 문 하나(조각 로컬, 길이 2 m): 문짝 2장(아래 판·띠) — 미닫이 방향 ±1.5, 쪽 +1. */
export function gateGeometry(): BufferGeometry {
  const b = new B();
  for (const dir of [-1, 1]) {
    const cz = dir * 0.48;
    const ex: [number, number] = [dir * 1.5, 1];
    b.box(0, 0.6, cz, 0.05, 1.1, 0.94, COLOR.frame, VPART.doorLeaf, ex);
    b.box(0, 1.2, cz, 0.06, 0.1, 0.94, COLOR.frame, VPART.doorLeaf, ex);
  }
  return b.build();
}

export interface StationsField {
  readonly root: Group;
  set(d: TrainStationsData | null, material: Material | undefined): void;
  /** 렌더 원점 → 위치, 문 열림 → 인스턴스. */
  update(renderOriginWF: Readonly<Vec3d>): void;
  dispose(): void;
}

interface Inst {
  m: Mesh;
  pos: InstancedBufferAttribute;
  vars: InstancedBufferAttribute;
}

/** 열차 머티리얼 인스턴스 메시(n개, 색 = 띠). */
function instanced(g: BufferGeometry, n: number, material: Material, band: number, name: string): Inst {
  const ig = new InstancedBufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) ig.setAttribute(k, a);
  ig.setIndex(g.index);
  const cap = Math.max(1, n) * 4;
  const pos = new InstancedBufferAttribute(new Float32Array(cap), 4);
  const vars = new InstancedBufferAttribute(new Float32Array(cap), 4);
  for (let k = 0; k < n; k++) vars.array.set([0, 0, band, 0], k * 4);
  ig.setAttribute('_ipos', pos);
  ig.setAttribute('_ivar', vars);
  ig.setAttribute('_imove', new InstancedBufferAttribute(new Float32Array(cap), 4));
  ig.instanceCount = n;
  const m = new Mesh(ig, material);
  m.name = name;
  m.frustumCulled = false;
  m.receiveShadow = true;
  m.castShadow = true;
  return { m, pos, vars };
}

/** 프레임: 정적 메시 위치·문 위치(원점 차)·열림. */
function place(d: TrainStationsData, origin: Vec3d, st: Inst, gt: Inst, o: Readonly<Vec3d>): void {
  st.pos.array.set([origin.x - o.x, origin.y - o.y, origin.z - o.z, 0]);
  st.pos.needsUpdate = true;
  const g = d.gates;
  const n = g.length / PIECE;
  for (let k = 0; k < n; k++) {
    const b = k * PIECE;
    gt.pos.array.set(
      [(g[b] as number) - o.x, (g[b + 1] as number) - o.y, (g[b + 2] as number) - o.z, g[b + 3] as number],
      k * 4,
    );
    gt.vars.array[k * 4 + 1] = d.gateOpen[k] ?? 0;
  }
  gt.pos.needsUpdate = true;
  gt.vars.needsUpdate = true;
}

export function createStationsField(): StationsField {
  const root = new Group();
  root.name = 'train-stations';
  let cur: { d: TrainStationsData; origin: Vec3d; st: Inst; gt: Inst } | undefined;
  const clear = () => {
    for (const m of root.children.slice()) {
      root.remove(m);
      (m as Mesh).geometry.dispose();
    }
    cur = undefined;
  };
  return {
    root,
    set(d, material) {
      clear();
      if (!d || !material || d.platforms.positions.length < 3) return;
      const P = d.platforms.positions;
      const origin = { x: P[0] as number, y: P[1] as number, z: P[2] as number };
      const st = instanced(stationGeometry(d, origin), 1, material, d.bandColor, 'train/stations');
      const gt = instanced(gateGeometry(), d.gates.length / PIECE, material, d.bandColor, 'train/psd-gates');
      root.add(st.m, gt.m);
      cur = { d, origin, st, gt };
    },
    update(o) {
      if (cur) place(cur.d, cur.origin, cur.st, cur.gt, o);
    },
    dispose: clear,
  };
}
