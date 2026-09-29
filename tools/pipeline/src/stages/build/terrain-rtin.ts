// 지형 단순화: RTIN(직각 이등변 삼각형 이분 계층) + 정확 오차(삼각형 내부 모든 격자 샘플) + 경계 정점 강제. see docs/04-data-pipeline.md §4.4-1, §6, docs/adr/0018-cell-mesh-build.md
// 분할 판단을 빗변 중점(두 삼각형 공유)에 두고 자식 → 부모로 전파하므로 결과는 항상 정합(T-접합·접힘·퇴화 없음).
// 삼각형 번호·좌표 생성(triangleCoords)과 분할 순회는 mapbox/martini에서 가져와 고쳤다(정확 오차·경계 강제는 이 파일의 것):
//   Copyright (c) 2019, Mapbox — ISC License. Permission to use, copy, modify, and/or distribute this software for any
//   purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice
//   appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.

/** 삼각형 i의 빗변 끝점 a·b(직각 꼭짓점 c는 a·b에서 유도). */
function triangleCoords(tile: number, count: number): Uint16Array {
  const coords = new Uint16Array(count * 4);
  for (let i = 0; i < count; i++) {
    let id = i + 2;
    let [ax, ay, bx, by, cx, cy] = [0, 0, 0, 0, 0, 0];
    if (id & 1) [bx, by, cx] = [tile, tile, tile];
    else [ax, ay, cy] = [tile, tile, tile];
    for (id >>= 1; id > 1; id >>= 1) {
      const mx = (ax + bx) >> 1;
      const my = (ay + by) >> 1;
      if (id & 1) [bx, by, ax, ay] = [ax, ay, cx, cy];
      else [ax, ay, bx, by] = [bx, by, cx, cy];
      [cx, cy] = [mx, my];
    }
    coords.set([ax, ay, bx, by], i * 4);
  }
  return coords;
}

/**
 * 표면 분류(`_SURF`) 경계 세분(격자 칸, M03-T06): 차도(0)와 나머지의 경계를 덮는 삼각형은 1칸까지, 그 밖의 분류 경계는 4칸까지 강제 분할.
 * 정점 보간 경계가 차도 가장자리에서 1 m 안(2 m면 보도 띠가 물결). 보도·광장처럼 밝은 포장끼리는 흐려도 티가 안 나 크기를 아낀다.
 */
const HARD_EDGE_SPAN = 1;
const SOFT_EDGE_SPAN = 4;
const HARD_CLASS = 0;

/** 삼각형 크기별 분류 비교 키(null = 비교 안 함). */
function edgeKeyOf(span: number): ((c: number) => number) | null {
  if (span > SOFT_EDGE_SPAN) return (c) => c;
  if (span > HARD_EDGE_SPAN) return (c) => (c === HARD_CLASS ? 1 : 0);
  return null;
}

/**
 * 분할하지 않은 삼각형(a, b, c)의 최대 수직 오차: 내부·경계 격자 샘플 vs 세 꼭짓점 평면 보간.
 * cls가 있으면 분류 경계를 덮는 큰 삼각형(edgeKeyOf)은 ∞(분할 강제).
 */
function triangleError(h: ArrayLike<number>, n: number, t: readonly number[], cls?: ArrayLike<number>): number {
  const [ax, ay, bx, by, cx, cy] = t as [number, number, number, number, number, number];
  const ha = h[ay * n + ax] as number;
  const hb = h[by * n + bx] as number;
  const hc = h[cy * n + cx] as number;
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const span = Math.max(Math.max(ax, bx, cx) - Math.min(ax, bx, cx), Math.max(ay, by, cy) - Math.min(ay, by, cy));
  const key = cls ? edgeKeyOf(span) : null;
  const k0 = key && cls ? key(cls[ay * n + ax] as number) : -1;
  let err = 0;
  for (let y = Math.min(ay, by, cy); y <= Math.max(ay, by, cy); y++) {
    for (let x = Math.min(ax, bx, cx); x <= Math.max(ax, bx, cx); x++) {
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      if (key && key(cls?.[y * n + x] as number) !== k0) return Number.POSITIVE_INFINITY;
      const e = Math.abs(l1 * ha + l2 * hb + l3 * hc - (h[y * n + x] as number));
      if (e > err) err = e;
    }
  }
  return err;
}

/**
 * 중점별 분할 필요 오차. 경계선 위 중점 = ∞(경계 정점 1 m 간격 고정, 04 §6).
 * 자식 삼각형(번호가 큼)부터 처리해 errors[중점] = max(두 공유 삼각형의 정확 오차, 자식 중점 오차).
 */
function midpointErrors(
  h: ArrayLike<number>,
  n: number,
  coords: Uint16Array,
  parents: number,
  cls?: ArrayLike<number>,
): Float64Array {
  const tile = n - 1;
  const errors = new Float64Array(n * n);
  const at = (i: number): number => errors[i] as number;
  for (let i = coords.length / 4 - 1; i >= 0; i--) {
    const [ax, ay, bx, by] = [coords[i * 4], coords[i * 4 + 1], coords[i * 4 + 2], coords[i * 4 + 3]] as number[] as [
      number,
      number,
      number,
      number,
    ];
    const mx = (ax + bx) >> 1;
    const my = (ay + by) >> 1;
    const cx = mx + my - ay;
    const cy = my + ax - mx;
    const border = mx === 0 || my === 0 || mx === tile || my === tile;
    let e = border ? Number.POSITIVE_INFINITY : triangleError(h, n, [ax, ay, bx, by, cx, cy], cls);
    if (i < parents) {
      const left = ((ay + cy) >> 1) * n + ((ax + cx) >> 1);
      const right = ((by + cy) >> 1) * n + ((bx + cx) >> 1);
      e = Math.max(e, at(left), at(right));
    }
    const mid = my * n + mx;
    if (e > at(mid)) errors[mid] = e;
  }
  return errors;
}

/**
 * n×n 높이 격자(n = 2^k + 1, 행 우선 `[y·n + x]`) → 삼각형 인덱스(격자 정점 번호 y·n + x).
 * 모든 격자 샘플에서 수직 오차 ≤ maxError, 경계 정점 전부 포함. 감기는 위(+높이)에서 볼 때 CCW(x→동, y→남 좌표계).
 * cls(같은 격자의 표면 분류)가 있으면 분류 경계 근처 삼각형을 세분한다(차도 경계 1칸, 그 밖 4칸).
 */
export function rtinTriangulate(
  h: ArrayLike<number>,
  n: number,
  maxError: number,
  cls?: ArrayLike<number>,
): Uint32Array {
  const tile = n - 1;
  if (tile < 2 || (tile & (tile - 1)) !== 0) throw new RangeError(`rtinTriangulate: n − 1 = ${tile} is not 2^k`);
  const count = tile * tile * 2 - 2;
  const coords = triangleCoords(tile, count);
  const errors = midpointErrors(h, n, coords, count - tile * tile, cls);
  const out: number[] = [];
  const emit = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const [a, b, c] = [ay * n + ax, by * n + bx, cy * n + cx];
    if (cross < 0) out.push(a, b, c);
    else out.push(a, c, b);
  };
  const walk = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
    const mx = (ax + bx) >> 1;
    const my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && (errors[my * n + mx] as number) > maxError) {
      walk(cx, cy, ax, ay, mx, my);
      walk(bx, by, cx, cy, mx, my);
    } else emit(ax, ay, bx, by, cx, cy);
  };
  walk(0, 0, tile, tile, tile, 0);
  walk(tile, tile, 0, 0, 0, tile);
  return Uint32Array.from(out);
}
