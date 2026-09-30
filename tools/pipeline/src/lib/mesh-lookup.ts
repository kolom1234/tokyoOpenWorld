// 삼각형 메시 높이 조회(M05-T01): xz 1 m 버킷 → 무게중심 보간 높이. 셀 빌드(보도 가장자리 → 지형 맞춤)와 validate 간극 검사가 같이 쓴다.

export interface Mesh {
  pos: ArrayLike<number>;
  idx: ArrayLike<number>;
  surf?: ArrayLike<number>;
}

/** 지형 삼각형 1 m 버킷 → (x, z) 높이(셀 로컬). */
export function terrainLookup(t: Mesh): (x: number, z: number) => number | undefined {
  const buckets = new Map<number, number[]>();
  for (let tri = 0; tri < t.idx.length / 3; tri++) {
    const vs = [0, 1, 2].map((k) => t.idx[tri * 3 + k] as number);
    const xs = vs.map((v) => t.pos[v * 3] as number);
    const zs = vs.map((v) => t.pos[v * 3 + 2] as number);
    for (let bz = Math.floor(Math.min(...zs)); bz <= Math.floor(Math.max(...zs)); bz++) {
      for (let bx = Math.floor(Math.min(...xs)); bx <= Math.floor(Math.max(...xs)); bx++) {
        const k = bz * 1024 + bx;
        const l = buckets.get(k);
        if (l) l.push(tri);
        else buckets.set(k, [tri]);
      }
    }
  }
  return (x, z) => {
    for (const tri of buckets.get(Math.floor(z) * 1024 + Math.floor(x)) ?? []) {
      const [a, b, c] = [0, 1, 2].map((k) => (t.idx[tri * 3 + k] as number) * 3) as [number, number, number];
      const p = (v: number, o: number): number => t.pos[v + o] as number;
      const det = (p(b, 2) - p(c, 2)) * (p(a, 0) - p(c, 0)) + (p(c, 0) - p(b, 0)) * (p(a, 2) - p(c, 2));
      const l1 = ((p(b, 2) - p(c, 2)) * (x - p(c, 0)) + (p(c, 0) - p(b, 0)) * (z - p(c, 2))) / det;
      const l2 = ((p(c, 2) - p(a, 2)) * (x - p(c, 0)) + (p(a, 0) - p(c, 0)) * (z - p(c, 2))) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      return l1 * p(a, 1) + l2 * p(b, 1) + l3 * p(c, 1);
    }
    return undefined;
  };
}
