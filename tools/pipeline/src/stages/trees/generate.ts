// 수종 모델 생성(M05-T04): @dgreenheck/ez-tree(MIT) 프리셋 + 수종별 덮어쓰기 → 가지(위치·법선·UV)·잎 카드(위치·법선·UV) → 높이 1로 정규화(줄기 밑 = 원점),
// 잎 UV = 잎 아틀라스 칸(leaf-atlas.ts). LOD1 = 가지 meshopt 단순화 25 % + 잎 카드 1/3만 1.7배 확대. ez-tree 텍스처 모듈이 모듈 로드 때 Image를 만들므로
// Node에선 document 스텁(텍스처는 쓰지 않는다 — 잎 모양은 자체 아틀라스). see ADR-0052
import { MeshoptSimplifier } from 'meshoptimizer';

export type SpeciesName = 'ginkgo' | 'zelkova' | 'cherry' | 'camphor' | 'pine' | 'shrub';

export interface Part {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  idx: Uint32Array;
}

export interface SpeciesModel {
  lods: [{ bark: Part; leaf: Part }, { bark: Part; leaf: Part }];
  /** 정규화 전 높이(ez-tree 단위). */
  rawHeight: number;
  /** 수관 중심(0, 0.5, 0)에서 가장 먼 정점 거리(정규화 단위) — 임포스터 틀 크기. */
  radius: number;
}

/** 수종 → 잎 아틀라스 칸. */
export const LEAF_CELL: Readonly<Record<SpeciesName, number>> = {
  zelkova: 0,
  camphor: 0,
  shrub: 0,
  ginkgo: 1,
  cherry: 2,
  pine: 3,
};

type Opts = Record<string, unknown> & {
  seed: number;
  branch: Record<string, Record<string, number> | number>;
  leaves: Record<string, unknown>;
};

/** 프리셋 + 덮어쓰기(가지 각·길이·잎 수 — 일본 가로수·공원 수형 근사). */
/** 실시간용 가볍게: 가지 단면·마디 수를 줄인다(수형은 유지 — LOD0 ≲ 8k 삼각형). */
function lighten(o: Opts, leaves: { count: number; size: number }): void {
  Object.assign(o.branch.sections as object, { 0: 6, 1: 4, 2: 3, 3: 2 });
  Object.assign(o.branch.segments as object, { 0: 6, 1: 4, 2: 3, 3: 3 });
  Object.assign(o.leaves, leaves);
}

const SPECIES_OPTS: Readonly<Record<SpeciesName, { preset: string; seed: number; tune: (o: Opts) => void }>> = {
  ginkgo: {
    preset: 'Ash Medium',
    seed: 1101,
    tune: (o) => {
      Object.assign(o.branch.angle as object, { 1: 32, 2: 38, 3: 40 });
      Object.assign(o.branch.children as object, { 0: 9, 1: 4, 2: 3 });
      lighten(o, { count: 4, size: 3.4 });
      Object.assign(o.leaves, { start: 0.1 });
    },
  },
  zelkova: {
    preset: 'Oak Large',
    seed: 2203,
    tune: (o) => {
      Object.assign(o.branch.angle as object, { 1: 34, 2: 45, 3: 45 });
      Object.assign(o.branch.start as object, { 1: 0.32 });
      Object.assign(o.branch.children as object, { 0: 7, 1: 4, 2: 3 });
      lighten(o, { count: 5, size: 3.2 });
    },
  },
  cherry: {
    preset: 'Oak Small',
    seed: 3307,
    tune: (o) => {
      Object.assign(o.branch.angle as object, { 1: 62, 2: 55 });
      lighten(o, { count: 8, size: 2.6 });
    },
  },
  camphor: { preset: 'Oak Medium', seed: 4409, tune: (o) => lighten(o, { count: 8, size: 3.4 }) },
  pine: {
    preset: 'Pine Medium',
    seed: 5501,
    tune: (o) => {
      lighten(o, { count: 5, size: (o.leaves.size as number) * 1.3 });
    },
  },
  shrub: {
    preset: 'Bush 1',
    seed: 6607,
    tune: (o) => {
      Object.assign(o.branch.children as object, { 0: 5, 1: 3, 2: 2 });
      lighten(o, { count: 4, size: (o.leaves.size as number) * 1.4 });
    },
  },
};

let stubbed = false;
function stubDocument(): void {
  if (stubbed || typeof globalThis.document !== 'undefined') return;
  const img = () => ({ addEventListener() {}, removeEventListener() {}, set src(_v: string) {}, style: {} });
  Object.assign(globalThis, { document: { createElementNS: img, createElement: img } });
  stubbed = true;
}

interface RawGeom {
  attributes: Record<string, { array: ArrayLike<number>; count: number }>;
  index: { array: ArrayLike<number> } | null;
}

function partOf(g: RawGeom, scale: number, uvCell?: number): Part {
  const p = g.attributes.position as { array: ArrayLike<number> };
  const pos = Float32Array.from(p.array, (v) => v * scale);
  const nrm = Float32Array.from((g.attributes.normal as { array: ArrayLike<number> }).array);
  const uv0 = (g.attributes.uv as { array: ArrayLike<number> }).array;
  const uv = Float32Array.from(uv0, (v, i) => {
    if (uvCell === undefined) return v;
    // 아틀라스 칸(2 × 2): u → 칸 x, v(three 위가 1) → 칸 y(PNG 행 = 아래로) — 텍스처 flipY 기본과 맞춘다.
    const c = i % 2 === 0 ? uvCell % 2 : 1 - Math.floor(uvCell / 2);
    return (c + Math.min(Math.max(v, 0.002), 0.998)) * 0.5;
  });
  const idx = Uint32Array.from(g.index?.array ?? []);
  return { pos, nrm, uv, idx };
}

/** 잎 카드 1/3만 남기고 카드 중심 기준 1.7배(LOD1). 카드 = 연속 정점 4개. */
function thinLeaves(p: Part): Part {
  const quads = p.pos.length / 12;
  const keep: number[] = [];
  for (let q = 0; q < quads; q++) if (q % 3 === 0) keep.push(q);
  const pos = new Float32Array(keep.length * 12);
  const nrm = new Float32Array(keep.length * 12);
  const uv = new Float32Array(keep.length * 8);
  const idx = new Uint32Array(keep.length * 6);
  keep.forEach((q, k) => {
    const c = [0, 1, 2].map((a) => [0, 1, 2, 3].reduce((s, v) => s + (p.pos[(q * 4 + v) * 3 + a] as number), 0) / 4);
    for (let v = 0; v < 4; v++)
      for (let a = 0; a < 3; a++) {
        const src = (q * 4 + v) * 3 + a;
        pos[(k * 4 + v) * 3 + a] = (c[a] as number) + ((p.pos[src] as number) - (c[a] as number)) * 1.7;
        nrm[(k * 4 + v) * 3 + a] = p.nrm[src] as number;
      }
    uv.set(p.uv.subarray(q * 8, q * 8 + 8), k * 8);
    idx.set(
      [0, 1, 2, 0, 2, 3].map((i) => k * 4 + i),
      k * 6,
    );
  });
  return { pos, nrm, uv, idx };
}

/** 가지 단순화(목표 25 %, 상대 오차 2 %). */
function simplifyBark(p: Part): Part {
  const [idx] = MeshoptSimplifier.simplify(p.idx, p.pos, 3, Math.floor((p.idx.length * 0.25) / 3) * 3, 0.02);
  return { ...p, idx };
}

function radiusOf(parts: readonly Part[]): number {
  let r = 0;
  for (const p of parts)
    for (let i = 0; i < p.pos.length; i += 3)
      r = Math.max(r, Math.hypot(p.pos[i] as number, (p.pos[i + 1] as number) - 0.5, p.pos[i + 2] as number));
  return r;
}

export async function generateSpecies(species: SpeciesName): Promise<SpeciesModel> {
  stubDocument();
  await MeshoptSimplifier.ready;
  const { Tree } = (await import('@dgreenheck/ez-tree')) as unknown as {
    Tree: new () => {
      options: Opts;
      loadPreset(n: string): void;
      generate(): void;
      branchesMesh: { geometry: RawGeom };
      leavesMesh: { geometry: RawGeom };
    };
  };
  const spec = SPECIES_OPTS[species];
  const t = new Tree();
  t.loadPreset(spec.preset);
  t.options.seed = spec.seed;
  spec.tune(t.options);
  t.generate();
  const bp = t.branchesMesh.geometry.attributes.position as { array: ArrayLike<number> };
  let h = 0;
  for (let i = 1; i < bp.array.length; i += 3) h = Math.max(h, bp.array[i] as number);
  const lp = t.leavesMesh.geometry.attributes.position as { array: ArrayLike<number> };
  for (let i = 1; i < lp.array.length; i += 3) h = Math.max(h, lp.array[i] as number);
  const bark = partOf(t.branchesMesh.geometry, 1 / h);
  const leaf = partOf(t.leavesMesh.geometry, 1 / h, LEAF_CELL[species]);
  return {
    lods: [
      { bark, leaf },
      { bark: simplifyBark(bark), leaf: thinLeaves(leaf) },
    ],
    rawHeight: h,
    radius: radiusOf([bark, leaf]),
  };
}
