// 나무 머티리얼(M05-T04, 07 §4 M_FOLIAGE·M_IMPOSTOR): 인스턴싱은 InstancedMesh 대신 InstancedBufferGeometry 속성 `_ipos`(x, y, z 렌더 좌표, yaw)·
// `_iext`(높이, 씨앗 0..1, 수종, 0)로 셰이더가 직접 한다 — 캐시 키에 객체 uuid가 안 들어가 수종 풀 24개가 노드 빌드 3번(수피·잎·임포스터)을 공유한다.
// 바람 = 높이² 비례 흔들림(+ 잎 떨림), 계절 = 수종 표(season.ts — 색·잎 밀도, 잎은 조각 해시로 성기게), 임포스터 = 반팔면체 8 × 8 틀 + 구면 법선.
// see ADR-0052
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  Fn,
  float,
  floor,
  hash,
  int,
  max,
  mix,
  normalize,
  normalLocal,
  positionGeometry,
  positionLocal,
  select,
  sin,
  sqrt,
  step,
  texture,
  time,
  transformNormalToView,
  uniform,
  uniformArray,
  uv,
  varyingProperty,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  DoubleSide,
  type Material,
  MeshLambertNodeMaterial,
  MeshStandardNodeMaterial,
  type Texture,
  type Node as TslNode,
  type UniformNode,
  Vector3,
  Vector4,
} from 'three/webgpu';
import { BARK_COLORS, SPECIES_SLOTS, seasonTable } from './season.ts';

export interface TreeUniforms {
  /** (r, g, b, 잎 밀도) × 수종 슬롯. */
  season: ReturnType<typeof uniformArray<'vec4'>>;
  /** 바람 (dirX, dirZ, 세기 m/s). */
  wind: UniformNode<'vec3', Vector3>;
  /** 수종별 임포스터 틀 반지름(정규화 높이 1 기준). */
  radius: ReturnType<typeof uniformArray<'float'>>;
  setSeason(dayOfYear: number): void;
}

export function createTreeUniforms(radius: readonly number[]): TreeUniforms {
  const rows = Array.from({ length: SPECIES_SLOTS }, () => new Vector4(0.3, 0.5, 0.2, 1));
  const season = uniformArray<'vec4'>(rows, 'vec4');
  const r = uniformArray<'float'>(
    Array.from({ length: SPECIES_SLOTS }, (_, i) => radius[i] ?? 0.6),
    'float',
  );
  const wind = uniform(new Vector3(1, 0, 2));
  let last = -1;
  return {
    season,
    wind,
    radius: r,
    setSeason(day) {
      if (day === last) return;
      last = day;
      const t = seasonTable(day);
      for (const [i, v] of rows.entries())
        v.set(t[i * 4] as number, t[i * 4 + 1] as number, t[i * 4 + 2] as number, t[i * 4 + 3] as number);
      season.array = rows;
    },
  };
}

const ipos = attribute('_ipos', 'vec4');
const iext = attribute('_iext', 'vec4');
const barkTable = uniformArray<'vec3'>(
  BARK_COLORS.map((c) => new Vector3(...c)),
  'vec3',
);
const barkOf = () => vec3(barkTable.element(int(iext.z)));

/** 로컬(정규화 높이 1) → 렌더 좌표 + yaw 회전(법선도) + 바람. */
function placeNode(u: TreeUniforms, flutter: boolean) {
  return Fn(() => {
    const h = iext.x;
    const c = cos(ipos.w);
    const s = sin(ipos.w);
    const p = positionLocal.mul(h);
    const rot = vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s)));
    const n = normalLocal;
    normalLocal.assign(vec3(n.x.mul(c).add(n.z.mul(s)), n.y, n.z.mul(c).sub(n.x.mul(s))));
    const k = positionLocal.y.mul(positionLocal.y);
    const phase = iext.y.mul(6.283);
    const sway = sin(time.mul(1.1).add(phase)).mul(u.wind.z).mul(k).mul(h).mul(0.01);
    let off = vec3(u.wind.x, 0, u.wind.y).mul(sway);
    if (flutter) {
      const f = vec3(
        sin(time.mul(6).add(p.x.mul(3)).add(phase)),
        sin(time.mul(7.3).add(p.z.mul(3))),
        cos(time.mul(5.1).add(p.y.mul(3))),
      );
      off = off.add(f.mul(u.wind.z).mul(k).mul(0.02));
    }
    return rot.add(off).add(ipos.xyz);
  })();
}

const leafRow = (u: TreeUniforms) => vec4(u.season.element(int(iext.z)));
const tintOf = () => iext.y.mul(0.3).add(0.85);
/** 잎 자체발광 비율(투과광 근사). */
const LEAF_TRANSLUCENCY = 0.22;

export function createBarkMaterial(u: TreeUniforms): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  m.name = 'tree_bark';
  m.positionNode = placeNode(u, false);
  m.colorNode = barkOf().mul(tintOf());
  return m;
}

/**
 * 잎·임포스터 조명: Lambert(정반사·환경맵 표본 없음 — 겹쳐 그려지는 알파 테스트 잎에서 Standard는 숲 시점 +4 ms) + 태양 직사 + 하늘 간접광
 * (보조 AtmosphereLight indirect — LUT 조회 1회, Lambert만으로는 그늘이 새까맣다). lightsNode가 없으면(소프트웨어 경로) 장면 조명 그대로.
 */
export interface FoliageLighting {
  lightsNode?: TslNode<'vec3'> | object;
}

const withFoliageLights = (m: MeshLambertNodeMaterial, l: FoliageLighting): void => {
  if (l.lightsNode) (m as unknown as { lightsNode: unknown }).lightsNode = l.lightsNode;
};
/** NodeMaterial.setupLighting은 모든 노드 머티리얼의 emissiveNode를 읽는다(Lambert 타입 정의에만 없음). */
const emissiveOf = (m: MeshLambertNodeMaterial) => m as MeshLambertNodeMaterial & { emissiveNode: unknown };

export function createLeafMaterial(u: TreeUniforms, leaves: Texture, l: FoliageLighting = {}): Material {
  const m = new MeshLambertNodeMaterial({ side: DoubleSide });
  withFoliageLights(m, l);
  m.name = 'tree_leaf';
  m.positionNode = placeNode(u, true);
  const tex = texture(leaves, uv());
  const row = leafRow(u);
  // 잎 밀도: 기하 위치 조각(0.2 단위) 해시 < 밀도면 남김 — 낙엽·새잎이 군데군데.
  const patch = hash(dot(floor(positionGeometry.mul(5)), vec3(1, 57, 113)).add(iext.y.mul(97))).toVarying(
    'v_leafPatch',
  );
  // 잎은 투과광·하늘빛을 받아 밝다 → 1.25배(실사 가로수 대비 맞춤).
  const leafColor = tex.rgb.mul(row.xyz).mul(tintOf()).mul(1.25);
  m.colorNode = leafColor;
  // 투과광·수관 안 산란 근사: 잎 색의 일부를 자체발광(그늘·뒷면 잎이 검게 죽지 않게 — 실제 GPU 확인).
  emissiveOf(m).emissiveNode = leafColor.mul(LEAF_TRANSLUCENCY);
  m.opacityNode = tex.a.mul(step(patch, row.w));
  m.alphaTest = 0.5;
  return m;
}

/** 반팔면체 복호(baker와 같은 식). */
const hemiOctDecode = (f: TslNode<'vec2'>) => {
  const g = f.mul(2).sub(1);
  const px = g.x.add(g.y).mul(0.5);
  const pz = g.x.sub(g.y).mul(0.5);
  const y = float(1).sub(abs(px)).sub(abs(pz));
  return normalize(vec3(px, y, pz));
};

export interface ImpostorLayout {
  frames: number;
  cols: number;
  rows: number;
}

export function createImpostorMaterial(
  u: TreeUniforms,
  atlas: Texture,
  L: ImpostorLayout,
  l: FoliageLighting = {},
): Material {
  const m = new MeshLambertNodeMaterial();
  withFoliageLights(m, l);
  m.name = 'tree_impostor';
  const vR = varyingProperty('vec3', 'v_impR');
  const vU = varyingProperty('vec3', 'v_impU');
  const vD = varyingProperty('vec3', 'v_impD');
  const vFrame = varyingProperty('vec2', 'v_impFrame');
  const N = float(L.frames);
  m.positionNode = Fn(() => {
    const h = iext.x;
    const c = cos(ipos.w);
    const s = sin(ipos.w);
    const center = ipos.xyz.add(vec3(0, h.mul(0.5), 0));
    const toCam = normalize(cameraPosition.sub(center));
    const dl = vec3(toCam.x.mul(c).sub(toCam.z.mul(s)), toCam.y, toCam.x.mul(s).add(toCam.z.mul(c)));
    const yy = max(dl.y, 0);
    const sum = abs(dl.x).add(yy).add(abs(dl.z));
    const ouv = vec2(dl.x.add(dl.z), dl.x.sub(dl.z)).div(sum).mul(0.5).add(0.5);
    const frame = clamp(floor(ouv.mul(N)), 0, N.sub(1));
    vFrame.assign(frame);
    const df = hemiOctDecode(frame.add(0.5).div(N));
    const up = select(abs(df.y).greaterThan(0.999), vec3(0, 0, -1), vec3(0, 1, 0));
    const rl = normalize(cross(up, df));
    const ul = cross(df, rl);
    const toWorld = (v: TslNode<'vec3'>) => vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.z.mul(c).sub(v.x.mul(s)));
    const r = toWorld(rl);
    const uu = toWorld(ul);
    vR.assign(r);
    vU.assign(uu);
    vD.assign(toWorld(df));
    const R = float(u.radius.element(int(iext.z))).mul(h);
    return center.add(r.mul(positionGeometry.x).add(uu.mul(positionGeometry.y)).mul(R));
  })();
  const local = uv();
  const tile = iext.z.sub(1);
  const tx = tile.sub(floor(tile.div(L.cols)).mul(L.cols));
  const ty = floor(tile.div(L.cols));
  const X = tx.add(vFrame.x.add(local.x).div(N)).div(L.cols);
  const Y = ty.add(vFrame.y.add(float(1).sub(local.y)).div(N)).div(L.rows);
  const smp = texture(atlas, vec2(X, float(1).sub(Y)));
  const row = leafRow(u);
  const patch = hash(dot(floor(local.mul(10)), vec2(1, 57)).add(iext.y.mul(97)));
  // 굽기 명암(수피 ≈ 0.4, 잎 ≈ 0.6)을 상세 LOD 밝기에 맞춘다 — 수피는 ×1.5(하늘 간접광과 함께 상세 LOD 줄기 밝기), 잎은 ×1.6.
  const impColor = mix(barkOf().mul(smp.r.mul(1.5)), row.xyz.mul(smp.r.mul(1.6)), smp.g).mul(tintOf());
  m.colorNode = impColor;
  emissiveOf(m).emissiveNode = impColor.mul(smp.g).mul(LEAF_TRANSLUCENCY);
  m.opacityNode = smp.a.mul(mix(float(1), step(patch, row.w), smp.g));
  m.alphaTest = 0.5;
  const q = local.mul(2).sub(1);
  const nz = sqrt(max(float(1).sub(dot(q, q)), 0.09));
  // 구면 법선 — 단, 아래 절반(줄기·수관 밑)은 수직 성분을 빼 원기둥형으로(아래를 향하면 해를 못 받아 줄기가 새까맣다).
  m.normalNode = transformNormalToView(
    normalize(
      vR
        .mul(q.x)
        .add(vU.mul(max(q.y, 0)))
        .add(vD.mul(nz)),
    ),
  );
  return m;
}
