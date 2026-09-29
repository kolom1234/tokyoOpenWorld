// 셀 콜라이더 적재(08 §4): 셀마다 [높이장, JCOL 셰이프들] 작업 → 적재 큐(도착 순서, 가까운 셀부터 보내는 건 메인 배선).
// pump(예산 ms): 예산 안에서 작업을 하나 이상 처리. 작업 = 높이장 4×4 타일 하나, triMesh ≤ 600 삼각형 조각 하나(파이프라인 청크 2500을 여기서 더 자름 —
// 렌더 경합에서 wasm이 2–3배 느려져도 한 작업 ≤ 8 ms, ADR-0042 부록).
// 셀의 모든 작업이 끝나면 onLoaded(key). 바디 = 작업마다 정적 바디 1개(셀 원점 + 셰이프 posLocal), userData = 재질.
import type { CellKey, Vec3d } from '@sanpo/core';
import { type HeightfieldData, parseJcol } from '@sanpo/tile-format';
import { createHeightfieldShape, createMeshShape } from './heightfield.ts';
import { OBJ } from './layers.ts';
import type { PhysicsWorld } from './world.ts';

type BodyId = InstanceType<PhysicsWorld['Jolt']['BodyID']>;

/** 작업 + 예상 비용(ms): 예산 안에 들 때만 시작(첫 작업은 항상). */
interface Job {
  run: () => BodyId;
  estMs: number;
}

/** 실측(Node, MVP 30셀): 높이장 257² p50 3.4·최대 9 ms → 타일(65²) ≈ 1/16, 건물 메시 p50 1.9·p95 2.3 ms/1000 삼각형. */
const HEIGHTFIELD_TILE_MS = 0.3;
const MESH_MS_PER_TRI = 0.002;
/** 높이장 타일 수(축당)·작업당 삼각형 상한. */
const HF_TILES = 4;
export const MAX_JOB_TRIS = 600;

/** 인덱스 [t0, t1) 삼각형만 쓰는 정점으로 압축한 조각. */
export function meshSlice(
  vertices: Float32Array,
  indices: Uint32Array,
  t0: number,
  t1: number,
): { vertices: Float32Array; indices: Uint32Array } {
  if (t0 === 0 && t1 * 3 >= indices.length) return { vertices, indices };
  const sub = indices.subarray(t0 * 3, t1 * 3);
  const remap = new Map<number, number>();
  const out = new Uint32Array(sub.length);
  const v: number[] = [];
  for (let k = 0; k < sub.length; k++) {
    const vi = sub[k] as number;
    let m = remap.get(vi);
    if (m === undefined) {
      m = remap.size;
      remap.set(vi, m);
      v.push(vertices[vi * 3] as number, vertices[vi * 3 + 1] as number, vertices[vi * 3 + 2] as number);
    }
    out[k] = m;
  }
  return { vertices: new Float32Array(v), indices: out };
}

interface CellEntry {
  originWF: Vec3d;
  jobs: Job[];
  bodies: BodyId[];
}

export interface CellColliders {
  enqueue(key: CellKey, originWF: Vec3d, jcol: ArrayBuffer | undefined, hf: HeightfieldData | undefined): void;
  remove(key: CellKey): void;
  /** 예산 안에서 작업 처리. 반환 = 처리한 작업 수. */
  pump(budgetMs: number): number;
  isLoaded(key: CellKey): boolean;
  /** 남은 작업 수. */
  readonly pending: number;
  readonly cells: number;
  dispose(): void;
}

/** 지형 재질(JCOL_MATERIAL.asphalt — 지면 재질 구분은 M04-T04 `_SURF`). */
const TERRAIN_MATERIAL = 1;

type AddStatic = (
  shape: InstanceType<PhysicsWorld['Jolt']['Shape']>,
  e: CellEntry,
  local: readonly number[],
  q: readonly number[],
  layer: number,
  material: number,
) => BodyId;

/** 정적 바디 1개(셀 원점 + 로컬 위치·회전, userData = 재질). createXxxShape이 잡은 참조는 바디 생성 뒤 놓는다. */
function staticAdder(w: PhysicsWorld, anchorWF: Readonly<Vec3d>): AddStatic {
  const { Jolt, bodies, scratch } = w;
  return (shape, e, local, q, layer, material) => {
    const pos = scratch.rvec3(
      e.originWF.x - anchorWF.x + (local[0] ?? 0),
      e.originWF.y - anchorWF.y + (local[1] ?? 0),
      e.originWF.z - anchorWF.z + (local[2] ?? 0),
    );
    scratch.q.Set(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1);
    const s = new Jolt.BodyCreationSettings(shape, pos, scratch.q, Jolt.EMotionType_Static, layer);
    s.mUserData = material;
    const id = new Jolt.BodyID(bodies.CreateAndAddBody(s, Jolt.EActivation_DontActivate).GetIndexAndSequenceNumber());
    Jolt.destroy(s);
    shape.Release();
    return id;
  };
}

/** 셀 작업: 높이장 → JCOL 셰이프(triMesh만 — 박스·캡슐·원기둥·볼록은 소품(M05)과 함께). */
function jobsOf(
  w: PhysicsWorld,
  add: AddStatic,
  e: CellEntry,
  jcol: ArrayBuffer | undefined,
  hf: HeightfieldData | undefined,
  warn: (msg: string) => void,
): CellEntry['jobs'] {
  const jobs: CellEntry['jobs'] = [];
  if (hf) {
    const n = (hf.size - 1) / HF_TILES + 1;
    for (let tz = 0; tz < HF_TILES; tz++) {
      for (let tx = 0; tx < HF_TILES; tx++) {
        const shape = () => createHeightfieldShape(w.Jolt, hf, tx * (n - 1), tz * (n - 1), n);
        jobs.push({
          run: () => add(shape(), e, [0, 0, 0], [0, 0, 0, 1], OBJ.TERRAIN, TERRAIN_MATERIAL),
          estMs: HEIGHTFIELD_TILE_MS,
        });
      }
    }
  }
  if (!jcol) return jobs;
  const r = parseJcol(new Uint8Array(jcol));
  if (!r.ok) {
    warn(`collision.bin: ${r.error.message}`);
    return jobs;
  }
  for (const sh of r.value) {
    if (sh.kind !== 'triMesh') continue;
    const nt = sh.indices.length / 3;
    for (let t0 = 0; t0 < nt; t0 += MAX_JOB_TRIS) {
      const t1 = Math.min(nt, t0 + MAX_JOB_TRIS);
      const mesh = () => {
        const m = meshSlice(sh.vertices, sh.indices, t0, t1);
        return createMeshShape(w.Jolt, m.vertices, m.indices, sh.material);
      };
      jobs.push({
        run: () => add(mesh(), e, sh.posLocal, sh.quat, sh.layer, sh.material),
        estMs: (t1 - t0) * MESH_MS_PER_TRI,
      });
    }
  }
  return jobs;
}

export function createCellColliders(
  w: PhysicsWorld,
  anchorWF: Readonly<Vec3d>,
  onLoaded: (key: CellKey) => void,
  warn: (msg: string) => void,
): CellColliders {
  const { Jolt, bodies } = w;
  const cells = new Map<CellKey, CellEntry>();
  const queue: CellKey[] = [];
  const add = staticAdder(w, anchorWF);
  const remove = (key: CellKey): void => {
    const e = cells.get(key);
    if (!e) return;
    for (const id of e.bodies) {
      bodies.RemoveBody(id);
      bodies.DestroyBody(id);
      Jolt.destroy(id);
    }
    cells.delete(key);
    const i = queue.indexOf(key);
    if (i >= 0) queue.splice(i, 1);
  };
  return {
    enqueue(key, originWF, jcol, hf) {
      remove(key);
      const e: CellEntry = { originWF: { ...originWF }, jobs: [], bodies: [] };
      e.jobs = jobsOf(w, add, e, jcol, hf, (m) => warn(`${key} ${m}`));
      cells.set(key, e);
      queue.push(key);
    },
    remove,
    pump(budgetMs) {
      const t0 = performance.now();
      let n = 0;
      while (queue.length > 0) {
        const key = queue[0] as CellKey;
        const e = cells.get(key);
        const next = e?.jobs[0];
        // 남은 예산에 들지 않는 작업은 다음 틱(틱마다 최소 1개).
        if (next && n > 0 && performance.now() - t0 + next.estMs > budgetMs) break;
        if (e && next) {
          e.jobs.shift();
          e.bodies.push(next.run());
          n++;
        }
        if (!e || e.jobs.length === 0) {
          queue.shift();
          if (e) onLoaded(key);
        }
      }
      return n;
    },
    isLoaded: (key) => cells.has(key) && !queue.includes(key),
    get pending() {
      let n = 0;
      for (const k of queue) n += cells.get(k)?.jobs.length ?? 0;
      return n;
    },
    get cells() {
      return cells.size;
    },
    dispose() {
      for (const key of [...cells.keys()]) remove(key);
    },
  };
}
