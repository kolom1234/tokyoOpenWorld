// 셀 랜드마크 오버라이드(M05-T05): 이 셀 건물 중 대체 대상 → 셸, 기준점이 이 셀인 부품 → overrides.mesh(glb, 머티리얼 landmark,
// POSITION u16·NORMAL i8·TEXCOORD_0 f32(미터)·`_LMAT` u8). 대체 건물은 buildings.mesh 렌더에서 빠지고(renderSkip) 충돌·meta에는 남는다.
// 수락 검사: 셸 + 붙은 부품 경계 vs PLATEAU 렌더 면 경계 — 수평 ≤ 0.5 m, 높이(위) ≤ 1 m. 넘으면 빌드 실패. see ADR-0053, docs/04 §4.4-4
import type { Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../../lib/gltf.ts';
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { type Aabb, boundsOf, quantizePositions } from '../buildings-mesh.ts';
import { remapVertices } from '../terrain-mesh.ts';
import { LStream } from './geom.ts';
import { anchorOf, emitPart, type PartCtx } from './parts.ts';
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

export interface OverrideCellOutput {
  glb: Uint8Array | null;
  aabbLocal: Aabb | null;
  tris: number;
  renderSkip: Set<string>;
  /** 충돌 스트림(셀 로컬) — 건물 충돌과 합친다. */
  collider: { pos: number[]; idx: number[] };
  landmarks: string[];
  checks: OverrideCheck[];
}

const inCell = (o: Vec3Tuple, p: readonly [number, number]): boolean =>
  p[0] >= o[0] && p[0] < o[0] + 256 && p[1] >= o[2] && p[1] < o[2] + 256;

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
      emitShell(out, b, entry.shell, originWF);
      for (const p of lm.parts) if (p.type === 'screen' && p.gml === gml) emitPart(ctx, p);
      const got = emptyBounds();
      growBounds(got, out.pos, from);
      const want = plateauExtent(b).bounds;
      const local: Bounds = { min: sub3(want.min, originWF), max: sub3(want.max, originWF) };
      checks.push({ landmark: lm.id, gml, ...boundsDelta(got, local) });
    }
    for (const p of lm.parts) {
      if (p.type === 'screen' && lm.replace.includes(p.gml)) continue;
      const owned = p.type === 'screen' ? byGml.has(p.gml) : inCell(originWF, anchorOf(p));
      if (!owned) continue;
      landmarks.add(lm.id);
      emitPart(ctx, p);
    }
  }
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
  };
}

const sub3 = (a: Vec3Tuple, o: Vec3Tuple): Vec3Tuple => [a[0] - o[0], a[1] - o[1], a[2] - o[2]];

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
