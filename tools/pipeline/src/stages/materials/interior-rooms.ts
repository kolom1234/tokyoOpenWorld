// 실내 큐브맵 방 8종 정의(M03-T05, 07 §5-4): 자체 제작(외부 에셋 없음) — 상자 가구·천장 조명판·바닥 무늬만.
// 좌표 = 정규화 방 [-1, 1]³: x = 밖에서 볼 때 오른쪽(벽 u 방향), y = 위(−1 바닥, +1 천장), z = 방 안쪽(−1 = 창 벽, +1 = 안쪽 벽).
// 셰이더(render materials/facade/interior.ts)가 실제 방(베이 폭 × 층고 × 깊이)을 이 상자에 맞춰 늘린다 → 가구는 대략적인 비율만.
// 색은 선형 RGB(0..1).

export type Rgb = readonly [number, number, number];
export type FloorPattern = 'carpet' | 'wood' | 'tatami' | 'plain';

export interface Box {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  color: Rgb;
}

export interface Room {
  id: string;
  floor: Rgb;
  floorPattern: FloorPattern;
  wall: Rgb;
  ceiling: Rgb;
  /** 천장 조명판 [x0, z0, x1, z1](y = +1). */
  lights: readonly (readonly [number, number, number, number])[];
  /** 조명 밝기 배율(0 = 소등). */
  lightLevel: number;
  boxes: readonly Box[];
}

const WHITE: Rgb = [0.72, 0.72, 0.7];
const GREY_CARPET: Rgb = [0.13, 0.14, 0.15];
const DESK: Rgb = [0.55, 0.54, 0.5];
const MONITOR: Rgb = [0.02, 0.02, 0.025];
const CHAIR: Rgb = [0.05, 0.05, 0.06];
const WOOD: Rgb = [0.34, 0.2, 0.1];
const BEIGE: Rgb = [0.62, 0.56, 0.47];

const box = (min: Box['min'], max: Box['max'], color: Rgb): Box => ({ min, max, color });

/** 사무실 책상 줄: 책상 상판 + 모니터 + 의자(등판). */
function deskRow(z: number): Box[] {
  const out: Box[] = [];
  for (const x of [-0.7, 0, 0.7]) {
    out.push(box([x - 0.3, -1, z - 0.18], [x + 0.3, -0.62, z + 0.18], DESK));
    out.push(box([x - 0.15, -0.62, z + 0.08], [x + 0.15, -0.4, z + 0.12], MONITOR));
    out.push(box([x - 0.12, -1, z - 0.42], [x + 0.12, -0.45, z - 0.34], CHAIR));
  }
  return out;
}

const OFFICE_LIGHTS: Room['lights'] = [
  [-0.8, -0.6, -0.4, -0.45],
  [0.4, -0.6, 0.8, -0.45],
  [-0.8, 0.2, -0.4, 0.35],
  [0.4, 0.2, 0.8, 0.35],
  [-0.2, -0.2, 0.2, -0.05],
  [-0.2, 0.6, 0.2, 0.75],
];

export const INTERIOR_ROOMS: readonly Room[] = [
  {
    id: 'office_open',
    floor: GREY_CARPET,
    floorPattern: 'carpet',
    wall: WHITE,
    ceiling: [0.78, 0.78, 0.76],
    lights: OFFICE_LIGHTS,
    lightLevel: 1,
    boxes: [...deskRow(-0.2), ...deskRow(0.55), box([-1, -1, 0.92], [1, -0.2, 1], [0.4, 0.4, 0.42])],
  },
  {
    id: 'office_meeting',
    floor: [0.16, 0.15, 0.14],
    floorPattern: 'carpet',
    wall: [0.68, 0.67, 0.64],
    ceiling: [0.76, 0.76, 0.74],
    lights: [[-0.5, -0.1, 0.5, 0.1]],
    lightLevel: 0.9,
    boxes: [
      box([-0.6, -1, -0.1], [0.6, -0.6, 0.6], [0.3, 0.22, 0.15]),
      box([-0.8, -1, -0.05], [-0.68, -0.45, 0.1], CHAIR),
      box([0.68, -1, -0.05], [0.8, -0.45, 0.1], CHAIR),
      box([-0.8, -1, 0.35], [-0.68, -0.45, 0.5], CHAIR),
      box([0.68, -1, 0.35], [0.8, -0.45, 0.5], CHAIR),
      box([-0.55, -0.3, 0.97], [0.55, 0.35, 1], [0.85, 0.86, 0.86]),
    ],
  },
  {
    id: 'office_dark',
    floor: [0.1, 0.1, 0.11],
    floorPattern: 'carpet',
    wall: [0.5, 0.5, 0.5],
    ceiling: [0.55, 0.55, 0.54],
    lights: OFFICE_LIGHTS,
    lightLevel: 0,
    boxes: [...deskRow(0.1)],
  },
  {
    id: 'office_storage',
    floor: [0.3, 0.3, 0.29],
    floorPattern: 'plain',
    wall: [0.6, 0.6, 0.58],
    ceiling: [0.7, 0.7, 0.68],
    lights: [[-0.15, -0.8, 0.15, 0.8]],
    lightLevel: 0.7,
    boxes: [
      box([-1, -1, -0.6], [-0.75, 0.3, 0.9], [0.3, 0.32, 0.36]),
      box([0.75, -1, -0.6], [1, 0.3, 0.9], [0.3, 0.32, 0.36]),
      box([-0.5, -1, 0.8], [0.5, 0.1, 1], [0.45, 0.4, 0.3]),
    ],
  },
  {
    id: 'home_living',
    floor: WOOD,
    floorPattern: 'wood',
    wall: BEIGE,
    ceiling: [0.74, 0.72, 0.68],
    lights: [[-0.15, 0.1, 0.15, 0.4]],
    lightLevel: 0.8,
    boxes: [
      box([-0.8, -1, 0.55], [0.3, -0.55, 0.9], [0.35, 0.3, 0.26]),
      box([-0.3, -1, 0.05], [0.3, -0.75, 0.35], [0.28, 0.17, 0.09]),
      box([0.6, -1, 0.6], [1, -0.55, 0.95], [0.12, 0.08, 0.05]),
      box([0.65, -0.55, 0.85], [0.95, -0.15, 0.9], MONITOR),
    ],
  },
  {
    id: 'home_bedroom',
    floor: [0.4, 0.28, 0.17],
    floorPattern: 'wood',
    wall: [0.7, 0.68, 0.64],
    ceiling: [0.75, 0.74, 0.72],
    lights: [[-0.12, 0.2, 0.12, 0.45]],
    lightLevel: 0.6,
    boxes: [
      box([-0.9, -1, 0.1], [0.1, -0.65, 1], [0.7, 0.7, 0.72]),
      box([-0.9, -0.65, 0.85], [0.1, -0.2, 1], [0.35, 0.25, 0.18]),
      box([0.55, -1, 0.3], [1, 0.6, 1], [0.55, 0.5, 0.44]),
    ],
  },
  {
    id: 'home_dining',
    floor: [0.45, 0.33, 0.2],
    floorPattern: 'wood',
    wall: [0.74, 0.72, 0.66],
    ceiling: [0.76, 0.75, 0.72],
    lights: [[-0.1, 0.25, 0.1, 0.45]],
    lightLevel: 0.9,
    boxes: [
      box([-0.4, -1, 0.1], [0.4, -0.6, 0.6], [0.4, 0.26, 0.14]),
      box([-1, -1, 0.75], [1, -0.5, 1], [0.8, 0.8, 0.78]),
      box([-1, -0.1, 0.8], [1, 0.4, 1], [0.7, 0.68, 0.62]),
    ],
  },
  {
    id: 'home_tatami',
    floor: [0.46, 0.44, 0.26],
    floorPattern: 'tatami',
    wall: [0.72, 0.66, 0.54],
    ceiling: [0.5, 0.36, 0.22],
    lights: [[-0.2, 0.1, 0.2, 0.4]],
    lightLevel: 0.7,
    boxes: [
      box([-0.3, -1, 0.15], [0.3, -0.82, 0.55], [0.3, 0.18, 0.08]),
      box([-1, -1, 0.9], [1, 0.8, 1], [0.86, 0.84, 0.78]),
    ],
  },
];
