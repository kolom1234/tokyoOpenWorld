// 간판 에셋 적재·연결(M05-T06): atlas.png(브랜드 색까지 구운 sRGB) → 공용 아틀라스 노드(signs/atlas) → 간판 머티리얼 → 필드 attach →
// 풀마다 1개로 선컴파일. 파사드 1층 간판 띠도 같은 노드를 쓰므로 적재 즉시 바뀐다. see ADR-0054
import { TextureLoader } from 'three/webgpu';
import type { SignageAssetUrls } from '../../api.ts';
import type { RenderContext } from '../context.ts';
import { setSignAtlas } from './atlas.ts';
import { createSignMaterial } from './material.ts';

export async function loadSignageInto(ctx: RenderContext, urls: SignageAssetUrls): Promise<void> {
  setSignAtlas(await new TextureLoader().loadAsync(urls.atlas));
  const material = createSignMaterial();
  ctx.signMaterials.push(material);
  ctx.signs.attach(material);
  const restore = ctx.signs.primeForCompile();
  try {
    await ctx.renderer.compileAsync(ctx.signs.root, ctx.view.camera, ctx.graph.scene);
  } finally {
    restore();
  }
  ctx.counters.sceneVersion++;
}
