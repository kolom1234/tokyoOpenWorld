// 정점 하늘 가시도(M12-T05, S4 — ADR-0110): 셀 + 여유 96 m의 1 m DSM(지면 + 건물 지붕 높이)에서 정점마다 12 방위 지평선 각을 훑어
// 코사인 가중 하늘 비율 V = Σ w·(1 − sin θ) / Σ w → `_SKY`(u8 0..255). 벽은 바깥쪽 방위만(w = 법선·방위), 지붕·지면은 전 방위.
// 화면공간 GTAO(≈ 수 m)가 못 보는 골목·고층 사이 큰 차폐를 간접광에 반영한다. 순수 계산(결정론).
import { rasterizeRings } from './surface-class.ts';

/** DSM 여유(m) = 지평선을 찾는 최대 거리. */
export const SKY_MARGIN_M = 96;
/** 방위 수·지평선 표본 거리(m, 가까울수록 촘촘). */
const DIRS = 12;
const DISTS = [1.5, 3, 5, 8, 12, 17, 24, 33, 45, 60, 80, 96];
/** 시작점을 면에서 띄우는 거리(m) — 자기 면·바로 아래 DSM 칸에 가리지 않게. */
const LIFT_M = 0.3;
const CELL_M = 256;

/** 건물 발자국 + 꼭대기 높이(지붕 최고 y). */
export interface DsmBuilding {
  ground: (readonly (readonly number[])[])[];
  topY: number;
}

export interface SkyField {
  /** WF 위치·법선(단위) → 0..1. */
  at(x: number, y: number, z: number, nx: number, ny: number, nz: number): number;
}

/**
 * DSM: 셀 원점(ox, oz) 기준 [−여유, 256 + 여유]² 1 m 격자 = max(지면, 건물 꼭대기). ground(x, z) = WF 지면 높이.
 * 건물은 발자국 링(WF xyz)을 짝-홀로 채운다(경사 지붕도 꼭대기 높이 — 약간 과대 차폐).
 */
export function createSkyField(o: {
  ox: number;
  oz: number;
  ground: (x: number, z: number) => number;
  buildings: readonly DsmBuilding[];
}): SkyField {
  const n = CELL_M + 2 * SKY_MARGIN_M;
  const x0 = o.ox - SKY_MARGIN_M;
  const z0 = o.oz - SKY_MARGIN_M;
  const dsm = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dsm[r * n + c] = o.ground(x0 + c, z0 + r);
  for (const b of o.buildings) {
    for (const rings of b.ground) {
      rasterizeRings(rings, n, x0, z0, (k) => {
        if ((dsm[k] as number) < b.topY) dsm[k] = b.topY;
      });
    }
  }
  const cos = Array.from({ length: DIRS }, (_, k) => Math.cos((2 * Math.PI * k) / DIRS));
  const sin = Array.from({ length: DIRS }, (_, k) => Math.sin((2 * Math.PI * k) / DIRS));
  const sample = (x: number, z: number): number => {
    const c = Math.round(x - x0);
    const r = Math.round(z - z0);
    if (c < 0 || r < 0 || c >= n || r >= n) return Number.NEGATIVE_INFINITY;
    return dsm[r * n + c] as number;
  };
  return {
    at(x, y, z, nx, ny, nz) {
      if (ny < -0.7) return 0.5; // 아래를 보는 면(처마 밑·고가 밑) — 하늘 대신 지면 반사
      const px = x + nx * LIFT_M;
      const py = y + Math.max(ny, 0) * LIFT_M + 0.05;
      const pz = z + nz * LIFT_M;
      const hl = Math.hypot(nx, nz);
      const wall = ny < 0.7 && hl > 1e-6;
      let sum = 0;
      let wsum = 0;
      for (let k = 0; k < DIRS; k++) {
        const dx = cos[k] as number;
        const dz = sin[k] as number;
        const w = wall ? Math.max(0, (dx * nx + dz * nz) / hl) : 1;
        if (w <= 0) continue;
        let t = 0;
        for (const s of DISTS) {
          const h = sample(px + dx * s, pz + dz * s);
          const tt = (h - py) / s;
          if (tt > t) t = tt;
        }
        sum += w * (1 - t / Math.sqrt(1 + t * t));
        wsum += w;
      }
      return wsum > 0 ? sum / wsum : 1;
    },
  };
}

/**
 * 정점 배열 → `_SKY`(u8). pos = 셀 로컬 xyz(x·z는 + 원점, y는 WF), nrm = 법선 xyz(nScale로 나눠 단위 — int8이면 127),
 * count = 정점 수.
 */
export function skyAttribute(
  field: SkyField,
  pos: ArrayLike<number>,
  nrm: ArrayLike<number>,
  count: number,
  origin: { ox: number; oz: number },
  nScale = 1,
): Uint8Array {
  const out = new Uint8Array(count);
  for (let v = 0; v < count; v++) {
    const i = v * 3;
    let nx = (nrm[i] as number) / nScale;
    let ny = (nrm[i + 1] as number) / nScale;
    let nz = (nrm[i + 2] as number) / nScale;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const s = field.at(
      (pos[i] as number) + origin.ox,
      pos[i + 1] as number,
      (pos[i + 2] as number) + origin.oz,
      nx,
      ny,
      nz,
    );
    out[v] = Math.round(Math.min(Math.max(s, 0), 1) * 255);
  }
  return out;
}
