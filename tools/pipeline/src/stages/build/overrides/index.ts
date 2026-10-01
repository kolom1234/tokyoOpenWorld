// 셀 랜드마크 오버라이드(M05-T05): 이 셀 건물 중 대체 대상 → 셸, 기준점이 이 셀인 부품 → overrides.mesh(glb, 머티리얼 landmark,
// POSITION u16·NORMAL i8·TEXCOORD_0 f32(미터)·`_LMAT` u8). 대체 건물은 buildings.mesh 렌더에서 빠지고(renderSkip) 충돌·meta에는 남는다.
// 수락 검사: 셸 + 붙은 부품 경계 vs PLATEAU 렌더 면 경계 — 수평 ≤ 0.5 m, 높이(위) ≤ 1 m. 넘으면 빌드 실패. see ADR-0053, docs/04 §4.4-4
import type { JcolShape, Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../../lib/gltf.ts';
import type { BridgeRecord, BuildingRecord } from '../../../readers/plateau/types.ts';
import type { StairSpec } from '../../derive/stairs.ts';
import { type Aabb, boundsOf, quantizePositions } from '../buildings-mesh.ts';
import { remapVertices } from '../terrain-mesh.ts';
import { emitBridge, emitStair } from './bridges.ts';
import { LStream } from './geom.ts';
import { emitPart, hostOf, ownsFreePart, type PartCtx } from './parts.ts';
import { type DetailStats, emitFireEscape, emitRooftop, emptyDetailStats } from './rooftops.ts';
import { type Bounds, emitShell, emptyBounds, growBounds, plateauExtent } from './shell.ts';
import type { OverrideSet } from './spec.ts';

export { type LandmarkSpec, LMAT, type OverrideSet, overrideSetOf, readOverrides } from './spec.ts';

export const LANDMARK_MATERIAL = 'landmark';
/** 수락 허용 오차(M05-T05 Accept). */
export const POSITION_TOL_M = 0.5;
export const HEIGHT_TOL_M = 1;

export interface OverrideCheck {
  landmark: string;
  gml: string;
  /** 수평 경계 최대 차(m). */
  dxz: number;
  /** 위 끝 높이 차(m). */
  dy: number;
}

/** 교량·높이 계단 입력(M05-T08): 셀 교량, 셀이 가진 계단, 교량 면을 걷어낼 계단 통로(이웃 포함). */
export interface WalkwayInput {
  bridges?: readonly BridgeRecord[];
  stairs?: readonly StairSpec[];
  corridors?: readonly StairSpec[];
}

export interface OverrideCellOutput {
  glb: Uint8Array | null;
  aabbLocal: Aabb | null;
  tris: number;
  renderSkip: Set<string>;
  /** 충돌 스트림(셀 로컬) — 건물 충돌과 합친다. */
  collider: { pos: number[]; idx: number[] };
  landmarks: string[];
  checks: OverrideCheck[];
  /** 옥상 설비·외부 비상계단(M05-T07) 통계. */
  details: DetailStats;
  /** 교량 면 정밀 충돌(셀 로컬, 지면 스트림에 합친다 — M05-T08). */
  walkCollider: { pos: number[]; idx: number[] };
  /** 계단 램프 프록시·옆 벽(JCOL 프리미티브·triMesh). */
  walkShapes: JcolShape[];
  walk: { bridges: number; stairs: number; risers: number; carved: number };
}

function boundsDelta(a: Bounds, b: Bounds): { dxz: number; dy: number } {
  const d = (x: Vec3Tuple, y: Vec3Tuple, k: 0 | 2): number => Math.abs(x[k] - y[k]);
  const dxz = Math.max(d(a.min, b.min, 0), d(a.max, b.max, 0), d(a.min, b.min, 2), d(a.max, b.max, 2));
  return { dxz, dy: Math.abs(a.max[1] - b.max[1]) };
}

/** 셀 1개의 랜드마크 메시·충돌·검사. groundAt = 지형(셀 로컬). */
export async function overrideCell(
  set: OverrideSet,
  records: readonly BuildingRecord[],
  originWF: Vec3Tuple,
  groundAt: (x: number, z: number) => number | undefined,
  walk: WalkwayInput = {},
): Promise<OverrideCellOutput> {
  const out = new LStream();
  const collider = new LStream();
  const byGml = new Map(records.map((b) => [b.gmlId, b]));
  const ctx: PartCtx = { originWF, groundAt, building: (g) => byGml.get(g), out, collider };
  const renderSkip = new Set<string>();
  const landmarks = new Set<string>();
  const checks: OverrideCheck[] = [];
  for (const lm of set.landmarks) {
    for (const gml of lm.replace) {
      const b = byGml.get(gml);
      const entry = set.shells.get(gml);
      if (!b || !entry) continue;
      renderSkip.add(gml);
      landmarks.add(lm.id);
      const from = out.pos.length;
      if (!entry.shell.skip) emitShell(out, b, entry.shell, originWF);
      for (const p of lm.parts) if (hostOf(p) === gml) emitPart(ctx, p);
      checks.push(attachedCheck(lm.id, b, out.pos, from, originWF, false));
    }
    for (const p of lm.parts) {
      const hostGml = hostOf(p);
      if (hostGml !== undefined && lm.replace.includes(hostGml)) continue;
      const host = hostGml === undefined ? undefined : byGml.get(hostGml);
      if (hostGml === undefined ? !ownsFreePart(originWF, p) : !host) continue;
      landmarks.add(lm.id);
      const from = out.pos.length;
      emitPart(ctx, p);
      // 대체하지 않은 건물에 붙인 화면도 그 건물 경계 대비 검사.
      if (host) checks.push(attachedCheck(lm.id, host, out.pos, from, originWF, true));
    }
  }
  const details = emitDetails(out, records, renderSkip, originWF);
  const walkway = emitWalkways(out, walk, originWF);
  const bad = checks.filter((c) => c.dxz > POSITION_TOL_M || c.dy > HEIGHT_TOL_M);
  if (bad.length > 0) throw new Error(`overrides: tolerance exceeded ${JSON.stringify(bad)}`);
  const encoded = out.count > 0 ? await encodeOverrides(out) : null;
  return {
    glb: encoded?.glb ?? null,
    aabbLocal: encoded?.aabb ?? null,
    tris: out.tris,
    renderSkip,
    collider: { pos: collider.pos, idx: collider.idx },
    landmarks: [...landmarks].sort(),
    checks,
    details,
    ...walkway,
  };
}

/** 교량 면 + 높이 계단(M05-T08): 렌더는 같은 스트림(UV 0), 충돌은 정밀 지면 스트림·램프 프록시. */
function emitWalkways(
  out: LStream,
  walk: WalkwayInput,
  originWF: Vec3Tuple,
): Pick<OverrideCellOutput, 'walkCollider' | 'walkShapes' | 'walk'> {
  const walkCollider = { pos: [] as number[], idx: [] as number[] };
  const walkShapes: JcolShape[] = [];
  const stats = { bridges: 0, stairs: 0, risers: 0, carved: 0 };
  out.plainUv = true;
  for (const b of walk.bridges ?? []) {
    stats.carved += emitBridge(out, walkCollider, b, originWF, walk.corridors);
    stats.bridges++;
  }
  for (const st of walk.stairs ?? []) {
    const n = emitStair(out, walkShapes, st, originWF);
    if (n === 0) continue;
    stats.stairs++;
    stats.risers += n;
  }
  out.plainUv = false;
  return { walkCollider, walkShapes, walk: stats };
}

const sub3 = (a: Vec3Tuple, o: Vec3Tuple): Vec3Tuple => [a[0] - o[0], a[1] - o[1], a[2] - o[2]];

/** 대체하지 않은 건물마다 옥상 설비 + 외부 비상계단(바깥 칸이 이 셀 다른 건물 안이면 생략). */
function emitDetails(
  out: LStream,
  records: readonly BuildingRecord[],
  skip: ReadonlySet<string>,
  originWF: Vec3Tuple,
): DetailStats {
  const stats = emptyDetailStats();
  out.plainUv = true;
  const rings = records.flatMap((b) =>
    b.surfaces
      .filter((s) => s.kind === 'ground' && (s.ringsWF[0]?.length ?? 0) >= 9)
      .map((s) => s.ringsWF[0] as number[]),
  );
  const blocked = (x: number, z: number): boolean => rings.some((r) => inRingWF(r, x, z));
  for (const b of records) {
    if (skip.has(b.gmlId)) continue;
    emitRooftop(out, b, originWF, stats);
    emitFireEscape(out, b, originWF, blocked, stats);
  }
  out.plainUv = false;
  return stats;
}

function inRingWF(r: readonly number[], x: number, z: number): boolean {
  let hit = false;
  const n = r.length / 3;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi, xj, zj] = [r[i * 3] as number, r[i * 3 + 2] as number, r[j * 3] as number, r[j * 3 + 2] as number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** 스트림 from.. 기하(+ withPlateau면 PLATEAU 경계 합집합) vs PLATEAU 렌더 면 경계. */
function attachedCheck(
  landmark: string,
  b: BuildingRecord,
  pos: readonly number[],
  from: number,
  originWF: Vec3Tuple,
  withPlateau: boolean,
): OverrideCheck {
  const { bounds: want, groundY } = plateauExtent(b);
  // LOD1(평평한 프리즘)은 측량 높이(measuredHeight)가 더 높으면 그것이 기준 — 형상 높이는 단순화 값.
  if (b.lod === 1 && b.measuredHeightM !== null) want.max[1] = Math.max(want.max[1], groundY + b.measuredHeightM);
  const local: Bounds = { min: sub3(want.min, originWF), max: sub3(want.max, originWF) };
  const got = withPlateau ? { min: [...local.min] as Vec3Tuple, max: [...local.max] as Vec3Tuple } : emptyBounds();
  growBounds(got, pos, from);
  return { landmark, gml: b.gmlId, ...boundsDelta(got, local) };
}

async function encodeOverrides(s: LStream): Promise<{ glb: Uint8Array; aabb: Aabb }> {
  await MeshoptEncoder.ready;
  const aabb = boundsOf(s.pos);
  const indices = Uint32Array.from(s.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const { q, t, s: scale } = quantizePositions(s.pos, aabb);
  const re = <T extends Uint16Array | Int8Array | Float32Array | Uint8Array>(a: T, n: number): T =>
    remapVertices(a, n, remap, unique);
  const nrm = Int8Array.from(s.nrm, (v) => Math.round(v * 127));
  const glb = await encodeGlb({
    name: 'overrides',
    translation: t,
    scale,
    primitives: [
      {
        materialId: LANDMARK_MATERIAL,
        attributes: {
          POSITION: { array: re(q, 3), itemSize: 3 },
          NORMAL: { array: re(nrm, 3), itemSize: 3, normalized: true },
          TEXCOORD_0: { array: re(Float32Array.from(s.uv), 2), itemSize: 2 },
          _LMAT: { array: re(Uint8Array.from(s.mat), 1), itemSize: 1 },
        },
        indices,
      },
    ],
  });
  return { glb, aabb };
}
