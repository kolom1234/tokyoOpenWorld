// 소품 절차 모델(M05-T03, 자체 제작 — 로고·상표·실존 상호 없음): PROP_TYPE별 LOD 0–2 기하. 원점 = 바닥 중심, 로컬 +Z = 정면.
// 전주 전선 부착(통신 5.6/6.1 m, 배전 8.6/9.1/9.6 m)·차도 쪽(+Z) 오프셋은 content/props/catalog.json(wireHeightsM·wireLateralM)과 맞춘다. 차량 신호 팔 = 로컬 +X(차도 위).
// 자판기 몸체는 흰색 — 인스턴스 색(가상 브랜드 팔레트)이 곱해진다. see ADR-0051, docs/07-rendering.md §5
import { PROP_TYPE } from '@sanpo/tile-format';
import type { BufferGeometry } from 'three/webgpu';
import { PartBuilder } from './geo.ts';

export type PropLod = 0 | 1 | 2;
const SEG: Readonly<Record<PropLod, number>> = { 0: 10, 1: 6, 2: 4 };

const C = {
  concrete: 0x9a9890,
  yellow: 0xe8c020,
  black: 0x202020,
  metal: 0x8c9094,
  dark: 0x2a2c2e,
  housing: 0x5c6670,
  green: 0x10c080,
  amber: 0xf0a000,
  red: 0xe02010,
  lamp: 0xfff2cc,
  white: 0xf0f0ec,
  panel: 0xcfd8e0,
  post: 0xc41e1a,
  wood: 0x8a5a36,
  glass: 0x9fb8c0,
  frame: 0x6a7a72,
  roof: 0x3c6a4a,
  bin: 0x5a6a5c,
  iron: 0x3a3632,
} as const;

type Model = (b: PartBuilder, lod: PropLod, seg: number) => void;

const utilityPole: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.19, 0.14, 11, seg, C.concrete);
  b.box(0, 9.65, 0.18, 0.1, 0.1, 1.3, C.dark);
  if (lod === 2) return;
  b.box(0, 9.15, 0.2, 0.08, 0.08, 0.5, C.dark).box(0, 8.65, -0.12, 0.08, 0.08, 0.4, C.dark);
  b.box(0, 5.6, 0.2, 0.06, 0.06, 0.3, C.dark).box(0, 6.1, 0.2, 0.06, 0.06, 0.3, C.dark);
  for (const z of [-0.25, 0.2, 0.55]) b.box(0, 9.72, z, 0.06, 0.1, 0.06, C.white);
  if (lod === 1) return;
  b.box(0, 7.3, -0.45, 0.55, 0.9, 0.5, C.metal);
  for (let i = 0; i < 4; i++) b.cyl(0, 0.3 + i * 0.45, 0, 0.2, 0.2, 0.45, seg, i % 2 ? C.black : C.yellow);
};

const streetLamp: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.09, 0.07, 7, seg, C.metal);
  b.box(0, 6.95, 0.75, 0.08, 0.08, 1.5, C.metal);
  b.box(0, 6.85, 1.45, 0.3, 0.14, 0.55, lod === 2 ? C.metal : C.lamp);
};

const signalVehicle: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.11, 0.1, 5.8, seg, C.metal);
  b.box(2, 5.45, 0, 4, 0.12, 0.12, C.metal);
  b.box(3.2, 5.2, 0, 1.25, 0.42, 0.3, C.housing);
  if (lod === 2) return;
  for (const [x, hex] of [
    [2.8, C.green],
    [3.2, C.amber],
    [3.6, C.red],
  ] as const)
    b.cyl(x, 5.2, 0.15, 0.13, 0.13, 0.03, seg, hex, 'z');
  if (lod === 0) for (const x of [2.8, 3.2, 3.6]) b.box(x, 5.36, 0.22, 0.3, 0.03, 0.14, C.housing);
};

const signalPedestrian: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.07, 0.06, 3.2, seg, C.metal);
  b.box(0, 2.62, 0.05, 0.32, 0.78, 0.26, C.housing);
  if (lod === 2) return;
  b.box(0, 2.82, 0.19, 0.24, 0.28, 0.02, C.red).box(0, 2.44, 0.19, 0.24, 0.28, 0.02, C.green);
};

const vendingMachine: Model = (b, lod) => {
  b.box(0, 0.915, 0, 1.1, 1.83, 0.8, C.white);
  if (lod === 2) return;
  b.box(0, 1.3, 0.405, 0.92, 0.72, 0.02, C.panel);
  b.box(0, 0.32, 0.405, 0.8, 0.16, 0.02, C.black);
  if (lod === 0) b.box(0.4, 0.95, 0.41, 0.16, 0.28, 0.02, C.dark).box(-0.12, 0.92, 0.41, 0.5, 0.06, 0.02, C.black);
};

const guardRail: Model = (b, lod, seg) => {
  if (lod === 2) {
    b.box(0, 0.6, 0, 4, 0.5, 0.05, C.white);
    return;
  }
  for (const y of lod === 0 ? [0.35, 0.6, 0.8] : [0.45, 0.8])
    b.cyl(-2, y, 0, 0.024, 0.024, 4, Math.min(seg, 6), C.white, 'x');
  for (const x of [-1, 1]) b.cyl(x, 0, 0, 0.03, 0.03, 0.82, Math.min(seg, 6), C.white);
};

const bollard: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.08, 0.08, 0.8, seg, C.dark);
  if (lod < 2) b.cyl(0, 0.62, 0, 0.083, 0.083, 0.06, seg, C.yellow);
};

const signStop: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.035, 0.035, 2.2, seg, C.metal);
  b.invTriangle(0, 2.25, 0.06, 0.8, 0.02, C.red);
  if (lod === 0) b.box(0, 2.33, 0.065, 0.36, 0.1, 0.004, C.white);
};

const postBox: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.1, 0.1, 0.25, seg, C.dark);
  b.box(0, 0.72, 0, 0.44, 0.95, 0.44, C.post);
  if (lod === 2) return;
  b.box(0, 1.22, 0, 0.5, 0.05, 0.5, C.post);
  if (lod === 0) b.box(0, 1.02, 0.225, 0.26, 0.04, 0.01, C.black);
};

const bicycleRack: Model = (b, lod) => {
  const t = lod === 2 ? 0.06 : 0.04;
  b.box(-0.28, 0.4, 0, t, 0.8, t, C.metal).box(0.28, 0.4, 0, t, 0.8, t, C.metal).box(0, 0.8, 0, 0.6, t, t, C.metal);
};

const busStop: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.05, 0.05, 2.5, seg, C.metal);
  b.cyl(0, 2.25, 0.03, 0.3, 0.3, 0.03, seg + 6, C.white, 'z');
  if (lod === 2) return;
  b.cyl(0, 2.25, 0.0, 0.33, 0.33, 0.03, seg + 6, C.roof, 'z');
  b.box(0, 1.35, 0.05, 0.42, 0.6, 0.04, C.panel);
  b.cyl(0, 0, 0, 0.22, 0.22, 0.12, seg, C.dark);
};

const manhole: Model = (b, _lod, seg) => {
  b.cyl(0, 0.003, 0, 0.3, 0.3, 0.012, seg + 6, C.iron);
};

const bench: Model = (b, lod) => {
  b.box(0, 0.42, 0, 1.6, 0.06, 0.45, C.wood);
  if (lod < 2) b.box(0, 0.72, -0.2, 1.6, 0.3, 0.05, C.wood);
  for (const x of [-0.7, 0.7]) b.box(x, 0.2, 0, 0.06, 0.4, 0.4, C.dark);
};

const phoneBooth: Model = (b, lod) => {
  b.box(0, 1.1, 0, 0.9, 2.2, 0.9, C.glass);
  b.box(0, 2.25, 0, 0.96, 0.1, 0.96, C.roof);
  if (lod === 2) return;
  for (const [x, z] of [
    [-0.44, -0.44],
    [0.44, -0.44],
    [-0.44, 0.44],
    [0.44, 0.44],
  ] as const)
    b.box(x, 1.1, z, 0.05, 2.2, 0.05, C.frame);
  if (lod === 0) b.box(0, 1.2, -0.38, 0.3, 0.4, 0.12, C.green);
};

const wasteBasket: Model = (b, lod, seg) => {
  b.cyl(0, 0, 0, 0.2, 0.22, 0.8, seg, C.bin);
  if (lod < 2) b.cyl(0, 0.8, 0, 0.23, 0.23, 0.04, seg, C.dark);
};

const MODELS: Readonly<Record<number, Model>> = {
  [PROP_TYPE.utilityPole]: utilityPole,
  [PROP_TYPE.streetLamp]: streetLamp,
  [PROP_TYPE.signalVehicle]: signalVehicle,
  [PROP_TYPE.signalPedestrian]: signalPedestrian,
  [PROP_TYPE.vendingMachine]: vendingMachine,
  [PROP_TYPE.guardRail]: guardRail,
  [PROP_TYPE.bollard]: bollard,
  [PROP_TYPE.signStop]: signStop,
  [PROP_TYPE.postBox]: postBox,
  [PROP_TYPE.bicycleRack]: bicycleRack,
  [PROP_TYPE.busStop]: busStop,
  [PROP_TYPE.manhole]: manhole,
  [PROP_TYPE.bench]: bench,
  [PROP_TYPE.phoneBooth]: phoneBooth,
  [PROP_TYPE.wasteBasket]: wasteBasket,
};

/** 아는 소품 종류(렌더가 모르는 typeId는 무시 — 전방 호환). */
export const PROP_TYPE_IDS: readonly number[] = Object.keys(MODELS).map(Number);

export function buildPropGeometry(typeId: number, lod: PropLod): BufferGeometry | undefined {
  const model = MODELS[typeId];
  if (!model) return undefined;
  const b = new PartBuilder();
  model(b, lod, SEG[lod]);
  return b.build();
}
