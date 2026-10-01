// 나무 에셋 적재·연결(M05-T04): 에셋 → 유니폼(수종 임포스터 반지름) → 머티리얼 3종 → 필드 attach → 풀마다 1개로 선컴파일(첫 등장 끊김 방지).
import type { TreeAssetUrls } from '../../api.ts';
import type { RenderContext } from '../context.ts';
import { loadTreeAssets } from './assets.ts';
import { createBarkMaterial, createImpostorMaterial, createLeafMaterial, createTreeUniforms } from './materials.ts';
import { SPECIES_SLOTS } from './season.ts';

export async function loadTreesInto(ctx: RenderContext, urls: TreeAssetUrls): Promise<void> {
  const assets = await loadTreeAssets(urls);
  const radius = Array.from({ length: SPECIES_SLOTS }, () => 0.6);
  for (const s of assets.manifest.species) radius[s.id] = s.radius;
  const u = createTreeUniforms(radius);
  const materials = {
    bark: createBarkMaterial(u),
    leaf: createLeafMaterial(u, assets.leaves),
    impostor: createImpostorMaterial(u, assets.impostor, assets.manifest.impostor),
  };
  ctx.treeUniforms = u;
  ctx.treeMaterials.push(materials.bark, materials.leaf, materials.impostor);
  ctx.trees.attach(assets, materials);
  const restore = ctx.trees.primeForCompile();
  try {
    await ctx.renderer.compileAsync(ctx.trees.root, ctx.view.camera, ctx.graph.scene);
  } finally {
    restore();
  }
  ctx.counters.sceneVersion++;
}

/** 바람(풍향 = 불어 가는 쪽, 도) → 유니폼. */
export function setTreeWind(ctx: RenderContext, windMs: number, windDirDeg: number): void {
  const a = (windDirDeg * Math.PI) / 180;
  ctx.treeUniforms?.wind.value.set(Math.sin(a), -Math.cos(a), Math.min(Math.max(windMs, 0), 20));
}
