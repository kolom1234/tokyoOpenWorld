// 태양 그림자(07 §6·§9): 대기 라이트(DirectionalLight)에 CSM(takram `CascadedShadowMapsNode` ⊃ three CSMShadowNode), 캐스케이드 경계 페이드.
// 태양 방향은 대기 라이트 위치(AtmosphereLightNode가 ECEF 태양 방향으로 매 프레임 갱신)에서 CSM이 읽는다. 셀 메시의 cast/receive는 cell-node가 슬롯별로 정한다.
// 티어(07 §9 그림자 행)와 갱신 스케줄(ADR-0039): 가까운 캐스케이드는 매 프레임, 먼 캐스케이드는 격 프레임(움직일 때),
// 카메라·장면이 멈춰 있으면 15프레임마다 하나씩(태양 이동 추적). 건너뛴 캐스케이드는 마지막으로 그린 맵과 그때의 shadow.matrix를 쓴다(조회 일관).
import type { QualityTier } from '@sanpo/core';
import { CascadedShadowMapsNode } from '@takram/three-geospatial/webgpu';
import type { DirectionalLight, Material, WebGPURenderer } from 'three/webgpu';

export interface ShadowSettings {
  cascades: number;
  mapSize: number;
  /** 그림자 거리(m, 카메라에서). */
  maxFarM: number;
}

/** 07 §9 그림자 행. */
export const SHADOW_TIERS: Readonly<Record<QualityTier, ShadowSettings>> = {
  low: { cascades: 2, mapSize: 1024, maxFarM: 150 },
  medium: { cascades: 3, mapSize: 1536, maxFarM: 300 },
  high: { cascades: 4, mapSize: 2048, maxFarM: 600 },
  ultra: { cascades: 4, mapSize: 4096, maxFarM: 800 },
};

/** 그림자 카메라를 캐스케이드 상자 앞으로 당기는 여유(m): 초고층(≈ 250 m) 그림자가 캐스케이드 밖에서 잘리지 않게. */
const LIGHT_MARGIN_M = 400;
/** 캐스케이드 깊이 범위(m): 여유 + 600 m 절두체 대각선. */
const SHADOW_FAR_M = 3000;
/** 정지 상태: 이 프레임 간격마다 캐스케이드 하나를 다시 그린다(High 4개 = 캐스케이드당 ≈ 1 s @60). */
export const STATIC_REFRESH_FRAMES = 15;

export interface ShadowFrame {
  /** 카메라(위치·방향·투영)가 지난 프레임과 다르다. */
  moved: boolean;
  /** 셀 추가·제거·HLOD 페이드 등 그림자 투사체가 바뀌었다. */
  sceneChanged: boolean;
  /** 원점 재설정(렌더 좌표가 바뀜 — 이전 맵의 행렬이 무효). */
  rebased: boolean;
}

export interface SunShadows {
  readonly node: CascadedShadowMapsNode;
  readonly settings: Readonly<ShadowSettings>;
  /** 캐스케이드 수가 같으면 제자리(맵 크기·거리), 다르면 노드 교체 + 받는 머티리얼 재빌드. */
  setTier(tier: QualityTier): void;
  /** renderPrep마다: 이번 프레임에 다시 그릴 캐스케이드를 정한다. 반환 = 그릴 캐스케이드 수(초기화 전 = 전부). */
  schedule(f: ShadowFrame): number;
  dispose(): void;
}

/**
 * 순수 스케줄: 프레임 f에 캐스케이드 i(0 = 가장 가까움)를 다시 그리나.
 * 움직일 때 — c0 매 프레임, n ≤ 3: 나머지는 홀짝 교대, n = 4: c1 홀수, c2 f%4=0, c3 f%4=2(프레임당 c0 + 하나).
 * 멈춰 있을 때 — STATIC_REFRESH_FRAMES마다 하나씩 돌아가며.
 */
export function cascadeDue(i: number, n: number, f: number, active: boolean): boolean {
  if (!active) return f % STATIC_REFRESH_FRAMES === 0 && Math.floor(f / STATIC_REFRESH_FRAMES) % n === i;
  if (i === 0) return true;
  if (n <= 3) return (f + i) % 2 === 0;
  if (i === 1) return f % 2 === 1;
  return f % 4 === (i === 2 ? 0 : 2);
}

function makeNode(light: DirectionalLight, s: ShadowSettings): CascadedShadowMapsNode {
  light.shadow.mapSize.set(s.mapSize, s.mapSize);
  // takram CascadedShadowMapsNode = three CSMShadowNode + 대기 라이트·reversed-Z 보정(takram 그림자 예제와 같은 구성).
  const node = new CascadedShadowMapsNode(light);
  node.cascades = s.cascades;
  node.maxFar = s.maxFarM;
  node.mode = 'practical';
  node.lightMargin = LIGHT_MARGIN_M;
  node.fade = true;
  light.shadow.shadowNode = node as unknown as NonNullable<typeof light.shadow.shadowNode>;
  return node;
}

function configureLight(light: DirectionalLight): void {
  light.castShadow = true;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_FAR_M;
  // reversed-Z·float 깊이: 작은 상수 바이어스 + 법선 바이어스로 여드름(acne)·피터팬 균형. 캐스케이드마다 CSM이 (i+1)배.
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.05;
  // 캐스케이드 복제본이 물려받는다 — 갱신은 schedule()이 needsUpdate로.
  light.shadow.autoUpdate = false;
}

export function enableSunShadows(
  renderer: WebGPURenderer,
  light: DirectionalLight,
  tier: QualityTier,
  materials: () => Material[],
): SunShadows {
  renderer.shadowMap.enabled = true;
  configureLight(light);
  let settings = SHADOW_TIERS[tier];
  let node = makeNode(light, settings);
  let frame = 0;
  let forceAll = true;
  return {
    get node() {
      return node;
    },
    get settings() {
      return settings;
    },
    setTier(t) {
      const next = SHADOW_TIERS[t];
      if (next.cascades !== settings.cascades) {
        node.dispose();
        node = makeNode(light, next);
        // 그림자 노드는 조명 그래프에 컴파일돼 있다 → 받는 머티리얼 재빌드.
        for (const m of materials()) m.needsUpdate = true;
      } else {
        light.shadow.mapSize.set(next.mapSize, next.mapSize);
        for (const l of node.lights) l.shadow?.mapSize.set(next.mapSize, next.mapSize);
        node.maxFar = next.maxFarM;
        if (node.lights.length > 0) node.updateFrustums();
      }
      settings = next;
      forceAll = true;
    },
    schedule(f) {
      const lights = node.lights;
      if (lights.length === 0) return settings.cascades;
      if (f.rebased) forceAll = true;
      const active = f.moved || f.sceneChanged;
      let n = 0;
      for (let i = 0; i < lights.length; i++) {
        const due = forceAll || cascadeDue(i, lights.length, frame, active);
        const sh = lights[i]?.shadow;
        if (sh === undefined) continue;
        sh.autoUpdate = false;
        sh.needsUpdate = due;
        if (due) n++;
      }
      forceAll = false;
      frame++;
      return n;
    },
    dispose() {
      node.dispose();
      light.shadow.shadowNode = null as unknown as NonNullable<typeof light.shadow.shadowNode>;
      light.castShadow = false;
      renderer.shadowMap.enabled = false;
    },
  };
}
