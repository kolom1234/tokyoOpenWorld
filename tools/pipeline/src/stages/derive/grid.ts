// derive 공용 1 m 격자 도구(M05-T01): 셀 로컬 정수 창, 반경 제한 최근접 탐색(정확 유클리드, 거리·(dz, dx) 순 — 결정론),
// 마스크 박스 평균. 모두 국소 연산이라 이웃 셀이 여유(SHAPE_PAD)까지 같은 입력을 보면 공유 샘플 결과가 같다. see docs/04-data-pipeline.md §4.3, §6

/** 셀 로컬 정수 격자 창: 샘플 (i, j) = 로컬 (x0 + i, z0 + j) m, 행 우선 `[j·n + i]`. */
export interface LocalGrid {
  x0: number;
  z0: number;
  n: number;
}

/** 반경 r(m) 안 격자 오프셋(원점 제외), 거리 오름차순·같은 거리는 (dj, di) 사전순. */
export interface Offsets {
  di: Int16Array;
  dj: Int16Array;
  d: Float32Array;
}

const cache = new Map<number, Offsets>();

export function discOffsets(r: number): Offsets {
  const hit = cache.get(r);
  if (hit) return hit;
  const list: [number, number, number][] = [];
  const ri = Math.ceil(r);
  for (let dj = -ri; dj <= ri; dj++) {
    for (let di = -ri; di <= ri; di++) {
      const d = Math.hypot(di, dj);
      if ((di !== 0 || dj !== 0) && d <= r) list.push([d, dj, di]);
    }
  }
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const o: Offsets = {
    di: Int16Array.from(list.map((x) => x[2])),
    dj: Int16Array.from(list.map((x) => x[1])),
    d: Float32Array.from(list.map((x) => x[0])),
  };
  cache.set(r, o);
  return o;
}

/** (i, j)에서 가장 가까운 mask[k] = 1 샘플의 선형 인덱스(자기 자신 포함, 없으면 −1). 창 밖은 없는 것으로. */
export function nearestIn(n: number, i: number, j: number, mask: Uint8Array, offs: Offsets): number {
  if (mask[j * n + i] === 1) return j * n + i;
  for (let t = 0; t < offs.d.length; t++) {
    const ii = i + (offs.di[t] as number);
    const jj = j + (offs.dj[t] as number);
    if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
    if (mask[jj * n + ii] === 1) return jj * n + ii;
  }
  return -1;
}

/** 두 선형 인덱스 사이 거리(m). */
export function distOf(n: number, a: number, b: number): number {
  return Math.hypot((a % n) - (b % n), Math.floor(a / n) - Math.floor(b / n));
}

/** mask = 1인 샘플만 평균하는 (2r+1)² 박스(창 가장자리는 있는 것만). mask 0 = values 그대로. */
export function maskedBoxMean(values: Float32Array, mask: Uint8Array, n: number, r: number): Float32Array {
  const out = Float32Array.from(values);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (mask[j * n + i] !== 1) continue;
      let s = 0;
      let c = 0;
      for (let jj = Math.max(0, j - r); jj <= Math.min(n - 1, j + r); jj++) {
        for (let ii = Math.max(0, i - r); ii <= Math.min(n - 1, i + r); ii++) {
          if (mask[jj * n + ii] !== 1) continue;
          s += values[jj * n + ii] as number;
          c++;
        }
      }
      out[j * n + i] = s / c;
    }
  }
  return out;
}

/** 창 값의 쌍선형 보간(로컬 m). 창 밖은 가장자리로 자름. */
export function bilinear(g: LocalGrid, values: Float32Array, x: number, z: number): number {
  const fx = Math.min(Math.max(x - g.x0, 0), g.n - 1);
  const fz = Math.min(Math.max(z - g.z0, 0), g.n - 1);
  const i = Math.min(Math.floor(fx), g.n - 2);
  const j = Math.min(Math.floor(fz), g.n - 2);
  const tx = fx - i;
  const tz = fz - j;
  const v = (a: number, b: number): number => values[b * g.n + a] as number;
  const top = v(i, j) * (1 - tx) + v(i + 1, j) * tx;
  const bot = v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx;
  return top * (1 - tz) + bot * tz;
}
