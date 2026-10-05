// 대기(M03-T02, 07 §6): @takram/three-atmosphere WebGPU — AtmosphereContext(렌더러 contextNode) + AtmosphereLight(태양 직사·하늘 간접) + 하늘 배경.
// WF(도북 격자, +X 동·+Y 위·−Z 북) → ECEF 변환을 렌더 원점마다 구성한다(수렴각 γ·지오이드고 반영). 태양·달 방향은 계산하지 않고 받는다(sim 소비).
// see docs/07-rendering.md §6, docs/01-architecture.md §7, ADR-0028
import type { Vec3, Vec3d } from '@sanpo/core';
import { gridConvergenceDeg, wfToLonLat } from '@sanpo/geo';
import {
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  skyBackground,
} from '@takram/three-atmosphere/webgpu';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { context } from 'three/tsl';
import { type Camera, Matrix4, type Scene, type Node as TslNode, Vector3, type WebGPURenderer } from 'three/webgpu';

/** 도쿄 부근 지오이드고(m): 타원체고 = TP + N. GSI 지오이드 2011 기준 MVP 구역 ≈ 36.7 m(±0.3). 대기 고도 보정용이라 상수로 충분. */
export const GEOID_HEIGHT_M = 36.7;
/** 그림자 카메라용 라이트 거리(m) — 방향광이라 값 자체는 그림자 범위(T03)에만 의미. */
const LIGHT_DISTANCE_M = 1000;

const scratchFrame = new Matrix4();
const scratchAxes = new Matrix4();

/**
 * 렌더 좌표(= WF − renderOrigin) → ECEF 행렬. 원점 = renderOrigin의 타원체 위치, 축 = (WF 격자 축을 진북 기준 N·U·E 성분으로) → 로컬 North-Up-East → ECEF.
 * γ(진북→도북 시계 +): 진북 = WF (−sinγ, 0, −cosγ), 진동 = WF (cosγ, 0, −sinγ).
 */
export function worldToEcef(originWF: Readonly<Vec3d>, out: Matrix4 = new Matrix4()): Matrix4 {
  const ll = wfToLonLat({ x: originWF.x, y: originWF.y, z: originWF.z });
  const g = (gridConvergenceDeg(ll) * Math.PI) / 180;
  const posECEF = new Geodetic(radians(ll.lon), radians(ll.lat), originWF.y + GEOID_HEIGHT_M).toECEF();
  Ellipsoid.WGS84.getNorthUpEastFrame(posECEF, scratchFrame);
  // 행 = (N, U, E) 성분 추출: n = v·N_wf, u = v.y, e = v·E_wf.
  const s = Math.sin(g);
  const c = Math.cos(g);
  scratchAxes.set(-s, 0, -c, 0, 0, 1, 0, 0, c, 0, -s, 0, 0, 0, 0, 1);
  return out.multiplyMatrices(scratchFrame, scratchAxes);
}

export interface AtmosphereRig {
  readonly context: AtmosphereContext;
  readonly light: AtmosphereLight;
  /** 렌더 원점이 바뀌면(재설정) 호출. */
  setOrigin(originWF: Readonly<Vec3d>): void;
  /** 태양·달을 향하는 WF 단위 벡터. */
  setBodies(sunDirWF: Readonly<Vec3>, moonDirWF: Readonly<Vec3>): void;
  /**
   * 대기 LUT(투과·산란, 컴퓨트)를 명시적으로 계산. 후처리 패스 안(중첩 updateBefore)에서만 참조되면 LUT 갱신이 누락돼
   * 조명·하늘이 0(검은 화면)이 된다(three r186 + takram 0.19.1 실측) → 선컴파일 때 1회 await.
   */
  prepare(yieldFrame: () => Promise<void>): Promise<void>;
  dispose(): void;
}

/**
 * @param skyBackground 하늘을 `scene.backgroundNode`로 그릴지. 후처리(aerialPerspective)가 깊이 1 텍셀에 하늘을 그리면 불필요하고,
 * 환경 프로브(SkyEnvironmentNode)와 함께 쓰면 배경 머티리얼이 매 프레임 재빌드된다(CPU ≈ 20 ms, 실측) → WebGL2 직접 렌더에서만 켠다.
 */
export function createAtmosphere(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  withSkyBackground: boolean,
): AtmosphereRig {
  const ctx = new AtmosphereContext();
  ctx.camera = camera;
  // 레이마칭 산란은 STBN 시간 노이즈를 넣는다 → TAA(M03-T07) 전에는 LUT 조회로(프레임 간 결정론, CPU 폴백 비용↓).
  ctx.raymarchScattering = false;
  // takram 타입은 three 타입 선언과 제네릭이 조금 달라(같은 런타임 클래스) 경계에서만 캐스트한다.
  const prev = renderer.contextNode.value as object;
  renderer.contextNode = context({ ...prev, getAtmosphere: () => ctx });
  renderer.library.addLight(
    AtmosphereLightNode as unknown as Parameters<typeof renderer.library.addLight>[0],
    AtmosphereLight,
  );
  const light = new AtmosphereLight(LIGHT_DISTANCE_M);
  light.name = 'sun';
  if (withSkyBackground) {
    const sky = skyBackground();
    // 별 데이터는 외부(GitHub) 기본 URL → 끈다(post/pipeline.ts와 같은 이유).
    sky.showStars = false;
    scene.backgroundNode = sky as unknown as TslNode;
  }
  const rot = new Matrix4();
  const dir = new Vector3();
  const sunWF = new Vector3(0, 1, 0);
  const moonWF = new Vector3(0, -1, 0);
  const applyBodies = (): void => {
    ctx.sunDirectionECEF.value.copy(dir.copy(sunWF).transformDirection(rot));
    ctx.moonDirectionECEF.value.copy(dir.copy(moonWF).transformDirection(rot));
  };
  return {
    context: ctx,
    light,
    setOrigin(originWF) {
      worldToEcef(originWF, ctx.matrixWorldToECEF.value);
      rot.extractRotation(ctx.matrixWorldToECEF.value);
      applyBodies();
    },
    setBodies(sun, moon) {
      sunWF.set(sun.x, sun.y, sun.z);
      moonWF.set(moon.x, moon.y, moon.z);
      applyBodies();
    },
    async prepare(yieldFrame) {
      // LUT 노드는 첫 빌드(setup)에서 텍스처를 만든다 → 캔버스로 1회 직접 렌더해 초기화한 뒤 계산을 끝까지 기다린다.
      // 먼저 비동기 컴파일 + 한 프레임 양보: 동기 render 안에서 파이프라인을 만들면 그동안 프레임이 멈춘다(M06 실측 1.4–1.7 s).
      await renderer.compileAsync(scene, camera);
      await yieldFrame();
      renderer.render(scene, camera);
      await yieldFrame();
      await ctx.lutNode.updateTextures(renderer as unknown as Parameters<typeof ctx.lutNode.updateTextures>[0]);
    },
    dispose() {
      light.dispose();
      ctx.dispose();
    },
  };
}
