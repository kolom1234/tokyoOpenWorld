// 셰이더 선컴파일(06 §6): 고정 머티리얼 ID별 기본·HLOD 변형을 작은 더미 메시로 씬에 잠깐 붙여 `compileAsync` → 스트리밍 중 첫 사용 끊김 제거.
// 더미 정점 속성은 실제 셀과 같은 이름·형식(POSITION f32·NORMAL i8 정규화·_child f32)이어야 같은 파이프라인이 캐시된다.
import type { Logger } from '@sanpo/core';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Group,
  Mesh,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { createHlodFades } from './hlod.ts';
import { type MaterialRegistry, PRECOMPILE_IDS } from './registry.ts';

function dummyGeometry(hlod: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  g.setAttribute('normal', new BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true));
  if (hlod) g.setAttribute('_child', new BufferAttribute(new Float32Array(3), 1));
  return g;
}

export async function precompileMaterials(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  materials: MaterialRegistry,
  log: Logger,
): Promise<void> {
  const t0 = performance.now();
  const holder = new Group();
  holder.name = 'precompile';
  const geos: BufferGeometry[] = [];
  for (const id of PRECOMPILE_IDS) {
    for (const hlod of [false, true]) {
      const g = dummyGeometry(hlod);
      geos.push(g);
      const m = new Mesh(g, hlod ? materials.getHlod(id) : materials.get(id));
      if (hlod) m.userData.hlodFade = createHlodFades();
      m.frustumCulled = false;
      holder.add(m);
    }
  }
  scene.add(holder);
  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    holder.removeFromParent();
    for (const g of geos) g.dispose();
  }
  log.info(`precompile ${holder.children.length} materials ${Math.round(performance.now() - t0)} ms`);
}
