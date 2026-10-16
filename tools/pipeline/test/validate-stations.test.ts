// validate stations(ADR-0082): 고리 부호 거리, 탑승 정차역 출구 누락·도착점 가장자리·표식 높이 오류.
import type { RailNetwork } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { type AccessLike, checkStationAccess, ringClearance } from '../src/stages/validate-stations.ts';

/** 승강장 x 0..6 × z −100..0(윗면 5), 정차 = 탑승 노선 하나(역 a) + 비탑승 노선(역 b). */
const net = {
  lines: [
    { id: 'jr', rideable: true },
    { id: 'freight', rideable: false },
  ],
  tracks: [
    { id: 't1', line: 'jr', stops: [{ station: 'a', platform: 0 }] },
    { id: 't2', line: 'freight', stops: [{ station: 'b', platform: 0 }] },
  ],
  stations: [],
  platforms: [{ id: 'p', ringXZ: [0, 0, 6, 0, 6, -100, 0, -100, 0, 0], topY: 5 }],
  points: new Float32Array(),
  speed: new Float32Array(),
  flags: new Uint8Array(),
} as unknown as RailNetwork;

const exit = (px: number, py: number, pz: number, yawDeg: number) => ({
  id: 'e',
  gate: { posWF: [0, 0, 0] as [number, number, number], yawDeg: 0 },
  stairs: { posWF: [0, 0, 0] as [number, number, number], yawDeg: 0 },
  platform: { posWF: [px, py, pz] as [number, number, number], yawDeg },
});

describe('validate stations', () => {
  it('ring clearance: + inside (distance to edge), − outside', () => {
    const ring = net.platforms[0]?.ringXZ as number[];
    expect(ringClearance(ring, 3, -50)).toBeCloseTo(3, 6);
    expect(ringClearance(ring, 1, -50)).toBeCloseTo(1, 6);
    expect(ringClearance(ring, -2, -50)).toBeCloseTo(-2, 6);
  });
  it('centre arrival passes; edge arrival, wrong height and missing rideable station fail', () => {
    const ok: string[] = [];
    // 북(yaw 0)으로 2.2 m → (3, −52.2).
    const r = checkStationAccess({ stations: [{ id: 'a', exits: [exit(3, 5, -50, 0)] }] }, net, ok);
    expect(ok).toEqual([]);
    expect(r.exits[0]?.arrival).toEqual([3, -52.2]);
    expect(r.exits[0]?.clearanceM).toBe(3);
    const bad: string[] = [];
    // 서(yaw 90)로 2.2 m → x 0.3(가장자리 0.3 m), 표식 높이 6.
    const access: AccessLike = {
      stations: [
        { id: 'b', exits: [] },
        { id: 'a', exits: [exit(2.5, 6, -50, 90)] },
      ],
    };
    checkStationAccess(access, net, bad);
    expect(bad.some((e) => e.includes('가장자리'))).toBe(true);
    expect(bad.some((e) => e.includes('표식 높이'))).toBe(true);
    // 비탑승 역 b는 출구가 없어도 되지만, access에 있으면 "탑승 정차 승강장 없음".
    expect(bad.some((e) => e.includes('b — 빌드에 탑승 정차 승강장 없음'))).toBe(true);
    const missing: string[] = [];
    checkStationAccess({ stations: [] }, net, missing);
    expect(missing).toEqual(['stations: a — 탑승 정차역인데 access.json 출구 없음']);
  });
});
