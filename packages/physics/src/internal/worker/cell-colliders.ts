// 셀 콜라이더 적재(08 §4): 셀마다 [높이장, JCOL 셰이프들] 작업 → 적재 큐(도착 순서, 가까운 셀부터 보내는 건 메인 배선).
// pump(예산 ms): 예산 안에서 작업을 하나 이상 처리. 작업 = 높이장 4×4 타일 하나, triMesh ≤ 600 삼각형 조각 하나(파이프라인 청크 2500을 여기서 더 자름 —
// 렌더 경합에서 wasm이 2–3배 느려져도 한 작업 ≤ 8 ms, ADR-0042 부록).
// 셀의 모든 작업이 끝나면 onLoaded(key). 바디 = 작업마다 정적 바디 1개(셀 원점 + 셰이프 posLocal), userData = 재질 | JCOL flags << 8.
// 프리미티브(박스·캡슐·원기둥)도 정적 바디, 에스컬레이터(SENSOR 박스 flags bit2)는 바디 없이 구간 목록에(ADR-0044). 그 밖의 SENSOR 셰이프는 아직 무시.
import type { CellKey, Vec3d } from '@sanpo/core';
import { type HeightfieldData, JCOL_FLAG, type JcolShape, parseJcol } from '@sanpo/tile-format';
import { type Escalators, escalatorVolume } from './escalators.ts';
import { createHeightfieldShape, createMeshShape } from './heightfield.ts';
import { OBJ } from './layers.ts';
import { createPrimitiveShape, PRIMITIVE_MS } from './primitives.ts';
import type { PhysicsWorld } from './world.ts';

type BodyId = InstanceType<PhysicsWorld['Jolt']['BodyID']>;

/** 작업 + 예상 비용(ms): 예산 안에 들 때만 시작(첫 작업은 항상). */
interface Job {
  run: () => BodyId | undefined;
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
  /** 앵커 재설정: 적재된 정적 바디 −Δ(남은 작업은 새 앵커로 만든다). */
  shift(dx: number, dy: number, dz: number): void;
  dispose(): void;
}

/** 지형 재질(JCOL_MATERIAL.asphalt — `_SURF` 차도·보도·광장 구분은 M05-T01 지형 성형과 함께, ADR-0044). */
const TERRAIN_MATERIAL = 1;

type AddStatic = (
  shape: InstanceType<PhysicsWorld['Jolt']['Shape']>,
  e: CellEntry,
  local: readonly number[],
  q: readonly number[],
  layer: number,
  userData: number,
) => BodyId;

/** 정적 바디 1개(셀 원점 + 로컬 위치·회전, userData = 재질 | flags << 8). createXxxShape이 잡은 참조는 바디 생성 뒤 놓는다. */
function staticAdder(w: PhysicsWorld, anchorWF: Readonly<Vec3d>): AddStatic {
  const { Jolt, bodies, scratch } = w;
  return (shape, e, local, q, layer, userData) => {
    const pos = scratch.rvec3(
      e.originWF.x - anchorWF.x + (local[0] ?? 0),
      e.originWF.y - anchorWF.y + (local[1] ?? 0),
      e.originWF.z - anchorWF.z + (local[2] ?? 0),
    );
    scratch.q.Set(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1);
    const s = new Jolt.BodyCreationSettings(shape, pos, scratch.q, Jolt.EMotionType_Static, layer);
    s.mUserData = userData;
    const id = new Jolt.BodyID(bodies.CreateAndAddBody(s, Jolt.EActivation_DontActivate).GetIndexAndSequenceNumber());
    Jolt.destroy(s);
    shape.Release();
    return id;
  };
}

/** 작업 목록을 만드는 데 필요한 것(셀 하나). */
interface JobCtx {
  w: PhysicsWorld;
  add: AddStatic;
  e: CellEntry;
  key: CellKey;
  anchorWF: Readonly<Vec3d>;
  escalators: Escalators;
}

/** 높이장 4×4 타일 작업. */
function heightfieldJobs(c: JobCtx, hf: HeightfieldData): Job[] {
  const jobs: Job[] = [];
  const n = (hf.size - 1) / HF_TILES + 1;
  for (let tz = 0; tz < HF_TILES; tz++) {
    for (let tx = 0; tx < HF_TILES; tx++) {
      const shape = () => createHeightfieldShape(c.w.Jolt, hf, tx * (n - 1), tz * (n - 1), n);
      jobs.push({
        run: () => c.add(shape(), c.e, [0, 0, 0], [0, 0, 0, 1], OBJ.TERRAIN, TERRAIN_MATERIAL),
        estMs: HEIGHTFIELD_TILE_MS,
      });
    }
  }
  return jobs;
}

/** JCOL 셰이프 하나 → 작업(triMesh는 ≤ MAX_JOB_TRIS 조각, 프리미티브는 1개). 에스컬레이터는 작업 없이 구간 등록. userData = 재질 | flags << 8. */
function shapeJobs(c: JobCtx, sh: JcolShape): Job[] {
  const userData = sh.material | (sh.flags << 8);
  if (sh.kind === 'box' && (sh.flags & JCOL_FLAG.escalator) !== 0) {
    const o = c.e.originWF;
    const a = c.anchorWF;
    const center: [number, number, number] = [
      o.x - a.x + sh.posLocal[0],
      o.y - a.y + sh.posLocal[1],
      o.z - a.z + sh.posLocal[2],
    ];
    c.escalators.add(c.key, escalatorVolume(center, sh.quat, sh.halfExtents));
    return [];
  }
  if (sh.layer === OBJ.SENSOR) return [];
  if (sh.kind !== 'triMesh') {
    const shape = () => createPrimitiveShape(c.w.Jolt, sh);
    const run = (): BodyId | undefined => {
      const s = shape();
      return s ? c.add(s, c.e, sh.posLocal, sh.quat, sh.layer, userData) : undefined;
    };
    return [{ run, estMs: PRIMITIVE_MS }];
  }
  const jobs: Job[] = [];
  const nt = sh.indices.length / 3;
  for (let t0 = 0; t0 < nt; t0 += MAX_JOB_TRIS) {
    const t1 = Math.min(nt, t0 + MAX_JOB_TRIS);
    const mesh = () => {
      const m = meshSlice(sh.vertices, sh.indices, t0, t1);
      return createMeshShape(c.w.Jolt, m.vertices, m.indices, sh.material);
    };
    jobs.push({
      run: () => c.add(mesh(), c.e, sh.posLocal, sh.quat, sh.layer, userData),
      estMs: (t1 - t0) * MESH_MS_PER_TRI,
    });
  }
  return jobs;
}

/** 셀 작업: 높이장 타일 → JCOL 셰이프들(triMesh 조각·프리미티브, 에스컬레이터 구간 등록). */
function jobsOf(
  c: JobCtx,
  jcol: ArrayBuffer | undefined,
  hf: HeightfieldData | undefined,
  warn: (msg: string) => void,
): Job[] {
  const jobs = hf ? heightfieldJobs(c, hf) : [];
  if (!jcol) return jobs;
  const r = parseJcol(new Uint8Array(jcol));
  if (!r.ok) {
    warn(`collision.bin: ${r.error.message}`);
    return jobs;
  }
  for (const sh of r.value) jobs.push(...shapeJobs(c, sh));
  return jobs;
}

/** 앵커 재설정: 정적 바디 −Δ. */
function shiftBodies(w: PhysicsWorld, ids: readonly BodyId[], dx: number, dy: number, dz: number): void {
  for (const id of ids) {
    const p = w.bodies.GetPosition(id);
    const [x, y, z] = [p.GetX() - dx, p.GetY() - dy, p.GetZ() - dz];
    w.bodies.SetPosition(id, w.scratch.rvec3(x, y, z), w.Jolt.EActivation_DontActivate);
  }
}

function destroyBodies(w: PhysicsWorld, ids: readonly BodyId[]): void {
  for (const id of ids) {
    w.bodies.RemoveBody(id);
    w.bodies.DestroyBody(id);
    w.Jolt.destroy(id);
  }
}

/** 예산 안에서 큐 앞 셀의 작업을 처리(최소 1개). 셀 작업이 끝나면 onLoaded. 반환 = 처리한 작업 수. */
function pumpQueue(
  cells: ReadonlyMap<CellKey, CellEntry>,
  queue: CellKey[],
  budgetMs: number,
  onLoaded: (key: CellKey) => void,
): number {
  const t0 = performance.now();
  let n = 0;
  while (queue.length > 0) {
    const key = queue[0] as CellKey;
    const e = cells.get(key);
    const next = e?.jobs[0];
    // 남은 예산에 들지 않는 작업은 다음 조각(조각마다 최소 1개).
    if (next && n > 0 && performance.now() - t0 + next.estMs > budgetMs) break;
    if (e && next) {
      e.jobs.shift();
      const id = next.run();
      if (id) e.bodies.push(id);
      n++;
    }
    if (!e || e.jobs.length === 0) {
      queue.shift();
      if (e) onLoaded(key);
    }
  }
  return n;
}

export function createCellColliders(
  w: PhysicsWorld,
  anchorWF: Readonly<Vec3d>,
  escalators: Escalators,
  onLoaded: (key: CellKey) => void,
  warn: (msg: string) => void,
): CellColliders {
  const cells = new Map<CellKey, CellEntry>();
  const queue: CellKey[] = [];
  const add = staticAdder(w, anchorWF);
  const remove = (key: CellKey): void => {
    const e = cells.get(key);
    if (!e) return;
    destroyBodies(w, e.bodies);
    cells.delete(key);
    escalators.removeCell(key);
    const i = queue.indexOf(key);
    if (i >= 0) queue.splice(i, 1);
  };
  return {
    enqueue(key, originWF, jcol, hf) {
      remove(key);
      const e: CellEntry = { originWF: { ...originWF }, jobs: [], bodies: [] };
      e.jobs = jobsOf({ w, add, e, key, anchorWF, escalators }, jcol, hf, (m) => warn(`${key} ${m}`));
      cells.set(key, e);
      // 작업이 없는 셀(데이터 없음)은 바로 적재 완료 — 큐에 넣으면 pending 0이라 펌프가 돌지 않아 영영 미적재.
      if (e.jobs.length === 0) onLoaded(key);
      else queue.push(key);
    },
    remove,
    pump: (budgetMs) => pumpQueue(cells, queue, budgetMs, onLoaded),
    isLoaded: (key) => cells.has(key) && !queue.includes(key),
    get pending() {
      let n = 0;
      for (const k of queue) n += cells.get(k)?.jobs.length ?? 0;
      return n;
    },
    get cells() {
      return cells.size;
    },
    shift: (dx, dy, dz) => {
      for (const e of cells.values()) shiftBodies(w, e.bodies, dx, dy, dz);
    },
    dispose() {
      for (const key of [...cells.keys()]) remove(key);
    },
  };
}
