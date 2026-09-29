// 저해상도 공중원근(M03 보강 2, ADR-0039): takram aerialPerspective는 픽셀마다 산란 LUT·투과 조회(1080p Medium, 15 W에서 GPU의 ≈ 19 %).
// 산란(S)·투과(T)는 거리에 따라 천천히 변한다 → 렌더 스케일의 ½×½에서 한 번에 계산(MRT: S + viewZ, T) → 렌더 스케일에서 깊이 인지 업샘플로 color × T + S.
// 하늘(깊이 = 무한)도 저해상도에서 시선 방향 산란·투과(S·T), 태양·달 원반(작아서 저해상도면 사라진다)만 렌더 스케일에서 더한다:
// 하늘 = (원반) × T + S(takram SkyNode와 같은 식). 깊이가 맞는 저해상도 이웃이 부족한 픽셀(건물 윤곽 — TAAU 지터로 텍셀이 앞·뒷면을 번갈아 잡아
// 떨렸다)은 렌더 스케일에서 정확히 계산한다. 지구 곡률 보정(takram correctGeometricError)은 카메라–지점 336 km 밖에서만 작동 → 도시 규모(≤ 60 km)에선 생략.
import {
  type AtmosphereContext,
  getAtmosphereContext,
  getIndirectLuminance,
  getIndirectLuminanceToPoint,
  MoonNode,
  SunNode,
} from '@takram/three-atmosphere/webgpu';
import {
  depthToViewZ,
  inverseProjectionMatrix,
  inverseViewMatrix,
  projectionMatrix,
  screenToPositionView,
} from '@takram/three-geospatial/webgpu';
import {
  abs,
  Fn,
  float,
  If,
  max,
  mix,
  outputStruct,
  positionGeometry,
  property,
  screenUV,
  texture,
  textureSize,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  type Camera,
  HalfFloatType,
  type NodeBuilder,
  type NodeFrame,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  TempNode,
  type TextureNode,
  type Node as TslNode,
  Vector2,
} from 'three/webgpu';

type V4 = TslNode<'vec4'>;
/** 렌더 스케일 대비 저해상도 배율(축당). */
export const AERIAL_SCALE = 0.5;
/** 업샘플 깊이 여유: 이웃 viewZ가 이 비율 + 절대 m 넘게 다르면 가중 0(건물 윤곽·하늘 경계). */
const REL_TOLERANCE = 0.08;
const ABS_TOLERANCE_M = 2;
/** 깊이가 맞는 이웃의 이중선형 가중 합이 이보다 작으면 그 픽셀은 정확히 계산. */
const MIN_SUPPORT = 0.5;
/** 이웃 산란 휘도의 최대/최소 비가 이보다 크면(하늘–지평선 아래 같은 급경계) 정확히 계산 — 보간이 지터와 함께 흔들린다. */
const MAX_NEIGHBOR_RATIO = 1.25;

const _size = new Vector2();
type RendererState = Parameters<typeof RendererUtils.resetRendererState>[1];
let _state: RendererState | undefined;
const m4 = (n: unknown) => n as TslNode<'mat4'>;

/** 쿼드 패스 정점(NDC) → 시선 방향(ECEF 단위 벡터). takram SkyNode의 cameraDirectionWorld와 같다(정점 단계 varying). */
function rayDirectionECEF(atm: AtmosphereContext, camera: Camera): TslNode<'vec3'> {
  const posView = m4(inverseProjectionMatrix(camera)).mul(vec4(positionGeometry, 1)).xyz;
  const dirWorld = m4(inverseViewMatrix(camera)).mul(vec4(posView, 0)).xyz;
  return m4(atm.matrixWorldToECEF).mul(vec4(dirWorld, 0)).xyz.toVertexStage().normalize().toConst();
}

interface Scatter {
  s: TslNode<'vec3'>;
  t: TslNode<'vec3'>;
}

/**
 * 한 픽셀의 산란 S·투과 T(Fn 안에서 호출): 하늘이면 시선 방향(getIndirectLuminance), 아니면 카메라→지점(getIndirectLuminanceToPoint).
 * 컨텍스트의 이름 붙은 상수(altitudeCorrectionUnit 등)는 처음 쓰인 범위에 선언된다 → 분기 전에 함수 범위에서 먼저 쓴다(WGSL 재선언 방지).
 */
function scatterAt(
  atm: AtmosphereContext,
  camera: Camera,
  uvN: TslNode<'vec2'>,
  d: TslNode<'float'>,
  viewZ: TslNode<'float'>,
  isSky: TslNode<'bool'>,
  ray: TslNode<'vec3'>,
): Scatter {
  const worldToUnit = atm.parametersNode.worldToUnit as unknown as TslNode<'float'>;
  const { sunDirectionECEF, cameraPositionUnit, altitudeCorrectionUnit } = atm;
  const posView = screenToPositionView(
    uvN,
    d,
    viewZ,
    projectionMatrix(camera),
    inverseProjectionMatrix(camera),
  ) as unknown as TslNode<'vec3'>;
  const posWorld = m4(inverseViewMatrix(camera)).mul(vec4(posView, 1)).xyz;
  const posUnit = m4(atm.matrixWorldToECEF).mul(vec4(posWorld, 1)).xyz.mul(worldToUnit);
  const camUnit = cameraPositionUnit.add(altitudeCorrectionUnit).toConst();
  const pointUnit = posUnit.add(altitudeCorrectionUnit).toConst();
  const s = vec3(0).toVar();
  const t = vec3(1).toVar();
  If(isSky, () => {
    const tr = getIndirectLuminance(camUnit, ray, vec2(0), sunDirectionECEF).toConst();
    s.assign(tr.get('luminance'));
    t.assign(tr.get('transmittance'));
  }).Else(() => {
    const tr = getIndirectLuminanceToPoint(camUnit, pointUnit, vec2(0), sunDirectionECEF).toConst();
    s.assign(tr.get('luminance'));
    t.assign(tr.get('transmittance'));
  });
  return { s, t };
}

const isSkyDepth = (d: TslNode<'float'>, reversed: boolean): TslNode<'bool'> =>
  reversed ? d.lessThanEqual(0) : d.greaterThanEqual(1);

/** 저해상도 S·T 텍스처를 매 프레임(updateBefore) 그리는 노드. 결과는 `inscatter`(rgb + a = viewZ)·`transmittance` 텍스처 노드로 읽는다. */
export class LowResAerialNode extends TempNode {
  static get type(): string {
    return 'LowResAerialNode';
  }

  readonly depthNode: TextureNode;
  /** 렌더 스케일(동적 해상도)과 곱한다. */
  renderScale: number;
  private readonly rt = new RenderTarget(1, 1, { count: 2, type: HalfFloatType, depthBuffer: false });
  private readonly material = new NodeMaterial();
  private readonly quad = new QuadMesh(this.material);
  readonly inscatter: TextureNode;
  readonly transmittance: TextureNode;

  constructor(depthNode: TextureNode, renderScale: number) {
    super('vec4');
    this.depthNode = depthNode;
    this.renderScale = renderScale;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.material.name = 'AerialLowRes';
    this.quad.name = 'AerialLowRes';
    const [s, t] = this.rt.textures;
    if (s) s.name = 'aerial.inscatter';
    if (t) t.name = 'aerial.transmittance';
    this.inscatter = texture(this.rt.textures[0]);
    this.transmittance = texture(this.rt.textures[1]);
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer;
    if (!renderer) return undefined;
    renderer.getDrawingBufferSize(_size);
    const k = AERIAL_SCALE * this.renderScale;
    const w = Math.max(1, Math.round(_size.x * k));
    const h = Math.max(1, Math.round(_size.y * k));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    _state = RendererUtils.resetRendererState(renderer, _state as RendererState);
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, _state);
    return undefined;
  }

  override setup(builder: NodeBuilder): TslNode {
    const atm = getAtmosphereContext(builder);
    const camera = (atm.camera ?? (builder as unknown as { camera?: Camera }).camera) as Camera;
    const sOut = property('vec4');
    const tOut = property('vec4');
    const depthNode = this.depthNode;
    const reversed = builder.renderer.reversedDepthBuffer;
    this.material.colorNode = Fn(() => {
      const d = depthNode.sample(uv()).r.toConst();
      const viewZ = depthToViewZ(d, camera).toConst();
      const sc = scatterAt(atm, camera, uv(), d, viewZ, isSkyDepth(d, reversed), rayDirectionECEF(atm, camera));
      sOut.assign(vec4(sc.s, viewZ));
      tOut.assign(vec4(sc.t, 1));
      return vec4(0);
    })();
    this.material.outputNode = outputStruct(sOut, tOut);
    this.material.needsUpdate = true;
    return vec4(0) as unknown as TslNode;
  }

  override dispose(): void {
    this.rt.dispose();
    this.material.dispose();
    super.dispose();
  }
}

/** 깊이 인지 2×2 이중선형: 깊이가 맞는 이웃만(가중 합 = 지지도) + 이웃 산란 휘도 최소·최대. */
function gatherLowRes(
  low: LowResAerialNode,
  z: TslNode<'float'>,
): Scatter & { w: TslNode<'float'>; lo: TslNode<'float'>; hi: TslNode<'float'> } {
  const tol = abs(z).mul(REL_TOLERANCE).add(ABS_TOLERANCE_M).toConst();
  const size = vec2(textureSize(low.inscatter) as unknown as TslNode<'ivec2'>);
  const p = screenUV.mul(size).sub(0.5).toConst();
  const cell = p.floor().toConst();
  const f = p.sub(cell).toConst();
  const sSum = vec3(0).toVar();
  const tSum = vec3(0).toVar();
  const wSum = float(0).toVar();
  const lo = float(1e30).toVar();
  const hi = float(0).toVar();
  for (const [ox, oy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const tuv = cell.add(vec2(ox, oy)).add(0.5).div(size);
    const s = low.inscatter.sample(tuv).toConst();
    const bw = (ox === 0 ? f.x.oneMinus() : f.x).mul(oy === 0 ? f.y.oneMinus() : f.y);
    const w = bw.mul(max(float(1).sub(abs(s.a.sub(z)).div(tol)), 0)).toConst();
    sSum.addAssign(s.rgb.mul(w));
    tSum.addAssign(low.transmittance.sample(tuv).rgb.mul(w));
    wSum.addAssign(w);
    // 깊이가 맞는 이웃끼리만 비교(윤곽은 지지도 검사가 맡는다).
    const l = s.r.add(s.g).add(s.b);
    lo.assign(lo.min(w.greaterThan(0).select(l, float(1e30))));
    hi.assign(hi.max(w.greaterThan(0).select(l, float(0))));
  }
  return { s: sSum, t: tSum, w: wSum, lo, hi };
}

/**
 * 렌더 스케일 픽셀: 저해상도 S·T를 깊이 인지 업샘플(지지도 ≥ MIN_SUPPORT), 아니면 그 픽셀만 정확히 → (color 또는 하늘이면 태양·달 원반) × T + S.
 * `atm` = 렌더러 contextNode의 대기 컨텍스트(원반 방향·ECEF 행렬 — 이 합성은 RTT 쿼드 패스 안).
 */
export function composeAerial(
  color: V4,
  depth: TextureNode,
  low: LowResAerialNode,
  camera: Camera,
  atm: AtmosphereContext,
  reversedDepth: boolean,
): V4 {
  const sun = new SunNode();
  const moon = new MoonNode();
  return Fn(() => {
    // low(= vec4(0))를 그래프에 넣어야 저해상도 패스(updateBefore)가 돈다.
    const out = vec4(color)
      .add(low as unknown as V4)
      .toVar();
    const d = depth.sample(screenUV).r.toConst();
    const z = depthToViewZ(d, camera).toConst();
    const sky = isSkyDepth(d, reversedDepth);
    const base = vec3(out.rgb).toVar();
    const ray = rayDirectionECEF(atm, camera);
    If(sky, () => {
      sun.rayDirectionECEF = ray as never;
      moon.rayDirectionECEF = ray as never;
      const sunN = sun as unknown as V4;
      const moonN = moon as unknown as V4;
      base.assign(mix(mix(vec3(0), sunN.rgb, sunN.a), moonN.rgb, moonN.a));
    });
    const g = gatherLowRes(low, z);
    const S = g.s.div(g.w.max(1e-4)).toVar();
    const T = g.t.div(g.w.max(1e-4)).toVar();
    If(g.w.lessThan(MIN_SUPPORT).or(g.hi.greaterThan(g.lo.mul(MAX_NEIGHBOR_RATIO).add(1e-4))), () => {
      const exact = scatterAt(atm, camera, screenUV, d, z, sky, ray);
      S.assign(exact.s);
      T.assign(exact.t);
    });
    out.rgb.assign(base.mul(T).add(S));
    return out;
  })() as unknown as V4;
}
