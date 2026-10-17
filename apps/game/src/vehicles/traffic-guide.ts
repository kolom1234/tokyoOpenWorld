// 운전 교통 안내(M08-T02 — 위반해도 벌점 없음, HUD 안내만): 차가 있는 차선을 lanes.bin(AI 교통과 같은 데이터)에서 찾아
// 제한 속도, 역주행(좌측통행 — 같은 방향 차선 없이 반대 방향 차선 위), 앞 정지선 신호(sim.signalStateAt — AI와 같은 신호 상태)·거리,
// 적신호에 정지선을 넘음(안내). 순수 함수 laneAt·guideOf + 0.15 s마다 갱신하는 상태기.
import type { CellKey, Vec3d } from '@sanpo/core';
import { packCellKey } from '@sanpo/core';
import type { SignalState } from '@sanpo/sim';
import { LANE_KIND, LANE_NO_SIGNAL, type LaneGraphChunk } from '@sanpo/tile-format';

const CELL_M = 256;
/** 차선 위 판정: 중심선에서 폭/2 + 이 여유(m)·방향 일치(cos)·반대(cos). */
const ON_LANE_MARGIN_M = 0.8;
const SAME_DIR = Math.cos((60 * Math.PI) / 180);
const OPPOSITE_DIR = Math.cos((120 * Math.PI) / 180);
/** 정지선 안내 거리(m). */
const STOP_SHOW_M = 45;

export interface LaneHit {
  /** 같은 방향 차선(없으면 undefined). */
  lane?: { speedKmh: number; signal: number; toEndM: number; kind: number };
  /** 반대 방향 차선 위(같은 방향 차선 없이). */
  wrongWay: boolean;
}

/** 셀 차선 중 차 위치(셀 로컬)·진행 방향(fx, fz)에 맞는 차선. */
export function laneAt(g: LaneGraphChunk, lx: number, lz: number, fx: number, fz: number): LaneHit {
  const L = g.lanes;
  const P = g.pointsLocal;
  let best: LaneHit['lane'];
  let bestD = Number.POSITIVE_INFINITY;
  let opposite = false;
  for (let i = 0; i < L.id.length; i++) {
    const half = (L.widthCm[i] as number) / 200 + ON_LANE_MARGIN_M;
    const o = L.ptOffset[i] as number;
    const n = L.ptCount[i] as number;
    let acc = 0;
    let total = 0;
    for (let k = 0; k + 1 < n; k++)
      total += Math.hypot(
        (P[(o + k + 1) * 3] as number) - (P[(o + k) * 3] as number),
        (P[(o + k + 1) * 3 + 2] as number) - (P[(o + k) * 3 + 2] as number),
      );
    for (let k = 0; k + 1 < n; k++) {
      const ax = P[(o + k) * 3] as number;
      const az = P[(o + k) * 3 + 2] as number;
      const dx = (P[(o + k + 1) * 3] as number) - ax;
      const dz = (P[(o + k + 1) * 3 + 2] as number) - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const t = Math.max(0, Math.min(1, ((lx - ax) * dx + (lz - az) * dz) / (len * len)));
      const d = Math.hypot(ax + dx * t - lx, az + dz * t - lz);
      const align = (dx * fx + dz * fz) / len;
      if (d <= half && align >= SAME_DIR && d < bestD) {
        bestD = d;
        best = {
          speedKmh: L.speedKmh[i] as number,
          signal: L.signal[i] as number,
          toEndM: total - acc - len * t,
          kind: L.kind[i] as number,
        };
      } else if (d <= half && align <= OPPOSITE_DIR && L.kind[i] !== LANE_KIND.connector) opposite = true;
      acc += len;
    }
  }
  return best ? { lane: best, wrongWay: false } : { wrongWay: opposite };
}

export interface DriveGuide {
  limitKmh?: number;
  wrongWay: boolean;
  /** 앞 정지선 신호(적·황)와 거리. */
  stop?: { lamp: 'R' | 'Y'; distM: number };
  /** 이번에 적신호 정지선을 넘음(안내 한 번). */
  ranRed: boolean;
}

/** 0.15 s마다: 차 위치·방위 → 차선 → 안내. 적신호 정지선 통과는 "정지선 3 m 안·적" 다음 갱신에 차선이 바뀌었으면. */
export function createDriveGuide(
  load: (key: CellKey) => Promise<LaneGraphChunk | null>,
  signal: (code: number) => SignalState,
): { update(pos: Readonly<Vec3d>, yawRad: number, dtS: number): DriveGuide; readonly guide: DriveGuide } {
  const guide: DriveGuide = { wrongWay: false, ranRed: false };
  let t = 0;
  let chunk: { key: CellKey; g: LaneGraphChunk | null } | undefined;
  let atRed = false;
  return {
    guide,
    update(pos, yaw, dt) {
      guide.ranRed = false;
      t -= dt;
      if (t > 0) return guide;
      t = 0.15;
      const ix = Math.floor(pos.x / CELL_M);
      const iz = Math.floor(pos.z / CELL_M);
      const key = packCellKey(0, ix, iz);
      if (chunk?.key !== key) {
        chunk = { key, g: null };
        void load(key).then((g) => {
          if (chunk?.key === key) chunk.g = g;
        });
      }
      const g = chunk.g;
      if (!g) return guide;
      const hit = laneAt(g, pos.x - ix * CELL_M, pos.z - iz * CELL_M, -Math.sin(yaw), -Math.cos(yaw));
      guide.wrongWay = hit.wrongWay;
      if (hit.lane?.speedKmh) guide.limitKmh = hit.lane.speedKmh;
      else delete guide.limitKmh;
      const l = hit.lane;
      const lamp = l && l.signal !== LANE_NO_SIGNAL ? signal(l.signal).vehicle : 'G';
      if (atRed && (!l || l.toEndM > 6)) guide.ranRed = true;
      atRed = lamp === 'R' && l !== undefined && l.toEndM < 3;
      if (l && lamp !== 'G' && l.toEndM < STOP_SHOW_M) guide.stop = { lamp, distM: l.toEndM };
      else delete guide.stop;
      return guide;
    },
  };
}
