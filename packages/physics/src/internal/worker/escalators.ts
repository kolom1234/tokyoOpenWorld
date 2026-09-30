// 에스컬레이터 구간(08 §5, ADR-0044): JCOL SENSOR 박스(flags bit2) = OBB, 박스 로컬 +Z = 진행 방향(경사 포함). 캐릭터 발이 안에 있으면
// 구간 속도 0.5 m/s(일본 기준 분속 30 m)를 진행 방향으로 더하고, 걸어서 오르기는 수평 0.6 m/s까지. 바디 없이 OBB 목록으로 판정(셀당 몇 개).
import type { CellKey } from '@sanpo/core';

export const ESCALATOR = { speedMs: 0.5, walkMaxMs: 0.6 } as const;

export interface EscalatorVolume {
  /** 중심(PHYS). */
  c: readonly [number, number, number];
  /** 회전(x, y, z, w). */
  q: readonly [number, number, number, number];
  half: readonly [number, number, number];
  /** 진행 방향(단위, PHYS) = q · (0, 0, 1). */
  dir: readonly [number, number, number];
}

export interface Escalators {
  add(key: CellKey, v: EscalatorVolume): void;
  removeCell(key: CellKey): void;
  /** 점(PHYS)을 담은 구간. */
  at(x: number, y: number, z: number): EscalatorVolume | undefined;
  readonly count: number;
}

/** v를 q로 회전(q = 단위). conj = true면 역회전. */
export function rotate(
  q: readonly [number, number, number, number],
  v: readonly [number, number, number],
  conj = false,
): [number, number, number] {
  const s = conj ? -1 : 1;
  const qx = q[0] * s;
  const qy = q[1] * s;
  const qz = q[2] * s;
  const qw = q[3];
  // t = 2 · (q.xyz × v), v' = v + w·t + q.xyz × t
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

export function escalatorVolume(
  c: readonly [number, number, number],
  q: readonly [number, number, number, number],
  half: readonly [number, number, number],
): EscalatorVolume {
  return { c, q, half, dir: rotate(q, [0, 0, 1]) };
}

export function inside(v: EscalatorVolume, x: number, y: number, z: number): boolean {
  const l = rotate(v.q, [x - v.c[0], y - v.c[1], z - v.c[2]], true);
  return Math.abs(l[0]) <= v.half[0] && Math.abs(l[1]) <= v.half[1] && Math.abs(l[2]) <= v.half[2];
}

export function createEscalators(): Escalators {
  const byCell = new Map<CellKey, EscalatorVolume[]>();
  let count = 0;
  return {
    add(key, v) {
      const list = byCell.get(key) ?? [];
      list.push(v);
      byCell.set(key, list);
      count++;
    },
    removeCell(key) {
      count -= byCell.get(key)?.length ?? 0;
      byCell.delete(key);
    },
    at(x, y, z) {
      if (count === 0) return undefined;
      for (const list of byCell.values()) for (const v of list) if (inside(v, x, y, z)) return v;
      return undefined;
    },
    get count() {
      return count;
    },
  };
}
