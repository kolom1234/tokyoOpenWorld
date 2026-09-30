// 보도 바깥 가장자리 새기기(M05-T01): 래스터 분류(1 m)는 PLATEAU 폴리곤 사이 1 m 미만 겹침·틈을 못 가려 가장자리 치마와 지형이 최대 15 cm 어긋났다.
// 셀 + 8-이웃 보행 폴리곤의 바깥 가장자리 조각(연석 판정과 같은 분류) 바깥쪽 BURN_M 안 격자 샘플을 가장자리 윗면 높이로 덮어쓴다
// (보행면 안 샘플은 그대로, 여러 조각이면 가장 가까운 것). 입력이 셀 + 이웃 전체라 이웃 셀과 공유 샘플이 같다. see docs/04-data-pipeline.md §4.3, §6
import type { RoadRecord } from '../../readers/plateau/types.ts';
import { classifyEdges, type EdgePiece } from './curbs.ts';
import { bilinear } from './grid.ts';
import { isWalk, ROAD_CLASS, type RoadIndex } from './roads.ts';
import type { ShapedGround } from './terrain-shape.ts';
import { TOL_TIGHT_M } from './terrain-shape.ts';

/** 가장자리 바깥으로 덮어쓰는 폭(m) — 탐침 5 cm·RTIN 삼각형 한 칸(대각 1.42 m)의 절반 이상. */
const BURN_M = 1;
/** 바깥 가장자리 둘레 보행 샘플을 윗면으로 맞추는 폭(m). */
const WALK_BAND_M = 1.5;

/** 창과 겹치는 보행 폴리곤의 바깥 가장자리 조각(셀 로컬, 셀 원점 ox·oz). */
export function outerEdgesAround(
  roads: readonly RoadRecord[],
  index: RoadIndex,
  ox: number,
  oz: number,
  shaped: ShapedGround,
): EdgePiece[] {
  const { x0, z0, n } = shaped.grid;
  const [minX, minZ, maxX, maxZ] = [ox + x0, oz + z0, ox + x0 + n - 1, oz + z0 + n - 1];
  const stats = { curbM: 0, outerM: 0 };
  const out: EdgePiece[] = [];
  for (const r of roads) {
    if (!isWalk(r)) continue;
    const o = r.polygonWF[0] ?? [];
    let hit = false;
    for (let i = 0; i < o.length && !hit; i += 3) {
      const x = o[i] as number;
      const z = o[i + 2] as number;
      hit = x >= minX - BURN_M && x <= maxX + BURN_M && z >= minZ - BURN_M && z <= maxZ + BURN_M;
    }
    if (!hit) continue;
    for (const e of classifyEdges(r, ox, oz, index, stats)) if (e.kind === 'outer') out.push(e);
  }
  return out;
}

/**
 * 바깥 가장자리 조각 BURN_M 안 비보행 샘플 = 가장자리 윗면 높이(가장 가까운 조각의 투영점), WALK_BAND_M 안 보행 샘플 = 자기 윗면 S
 * (연석 띠 규칙이 좁은 보도 가장자리를 D로 낮추지 않게). 반평면 제한 없음 — 보도 끝(연석과 예각으로 만나는 곳)의 차도 샘플도 올린다.
 */
export function burnOuterEdges(shaped: ShapedGround, edges: readonly EdgePiece[]): number {
  const { x0, z0, n } = shaped.grid;
  const best = new Float32Array(n * n).fill(Number.POSITIVE_INFINITY);
  let burned = 0;
  for (const e of edges) {
    const [ax, az] = e.a;
    const [bx, bz] = e.b;
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - BURN_M - x0));
    const i1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx) + BURN_M - x0));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - BURN_M - z0));
    const j1 = Math.min(n - 1, Math.ceil(Math.max(az, bz) + BURN_M - z0));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        const [px, pz] = [i + x0, j + z0];
        const t = Math.min(Math.max(((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / len2, 0), 1);
        const [qx, qz] = [ax + (bx - ax) * t, az + (bz - az) * t];
        const d = Math.hypot(px - qx, pz - qz);
        if (shaped.cls[k] === ROAD_CLASS.walk) {
          if (d <= WALK_BAND_M) {
            shaped.ground[k] = shaped.top[k] as number;
            shaped.tol[k] = TOL_TIGHT_M;
          }
          continue;
        }
        if (d > BURN_M || d >= (best[k] as number)) continue;
        if (best[k] === Number.POSITIVE_INFINITY) burned++;
        best[k] = d;
        shaped.ground[k] = bilinear(shaped.grid, shaped.top, qx, qz);
        shaped.tol[k] = TOL_TIGHT_M;
      }
    }
  }
  return burned;
}
