// 나무 에셋 적재·연결(M05-T04): 에셋 → 유니폼(수종 임포스터 반지름) → 머티리얼 3종 → 필드 attach → 풀마다 1개로 선컴파일(첫 등장 끊김 방지).
import { AtmosphereLight } from '@takram/three-atmosphere/webgpu';
import { lights } from 'three/tsl';
import type { TreeAssetUrls } from '../../api.ts';
import type { RenderContext } from '../context.ts';
import { compileDetached } from '../materials/precompile.ts';
import { loadTreeAssets } from './assets.ts';
import { createBarkMaterial, createImpostorMaterial, createLeafMaterial, createTreeUniforms } from './materials.ts';
import { SPECIES_SLOTS } from './season.ts';

export async function loadTreesInto(ctx: RenderContext, urls: TreeAssetUrls): Promise<void> {
  const assets = await loadTreeAssets(urls);
  const radius = Array.from({ length: SPECIES_SLOTS }, () => 0.6);
  for (const s of assets.manifest.species) radius[s.id] = s.radius;
  const u = createTreeUniforms(radius);
  const foliage = foliageLights(ctx);
  const materials = {
    bark: createBarkMaterial(u),
    leaf: createLeafMaterial(u, assets.leaves, foliage),
    impostor: createImpostorMaterial(u, assets.impostor, assets.manifest.impostor, foliage),
  };
  ctx.treeUniforms = u;
  ctx.treeMaterials.push(materials.bark, materials.leaf, materials.impostor);
  ctx.trees.attach(assets, materials);
  await compileDetached(ctx.renderer, ctx.trees.root, ctx.view.camera, ctx.graph.scene, () =>
    ctx.trees.primeForCompile(),
  );
  ctx.counters.sceneVersion++;
}

/**
 * 잎 조명 = 태양(장면 조명, 그림자 포함) + 하늘 간접광만 켠 보조 AtmosphereLight(장면에 넣지 않음 — 다른 머티리얼은 환경맵이 간접광).
 * 환경 프로브가 없는 경로(소프트웨어 WebGL2)는 태양 조명이 이미 간접광을 켜 둔다 → 장면 조명 그대로.
 */
function foliageLights(ctx: RenderContext): { lightsNode?: object } {
  const sun = ctx.atmosphere.light;
  if (sun.indirect.value) return {};
  const sky = new AtmosphereLight();
  sky.name = 'tree-sky';
  sky.direct.value = false;
  sky.indirect.value = true;
  return { lightsNode: lights([sun, sky as unknown as typeof sun]) };
}

/** 바람(풍향 = 불어 가는 쪽, 도) → 유니폼. */
export function setTreeWind(ctx: RenderContext, windMs: number, windDirDeg: number): void {
  const a = (windDirDeg * Math.PI) / 180;
  ctx.treeUniforms?.wind.value.set(Math.sin(a), -Math.cos(a), Math.min(Math.max(windMs, 0), 20));
}
