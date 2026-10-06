// 철도 적재(M07-T03, ADR-0072): 첫 표시 뒤 world `global/rail.bin`(gzip — DecompressionStream) + `global/timetables/index.json`·노선 파일 →
// sim.setRail(열차 = 시각의 순수 함수, 메인 스레드) → render.trains. 없으면(world-mini·옛 빌드 404) 열차 없이 계속.
// see docs/modules/game.md §부트 시퀀스, docs/10-simulation.md §6
import type { GameSystem, Logger } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { RenderService } from '@sanpo/render';
import type { RailStaticLayout, SimService } from '@sanpo/sim';
import {
  gunzip,
  JCOL_MATERIAL,
  parseRail,
  type RailNetwork,
  type TimetableFile,
  type TimetableIndexFile,
} from '@sanpo/tile-format';
import type { LoadedWorld } from './world-load.ts';

type FetchLike = (input: string) => Promise<Response>;

export interface RailData {
  network: RailNetwork;
  timetables: TimetableFile[];
}

/** rail.bin + 시간표. rail.bin이 없으면 undefined, 시간표가 없으면 빈 목록(선로만). 노선 파일 사이 한 프레임 양보(큰 JSON 파싱 분산). */
export async function loadRail(baseUrl: string, fetchFn: FetchLike, log: Logger): Promise<RailData | undefined> {
  const res = await fetchFn(`${baseUrl}/global/rail.bin`);
  if (!res.ok) return undefined;
  const raw = await gunzip(new Uint8Array(await res.arrayBuffer()));
  const t0 = performance.now();
  const net = raw.ok ? parseRail(raw.value) : undefined;
  log.info(`rail.bin parse ${(performance.now() - t0).toFixed(1)} ms`);
  if (!net?.ok) {
    log.warn('rail.bin', raw.ok ? net?.error : raw.error);
    return undefined;
  }
  const timetables: TimetableFile[] = [];
  const idx = await fetchFn(`${baseUrl}/global/timetables/index.json`);
  if (!idx.ok) return { network: net.value, timetables };
  const index = (await idx.json()) as TimetableIndexFile;
  for (const l of index.lines ?? []) {
    const r = await fetchFn(`${baseUrl}/${l.file}`);
    if (!r.ok) continue;
    const text = await r.text();
    const t0 = performance.now();
    timetables.push(JSON.parse(text) as TimetableFile);
    log.info(
      `timetable ${l.line}: ${l.trips} trips${l.approximate ? ' (근사)' : ''} ${Math.round(performance.now() - t0)} ms`,
    );
    await new Promise((ok) => requestAnimationFrame(() => ok(undefined)));
  }
  return { network: net.value, timetables };
}

/** 첫 표시 뒤: 철도 적재 → sim 열차 → render 열차 레이어(선컴파일 뒤 그림). 끝나면(성공·실패·없음) done(). */
export function startTrainsLater(
  v: { render: RenderService; sim: SimService },
  world: LoadedWorld,
  log: Logger,
  done: () => void,
  onRail?: (r: RailData) => void,
  fetchFn: FetchLike = (u) => fetch(u),
): void {
  void loadRail(world.baseUrl, fetchFn, log)
    .then(async (rail) => {
      if (!rail) return;
      onRail?.(rail);
      const t0 = performance.now();
      v.sim.setRail(rail.network, rail.timetables);
      log.info(`sim.setRail ${(performance.now() - t0).toFixed(1)} ms`);
      const buf = v.sim.outputs().trains;
      const layout = v.sim.railStatic();
      const band = rail.network.lines.find((l) => l.rideable)?.color ?? '#9acd32';
      if (layout)
        v.render.trains.setStations({
          platforms: layout.platforms,
          panels: layout.panels,
          gates: layout.gates,
          gateOpen: v.sim.psdGateOpen(),
          bandColor: Number.parseInt(band.slice(1), 16),
        });
      if (buf) await v.render.trains.bindShared(buf);
      log.info(`rail: ${rail.network.tracks.length} tracks, ${v.sim.trainStats()?.trips ?? 0} trips`);
    })
    .catch((e: unknown) => log.warn('trains', e))
    .finally(done);
}

/** 열차 물리 반경(m) — 플레이어 둘레 칸만 바디(08 §3 NPC 60 m와 같은 크기). */
const TRAIN_PHYSICS_R = 60;
/** 홈도어 문이 이만큼 열리면 막힘 상자를 없앤다(열차 문과 같은 기준). */
const GATE_OPEN_AT = 0.9;

/** 홈도어 조각(f64 × 5) → 정적 상자(f64 × 8: cx, cy, cz, 반변, yaw, 재질) — 높이 1.3 m, 두께 0.12 m. which = 넣을 조각. */
function psdBoxes(pieces: Float64Array, which: (k: number) => boolean): Float64Array {
  const out: number[] = [];
  for (let k = 0; k * 5 + 4 < pieces.length; k++) {
    if (!which(k)) continue;
    const o = k * 5;
    out.push(
      pieces[o] as number,
      (pieces[o + 1] as number) + 0.65,
      pieces[o + 2] as number,
      0.06,
      0.65,
      (pieces[o + 4] as number) / 2,
      pieces[o + 3] as number,
      JCOL_MATERIAL.metal,
    );
  }
  return Float64Array.from(out);
}

/** 승강장 바닥(윗면 삼각형)·홈도어 고정 판 → physics 정적 묶음. */
export function sendRailStatics(physics: PhysicsService, layout: RailStaticLayout): void {
  const pf = layout.platforms;
  physics.setStaticGroup('rail-platforms', {
    mesh: { positions: pf.positions, indices: pf.indices.slice(0, pf.topIndexCount), material: JCOL_MATERIAL.tile },
  });
  physics.setStaticGroup('rail-psd-panels', { boxes: psdBoxes(layout.panels, () => true) });
}

/**
 * phase 25(물리 30 전): 플레이어 60 m 안 열차 칸 레코드 → physics(이번 프레임 포즈), 홈도어 문 닫힘 상자 = 열림 상태가 바뀔 때만 다시.
 * 철도·물리가 늦게 생기면 생긴 뒤부터(정적 묶음은 처음 한 번).
 */
export function trainPhysicsSystem(sim: SimService, physics: () => PhysicsService | undefined): GameSystem {
  let sent = 0;
  let statics: PhysicsService | undefined;
  let gateKey = '';
  return {
    id: 'rail/physics',
    phase: 25,
    update(f) {
      const ph = physics();
      const layout = sim.railStatic();
      if (!ph || !layout) return;
      if (statics !== ph) {
        sendRailStatics(ph, layout);
        statics = ph;
        gateKey = '';
      }
      const open = sim.psdGateOpen();
      const key = Array.from(open, (g) => (g >= GATE_OPEN_AT ? '1' : '0')).join('');
      if (key !== gateKey) {
        ph.setStaticGroup('rail-psd-gates', { boxes: psdBoxes(layout.gates, (k) => (open[k] ?? 0) < GATE_OPEN_AT) });
        gateKey = key;
      }
      const cars = sim.trainBodies(f.player.posWF, TRAIN_PHYSICS_R);
      if (cars.length > 0 || sent > 0) ph.setTrainCars(cars);
      sent = cars.length;
    },
    dispose() {},
  };
}
