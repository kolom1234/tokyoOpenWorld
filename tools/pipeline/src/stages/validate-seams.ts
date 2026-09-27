// validate: 이웃 셀 지형 경계 완전 일치 검사(terrain.height u16 행·열, terrain.mesh 경계 정점). see docs/04-data-pipeline.md §4.6, §6
import type { HeightfieldData } from '@sanpo/tile-format';

/** 셀별 지형 디코드 결과(검사 입력). positions = terrain.mesh POSITION(셀 로컬 float32). */
export interface CellTerrain {
  ix: number;
  iz: number;
  hf: HeightfieldData;
  positions: Float32Array;
}

export interface SeamReport {
  /** 검사한 이웃 쌍(동·남 방향). */
  pairs: number;
  /** 비교한 높이장 샘플 수(쌍마다 size). */
  heightSamples: number;
  /** 비교한 메시 경계 정점 수. */
  meshVertices: number;
  errors: string[];
}

/** axis(0 = x, 2 = z) 좌표가 `at`인 정점 → (다른 축 좌표 → y), 다른 축 오름차순. */
export function edgeVertices(pos: Float32Array, axis: 0 | 2, at: number): [number, number][] {
  const other = axis === 0 ? 2 : 0;
  const out: [number, number][] = [];
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + axis] === at) out.push([pos[i + other] as number, pos[i + 1] as number]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function sameEdge(a: [number, number][], b: [number, number][]): boolean {
  return a.length === b.length && a.every(([k, y], i) => b[i]?.[0] === k && Object.is(b[i]?.[1], y));
}

function hfEdge(hf: HeightfieldData, side: 'e' | 'w' | 's' | 'n'): Uint16Array {
  const n = hf.size;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const idx = side === 'e' ? i * n + n - 1 : side === 'w' ? i * n : side === 's' ? (n - 1) * n + i : i;
    out[i] = hf.data[idx] as number;
  }
  return out;
}

function checkPair(a: CellTerrain, b: CellTerrain, dir: 'east' | 'south', r: SeamReport): void {
  const name = `L0_${a.ix}_${a.iz}↔L0_${b.ix}_${b.iz}`;
  const n = a.hf.size;
  if (a.hf.minH !== b.hf.minH || a.hf.step !== b.hf.step || b.hf.size !== n) {
    r.errors.push(`${name}: heightfield base/step/size differ`);
  }
  const [ea, eb] = dir === 'east' ? [hfEdge(a.hf, 'e'), hfEdge(b.hf, 'w')] : [hfEdge(a.hf, 's'), hfEdge(b.hf, 'n')];
  const bad = ea.findIndex((v, i) => v !== eb[i]);
  if (bad >= 0) r.errors.push(`${name}: terrain.height edge differs at sample ${bad}`);
  r.heightSamples += n;
  const axis = dir === 'east' ? 0 : 2;
  const ma = edgeVertices(a.positions, axis, n - 1);
  const mb = edgeVertices(b.positions, axis, 0);
  if (ma.length !== n || !sameEdge(ma, mb)) {
    r.errors.push(`${name}: terrain.mesh edge vertices differ (${ma.length} vs ${mb.length})`);
  }
  r.meshVertices += ma.length;
  r.pairs++;
}

/** 모든 셀의 동·남 이웃(존재하는 것만)과 경계를 비교. */
export function checkSeams(cells: readonly CellTerrain[]): SeamReport {
  const byKey = new Map(cells.map((c) => [`${c.ix},${c.iz}`, c]));
  const r: SeamReport = { pairs: 0, heightSamples: 0, meshVertices: 0, errors: [] };
  for (const c of cells) {
    const east = byKey.get(`${c.ix + 1},${c.iz}`);
    const south = byKey.get(`${c.ix},${c.iz + 1}`);
    if (east) checkPair(c, east, 'east', r);
    if (south) checkPair(c, south, 'south', r);
  }
  return r;
}
