// validate: 역 동선(M07-T06 후속 — ADR-0082). rail.bin이 있으면 content/stations/access.json을 빌드 승강장과 대조:
// ① 탑승 가능 노선(rideable)이 서는 역마다 출구 ≥ 1, ② 계단 F 도착점(승강장 표식 앞 2.2 m — apps/game station/stairs.ts passageTarget과 같은 규칙)이
// 그 역 탑승 정차 승강장 고리 안 + 가장자리 ≥ ARRIVAL_CLEARANCE_M, ③ 표식 높이 ≈ 승강장 윗면(±0.3 m), ④ 표식 자체도 고리 안.
// 고리 = OSM 윤곽(런타임 윗면은 여기에 선로 쪽 가장자리 띠를 더한다 — 고리 기준이 더 엄격).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzip, parseRail, type RailNetwork } from '@sanpo/tile-format';

/** apps/game station/platform-geo.ts ARRIVAL_CLEARANCE_M·stairs.ts ARRIVAL_STEP_M과 같은 값. */
export const ARRIVAL_CLEARANCE_M = 1.2;
export const ARRIVAL_STEP_M = 2.2;
const HEIGHT_TOL_M = 0.3;

interface Pos {
  posWF: [number, number, number];
  yawDeg: number;
}
export interface AccessLike {
  stations: { id: string; exits: { id: string; gate: Pos; stairs: Pos; platform: Pos }[] }[];
}

export interface StationExitCheck {
  station: string;
  exit: string;
  /** 도착점 WF xz·승강장 윗면 높이·고리 가장자리까지(m, 밖이면 음수). */
  arrival: [number, number];
  topY: number | null;
  clearanceM: number;
}

/** 점–다각형(xz 평탄 고리) 부호 거리: 안 = +가장자리까지, 밖 = −. */
export function ringClearance(ring: readonly number[], x: number, z: number): number {
  const n = ring.length / 2;
  let inside = false;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi, xj, zj] = [ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1]] as number[] as [
      number,
      number,
      number,
      number,
    ];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const dx = xj - xi;
    const dz = zj - zi;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / L2));
    best = Math.min(best, Math.hypot(xi + dx * t - x, zi + dz * t - z));
  }
  return inside ? best : -best;
}

/** 역 → 탑승 정차 승강장 번호들. */
function rideablePlatforms(net: RailNetwork): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const t of net.tracks) {
    if (!net.lines.find((l) => l.id === t.line)?.rideable) continue;
    for (const st of t.stops) {
      if (st.platform === undefined) continue;
      const set = out.get(st.station) ?? new Set<number>();
      set.add(st.platform);
      out.set(st.station, set);
    }
  }
  return out;
}

export function checkStationAccess(
  access: AccessLike,
  net: RailNetwork,
  errors: string[],
): { exits: StationExitCheck[] } {
  const ride = rideablePlatforms(net);
  const exits: StationExitCheck[] = [];
  for (const id of ride.keys())
    if (!access.stations.some((s) => s.id === id && s.exits.length > 0))
      errors.push(`stations: ${id} — 탑승 정차역인데 access.json 출구 없음`);
  for (const s of access.stations) {
    const plats = [...(ride.get(s.id) ?? [])].map((i) => net.platforms[i]).filter((p) => p !== undefined);
    if (plats.length === 0) errors.push(`stations: ${s.id} — 빌드에 탑승 정차 승강장 없음`);
    for (const e of s.exits) {
      const p = e.platform;
      const yaw = (p.yawDeg * Math.PI) / 180;
      const ax = p.posWF[0] - Math.sin(yaw) * ARRIVAL_STEP_M;
      const az = p.posWF[2] - Math.cos(yaw) * ARRIVAL_STEP_M;
      let best = { c: Number.NEGATIVE_INFINITY, topY: null as number | null, marker: Number.NEGATIVE_INFINITY };
      for (const pl of plats) {
        const c = ringClearance(pl.ringXZ, ax, az);
        if (c > best.c) best = { c, topY: pl.topY, marker: ringClearance(pl.ringXZ, p.posWF[0], p.posWF[2]) };
      }
      const tag = `stations: ${s.id}/${e.id}`;
      if (best.c < ARRIVAL_CLEARANCE_M)
        errors.push(
          `${tag} 계단 도착점 (${ax.toFixed(1)}, ${az.toFixed(1)}) 승강장 가장자리 ${best.c.toFixed(2)} m < ${ARRIVAL_CLEARANCE_M}`,
        );
      if (best.marker < 0) errors.push(`${tag} 승강장 계단 표식이 승강장 밖`);
      if (best.topY !== null && Math.abs(p.posWF[1] - best.topY) > HEIGHT_TOL_M)
        errors.push(`${tag} 표식 높이 ${p.posWF[1]} ≠ 승강장 윗면 ${best.topY} (±${HEIGHT_TOL_M})`);
      exits.push({
        station: s.id,
        exit: e.id,
        arrival: [Math.round(ax * 10) / 10, Math.round(az * 10) / 10],
        topY: best.topY,
        clearanceM: Math.round(best.c * 100) / 100,
      });
    }
  }
  return { exits };
}

/** 빌드 디렉토리 + 저장소 content → 검사(rail.bin·access.json 없으면 null). */
export async function checkStations(
  dir: string,
  repoRoot: string,
  errors: string[],
): Promise<{ exits: StationExitCheck[] } | null> {
  const railPath = join(dir, 'global/rail.bin');
  const accessPath = join(repoRoot, 'content/stations/access.json');
  if (!existsSync(railPath) || !existsSync(accessPath)) return null;
  const raw = await gunzip(new Uint8Array(readFileSync(railPath)));
  const net = raw.ok ? parseRail(raw.value) : undefined;
  if (!net?.ok) {
    errors.push(`stations: rail.bin ${raw.ok ? net?.error.message : raw.error.message}`);
    return null;
  }
  return checkStationAccess(JSON.parse(readFileSync(accessPath, 'utf8')) as AccessLike, net.value, errors);
}
