// 연석·가장자리(M05-T01, 04 §4.3): 보행면 폴리곤 변을 ≤ 1 m 조각으로 나눠 바깥쪽(자기 폴리곤 밖) 0.15 m 점을 벡터 분류 —
// 차도면 = 연석(세로 면: 기준면 D − 6 cm → 윗면 + 6 mm, 차도 쪽을 향함), 다른 보행면 = 내부(셀 경계 자름 포함, 기하 없음),
// 비도로 = 바깥 가장자리(윗면에서 12 cm 아래로 내린 치마 — 지형이 윗면과 만나므로 틈 가림용). see docs/04-data-pipeline.md §4.3
import type { RoadRecord } from '../../readers/plateau/types.ts';
import { insideRings, type RoadIndex, type RoadSide } from './roads.ts';
import { EDGE_PIECE_M, type HeightAt, type MeshBuf, TOP_OFFSET_M } from './sidewalks.ts';

const PIECE_M = EDGE_PIECE_M;
/** 바깥 판정 탐침 거리(m): 첫 탐침이 비도로면 더 멀리 — PLATEAU 폴리곤 사이 1 m 미만 틈은 데이터 틈(보행면 너머 = 내부, 차도 너머 = 연석). */
const PROBES_M = [0.15, 0.5, 1.0] as const;
/** 연석 아래 끝을 기준면보다 내리는 양(m) — 차도 횡단경사 첫 샘플(≤ 2 cm)·RTIN 1 cm 오차를 덮는다. */
export const CURB_SINK_M = 0.06;
/** 바깥 가장자리 치마 깊이(m). */
export const SKIRT_M = 0.12;
/** `_SURF`: 연석 = 7(plaza → 콘크리트), 치마·윗면 = 1(보도). */
export const SURF_CURB = 7;
export const SURF_WALK = 1;

export interface EdgePiece {
  a: [number, number];
  b: [number, number];
  /** 바깥 방향 단위 법선(셀 로컬 xz). */
  out: [number, number];
  kind: 'curb' | 'outer';
}

export interface EdgeStats {
  curbM: number;
  outerM: number;
}

/** 폴리곤 변 조각 분류(셀 로컬 좌표, 판정은 WF). 내부 변은 빼고 돌려준다. */
export function classifyEdges(r: RoadRecord, ox: number, oz: number, index: RoadIndex, stats: EdgeStats): EdgePiece[] {
  const out: EdgePiece[] = [];
  for (const ring of r.polygonWF) {
    const n = ring.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = (ring[i * 3] as number) - ox;
      const az = (ring[i * 3 + 2] as number) - oz;
      const bx = (ring[j * 3] as number) - ox;
      const bz = (ring[j * 3 + 2] as number) - oz;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const pieces = Math.ceil(len / PIECE_M);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let p = 0; p < pieces; p++) {
        const t0 = p / pieces;
        const t1 = (p + 1) / pieces;
        const a: [number, number] = [ax + (bx - ax) * t0, az + (bz - az) * t0];
        const b: [number, number] = [ax + (bx - ax) * t1, az + (bz - az) * t1];
        const mx = (a[0] + b[0]) / 2 + ox;
        const mz = (a[1] + b[1]) / 2 + oz;
        const sign = insideRings(r.polygonWF, mx + nx * PROBES_M[0], mz + nz * PROBES_M[0]) ? -1 : 1;
        let side: RoadSide = 'none';
        for (const d of PROBES_M) {
          side = index.classify(mx + sign * nx * d, mz + sign * nz * d);
          if (side !== 'none') break;
        }
        if (side === 'walk') continue;
        const kind = side === 'road' ? 'curb' : 'outer';
        if (kind === 'curb') stats.curbM += len / pieces;
        else stats.outerM += len / pieces;
        out.push({ a, b, out: [sign * nx, sign * nz], kind });
      }
    }
  }
  return out;
}

/** 세로 사각형(바깥 법선 쪽에서 볼 때 CCW) — 정점은 공유하지 않는다(평평한 음영). */
function quad(m: MeshBuf, e: EdgePiece, top: [number, number], bottom: [number, number], surf: number): void {
  const base = m.pos.length / 3;
  const [ax, az] = e.a;
  const [bx, bz] = e.b;
  m.pos.push(ax, top[0], az, bx, top[1], bz, bx, bottom[1], bz, ax, bottom[0], az);
  for (let k = 0; k < 4; k++) {
    m.nrm.push(e.out[0], 0, e.out[1]);
    m.surf.push(surf);
  }
  // 바깥에서 볼 때 a→b가 오른쪽이면 (a_top, b_top, b_bot)이 CCW가 아니다 — 법선 방향으로 감기를 맞춘다.
  const tx = bx - ax;
  const tz = bz - az;
  const faceY = tz * e.out[0] - tx * e.out[1];
  if (faceY > 0) m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else m.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/** 연석 면·바깥 치마. top = 보행 윗면 높이, base = 기준면 D, outerTop = 바깥 가장자리 윗면(지형 맞춤, 없으면 top). */
export function addEdges(
  m: MeshBuf,
  edges: readonly EdgePiece[],
  top: HeightAt,
  base: HeightAt,
  outerTop: HeightAt = top,
): void {
  for (const e of edges) {
    const h = e.kind === 'outer' ? outerTop : top;
    const ta = h(e.a[0], e.a[1]) + TOP_OFFSET_M;
    const tb = h(e.b[0], e.b[1]) + TOP_OFFSET_M;
    if (e.kind === 'curb') {
      quad(m, e, [ta, tb], [base(e.a[0], e.a[1]) - CURB_SINK_M, base(e.b[0], e.b[1]) - CURB_SINK_M], SURF_CURB);
    } else quad(m, e, [ta, tb], [ta - SKIRT_M, tb - SKIRT_M], SURF_WALK);
  }
}
