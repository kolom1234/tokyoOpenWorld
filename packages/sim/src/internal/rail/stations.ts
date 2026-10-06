// 역 정적 배치·홈도어 상태(M07-T04, ADR-0073): setRail 때 승강장 기하·홈도어 조각(WF) 한 번 → 프레임마다 문(gate) 열림 = 그 정차에 선 열차의 문.
// 출력: RailStaticLayout(render 메시·physics 바닥/판), gateOpen(같은 Float32Array를 제자리 갱신 — render·physics 배선이 읽는다).
import type { RailStaticLayout } from '../../api.ts';
import type { RailRt } from './network.ts';
import { type PsdStop, platformGeometry, psdLayout, psdPiece } from './platforms.ts';
import type { TrainState } from './trains.ts';

export const PSD_PIECE_STRIDE = 5;

export interface RailStations {
  readonly layout: RailStaticLayout;
  /** 문(gate) 열림 0..1(layout.gates 순서) — update가 제자리 갱신. */
  readonly gateOpen: Float32Array;
  update(trains: readonly TrainState[]): void;
}

function pieces(rt: RailRt, stops: readonly PsdStop[], pick: (p: PsdStop) => [number, number][]): Float64Array {
  const out: number[] = [];
  for (const ps of stops)
    for (const [s0, s1] of pick(ps)) {
      const q = psdPiece(rt, ps, s0, s1);
      out.push(q.x, q.y, q.z, q.yaw, q.len);
    }
  return Float64Array.from(out);
}

export function createRailStations(rt: RailRt): RailStations {
  const stops = psdLayout(rt.net);
  const layout: RailStaticLayout = {
    platforms: platformGeometry(rt.net),
    panels: pieces(rt, stops, (p) => p.panels),
    gates: pieces(rt, stops, (p) => p.gates),
    gateStops: stops.map((p) => p.gates.length),
  };
  const gateOpen = new Float32Array(layout.gates.length / PSD_PIECE_STRIDE);
  return {
    layout,
    gateOpen,
    update(trains) {
      let o = 0;
      for (const ps of stops) {
        const t = trains.find((q) => q.track === ps.track && q.stationAt === ps.station);
        gateOpen.fill(t ? Math.abs(t.motion.doors) : 0, o, o + ps.gates.length);
        o += ps.gates.length;
      }
    },
  };
}
